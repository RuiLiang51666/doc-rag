import { NextRequest, NextResponse } from "next/server";
import { searchWithTiming } from "@/lib/search";
import {
  createAnswerStream,
  rewriteQueryLocal,
  parseUsedIndices,
  USED_MARKER_KEYWORD,
} from "@/lib/llm";

// 本地模型推理 + 外部 LLM 调用，需 Node runtime
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// 流式协议：先逐块推回答正文纯文本，最后一行推 META 标记 + JSON（含 sources）
const META_SENTINEL = "\n<<<META>>>";

export async function POST(req: NextRequest) {
  let query: string;
  try {
    const body = await req.json();
    query = body.query;
    if (!query || typeof query !== "string" || !query.trim()) {
      return NextResponse.json({ error: "问题不能为空" }, { status: 400 });
    }
  } catch {
    return NextResponse.json({ error: "请求格式错误" }, { status: 400 });
  }

  const original = query.trim();
  const tStart = performance.now();

  // 1. 查询改写（本地规则，零网络调用，基本瞬时）
  const tRw0 = performance.now();
  const searchQuery = rewriteQueryLocal(original);
  const rewriteMs = performance.now() - tRw0;

  // 2. 用改写后的 query 检索 Top 8（分别计时：向量化 / 检索打分）
  let sources, embedMs, scoreMs;
  try {
    const r = await searchWithTiming(searchQuery, 8);
    sources = r.results;
    embedMs = r.embedMs;
    scoreMs = r.scoreMs;
  } catch (err) {
    const msg = err instanceof Error ? err.message : "检索失败";
    return NextResponse.json({ error: `检索阶段出错：${msg}` }, { status: 500 });
  }

  // 3. 流式生成回答（喂的是原始问题，不是改写后的）
  let completion;
  try {
    completion = await createAnswerStream(original, sources);
  } catch (err) {
    return NextResponse.json({ error: friendlyLlmError(err), sources }, { status: 502 });
  }

  const tGen0 = performance.now();
  const HOLDBACK = USED_MARKER_KEYWORD.length; // 防止把"引用片段"标记的开头推给前端

  const stream = new ReadableStream({
    async start(controller) {
      const enc = new TextEncoder();
      let full = "";
      let sentLen = 0;
      let markerSeen = false;

      try {
        for await (const chunk of completion) {
          const delta = chunk.choices?.[0]?.delta?.content;
          if (!delta) continue;
          full += delta;

          if (!markerSeen) {
            const idx = full.indexOf(USED_MARKER_KEYWORD);
            let visibleEnd: number;
            if (idx !== -1) {
              // 标记出现：只推到标记前，之后不再推
              visibleEnd = idx;
              markerSeen = true;
            } else {
              // 尚未出现：保留尾部 HOLDBACK 字符，防止标记关键字跨 delta 被截断
              visibleEnd = Math.max(sentLen, full.length - HOLDBACK);
            }
            if (visibleEnd > sentLen) {
              controller.enqueue(enc.encode(full.slice(sentLen, visibleEnd)));
              sentLen = visibleEnd;
            }
          }
        }

        // 流结束：解析实际引用的片段，附上来源元信息
        const usedIndices = parseUsedIndices(full, sources.length);
        const usedSources = usedIndices.map((i) => sources[i]).filter(Boolean);

        const generateMs = performance.now() - tGen0;
        const totalMs = performance.now() - tStart;
        console.log(
          `\n⏱️  问答耗时统计 「${original}」（流式）\n` +
            `   查询改写(本地)   : ${rewriteMs.toFixed(0)} ms\n` +
            `   问题向量化(本地) : ${embedMs.toFixed(0)} ms\n` +
            `   向量检索         : ${scoreMs.toFixed(0)} ms\n` +
            `   生成回答(智谱,流式总时长): ${generateMs.toFixed(0)} ms\n` +
            `   ── 总耗时        : ${totalMs.toFixed(0)} ms`
        );

        controller.enqueue(
          enc.encode(META_SENTINEL + JSON.stringify({ sources: usedSources }))
        );
        controller.close();
      } catch (err) {
        // 流中途出错：推一个错误 META，前端据此提示
        const enc2 = new TextEncoder();
        controller.enqueue(
          enc2.encode(META_SENTINEL + JSON.stringify({ error: friendlyLlmError(err) }))
        );
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      // 声明为 SSE 类型:Render/Cloudflare 对 text/plain 流会整体缓冲后一次性下发,
      // 只有 text/event-stream 保证逐块透传(正文仍是纯文本 + META 尾包,前端解析不变)
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      "X-Accel-Buffering": "no",
    },
  });
}

function friendlyLlmError(err: unknown): string {
  const e = err as { status?: number; message?: string; code?: string };
  const raw = e?.message || String(err);

  if (e?.status === 401 || /invalid api key|unauthorized|鉴权/i.test(raw)) {
    return "大模型调用失败：API Key 无效或鉴权失败，请检查 .env.local 中的 LLM_API_KEY。";
  }
  if (e?.status === 429 || /quota|rate limit|余额|频率/i.test(raw)) {
    return "大模型调用失败：触发频率限制或账户余额不足，请稍后再试或检查智谱账户余额。";
  }
  if (/ENOTFOUND|ECONNREFUSED|fetch failed|network|timeout|ETIMEDOUT/i.test(raw)) {
    return "大模型调用失败：网络连接异常，无法访问智谱 API，请检查网络。";
  }
  return `大模型调用失败：${raw}`;
}
