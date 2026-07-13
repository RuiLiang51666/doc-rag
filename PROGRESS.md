# KaiwuDB 本地 RAG 文档问答系统 — 进度记录

> 用途：跨会话快速恢复上下文。新会话可直接读本文件了解全貌。
> 最后更新：2026-06-25

---

## 1. 项目目标

基于 **KaiwuDB 中文文档**（位于 `/Users/shuaidong/docs`）搭建一个**本地运行的 RAG 文档问答系统**，用于**面试演示**。

- 文档语言：中文（已排除 `en/` 英文目录）
- 完全本地：embedding 在本机 CPU 运行，不调用任何付费 embedding API
- 生成回答：调用智谱 GLM（OpenAI 兼容接口）
- 第一版目标：本地跑通、能演示

---

## 2. 技术栈

| 层 | 选型 |
|----|------|
| 框架 | Next.js 14（App Router）+ TypeScript + Tailwind CSS |
| 本地 embedding | `@huggingface/transformers` + 模型 `Xenova/bge-small-zh-v1.5`（中文优化，512 维，纯 CPU） |
| 生成大模型 | 智谱 `glm-4-flash`，通过 `openai` npm 包 + 自定义 baseURL 调用 |
| 向量存储 | 本地 JSON 文件（`data/embeddings.json`），无外部向量数据库 |
| Markdown 渲染 | `react-markdown` + `@tailwindcss/typography` |

### 环境注意事项（重要）
- **Node.js 通过 nvm 安装**，不在默认 PATH。每个终端命令前需先加载 nvm：
  ```bash
  export NVM_DIR="$HOME/.nvm" && [ -s "$NVM_DIR/nvm.sh" ] && . "$NVM_DIR/nvm.sh"
  ```
  （Homebrew 版本过旧无法装 node，系统也没预装 node，所以用了 nvm + Node v24.18.0）
- 安装依赖统一加 `--ignore-scripts`，避开 `sharp` 原生编译/下载超时问题。
- 原计划用 `@xenova/transformers`，但它强依赖 `sharp`（图像库）在本机装不上，**改用其官方继任包 `@huggingface/transformers`**，API 兼容、纯 CPU、模型仍是 Xenova 转换版。

### `.env.local`（密钥，已配置）
```
LLM_API_KEY=<智谱 API Key，已填>
LLM_BASE_URL=https://open.bigmodel.cn/api/paas/v4/
LLM_MODEL=glm-4-flash
```

---

## 3. 已完成的部分

1. **项目骨架**：Next.js 14 + TS + Tailwind，首页问答 UI。
2. **文档读取与按标题智能切块**（`lib/chunker.ts`）：
   - 递归读 `/Users/shuaidong/docs` 下所有 `.md`
   - 排除：`en/`、`static/`、`CONTRIBUTING*`、`LICENSE`、`README.en.md`、`style-guide.md`
   - 按 `##` / `###` / `####` 标题切块，每块保留来源（文件相对路径 + 标题）
   - 超长块（>1500字）按段落→按行→硬截（3000字）三层降级
   - 过短块合并到相邻块
   - 图片语法 `![alt](url)` 只保留 alt 文字
3. **过滤无效块**：去掉标题行/代码围栏符后正文 <20 字符的块（删了 26 个纯标题/孤立围栏块，正文未误删）。
4. **本地向量索引构建**（`scripts/build-index.mjs`，`npm run build-index`）：
   - 全部 chunk 用 bge-small-zh-v1.5 向量化，mean pooling + L2 归一化
   - 批处理（每批 32）+ 单条出错跳过的容错
   - **最新版：向量化前在正文前拼一行 `来源: <路径> > <标题>`**（提升按主题召回；存储的 content 仍是原文，不含来源行）
   - 输出 `data/embeddings.json`
5. **检索**（`lib/search.ts`）：
   - 加载索引到内存，问题向量化后与所有 chunk 点积（已归一化=余弦相似度）排序
   - BGE 检索：query 加前缀 `为这个句子生成表示以用于检索相关文章：`，passage 不加
   - 默认 Top 8
6. **接智谱生成回答 + 标注来源**（`app/api/ask/route.ts` + `lib/llm.ts` + `app/page.tsx`）：
   - 流程：提问 → 检索 Top 8 → 拼上下文 + 问题 → glm-4-flash 生成
   - Prompt 强约束：只能基于片段回答、无答案就说"根据现有文档无法找到相关信息"、末尾标注引用来源
   - 错误处理：Key 错/余额不足/网络异常都友好提示；生成失败仍返回检索来源；页面不崩
   - 页面展示：Markdown 回答 + 可折叠的 Top 8 来源片段（带相似度分数）

### 索引现状
- 模型：`Xenova/bge-small-zh-v1.5`，维度 **512**
- chunk 数：**2885**，文件大小约 **32.7 MB**
- 已用"来源前缀"逻辑重建过

---

## 4. 关键文件清单

| 路径 | 作用 |
|------|------|
| `lib/chunker.ts` | 文档读取 + 按标题智能切块 + 过滤无效块；导出 `loadAllChunks()` |
| `lib/search.ts` | 加载索引、问题向量化、点积检索 Top K；导出 `search(query, topK)` |
| `lib/llm.ts` | 智谱客户端（openai 包 + baseURL）、防编造 prompt、`generateAnswer()` |
| `scripts/build-index.mjs` | 构建向量索引脚本（`npm run build-index`），含来源前缀逻辑 |
| `scripts/search-cli.mjs` | 命令行检索测试（`npm run search "问题"`） |
| `scripts/chunk-docs.mjs` | 切块质量检查脚本（打印统计与样例，可选） |
| `app/api/ask/route.ts` | 问答 API：检索 Top 8 + 调 GLM 生成 + 错误处理 |
| `app/api/search/route.ts` | 纯检索 API（不生成，调试用） |
| `app/page.tsx` | 首页 UI：提问框 + Markdown 回答 + 可折叠来源 |
| `data/embeddings.json` | 本地向量索引（构建产物） |
| `.env.local` | 智谱密钥与模型配置 |
| `next.config.mjs` | 把 `@huggingface/transformers` 设为 serverComponentsExternalPackages（避免被 webpack 打包二进制） |
| `tailwind.config.ts` | 启用 typography 插件 |

---

## 5. 怎么启动和测试

**所有命令前先加载 nvm：**
```bash
export NVM_DIR="$HOME/.nvm" && [ -s "$NVM_DIR/nvm.sh" ] && . "$NVM_DIR/nvm.sh"
cd ~/doc-rag
```

- 启动开发服务器：`npm run dev` → 打开 http://localhost:3000
- 构建/重建索引：`npm run build-index`（已存在会跳过）/ `npm run build-index:force`（强制重建，换模型或改向量化逻辑后必须跑）
- 命令行检索测试：`npm run search "你的问题"`（只检索、不生成，看 Top 5 来源与分数）
- 完整问答测试（API）：
  ```bash
  curl -s -X POST localhost:3000/api/ask -H "Content-Type: application/json" -d '{"query":"KWDB 支持哪些数据类型"}'
  ```

---

## 6. 召回优化（已完成 ✅ — 查询改写 query rewriting）

### 6.1 曾经的问题（已解决）
- **"KWDB 是什么"** → 曾召回不到产品定义，LLM 答成"关系型数据库"（错，实为多模数据库）。
- **"KWDB 支持哪些数据类型"** → 曾只召回**关系数据类型**，漏了时序数据类型。

### 6.2 根因（已确认）
- 产品介绍正文、时序数据类型文档（`data-type-ts-db.md`）**都在索引里，没丢内容**。
- 真正根因在 **query 侧**：原始问题太空泛——"KWDB"在几乎每个 chunk 都出现（零区分度）、"是什么"语义稀薄；且 LLM 改写时若不知道 KWDB 是多模数据库，会只往"关系"一面扩写，导致时序文档召回不足。

### 6.3 已落地的解法：查询改写（方案 A）
1. **检索前加一步查询改写**：用户原始问题先发给 `glm-4-flash`（`rewriteQuery()`，temperature 0.3，短 prompt），扩写成便于向量检索的关键词串。
2. **改写器是 KWDB-aware 的**（关键）：system prompt 告诉它"KWDB 是多模融合数据库，同时支持时序和关系"，要求涉及数据类型/表/数据库/查询等通用概念时**同时覆盖『时序』和『关系』两面**，不偏向一侧。这是让时序文档被召回的关键修复。
3. **用改写后的 query 检索 Top 8**；**最终生成喂给 GLM 的是原始问题**（不是改写后的）。
4. **容错**：查询改写失败则回退到原始问题直接检索，不影响主流程。
5. 实现位置：`lib/llm.ts` 的 `rewriteQuery()`，接入 `app/api/ask/route.ts`（流程：改写 → 检索 → 生成）。

### 6.4 验证结果（已通过）
- **"KWDB 是什么"** → Top1 `about-kwdb/product-features.md > 多模融合，一库多用`；回答正确（"多模数据库，将时序与关系数据模型融于一体"）✅
- **"KWDB 支持哪些数据类型"** → Top2 出现 `data-type-ts-db.md`（时序数据类型）；回答同时列出关系类型 + 时序类型 ✅
- **"如何创建时序数据库"** → ts-db 系列（ts-database/ts-table/ts-index）进 Top 8；回答给出 `CREATE TS DATABASE` 完整示例 ✅

### 6.5 来源列表问题（已修 ✅）
- **格式照抄字段名（已修）**：GLM 曾把 prompt 里"文件路径""标题"当字面值打印，甚至出现"文件路径 → 标题"占位空行。已重写 prompt 规则 4：来源直接写真实的「路径 > 标题」值，并给出正确格式示例让其照做。验证（"如何备份数据库"）格式已干净统一。
- **无答案仍列来源（已修）**：曾出现答"无法找到"却仍列 8 条来源。根因是 GLM 把固定句改写成"无法直接比较…"，导致"无答案不列来源"规则没触发。已加强 prompt 规则 2：无答案时**原样**只输出「根据现有文档无法找到相关信息。」、不改写不解释、不输出任何来源。验证（"KWDB 和 MySQL 谁强"）已只输出固定句、零来源。
- **来源 URL 幻觉（已修）**：曾把来源拼成假的 `https://example.com/...`；prompt 已禁止编造 URL，来源只写纯文本路径。

### 6.6 来源与回答一致性（已修 ✅ — 只展示实际引用的来源）
- **问题**：前端无条件展示检索到的全部 8 条来源，与回答脱节——连"无法找到相关信息"时也列 8 条来源，自相矛盾。
- **解法（机器可解析标记）**：生成 prompt 要求模型在输出**最后一行**单独给出 `引用片段: 1, 3`（实际引用的片段编号），无答案/未引用则 `引用片段: 无`。`generateAnswer()` 解析该标记 → 返回 `{ answer, usedIndices }`，并从正文剥离标记行；`app/api/ask/route.ts` 据 `usedIndices` 过滤 `sources` 后再返回。前端不变（只渲染后端返回的已过滤来源）。
- **验证**：「你是谁?」→ 回答"无法找到" + **来源数 0** ✅；「如何备份数据库」→ 正常回答 + **仅 1 条真正引用的来源**（原先 8 条）✅。
- 注：LLM 生成失败的错误分支仍返回检索到的全部来源（属错误态，展示检索上下文便于排查，可接受）。

### 6.7 回答正文混入内部片段标记（已修 ✅）
- **问题**：回答开头偶尔冒出「【片段 1】【片段 3】」等内部标记——模型把 prompt 里给文档段落编号的内部标记直接输出到了正文。
- **解法（双保险）**：
  1. **Prompt 约束**（`lib/llm.ts` SYSTEM_PROMPT 规则 3）：明确告知"【片段 N】只是内部编号、用户看不到"，要求正文绝不出现"片段X""【片段N】"，并给了反面示例 + 正确示例。
  2. **后端清洗**（`cleanFragmentMarkers()`）：正则兜底去除残留的 `【片段 1】`、`片段3`、`根据片段 2` 等形式，并清理多余空格/空行。即使模型偶尔不听话，用户也看不到。
- **验证**：「支持备份数据库吗」「如何创建用户」回答正文均干净、无片段标记 ✅。

### 6.8 性能瓶颈定位（已测量）
- 在 `app/api/ask/route.ts` 加各阶段耗时统计（控制台打印）；`lib/search.ts` 新增 `searchWithTiming()` 区分"向量化"与"检索打分"。
- **实测**：查询改写（智谱）5–10s、问题向量化 ~0.04–0.17s、向量检索 ~0.005s、生成回答（智谱）8–17s、总 19–22s。
- **结论**：瓶颈 100% 在两次串行的智谱 API 调用，本地检索可忽略。→ 已据此做 6.9 两项优化。

### 6.9 性能优化（已完成 ✅ — 流式输出 + 查询改写本地化）
1. **生成回答改流式（streaming）**：
   - `lib/llm.ts` 新增 `createAnswerStream()`（`stream:true`）；`app/api/ask/route.ts` 用 `ReadableStream` 把回答正文逐块推给前端，末尾用 `\n<<<META>>>` 分隔符附上 `{sources}` JSON。
   - 流式时做"尾部 holdback"：检测到 `引用片段` 标记就停止推正文，确保内部标记不外泄。
   - 前端 `app/components/Assistant.tsx` 用 `ReadableStream` reader 逐块拼接、实时渲染（打字机效果）；读到 `<<<META>>>` 后解析来源，回答完成后再展示来源列表。
   - 效果：用户在首 token 到达后即看到文字逐字出现，不再干等整段生成。
2. **查询改写本地化（零网络调用）**：
   - 把原来"调用智谱改写"（5–10s）换成 `rewriteQueryLocal()`——纯规则/关键词映射（`EXPANSION_RULES`）。
   - 保留多模召回效果：宽泛/定义类问题（"是什么/介绍"）补"产品概述+多模融合+时序+关系"；通用概念（数据类型/表/查询/函数等）同时补『时序』『关系』两侧术语；短/宽泛问题有兜底扩写。
   - **耗时从 5–10s 降到 0ms**。
- **验证（流式 + 本地改写）**：
   - 「如何备份数据库」：查询改写 0ms、向量化 ~12ms、检索 ~5ms、生成流式总时长约 10s；token 逐块到达（59 块陆续流出），打字机体感 ✅。
   - 「KWDB 是什么」：召回未退化，引用来源 **#1 = about-kwdb/product-intro.md**（权威定义页），回答正确（多模融合数据库）✅。
   - 「KWDB 支持哪些数据类型」：同时召回时序 `data-type-ts-db.md` + 关系 `data-type-relational-db.md`，回答含两侧类型 ✅。
- 备注：生成的总时长（智谱吐字速度）未变，优化的是**感知延迟**（首字更早可见）+ **彻底省掉改写那一次 5–10s 调用**。

### 6.10 UI 文案中性化（已完成 ✅ — 纯文案，功能未动）
- 目标：UI 上去掉指向具体产品/公司的措辞，改成通用文档站文案（不动问答/检索/文档数据）。
- 改动：
  - Hero 大标题：「构建于 KWDB 之上的开发者文档」→「你的文档，可以对话」
  - 胶囊标签：「多模融合 · 时序+关系一库多用」→「文档检索 · 即时问答」
  - 副标题、四张卡片描述：去掉"安装部署 KWDB/多模查询/时序与关系建模/跨模查询"等，改为通用说明（分区名 快速开始/API 参考/教程/运维管理 保留）
  - 助手面板副标题：「基于 KWDB 文档检索生成」→「基于本地文档检索生成」
  - 助手空状态：「问我关于 KWDB 的任何问题」→「问我关于文档内容的任何问题」；示例问题改为「这个产品是什么？/支持哪些数据类型？/如何快速开始？」
  - 浏览器标签标题（`app/layout.tsx` metadata）→ 中性
  - 顶部导航产品名「开发者文档」保留（本身通用）
- 验证：`GET /` 200，新文案均渲染，主页 DOM 无 KWDB/多模融合/时序与关系/多模查询 残留。

### 6.11 字号层级与间距精修（已完成 ✅ — 纯样式，Vercel/Linear 质感）
- 目标：更克制、层级分明的排版（只改样式，不动结构/功能/配色/主色）。
- Hero（`app/page.tsx`）：
  - 主标题 `text-4xl/5xl` → `text-[2rem]` / `sm:text-[3rem]`（≈48px），`font-extrabold`、`leading-[1.1]`、`tracking-[-0.02em]`（收紧字间距）。
  - 副标题降一号至 `text-[15px]/base`、中灰 `--muted`、`line-height:1.6`，与主标题拉开层级。
  - 间距节奏：上下留白收紧（`pt-16 pb-12` / `sm:pt-20 pb-16`）；badge→标题→副标题→按钮按"相关靠近、组间留白"调为 `mb-5 / mt-4 / mt-7`。
- 卡片：标题 `text-base` semibold + `tracking-[-0.01em]`；描述 `text-[13.5px]` 中灰 `line-height:1.6`；"了解更多" `text-[13px]`；内部间距 `mt-3.5 / mt-2 / mt-4` 调匀；卡片区底部留白 `pb-28→pb-24`。
- 正文统一 line-height ≈1.6；浅色风格与靛蓝主色保持不变；桌面/手机两端断点协调。
- 验证：`GET /` 200，精修类（`text-[3rem]`/`leading-[1.1]`/`tracking-[-0.02em]`/`text-[13.5px]`）均生效。

### 6.12 视觉精修第二轮（已完成 ✅ — 更克制透气、一线产品质感）
- 纯样式，文案/结构/功能/配色/主色不变。
- 主标题再收一档：`sm:text-[3rem]`→`sm:text-[2.875rem]`（≈46px），字重 `extrabold`→`bold`、`leading-[1.12]`，大气不"喊"。
- 卡片内边距加大：`p-5`→`p-6 sm:p-7`（24/28px），文字不再贴边；内部间距调匀（`mt-4 / mt-2.5 / mt-5`）。
- 精致细节：
  - 卡片默认阴影更轻（`shadow-[0_1px_2px_rgba(15,23,42,0.03)]`），hover 上浮 `-translate-y-1` + 阴影加深（`0_14px_32px_-12px`）+ 浅靛蓝边框，`transition-all duration-200 ease-out`。
  - "了解更多 →" 箭头独立 span，hover 轻微右移（`group-hover:translate-x-1`）。
  - 卡片间距加大：`gap-4`→`gap-5 sm:gap-6`。
- 顶部导航：高度 `h-14`→`h-16`，底部极浅分割线 + 轻微投影（`box-shadow`），`backdrop-blur-md`；导航项间距 `gap-7`→`gap-8`、字号 `13.5px`，logo 与文字对齐微调（`gap-2.5`、`tracking`）。
- 验证：`GET /` 200，精修类（`text-[2.875rem]`/`sm:p-7`/`group-hover:translate-x-1`/`h-16`/`gap-8`）均生效。

### 6.13 已知小问题（不阻塞，后续再修）

### 6.9 已知小问题（不阻塞，后续再修）
- **代码块被切断**：约 50 处 chunk 的首/末行含未闭合的 ```` ``` ````，段落切分在代码块内部切断所致。不影响检索正确性，待后续让切块逻辑"不在代码块内部切断"。
- **长列表类回答偏简略**：如"支持哪些聚合函数"，因函数表被切成 ~43 个 chunk，Top 8 只能捞到其中几块，回答列举不全。需调整切块粒度或对这类"枚举型"问题加大 TopK，工程量较大，单独议。
- **有答案时来源仍可能略多列**：已显著改善（备份问题从 8 条降到 2 条），但 GLM 判断"实际引用"仍非 100% 精确，属"尽力而为"范畴。

---

## 7. UI 升级（已完成 ✅ — 文档站 + 右下角悬浮 AI 助手）

**目标**：从单一问答页升级为"精致的真实产品——文档站 + AI 助手"。**功能逻辑未动，纯 UI。**

**视觉风格**：浅色主题、开发者文档站调性（Stripe/Vercel/Linear），靛蓝单一主色 `#4f46e5`，深灰文字（非纯黑）、大量留白、8px 圆角、柔和浅阴影。全部主题色集中在 `app/globals.css` 的 CSS 变量（`--accent`/`--border`/`--surface-muted` 等），改色只需改这里。

**结构**：
- `app/page.tsx`：文档站着陆页（服务端组件）——顶部导航条（产品名 + 导航链接 + 控制台按钮）、Hero 区（主副标题 + CTA）、4 张分区卡片（快速开始/API 参考/教程/运维）。纯展示。
- `app/components/Assistant.tsx`（新建，客户端组件）：右下角悬浮圆形按钮 + 弹出对话面板。**现有问答逻辑（fetch `/api/ask`、回答 Markdown 渲染、可折叠来源）原样搬入，未改。** 含空状态引导（3 个示例问题）、加载态、错误态。
- 字体：Geist Sans（正文）+ Geist Mono（路径/代码），在 `globals.css` 绑定 CSS 变量。
- 动画：面板滑入 `animate-assistant-pop`；细滚动条 `.thin-scroll`。

**响应式**：桌面端面板 380px 宽、贴右下角浮层；手机端（<sm）面板全屏（`100dvh`/`w-full`）。

**验证**：`GET /` 返回 200，编译无错误，landing + 悬浮按钮均渲染；`/api/ask` 逻辑未动、之前已验证可用。

---

## 8. 下一步（恢复会话后从这里继续）
1. 在浏览器实际看一眼 UI 效果（见下方"怎么看效果"），微调间距/配色。
2. 可选打磨：回答流式输出（提升体验）、切块"不切断代码块"修复、枚举型问题加大 TopK。
3. 面试演示前：准备 3-5 个稳定问题的演示脚本。
4. 重测确认产品介绍页 / 时序数据类型页能进 Top 8 后，再回头处理 6.3 的小问题。

---

## 9. Clarified Editorial 换肤 + 流式标记泄漏修复（2026-07-13 ✅）

**换肤(与作品集 liangrui.vercel.app 同一设计语言,功能逻辑未动)**:
- `app/globals.css`:token 全换 —— 纸感底 `#f7f6f0` + 纸纹(`/paper-texture.png`)、深绿主色 `#005b4d`、hairline 边框 `rgba(0,91,77,0.15)`;字体 Google Fonts(Source Serif 4 标题 / Hanken Grotesk 正文 / JetBrains Mono 标签),新增 `.t-label` mono 小标签工具类。Assistant.tsx 全用 `var(--accent)` 等变量,零改动自动换肤。
- `app/page.tsx`:外壳按 Stitch 稿重写 —— 衬线绿 wordmark、mono 导航、药丸按钮;hero 7/5 左文右图(`/illust-qa.jpg`);01 核心板块带状底 + 4 张 vellum 卡;oxblood 左边线引文横幅;02 交互特性 4 项(流式/改写/溯源/上下文);深绿网格纹 CTA;编辑风页脚。NAV/CARDS/prompt 映射与「全站无死链」原则原样保留。
- `public/`(新建):paper-texture.png、illust-qa.jpg(自作品集资产复制)。

**修复:「【片段 N】」再次漏出**
- 根因:`app/api/ask/route.ts` 的 holdback 只在「【 之后没有 】」时停推;若 】已到达但切点落在【…】中间,标记被劈成两半分次推送,两侧都匹配不上清洗正则,拼回后原样可见。
- 修法:只要 】 缺失**或落在本次推送范围之外**,一律停在 【 前等标记完整再推。
- 验证:同一泄漏问题(快速开始指南)重打 API,正文 0 处片段标记。

**验证**:dev 服务器热更新后,首页无 console 报错、无横向溢出;字体/纸纹/主色计算值全部正确;点卡片 → 助手弹出 → 问题发送 → RAG 流式回答正常。

**补充(同日)**:删除未使用的 Geist 本地字体(layout.tsx 的 localFont + app/fonts/),换肤后已无引用,省 ~100KB 加载;`next build` 通过(首页 First Load JS 129KB)。
