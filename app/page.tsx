"use client";

import Assistant from "./components/Assistant";

/* 全站无死链:每个可点击位都映射为一个与知识库内容对齐的问题,点击即转投智能助手。
   知识库主题覆盖:产品介绍/快速开始/部署/SQL 参考/开发接入/运维/工具/最佳实践/版本说明 */
const NAV = [
  { label: "产品介绍", prompt: "请根据本站文档，介绍一下本产品是什么，它的核心特性与典型应用场景有哪些？" },
  { label: "部署指南", prompt: "请根据本站文档，总结本产品支持的部署方式，以及部署前需要满足的环境要求。" },
  { label: "最佳实践", prompt: "请根据本站文档，介绍有哪些最佳实践，例如高可用部署或 JDBC 批量写入的建议做法。" },
  { label: "版本说明", prompt: "请根据本站文档，介绍最新版本包含的主要新特性与重要变更。" },
];

const CONSOLE_PROMPT = "请根据本站文档，介绍本产品提供了哪些数据库管理与开发工具，分别适用于什么场景？";

const CARDS = [
  {
    title: "快速开始",
    desc: "几分钟内完成环境准备与安装，跑通你的第一个示例。",
    tag: "Guide",
    prompt: "请根据本站文档，给我一份快速开始指南：环境准备、安装步骤和第一个可运行的示例。",
  },
  {
    title: "开发接入",
    desc: "通过 JDBC 等驱动连接数据库，快速完成应用开发。",
    tag: "Develop",
    prompt: "请根据本站文档，说明如何通过 JDBC 连接数据库并完成建表与数据写入，尽量给出示例代码。",
  },
  {
    title: "运维管理",
    desc: "部署、监控、备份与故障排查的运维指南。",
    tag: "Ops",
    prompt: "请根据本站文档，总结部署、监控、备份与故障排查的关键运维要点。",
  },
  {
    title: "SQL 参考",
    desc: "完整的 SQL 语法、数据类型与函数说明，随用随查。",
    tag: "Reference",
    prompt: "请根据本站文档，概述本产品支持的 SQL 语法类别与常用语句，并举例说明。",
  },
];

/* 作品集主页(本 demo 由梁瑞的作品集页跳转而来,提供返回入口) */
const PORTFOLIO_URL = "https://personal-site-two-jet.vercel.app/";
/* hero 副按钮固定指向「SQL 参考」,按 tag 取以免卡片顺序调整后错位 */
const SQL_PROMPT = CARDS.find((c) => c.tag === "Reference")!.prompt;

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
          {/* 品牌区即「返回主页」入口:本 demo 由作品集页跳转而来,点击 logo 回到作品集主页 */}
          <a href={PORTFOLIO_URL} title="返回作品集主页" className="group flex items-center gap-2.5">
            <span
              className="flex h-7 w-7 items-center justify-center rounded-lg text-sm font-bold text-white transition-transform group-hover:scale-105"
              style={{ background: "var(--accent)" }}
            >
              K
            </span>
            <span className="text-[15px] font-semibold tracking-[-0.01em] transition-colors group-hover:text-[var(--accent)]" style={{ color: "var(--foreground)" }}>
              开发者文档
            </span>
          </a>
          <nav className="hidden items-center gap-8 sm:flex">
            {NAV.map((n) => (
              <a
                key={n.label}
                href="#"
                onClick={(e) => ask(n.prompt, e)}
                className="text-[13.5px] transition-colors hover:text-[var(--accent)]"
                style={{ color: "var(--muted)" }}
              >
                {n.label}
              </a>
            ))}
          </nav>
          <a
            href="#"
            onClick={(e) => ask(CONSOLE_PROMPT, e)}
            className="rounded-lg px-3 py-1.5 text-sm font-medium text-white transition-colors hover:bg-[var(--accent-hover)]"
            style={{ background: "var(--accent)" }}
          >
            管理工具
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
          {"从入门指南到 SQL 参考，结构化的文档与详实的示例助你快速上手。遇到问题？无需四处翻找，点击右下角"}
          <span style={{ color: "var(--accent)" }}>「智能助手」</span>
          {"，或直接点击页面任意导航、按钮与卡片，获取基于本地向量库 RAG 系统的即时解答。"}
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
            onClick={(e) => ask(SQL_PROMPT, e)}
            className="rounded-lg border bg-white px-5 py-2.5 text-sm font-medium transition-colors hover:border-[var(--accent)]"
            style={{ borderColor: "#d3cbb8", color: "var(--foreground)" }}
          >
            查看 SQL 参考
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
