"use client";

import Assistant from "./components/Assistant";

/* 页面可点击位映射为与知识库内容对齐的问题,点击即转投智能助手 */
const INTRO_PROMPT = "请根据本站文档，介绍一下本产品是什么，它的核心特性与典型应用场景有哪些？";
const QUICKSTART_PROMPT = "请根据本站文档，给我一份快速开始指南：环境准备、安装步骤和第一个可运行的示例。";
const SQL_PROMPT = "请根据本站文档，概述本产品支持的 SQL 语法类别与常用语句，并举例说明。";

/* 交互特性(展示助手能力,非链接) */
const FEATURES = [
  {
    title: "流式响应输出",
    desc: "体验零延迟的反馈，实时文本流让你在答案生成的瞬间即可开始阅读。",
    icon: (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round">
        <path d="M3 7c2.5-2 5.5-2 8 0s5.5 2 8 0" /><path d="M3 12c2.5-2 5.5-2 8 0s5.5 2 8 0" /><path d="M3 17c2.5-2 5.5-2 8 0s5.5 2 8 0" />
      </svg>
    ),
  },
  {
    title: "智能查询改写",
    desc: "系统自动将模糊的用户输入精炼为专业的技术查询，确保检索到最相关的文档。",
    icon: (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
        <path d="M12 20h9" /><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z" />
      </svg>
    ),
  },
  {
    title: "精准来源追溯",
    desc: "每一个结论都由可点击的引用标识支撑，直接链接到内部知识库的源段落。",
    icon: (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
        <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" /><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" />
      </svg>
    ),
  },
  {
    title: "持久上下文对话",
    desc: "系统保持对话状态，支持基于先前发现的复杂追问，无需重复背景信息。",
    icon: (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 3" />
      </svg>
    ),
  },
];

/* 作品集主页(本 demo 由梁瑞的作品集页跳转而来,顶栏与作品集各页一致) */
const PORTFOLIO_URL = "https://liangrui.vercel.app/";
const SITE_LINKS = [
  { label: "首页", href: PORTFOLIO_URL },
  { label: "文档同步 Agent", href: "https://liangrui.vercel.app/docs-agent.html" },
  { label: "文档质检", href: "https://liangrui.vercel.app/qc.html" },
];

function ask(q: string, e?: React.MouseEvent) {
  e?.preventDefault();
  window.dispatchEvent(new CustomEvent("doc-rag:ask", { detail: { q } }));
}

export default function Home() {
  return (
    <div className="min-h-screen">
      {/* 顶部导航 */}
      <header
        className="sticky top-0 z-40 border-b backdrop-blur-md"
        style={{ borderColor: "var(--border)", background: "rgba(247,246,240,0.88)" }}
      >
        <div className="mx-auto flex h-[72px] max-w-[1120px] items-center justify-between px-6 md:px-8">
          <a
            href={PORTFOLIO_URL}
            title="返回作品集主页"
            className="text-[22px] font-bold tracking-[0.02em] transition-opacity hover:opacity-80"
            style={{ fontFamily: "var(--serif)", color: "var(--accent)" }}
          >
            梁瑞
          </a>
          <nav className="flex items-center gap-5 sm:gap-9">
            {SITE_LINKS.map((n) => (
              <a
                key={n.label}
                href={n.href}
                className="text-[13px] tracking-[0.05em] transition-colors hover:text-[var(--accent)]"
                style={{ fontFamily: "var(--mono)", color: "var(--muted)" }}
              >
                {n.label}
              </a>
            ))}
          </nav>
        </div>
      </header>

      {/* Hero 区(7/5,左文右图) */}
      <section className="mx-auto grid max-w-[1120px] grid-cols-1 items-center gap-10 px-6 pb-20 pt-14 md:grid-cols-[7fr_5fr] md:gap-12 md:px-8 md:pt-20 md:pb-24">
        <div>
          <span
            className="t-label mb-5 inline-block rounded-[2px] px-3 py-1.5"
            style={{ background: "var(--accent-soft)", color: "var(--accent)" }}
          >
            文档检索 · INSTANT Q&amp;A
          </span>
          <h1
            className="text-balance text-[2.4rem] font-bold leading-[1.08] tracking-[-0.02em] sm:text-[3.4rem]"
            style={{ color: "var(--accent)" }}
          >
            你的文档，可以对话
          </h1>
          <p className="mt-6 max-w-[540px] text-[17px]" style={{ color: "var(--muted)", lineHeight: 1.7 }}>
            {/* 文案连写在单个表达式里,避免 JSX 换行在中文句中引入多余空格 */}
            {"从入门指南到 SQL 参考，结构化的文档与详实的示例助你快速上手。遇到问题？无需四处翻找，点击右下角"}
            <span style={{ color: "var(--accent)" }}>「智能助手」</span>
            {"，或直接点击页面上的任意按钮，获取基于本地向量库 RAG 系统的即时解答。"}
          </p>
          <div className="mt-9 flex flex-wrap items-center gap-4">
            <a
              href="#"
              onClick={(e) => ask(QUICKSTART_PROMPT, e)}
              className="t-label rounded-full px-7 py-3.5 text-white transition-colors hover:bg-[var(--accent-hover)]"
              style={{ background: "var(--accent)" }}
            >
              快速开始
            </a>
            <a
              href="#"
              onClick={(e) => ask(SQL_PROMPT, e)}
              className="t-label rounded-full border px-7 py-3.5 transition-colors hover:bg-[var(--accent-soft)]"
              style={{ borderColor: "var(--border)", color: "var(--accent)" }}
            >
              查看 SQL 参考
            </a>
          </div>
        </div>
        <div className="overflow-hidden rounded-[2px] transition-transform duration-500 hover:-translate-y-1">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/illust-qa.jpg" alt="智能问答系统插画" className="w-full" />
        </div>
      </section>

      {/* 01 交互特性(带状底) */}
      <section
        className="border-y py-16 md:py-20"
        style={{ borderColor: "var(--border)", background: "rgba(0,91,77,0.03)" }}
      >
        <div className="mx-auto max-w-[1120px] px-6 md:px-8">
          <div className="mx-auto mb-12 max-w-2xl text-center">
            <span className="t-label mb-3 block" style={{ color: "var(--accent)" }}>
              01 · INTERACTION
            </span>
            <h2 className="text-[1.7rem] font-semibold sm:text-[1.9rem]" style={{ color: "var(--foreground)" }}>
              简化知识发现之旅
            </h2>
          </div>
          <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
            {FEATURES.map((f) => (
              <div
                key={f.title}
                className="flex items-start gap-6 rounded-[2px] border p-7 transition-colors duration-300 hover:bg-white/40 md:p-8"
                style={{ borderColor: "var(--border)", background: "var(--vellum)" }}
              >
                <div
                  className="flex h-12 w-12 shrink-0 items-center justify-center rounded-[2px]"
                  style={{ background: "var(--accent-soft)", color: "var(--accent)" }}
                >
                  {f.icon}
                </div>
                <div>
                  <h3 className="text-[1.2rem] font-semibold" style={{ color: "var(--foreground)" }}>
                    {f.title}
                  </h3>
                  <p className="mt-2 text-[14px]" style={{ color: "var(--muted)", lineHeight: 1.65 }}>
                    {f.desc}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA(深绿面板) */}
      <section className="mx-auto max-w-[1120px] px-6 pb-20 md:px-8 md:pb-24">
        <div
          className="relative overflow-hidden rounded-[2px] p-10 text-center text-white md:p-16"
          style={{ background: "linear-gradient(150deg, #0a6a58 0%, var(--accent) 45%, #013a30 100%)" }}
        >
          {/* 网格纹理装饰 */}
          <svg className="pointer-events-none absolute inset-0 h-full w-full opacity-10" xmlns="http://www.w3.org/2000/svg">
            <pattern id="ctagrid" width="40" height="40" patternUnits="userSpaceOnUse">
              <path d="M 40 0 L 0 0 0 40" fill="none" stroke="white" strokeWidth="0.5" />
            </pattern>
            <rect fill="url(#ctagrid)" width="100%" height="100%" />
          </svg>
          <div className="relative z-10">
            <h2 className="text-balance text-[1.9rem] font-bold leading-[1.15] sm:text-[2.6rem]">
              准备好和文档对话了吗？
            </h2>
            <p className="mx-auto mt-5 max-w-xl text-[16px] opacity-80" style={{ lineHeight: 1.7 }}>
              静态的知识库，从此变成有问必答的专家伙伴。
            </p>
            <div className="mt-9 flex flex-col items-center justify-center gap-5 md:flex-row">
              <a
                href="#"
                onClick={(e) => ask(INTRO_PROMPT, e)}
                className="t-label rounded-full bg-white px-9 py-4 transition-transform duration-300 hover:scale-105"
                style={{ color: "var(--accent)" }}
              >
                立即提问
              </a>
              <a
                href={PORTFOLIO_URL}
                className="t-label border-b border-white/30 pb-1 text-white transition-colors hover:border-white"
              >
                返回作品集
              </a>
            </div>
          </div>
        </div>
      </section>

      {/* 页脚 */}
      <footer className="border-t" style={{ borderColor: "var(--border)" }}>
        <div className="mx-auto flex max-w-[1120px] flex-wrap items-center justify-between gap-6 px-6 py-12 md:px-8">
          <div>
            <div className="text-[22px] font-bold" style={{ fontFamily: "var(--serif)", color: "var(--accent)" }}>
              梁瑞
            </div>
            <div className="mt-1.5 text-[10.5px] tracking-[0.05em]" style={{ fontFamily: "var(--mono)", color: "var(--muted)" }}>
              © 2026 LIANG RUI · 技术写作的 AI 实践
            </div>
          </div>
          <div className="flex gap-8">
            <a
              href={PORTFOLIO_URL}
              className="text-[12px] uppercase tracking-[0.1em] transition-colors hover:text-[var(--accent)]"
              style={{ fontFamily: "var(--mono)", color: "var(--muted)" }}
            >
              返回作品集
            </a>
            <a
              href="https://github.com/RuiLiang51666/doc-rag"
              target="_blank"
              rel="noopener"
              className="text-[12px] uppercase tracking-[0.1em] transition-colors hover:text-[var(--accent)]"
              style={{ fontFamily: "var(--mono)", color: "var(--muted)" }}
            >
              GitHub 源码
            </a>
          </div>
        </div>
      </footer>

      {/* 悬浮 AI 助手 */}
      <Assistant />
    </div>
  );
}
