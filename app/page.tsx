"use client";

import Assistant from "./components/Assistant";

const NAV = ["文档", "API 参考", "教程", "下载"];

/* Demo 页卡片均为演示性死链:点击统一拦截,转投右下角智能助手并自动检索对应主题 */
const CARDS = [
  {
    title: "快速开始",
    desc: "几分钟内完成环境准备与安装，跑通你的第一个示例。",
    tag: "Guide",
    prompt: "请根据本站文档，给我一份快速开始指南：环境准备、安装步骤和第一个可运行的示例。",
  },
  {
    title: "API 参考",
    desc: "完整的接口、参数与配置项说明，随用随查。",
    tag: "Reference",
    prompt: "请帮我查阅本站文档中关于 API 的核心参数与配置说明。",
  },
  {
    title: "教程",
    desc: "由浅入深的实战示例，帮你掌握核心用法与最佳实践。",
    tag: "Tutorial",
    prompt: "请基于本站文档，推荐一条由浅入深的学习路径，并概述各部分的重点。",
  },
  {
    title: "运维管理",
    desc: "部署、监控、备份与故障排查的运维指南。",
    tag: "Ops",
    prompt: "请根据本站文档，总结部署、监控、备份与故障排查的关键运维要点。",
  },
];

function ask(q: string, e?: React.MouseEvent) {
  e?.preventDefault();
  window.dispatchEvent(new CustomEvent("doc-rag:ask", { detail: { q } }));
}

export default function Home() {
  return (
    <div className="min-h-screen" style={{ background: "var(--surface-muted)" }}>
      {/* 顶部导航 */}
      <header
        className="sticky top-0 z-40 border-b backdrop-blur-md"
        style={{
          borderColor: "var(--border)",
          background: "rgba(255,255,255,0.72)",
          boxShadow: "0 1px 0 rgba(15,23,42,0.02), 0 1px 8px rgba(15,23,42,0.03)",
        }}
      >
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-6">
          <div className="flex items-center gap-2.5">
            <span
              className="flex h-7 w-7 items-center justify-center rounded-lg text-sm font-bold text-white"
              style={{ background: "var(--accent)" }}
            >
              K
            </span>
            <span className="text-[15px] font-semibold tracking-[-0.01em]" style={{ color: "var(--foreground)" }}>
              开发者文档
            </span>
          </div>
          <nav className="hidden items-center gap-8 sm:flex">
            {NAV.map((n) => (
              <a
                key={n}
                href="#"
                className="text-[13.5px] transition-colors hover:text-[var(--accent)]"
                style={{ color: "var(--muted)" }}
              >
                {n}
              </a>
            ))}
          </nav>
          <a
            href="#"
            className="rounded-lg px-3 py-1.5 text-sm font-medium text-white transition-colors"
            style={{ background: "var(--accent)" }}
          >
            控制台
          </a>
        </div>
      </header>

      {/* Hero 区 */}
      <section className="mx-auto max-w-6xl px-6 pt-16 pb-12 text-center sm:pt-20 sm:pb-16">
        <div
          className="mx-auto mb-5 inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[12px] font-medium"
          style={{ borderColor: "var(--border)", background: "var(--surface)", color: "var(--muted)" }}
        >
          <span className="h-1.5 w-1.5 rounded-full" style={{ background: "var(--accent)" }} />
          文档检索 · 即时问答
        </div>
        <h1
          className="text-balance mx-auto max-w-3xl text-[1.875rem] font-bold leading-[1.12] tracking-[-0.02em] sm:text-[2.875rem]"
          style={{ color: "var(--foreground)" }}
        >
          你的文档，可以对话
        </h1>
        <p
          className="text-balance mx-auto mt-4 max-w-xl text-[15px] sm:text-base"
          style={{ color: "var(--muted)", lineHeight: 1.6 }}
        >
          {/* 文案连写在单个表达式里,避免 JSX 换行在中文句中引入多余空格 */}
          {"从入门指南到接口参考，结构化的文档与详实的示例助你快速上手。遇到问题？无需四处翻找，点击右下角"}
          <span style={{ color: "var(--accent)" }}>「智能助手」</span>
          {"或直接点击下方任意卡片，获取基于本地向量库 RAG 系统的即时解答。"}
        </p>
        <div className="mt-7 flex items-center justify-center gap-3">
          <a
            href="#"
            onClick={(e) => ask(CARDS[0].prompt, e)}
            className="rounded-lg px-5 py-2.5 text-sm font-medium text-white transition-colors"
            style={{ background: "var(--accent)" }}
          >
            快速开始
          </a>
          <a
            href="#"
            onClick={(e) => ask(CARDS[1].prompt, e)}
            className="rounded-lg border bg-white px-5 py-2.5 text-sm font-medium transition-colors hover:border-[var(--accent)]"
            style={{ borderColor: "#d3cbb8", color: "var(--foreground)" }}
          >
            查看 API 参考
          </a>
        </div>
      </section>

      {/* 卡片区 */}
      <section className="mx-auto max-w-6xl px-6 pb-24">
        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 sm:gap-6 lg:grid-cols-4">
          {CARDS.map((c) => (
            <button
              key={c.title}
              type="button"
              onClick={() => ask(c.prompt)}
              className="group flex h-full cursor-pointer flex-col rounded-xl border bg-white p-6 text-left shadow-[0_1px_2px_rgba(15,23,42,0.03)] transition-all duration-300 ease-out hover:-translate-y-1 hover:border-[var(--accent)] hover:shadow-[0_14px_32px_-12px_rgba(15,23,42,0.16)] sm:p-7"
              style={{ borderColor: "var(--border)" }}
            >
              <span
                className="inline-block rounded-md px-2 py-0.5 text-[11px] font-semibold"
                style={{ background: "var(--accent-soft)", color: "var(--accent-hover)" }}
              >
                {c.tag}
              </span>
              <h3 className="mt-4 text-base font-semibold tracking-[-0.01em]" style={{ color: "var(--foreground)" }}>
                {c.title}
              </h3>
              <p className="mt-2.5 text-[13.5px]" style={{ color: "var(--muted)", lineHeight: 1.6 }}>
                {c.desc}
              </p>
              <span className="mt-auto inline-flex items-center pt-5 text-[13px] font-medium" style={{ color: "var(--accent)" }}>
                向助手提问
                <span className="ml-1 transition-transform duration-200 ease-out group-hover:translate-x-1">→</span>
              </span>
            </button>
          ))}
        </div>
      </section>

      {/* 悬浮 AI 助手 */}
      <Assistant />
    </div>
  );
}
