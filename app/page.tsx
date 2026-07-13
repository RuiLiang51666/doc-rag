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

/* 作品集主页(本 demo 由梁瑞的作品集页跳转而来,提供返回入口) */
const PORTFOLIO_URL = "https://liangrui.vercel.app/";
/* hero 副按钮固定指向「SQL 参考」,按 tag 取以免卡片顺序调整后错位 */
const SQL_PROMPT = CARDS.find((c) => c.tag === "Reference")!.prompt;

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
          {/* 品牌区即「返回主页」入口:本 demo 由作品集页跳转而来,点击回到作品集主页 */}
          <a
            href={PORTFOLIO_URL}
            title="返回作品集主页"
            className="text-[21px] font-bold transition-opacity hover:opacity-80"
            style={{ fontFamily: "var(--serif)", color: "var(--accent)" }}
          >
            开发者文档
          </a>
          <nav className="hidden items-center gap-8 sm:flex">
            {NAV.map((n) => (
              <a
                key={n.label}
                href="#"
                onClick={(e) => ask(n.prompt, e)}
                className="text-[13px] tracking-[0.05em] transition-colors hover:text-[var(--accent)]"
                style={{ fontFamily: "var(--mono)", color: "var(--muted)" }}
              >
                {n.label}
              </a>
            ))}
          </nav>
          <a
            href="#"
            onClick={(e) => ask(CONSOLE_PROMPT, e)}
            className="t-label rounded-full px-6 py-2.5 text-white transition-colors hover:bg-[var(--accent-hover)]"
            style={{ background: "var(--accent)" }}
          >
            管理工具
          </a>
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
            {"，或直接点击页面任意导航、按钮与卡片，获取基于本地向量库 RAG 系统的即时解答。"}
          </p>
          <div className="mt-9 flex flex-wrap items-center gap-4">
            <a
              href="#"
              onClick={(e) => ask(CARDS[0].prompt, e)}
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

      {/* 01 核心板块(带状底) */}
      <section
        className="border-y py-16 md:py-20"
        style={{ borderColor: "var(--border)", background: "rgba(0,91,77,0.03)" }}
      >
        <div className="mx-auto max-w-[1120px] px-6 md:px-8">
          <div className="mb-10">
            <span className="t-label mb-3 block" style={{ color: "var(--accent)" }}>
              01 · CORE SECTIONS
            </span>
            <h2 className="text-[1.7rem] font-semibold sm:text-[1.9rem]" style={{ color: "var(--foreground)" }}>
              快速上手指南
            </h2>
          </div>
          <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-4">
            {CARDS.map((c) => (
              <button
                key={c.title}
                type="button"
                onClick={() => ask(c.prompt)}
                className="group flex h-full cursor-pointer flex-col rounded-[2px] border p-7 text-left backdrop-blur-[4px] transition-all duration-300 ease-out hover:-translate-y-1 hover:shadow-[0_10px_30px_-10px_rgba(0,91,77,0.15)]"
                style={{ borderColor: "var(--border)", background: "var(--vellum)" }}
              >
                <span
                  className="text-[11px] uppercase tracking-[0.08em]"
                  style={{ fontFamily: "var(--mono)", color: "rgba(0,91,77,0.45)" }}
                >
                  {c.tag}
                </span>
                <h3 className="mt-4 text-[1.25rem] font-semibold" style={{ color: "var(--foreground)" }}>
                  {c.title}
                </h3>
                <p className="mt-2.5 text-[14px]" style={{ color: "var(--muted)", lineHeight: 1.65 }}>
                  {c.desc}
                </p>
                <span
                  className="mt-auto inline-flex items-center gap-1.5 pt-6 text-[12px] font-medium uppercase tracking-[0.08em]"
                  style={{ fontFamily: "var(--mono)", color: "var(--accent)" }}
                >
                  向助手提问
                  <span className="transition-transform duration-200 ease-out group-hover:translate-x-1">→</span>
                </span>
              </button>
            ))}
          </div>
          {/* 引导横幅:oxblood 左边线 + 衬线引文 */}
          <div
            className="mt-12 rounded-[2px] border p-7 md:p-8"
            style={{ borderColor: "var(--border)", borderLeft: "4px solid var(--oxblood)", background: "var(--surface-muted)" }}
          >
            <p className="text-[1.15rem] italic sm:text-[1.3rem]" style={{ fontFamily: "var(--serif)", color: "var(--oxblood)", lineHeight: 1.6 }}>
              「遇到问题？无需四处翻找 —— 页面上的每一个导航、按钮与卡片都可以点击，你的问题会直接转给智能助手。」
            </p>
          </div>
        </div>
      </section>

      {/* 02 交互特性 */}
      <section className="mx-auto max-w-[1120px] px-6 py-16 md:px-8 md:py-20">
        <div className="mx-auto mb-12 max-w-2xl text-center">
          <span className="t-label mb-3 block" style={{ color: "var(--accent)" }}>
            02 · INTERACTION
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
              style={{ borderColor: "var(--border)" }}
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
                onClick={(e) => ask(NAV[0].prompt, e)}
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
              开发者文档
            </div>
            <div className="mt-1.5 text-[10.5px] tracking-[0.05em]" style={{ fontFamily: "var(--mono)", color: "var(--muted)" }}>
              DOC-RAG DEMO · 梁瑞 · 技术写作的 AI 实践
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
