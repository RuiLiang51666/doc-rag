"use client";

import { useEffect, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";

interface SearchResult {
  score: number;
  content: string;
  filePath: string;
  heading: string;
}

/** 对话消息:来源挂在各自的助手消息上 */
interface ChatMsg {
  role: "user" | "assistant";
  content: string;
  sources?: SearchResult[];
}

/** 兜底清洗内部片段标记(与服务端同款):流式累积缓冲会把跨块劈开的标记重新拼完整,
 *  每次上屏前在完整文本上再清一遍,即使服务端漏网也不会呈现给用户 */
function stripMarkers(s: string): string {
  return s
    .replace(/[【\[]\s*片段[\s\d０-９，,、和及片段]*[】\]]/g, "")
    .replace(/(根据|参见|见|来自|依据)?\s*片段\s*[\d０-９]+(\s*[、，,和及]\s*[\d０-９]+)*/g, "");
}

const PROSE_CLS =
  "prose prose-sm max-w-none " +
  "prose-headings:text-[var(--foreground)] prose-p:text-[var(--foreground)] " +
  "prose-li:text-[var(--foreground)] prose-strong:text-[var(--foreground)] " +
  "prose-a:text-[var(--accent)] " +
  "prose-code:rounded prose-code:bg-[var(--accent-soft)] prose-code:px-1 prose-code:py-0.5 prose-code:text-[var(--accent)] prose-code:before:content-none prose-code:after:content-none " +
  "prose-pre:bg-[#013128] prose-pre:text-[#d9efe6] prose-pre:text-[12px]";

export default function Assistant() {
  const [open, setOpen] = useState(false);
  const [question, setQuestion] = useState("");
  const [messages, setMessages] = useState<ChatMsg[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");        // 后端业务错误(确定性,如问题为空/LLM 报错):红色提示
  const [failed, setFailed] = useState(false);   // 重试仍失败(网络/超时):友好兜底 + 重试按钮
  const [waking, setWaking] = useState(false);   // 正在自动重试:显示提示
  const [openSrc, setOpenSrc] = useState<string | null>(null); // 展开的来源,键 `${消息下标}-${来源下标}`
  const [bouncing, setBouncing] = useState(false);
  const [tip, setTip] = useState(false);
  const loadingRef = useRef(false);
  const lastAskedRef = useRef("");               // 供"重试"按钮重发上一个问题
  // 事件监听器只在挂载时注册一次,闭包里的 state 是旧值:消息列表以 ref 为准
  const messagesRef = useRef<ChatMsg[]>([]);
  const scrollRef = useRef<HTMLDivElement | null>(null);

  function commitMessages(next: ChatMsg[]) {
    messagesRef.current = next;
    setMessages(next);
  }

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

  /* 新消息/流式更新时自动滚到底部 */
  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages, loading, failed, error]);

  // Vercel serverless 冷启动为秒级(模型加载 3-5s),30s 已含充分余量;超时/断连/网关错误自动重试
  const MAX_ATTEMPTS = 3; // 1 正常 + 2 重试
  const ATTEMPT_TIMEOUT = 30_000;
  const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

  /** 更新(或创建)线程末尾的助手草稿消息 */
  function updateAssistantDraft(text: string) {
    const cur = messagesRef.current;
    const last = cur[cur.length - 1];
    if (last && last.role === "assistant") {
      commitMessages([...cur.slice(0, -1), { ...last, content: text }]);
    } else {
      commitMessages([...cur, { role: "assistant", content: text }]);
    }
  }

  /** 给线程末尾的助手消息挂来源 */
  function attachSources(sources: SearchResult[]) {
    const cur = messagesRef.current;
    const last = cur[cur.length - 1];
    if (last && last.role === "assistant") {
      commitMessages([...cur.slice(0, -1), { ...last, sources }]);
    }
  }

  /**
   * 单次请求 + 流式读取。
   * 正常返回 = 已处理完成(成功,或后端确定性业务错误,均已上屏),不再重试;
   * 抛出异常 = 可重试错误(网络/超时/网关 5xx/空流),抛出前会清掉本次的半截草稿。
   */
  async function runOnce(q: string, history: { role: "user" | "assistant"; content: string }[]): Promise<void> {
    const ctrl = new AbortController();
    let firstByte = false;
    let draftPushed = false;
    // 只守护"连接 + 首字节":一旦开始出字就清掉,不误杀正常的长生成
    const timer = setTimeout(() => {
      if (!firstByte) ctrl.abort();
    }, ATTEMPT_TIMEOUT);

    try {
      const res = await fetch("/api/ask", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query: q, history }),
        signal: ctrl.signal,
      });

      const ctype = res.headers.get("Content-Type") || "";

      // 后端业务错误(JSON,如 400 问题为空 / 502 LLM 报错):确定性,直接展示不重试
      if (!res.ok && ctype.includes("application/json")) {
        const data = await res.json();
        setError(data.error || "请求失败");
        return;
      }

      // 网关错误(502/503/504,通常是 HTML 或空):当作可重试错误抛出,不当答案渲染
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
          setWaking(false); // 已开始出字,撤下重试提示
        }
        buffer += decoder.decode(value, { stream: true });
        const idx = buffer.indexOf(META);
        const visible = stripMarkers(idx === -1 ? buffer : buffer.slice(0, idx));
        if (visible.trim()) {
          updateAssistantDraft(visible);
          draftPushed = true;
        }
      }

      // 处理结尾的 META（sources / error）
      const idx = buffer.indexOf(META);
      if (idx !== -1) {
        const visible = stripMarkers(buffer.slice(0, idx));
        if (visible.trim()) {
          updateAssistantDraft(visible);
          draftPushed = true;
        }
        try {
          const meta = JSON.parse(buffer.slice(idx + META.length));
          if (meta.error) setError(meta.error);
          if (meta.sources) attachSources(meta.sources);
        } catch {
          /* META 解析失败则忽略，回答正文已展示 */
        }
      }

      // 流开了但整段为空(极端异常):当作失败以便重试
      if (!buffer.trim()) throw new Error("empty_stream");
    } catch (err) {
      // 本次尝试的半截草稿不留在线程里,重试会重新生成
      if (draftPushed) {
        const cur = messagesRef.current;
        if (cur[cur.length - 1]?.role === "assistant") commitMessages(cur.slice(0, -1));
      }
      throw err;
    } finally {
      clearTimeout(timer);
    }
  }

  async function handleAsk(qOverride?: string, isRetry = false) {
    const q = (qOverride ?? question).trim();
    if (!q || loadingRef.current) return;
    loadingRef.current = true;
    lastAskedRef.current = q;

    setLoading(true);
    setError("");
    setFailed(false);
    setWaking(false);
    setQuestion("");

    // 历史 = 本问之前的完整线程(重试时线程末尾已是这条用户消息,不再追加)
    let history = messagesRef.current.map(({ role, content }) => ({ role, content }));
    if (isRetry && history[history.length - 1]?.role === "user") {
      history = history.slice(0, -1);
    } else {
      commitMessages([...messagesRef.current, { role: "user", content: q }]);
    }

    try {
      for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
        if (attempt > 1) setWaking(true); // 第 2 次起提示自动重试中
        try {
          await runOnce(q, history);
          return; // 已完成(成功或业务错误),结束
        } catch (err) {
          if (attempt === MAX_ATTEMPTS) throw err; // 重试用尽,交给外层兜底
          await sleep(600 * attempt); // 递增退避
        }
      }
    } catch {
      // 网络/超时/网关等瞬时故障重试仍失败:友好兜底 + 重试按钮,不裸奔 network error
      setFailed(true);
    } finally {
      setLoading(false);
      setWaking(false);
      loadingRef.current = false;
    }
  }

  function newConversation() {
    if (loadingRef.current) return;
    commitMessages([]);
    setError("");
    setFailed(false);
    setOpenSrc(null);
    setQuestion("");
  }

  /* 回答里的链接多为知识库内部相对路径(../xx.md),站外无法打开:
     外部 http 链接照常新开页;内部链接转成「继续追问」入口,点击即向助手提问 */
  const mdComponents = {
    a: (props: unknown) => {
      const { href, children } = props as { href?: string; children?: React.ReactNode };
      if (href && /^https?:\/\//.test(href)) {
        return (
          <a href={href} target="_blank" rel="noopener noreferrer">
            {children}
          </a>
        );
      }
      const topic = (Array.isArray(children) ? children.join("") : String(children ?? "")).trim();
      return (
        <button
          type="button"
          title={`向助手追问「${topic}」`}
          onClick={() => topic && handleAsk(`请根据本站文档，详细介绍「${topic}」。`)}
          className="cursor-pointer border-none bg-transparent p-0 underline decoration-dashed underline-offset-2"
          style={{ color: "var(--accent)", font: "inherit" }}
        >
          {children}
        </button>
      );
    },
  };

  const lastIsUser = messages[messages.length - 1]?.role === "user";

  return (
    <>
      {/* 主动唤醒气泡:轻提示可点击,展开面板即消失 */}
      {tip && !open && (
        <button
          onClick={() => { setTip(false); setOpen(true); }}
          className="fixed bottom-[92px] right-5 z-50 rounded-xl border bg-white px-3.5 py-2 text-left text-[12.5px] leading-relaxed shadow-[0_8px_24px_rgba(15,23,42,0.12)]"
          style={{ borderColor: "var(--border)", color: "var(--foreground)", maxWidth: "240px" }}
        >
          试试点击我，直接对文档提问！👇
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
                <div className="text-[11px] text-white/70">基于本地文档检索 · 支持多轮追问</div>
              </div>
            </div>
            <div className="flex items-center gap-1.5">
              {messages.length > 0 && (
                <button
                  onClick={newConversation}
                  disabled={loading}
                  className="rounded-md border border-white/25 px-2 py-1 text-[11px] text-white/85 transition-colors hover:bg-white/15 hover:text-white disabled:opacity-40"
                >
                  新对话
                </button>
              )}
              <button
                onClick={() => setOpen(false)}
                aria-label="关闭"
                className="rounded-md p-1 text-white/80 transition-colors hover:bg-white/15 hover:text-white"
              >
                <IconClose />
              </button>
            </div>
          </header>

          {/* 对话线程（可滚动） */}
          <div ref={scrollRef} className="thin-scroll flex-1 overflow-y-auto px-4 py-4" style={{ background: "var(--surface-muted)" }}>
            {/* 空状态 */}
            {messages.length === 0 && !error && !loading && !failed && (
              <div className="mt-6 text-center text-sm" style={{ color: "var(--muted)" }}>
                <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-2xl" style={{ background: "var(--accent-soft)", color: "var(--accent)" }}>
                  <IconChat />
                </div>
                <p className="font-medium" style={{ color: "var(--foreground)" }}>有什么可以帮你？</p>
                <p className="mt-1">支持多轮追问，比如问完部署方式再问「第二种的前置要求」</p>
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

            <div className="flex flex-col gap-3">
              {messages.map((m, mi) =>
                m.role === "user" ? (
                  <div key={mi} className="flex justify-end">
                    <div
                      className="max-w-[85%] whitespace-pre-wrap rounded-xl rounded-br-sm px-3.5 py-2 text-[13.5px] leading-relaxed text-white"
                      style={{ background: "var(--accent)" }}
                    >
                      {m.content}
                    </div>
                  </div>
                ) : (
                  <div key={mi}>
                    <div className="rounded-xl rounded-bl-sm border bg-white p-4" style={{ borderColor: "var(--border)" }}>
                      <div className={PROSE_CLS}>
                        <ReactMarkdown components={mdComponents}>{m.content}</ReactMarkdown>
                      </div>
                    </div>
                    {(m.sources?.length ?? 0) > 0 && (
                      <div className="mt-2 flex flex-col gap-1.5">
                        <div className="px-0.5 text-[11px] font-semibold uppercase tracking-wide" style={{ color: "var(--muted)" }}>
                          参考来源
                        </div>
                        {m.sources!.map((s, si) => {
                          const key = `${mi}-${si}`;
                          return (
                            <div key={key} className="overflow-hidden rounded-lg border bg-white" style={{ borderColor: "var(--border)" }}>
                              <button
                                onClick={() => setOpenSrc(openSrc === key ? null : key)}
                                className="flex w-full items-center justify-between gap-2 px-3 py-2 text-left transition-colors hover:bg-[var(--surface-muted)]"
                              >
                                <span className="min-w-0 flex-1 truncate font-mono text-[11px]" style={{ color: "var(--foreground)" }}>
                                  {s.filePath}
                                </span>
                                <span className="shrink-0 font-mono text-[10px]" style={{ color: "var(--muted)" }}>
                                  {s.score.toFixed(2)} {openSrc === key ? "▲" : "▼"}
                                </span>
                              </button>
                              {openSrc === key && (
                                <div className="thin-scroll max-h-48 overflow-auto whitespace-pre-wrap border-t px-3 py-2 text-[12px] leading-relaxed" style={{ borderColor: "var(--border)", color: "var(--muted)", background: "var(--surface-muted)" }}>
                                  <div className="mb-1 font-medium" style={{ color: "var(--foreground)" }}>{s.heading}</div>
                                  {s.content}
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                )
              )}

              {loading && lastIsUser && (
                <div className="flex items-center gap-2 text-sm" style={{ color: "var(--muted)" }}>
                  <span className="h-2 w-2 animate-pulse rounded-full" style={{ background: "var(--accent)" }} />
                  {waking ? "连接有点慢，正在自动重试…" : "正在检索文档并生成回答…"}
                </div>
              )}

              {error && (
                <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
                  ⚠️ {error}
                </div>
              )}

              {/* 网络/超时重试仍失败:体面兜底,给一键重试,不裸奔 network error */}
              {failed && !loading && (
                <div className="rounded-xl border bg-white px-4 py-4 text-sm" style={{ borderColor: "var(--border)", color: "var(--muted)" }}>
                  <p className="font-medium" style={{ color: "var(--foreground)" }}>服务有点忙，暂时没连上 😴</p>
                  <p className="mt-1 leading-relaxed">
                    可能是网络瞬时波动，稍等片刻再点重试通常就好了。
                  </p>
                  <button
                    onClick={() => handleAsk(lastAskedRef.current, true)}
                    className="mt-3 rounded-lg px-3.5 py-1.5 text-[13px] font-medium text-white transition-colors hover:bg-[var(--accent-hover)]"
                    style={{ background: "var(--accent)" }}
                  >
                    重新试试 →
                  </button>
                </div>
              )}
            </div>
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
                placeholder={messages.length ? "继续追问…" : "输入你的问题…"}
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
