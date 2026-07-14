"use client";

import { useEffect, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";

interface SearchResult {
  score: number;
  content: string;
  filePath: string;
  heading: string;
}

/** 兜底清洗内部片段标记(与服务端同款):流式累积缓冲会把跨块劈开的标记重新拼完整,
 *  每次 setAnswer 前在完整文本上再清一遍,即使服务端漏网也不会呈现给用户 */
function stripMarkers(s: string): string {
  return s
    .replace(/[【\[]\s*片段[\s\d０-９，,、和及片段]*[】\]]/g, "")
    .replace(/(根据|参见|见|来自|依据)?\s*片段\s*[\d０-９]+(\s*[、，,和及]\s*[\d０-９]+)*/g, "");
}

export default function Assistant() {
  const [open, setOpen] = useState(false);
  const [question, setQuestion] = useState("");
  const [answer, setAnswer] = useState("");
  const [sources, setSources] = useState<SearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");        // 后端业务错误(确定性,如问题为空/LLM 报错):红色提示
  const [failed, setFailed] = useState(false);   // 重试仍失败(网络/唤醒超时):友好兜底 + 重试按钮
  const [waking, setWaking] = useState(false);   // 正在重试(冷启动/偶发断连):显示"服务正在唤醒"
  const [openIdx, setOpenIdx] = useState<number | null>(null);
  const [bouncing, setBouncing] = useState(false);
  const [tip, setTip] = useState(false);
  const loadingRef = useRef(false);
  const lastAskedRef = useRef("");               // 供"重试"按钮重发上一个问题

  /* 页面卡片派发 doc-rag:ask 事件 → 展开面板、预填问题并自动发送(死链拦截联动) */
  useEffect(() => {
    function onAsk(e: Event) {
      const q = (e as CustomEvent<{ q?: string }>).detail?.q?.trim();
      if (!q) return;
      setTip(false);
      setOpen(true);
      setQuestion(q);
      handleAsk(q);
    }
    window.addEventListener("doc-rag:ask", onAsk);
    return () => window.removeEventListener("doc-rag:ask", onAsk);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /* 加载 1.5s 后:气泡提示 + 弹跳一次(约 2s 停止),吸引注意 */
  useEffect(() => {
    const t1 = setTimeout(() => { setBouncing(true); setTip(true); }, 1500);
    const t2 = setTimeout(() => setBouncing(false), 3600);
    return () => { clearTimeout(t1); clearTimeout(t2); };
  }, []);

  // 免费实例冷启动最长约 50s,单次给到 75s 容忍唤醒;超时/断连/网关错误自动重试
  const MAX_ATTEMPTS = 3; // 1 正常 + 2 重试
  const ATTEMPT_TIMEOUT = 75_000;
  const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

  /**
   * 单次请求 + 流式读取。
   * 正常返回 = 已处理完成(成功,或后端确定性业务错误,均已上屏),不再重试;
   * 抛出异常 = 可重试错误(网络/超时/网关 5xx/空流)。
   */
  async function runOnce(q: string): Promise<void> {
    setAnswer("");
    setSources([]);
    setOpenIdx(null);

    const ctrl = new AbortController();
    let firstByte = false;
    // 只守护"连接 + 首字节":一旦开始出字就清掉,不误杀正常的长生成
    const timer = setTimeout(() => {
      if (!firstByte) ctrl.abort();
    }, ATTEMPT_TIMEOUT);

    try {
      const res = await fetch("/api/ask", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query: q }),
        signal: ctrl.signal,
      });

      const ctype = res.headers.get("Content-Type") || "";

      // 后端业务错误(JSON,如 400 问题为空 / 502 LLM 报错):确定性,直接展示不重试
      if (!res.ok && ctype.includes("application/json")) {
        const data = await res.json();
        setError(data.error || "请求失败");
        if (data.sources) setSources(data.sources);
        return;
      }

      // 网关/唤醒错误(502/503/504,通常是 HTML 或空):当作可重试错误抛出,不当答案渲染
      if (!res.ok || !res.body) {
        throw new Error(`gateway_${res.status}`);
      }

      // 流式读取：逐块拼接回答；末尾 META 标记后是 sources/error 的 JSON
      const META = "\n<<<META>>>";
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        if (!firstByte) {
          firstByte = true;
          clearTimeout(timer);
          setWaking(false); // 已开始出字,撤下"唤醒中"提示
        }
        buffer += decoder.decode(value, { stream: true });
        const idx = buffer.indexOf(META);
        setAnswer(stripMarkers(idx === -1 ? buffer : buffer.slice(0, idx)));
      }

      // 处理结尾的 META（sources / error）
      const idx = buffer.indexOf(META);
      if (idx !== -1) {
        setAnswer(stripMarkers(buffer.slice(0, idx)));
        try {
          const meta = JSON.parse(buffer.slice(idx + META.length));
          if (meta.error) setError(meta.error);
          if (meta.sources) setSources(meta.sources);
        } catch {
          /* META 解析失败则忽略，回答正文已展示 */
        }
      }

      // 流开了但整段为空(极端异常):当作失败以便重试
      if (!buffer.trim()) throw new Error("empty_stream");
    } finally {
      clearTimeout(timer);
    }
  }

  async function handleAsk(qOverride?: string) {
    const q = (qOverride ?? question).trim();
    if (!q || loadingRef.current) return;
    loadingRef.current = true;
    lastAskedRef.current = q;

    setLoading(true);
    setError("");
    setFailed(false);
    setWaking(false);
    setAnswer("");
    setSources([]);
    setOpenIdx(null);

    try {
      for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
        if (attempt > 1) setWaking(true); // 第 2 次起提示"服务正在唤醒"
        try {
          await runOnce(q);
          return; // 已完成(成功或业务错误),结束
        } catch (err) {
          if (attempt === MAX_ATTEMPTS) throw err; // 重试用尽,交给外层兜底
          await sleep(600 * attempt); // 递增退避,给实例唤醒/恢复的时间
        }
      }
    } catch {
      // 网络/超时/网关等瞬时故障重试仍失败:友好兜底 + 重试按钮,不裸奔 network error
      setFailed(true);
      setAnswer("");
    } finally {
      setLoading(false);
      setWaking(false);
      loadingRef.current = false;
    }
  }

  return (
    <>
      {/* 主动唤醒气泡:轻提示可点击,展开面板即消失 */}
      {tip && !open && (
        <button
          onClick={() => { setTip(false); setOpen(true); }}
          className="fixed bottom-[92px] right-5 z-50 rounded-xl border bg-white px-3.5 py-2 text-left text-[12.5px] leading-relaxed shadow-[0_8px_24px_rgba(15,23,42,0.12)]"
          style={{ borderColor: "var(--border)", color: "var(--foreground)", maxWidth: "240px" }}
        >
          试试点击我，或点击页面上的任意按钮，直接对文档提问！👇
          <span
            className="absolute -bottom-1.5 right-6 h-3 w-3 rotate-45 border-b border-r bg-white"
            style={{ borderColor: "var(--border)" }}
          />
        </button>
      )}

      {/* 悬浮按钮 */}
      <button
        onClick={() => { setTip(false); setOpen((v) => !v); }}
        aria-label={open ? "关闭助手" : "打开助手"}
        className={`fixed bottom-5 right-5 z-50 flex h-14 w-14 items-center justify-center rounded-full text-white shadow-lg transition-transform hover:scale-105 active:scale-95${bouncing && !open ? " animate-bounce" : ""}`}
        style={{ backgroundColor: "var(--accent)", boxShadow: "0 8px 24px rgba(0,91,77,0.35)" }}
      >
        {open ? <IconClose /> : <IconChat />}
      </button>

      {/* 对话面板 */}
      {open && (
        <div
          className="animate-assistant-pop fixed z-50 flex flex-col overflow-hidden bg-white
                     bottom-0 right-0 h-[100dvh] w-full rounded-none
                     sm:bottom-24 sm:right-5 sm:h-[78vh] sm:max-h-[680px] sm:w-[380px] sm:rounded-2xl"
          style={{ boxShadow: "0 16px 48px rgba(15,23,42,0.18)", border: "1px solid var(--border)" }}
        >
          {/* 标题栏 */}
          <header
            className="flex items-center justify-between px-4 py-3 text-white"
            style={{ backgroundColor: "var(--accent)" }}
          >
            <div className="flex items-center gap-2">
              <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-white/20">
                <IconSpark />
              </span>
              <div className="leading-tight">
                <div className="text-sm font-semibold">文档智能助手</div>
                <div className="text-[11px] text-white/70">基于本地文档检索生成</div>
              </div>
            </div>
            <button
              onClick={() => setOpen(false)}
              aria-label="关闭"
              className="rounded-md p-1 text-white/80 transition-colors hover:bg-white/15 hover:text-white"
            >
              <IconClose />
            </button>
          </header>

          {/* 内容区（可滚动） */}
          <div className="thin-scroll flex-1 overflow-y-auto px-4 py-4" style={{ background: "var(--surface-muted)" }}>
            {/* 空状态 */}
            {!answer && !error && !loading && !failed && (
              <div className="mt-6 text-center text-sm" style={{ color: "var(--muted)" }}>
                <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-2xl" style={{ background: "var(--accent-soft)", color: "var(--accent)" }}>
                  <IconChat />
                </div>
                <p className="font-medium" style={{ color: "var(--foreground)" }}>有什么可以帮你？</p>
                <p className="mt-1">问我关于文档内容的任何问题</p>
                <div className="mt-4 flex flex-col gap-2">
                  {["这个产品是什么？", "支持哪些数据类型？", "如何快速开始？"].map((s) => (
                    <button
                      key={s}
                      onClick={() => setQuestion(s)}
                      className="rounded-lg border bg-white px-3 py-2 text-left text-[13px] transition-colors hover:border-[var(--accent)]"
                      style={{ borderColor: "var(--border)", color: "var(--foreground)" }}
                    >
                      {s}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {loading && !answer && (
              <div className="flex items-center gap-2 text-sm" style={{ color: "var(--muted)" }}>
                <span className="h-2 w-2 animate-pulse rounded-full" style={{ background: "var(--accent)" }} />
                {waking ? "服务正在唤醒，请稍候…（首次访问约需 1 分钟）" : "正在检索文档并生成回答…"}
              </div>
            )}

            {error && (
              <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
                ⚠️ {error}
              </div>
            )}

            {/* 网络/唤醒重试仍失败:体面兜底,给一键重试,不裸奔 network error */}
            {failed && !loading && (
              <div className="rounded-xl border bg-white px-4 py-4 text-sm" style={{ borderColor: "var(--border)", color: "var(--muted)" }}>
                <p className="font-medium" style={{ color: "var(--foreground)" }}>服务有点忙，暂时没连上 😴</p>
                <p className="mt-1 leading-relaxed">
                  演示服务部署在免费实例上，空闲后会休眠。可能正在唤醒，稍等片刻再点重试通常就好了。
                </p>
                <button
                  onClick={() => handleAsk(lastAskedRef.current)}
                  className="mt-3 rounded-lg px-3.5 py-1.5 text-[13px] font-medium text-white transition-colors hover:bg-[var(--accent-hover)]"
                  style={{ background: "var(--accent)" }}
                >
                  重新试试 →
                </button>
              </div>
            )}

            {answer && (
              <div className="rounded-xl border bg-white p-4" style={{ borderColor: "var(--border)" }}>
                <div className="prose prose-sm max-w-none
                                prose-headings:text-[var(--foreground)] prose-p:text-[var(--foreground)]
                                prose-li:text-[var(--foreground)] prose-strong:text-[var(--foreground)]
                                prose-a:text-[var(--accent)]
                                prose-code:rounded prose-code:bg-[var(--accent-soft)] prose-code:px-1 prose-code:py-0.5 prose-code:text-[var(--accent)] prose-code:before:content-none prose-code:after:content-none
                                prose-pre:bg-[#013128] prose-pre:text-[#d9efe6] prose-pre:text-[12px]">
                  <ReactMarkdown>{answer}</ReactMarkdown>
                </div>
              </div>
            )}

            {sources.length > 0 && (
              <div className="mt-3 flex flex-col gap-1.5">
                <div className="px-0.5 text-[11px] font-semibold uppercase tracking-wide" style={{ color: "var(--muted)" }}>
                  参考来源
                </div>
                {sources.map((s, i) => (
                  <div key={i} className="overflow-hidden rounded-lg border bg-white" style={{ borderColor: "var(--border)" }}>
                    <button
                      onClick={() => setOpenIdx(openIdx === i ? null : i)}
                      className="flex w-full items-center justify-between gap-2 px-3 py-2 text-left transition-colors hover:bg-[var(--surface-muted)]"
                    >
                      <span className="min-w-0 flex-1 truncate font-mono text-[11px]" style={{ color: "var(--foreground)" }}>
                        {s.filePath}
                      </span>
                      <span className="shrink-0 font-mono text-[10px]" style={{ color: "var(--muted)" }}>
                        {s.score.toFixed(2)} {openIdx === i ? "▲" : "▼"}
                      </span>
                    </button>
                    {openIdx === i && (
                      <div className="thin-scroll max-h-48 overflow-auto whitespace-pre-wrap border-t px-3 py-2 text-[12px] leading-relaxed" style={{ borderColor: "var(--border)", color: "var(--muted)", background: "var(--surface-muted)" }}>
                        <div className="mb-1 font-medium" style={{ color: "var(--foreground)" }}>{s.heading}</div>
                        {s.content}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* 输入区 */}
          <div className="border-t bg-white p-3" style={{ borderColor: "var(--border)" }}>
            <div className="flex items-end gap-2">
              <textarea
                rows={1}
                value={question}
                onChange={(e) => setQuestion(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    handleAsk();
                  }
                }}
                placeholder="输入你的问题…"
                className="thin-scroll max-h-28 flex-1 resize-none rounded-lg border px-3 py-2 text-sm outline-none transition-colors focus:border-[var(--accent)]"
                style={{ borderColor: "var(--border)", color: "var(--foreground)" }}
              />
              <button
                onClick={() => handleAsk()}
                disabled={loading || !question.trim()}
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-white transition-colors disabled:opacity-40"
                style={{ backgroundColor: "var(--accent)" }}
                aria-label="发送"
              >
                <IconSend />
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

/* ── 图标（内联 SVG，避免额外依赖） ── */
function IconChat() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z" />
    </svg>
  );
}
function IconClose() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
    </svg>
  );
}
function IconSend() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <line x1="22" y1="2" x2="11" y2="13" /><polygon points="22 2 15 22 11 13 2 9 22 2" />
    </svg>
  );
}
function IconSpark() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
      <path d="M12 2l1.9 5.8L20 9.7l-5 3.6L16.9 19 12 15.6 7.1 19 9 13.3 4 9.7l6.1-1.9L12 2z" />
    </svg>
  );
}
