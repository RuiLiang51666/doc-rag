import Assistant from "./components/Assistant";

const NAV = ["文档", "API 参考", "教程", "下载"];

const CARDS = [
  {
    title: "快速开始",
    desc: "几分钟内完成环境准备与安装，跑通你的第一个示例。",
    tag: "Guide",
  },
  {
    title: "API 参考",
    desc: "完整的接口、参数与配置项说明，随用随查。",
    tag: "Reference",
  },
  {
    title: "教程",
    desc: "由浅入深的实战示例，帮你掌握核心用法与最佳实践。",
    tag: "Tutorial",
  },
  {
    title: "运维管理",
    desc: "部署、监控、备份与故障排查的运维指南。",
    tag: "Ops",
  },
];

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
          className="text-balance mx-auto mt-4 max-w-lg text-[15px] sm:text-base"
          style={{ color: "var(--muted)", lineHeight: 1.6 }}
        >
          从入门指南到接口参考，全面的文档与示例助你快速上手。遇到问题？
          点击右下角的 <span style={{ color: "var(--accent)" }}>智能助手</span>，基于文档即时解答。
        </p>
        <div className="mt-7 flex items-center justify-center gap-3">
          <a
            href="#"
            className="rounded-lg px-5 py-2.5 text-sm font-medium text-white transition-colors"
            style={{ background: "var(--accent)" }}
          >
            快速开始
          </a>
          <a
            href="#"
            className="rounded-lg border px-5 py-2.5 text-sm font-medium transition-colors hover:bg-white"
            style={{ borderColor: "var(--border)", color: "var(--foreground)" }}
          >
            查看 API 参考
          </a>
        </div>
      </section>

      {/* 卡片区 */}
      <section className="mx-auto max-w-6xl px-6 pb-24">
        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 sm:gap-6 lg:grid-cols-4">
          {CARDS.map((c) => (
            <div
              key={c.title}
              className="group rounded-xl border bg-white p-6 shadow-[0_1px_2px_rgba(15,23,42,0.03)] transition-all duration-200 ease-out hover:-translate-y-1 hover:border-[var(--accent)] hover:shadow-[0_14px_32px_-12px_rgba(15,23,42,0.16)] sm:p-7"
              style={{ borderColor: "var(--border)" }}
            >
              <span
                className="inline-block rounded-md px-2 py-0.5 text-[11px] font-medium"
                style={{ background: "var(--accent-soft)", color: "var(--accent)" }}
              >
                {c.tag}
              </span>
              <h3 className="mt-4 text-base font-semibold tracking-[-0.01em]" style={{ color: "var(--foreground)" }}>
                {c.title}
              </h3>
              <p className="mt-2.5 text-[13.5px]" style={{ color: "var(--muted)", lineHeight: 1.6 }}>
                {c.desc}
              </p>
              <span className="mt-5 inline-flex items-center text-[13px] font-medium" style={{ color: "var(--accent)" }}>
                了解更多
                <span className="ml-1 transition-transform duration-200 ease-out group-hover:translate-x-1">→</span>
              </span>
            </div>
          ))}
        </div>
      </section>

      {/* 悬浮 AI 助手 */}
      <Assistant />
    </div>
  );
}
