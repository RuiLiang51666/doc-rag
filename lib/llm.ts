import OpenAI from "openai";
import type { SearchResult } from "./search";

const MODEL = process.env.LLM_MODEL || "glm-4-flash";
const BASE_URL = process.env.LLM_BASE_URL || "https://open.bigmodel.cn/api/paas/v4/";
const API_KEY = process.env.LLM_API_KEY || "";

let _client: OpenAI | null = null;

function getClient(): OpenAI {
  if (!API_KEY) {
    throw new Error("未配置 LLM_API_KEY，请在 .env.local 中填写智谱 API Key");
  }
  if (!_client) {
    _client = new OpenAI({ apiKey: API_KEY, baseURL: BASE_URL });
  }
  return _client;
}

/**
 * 本地查询改写（规则/关键词映射，零网络调用）。
 *
 * 设计目标：保留之前花大力气解决的"宽泛问题召回"效果——
 *  - "KWDB 是什么/介绍"类 → 补产品概述 + 多模融合 + 时序/关系，召回产品介绍页
 *  - "数据类型/表/查询/函数"等通用概念 → 同时覆盖『时序』和『关系』两侧术语
 * 思路源自实验结论：query 形如 "KWDB 多模融合 数据库 时序 关系" 能把
 * product-features / product-intro 召回到 Top3，时序侧文档也能被召回。
 */
const EXPANSION_RULES: { match: RegExp; add: string }[] = [
  // 宽泛/定义类问题 —— 召回产品介绍页的关键
  {
    match: /是什么|什么是|是啥|介绍|概述|简介|干什么|做什么|能做|用来|是干嘛|是个啥|属于什么/,
    add: "产品概述 产品介绍 多模融合数据库 分布式数据库 时序数据库 关系数据库 产品特性 应用场景",
  },
  // 通用概念 —— 同时覆盖时序 + 关系两侧
  { match: /数据类型|类型|字段类型/, add: "时序数据类型 关系数据类型 数值类型 字符类型 时间日期类型 布尔类型" },
  { match: /表|table/i, add: "时序表 关系表 创建表 表管理" },
  { match: /数据库|database|建库/i, add: "时序数据库 关系数据库 创建数据库 数据库管理" },
  { match: /查询|检索|query|select/i, add: "时序查询 关系查询 跨模查询 SQL 查询 数据查询" },
  { match: /函数|function/i, add: "时序函数 关系函数 聚合函数 内置函数" },
  { match: /索引|index/i, add: "时序索引 关系索引 创建索引" },
  { match: /插入|写入|导入|insert/i, add: "时序数据写入 关系数据写入 数据导入" },
  // 主题类
  { match: /备份|恢复|容灾|backup|restore/i, add: "备份 恢复 容灾 数据导出 数据导入" },
  { match: /用户|权限|角色|授权|登录|密码/i, add: "用户管理 角色管理 权限管理 授予权限 创建用户" },
  { match: /监控|指标|grafana|告警/i, add: "监控 指标 Grafana 监控仪表板 监控指标" },
  { match: /部署|安装|集群|install|deploy/i, add: "部署 安装 集群部署 单节点部署" },
  { match: /跨模|多模|融合/i, add: "跨模查询 多模数据 时序关系融合" },
  { match: /调优|优化|性能|tuning/i, add: "性能调优 查询优化 SQL 调优" },
];

// 是否为"宽泛/短"问题（用于兜底扩写）
function isBroadQuery(q: string): boolean {
  const stripped = q.replace(/[？?。，,、\s]/g, "");
  return stripped.length <= 10 || /^kwdb/i.test(stripped);
}

export function rewriteQueryLocal(question: string): string {
  const q = question.trim();
  const added = new Set<string>();

  for (const rule of EXPANSION_RULES) {
    if (rule.match.test(q)) {
      rule.add.split(/\s+/).forEach((w) => added.add(w));
    }
  }

  // 兜底：宽泛/短问题但没命中任何规则时，补上产品概述 + 多模两侧，
  // 避免空泛 query 喂不出好向量（如纯 "KWDB"）。
  if (added.size === 0 && isBroadQuery(q)) {
    "KWDB 产品概述 多模融合数据库 时序数据库 关系数据库 产品特性"
      .split(/\s+/)
      .forEach((w) => added.add(w));
  }

  // 原始问题在前，扩写关键词在后；去掉与原问题重复的词
  const extra = [...added].filter((w) => !q.includes(w)).join(" ");
  return extra ? `${q} ${extra}` : q;
}

/** 把检索到的片段拼成带编号的上下文 */
function buildContext(chunks: SearchResult[]): string {
  return chunks
    .map(
      (c, i) =>
        `【片段 ${i + 1}】（来源：${c.filePath} → ${c.heading}）\n${c.content}`
    )
    .join("\n\n---\n\n");
}

const SYSTEM_PROMPT = `你是 KWDB 数据库文档的智能问答助手。请严格遵守以下规则：

1. 只能基于下面提供的「文档片段」回答用户问题，不要使用任何文档之外的知识，不要编造或推测。每个片段都有编号，如【片段 1】【片段 2】。
2. 如果提供的片段中没有足够信息回答问题，必须**原样**只输出这一句：「根据现有文档无法找到相关信息。」——不要改写、不要扩展、不要解释原因。
3. 能回答时，回答要准确、简洁、条理清晰，可以用 Markdown 列表/代码块组织内容。回答正文中**不要**自己写"参考来源"列表（来源由系统单独展示）。
   - 【片段 N】只是系统内部的编号标记，**用户看不到这些片段，也看不到编号**。回答正文里**绝对不要**出现"片段1""【片段2】""根据片段3"这类字样，请把它们当成普通资料，直接自然作答。
   - 反面示例（错误，禁止这样写）：「【片段 1】【片段 3】KWDB 支持数据备份……」
   - 正确示例：「KWDB 支持通过数据导入、导出的方式进行备份……」
4. 在你的完整输出的**最后一行**，必须单独输出一行引用标记，格式严格为：
   引用片段: 1, 3
   即列出你回答时**实际引用了内容**的片段编号（只列真正用到的，不要把所有片段都列上）。
   如果你回答的是「根据现有文档无法找到相关信息。」或没有用到任何片段，则这一行必须输出：
   引用片段: 无`;

const USED_RE = /引用片段[:：]\s*(.+)\s*$/m;

/** 清洗回答正文里残留的内部片段标记（双保险） */
function cleanFragmentMarkers(text: string): string {
  return text
    // 【片段 1】【片段 2、3】等带括号形式
    .replace(/[【\[]\s*片段[\s\d，,、和及]*[】\]]/g, "")
    // 「根据/参见/见 片段 1」中的"片段N"裸写形式
    .replace(/(根据|参见|见|来自|依据)?\s*片段\s*\d+(\s*[、，,和及]\s*\d+)*/g, "")
    // 清理因删除产生的多余空格/空行
    .replace(/[ \t]{2,}/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/** 组装生成回答用的 messages */
function buildAnswerMessages(question: string, chunks: SearchResult[]) {
  const context = buildContext(chunks);
  const userPrompt = `以下是从 KWDB 文档中检索到的相关片段：

${context}

====

用户问题：${question}

请根据上述文档片段回答。`;
  return [
    { role: "system" as const, content: SYSTEM_PROMPT },
    { role: "user" as const, content: userPrompt },
  ];
}

/** 从模型完整输出解析「引用片段」标记 → 实际引用的片段下标（0-based） */
export function parseUsedIndices(raw: string, chunkCount: number): number[] {
  const m = raw.match(USED_RE);
  if (!m) return [];
  const body = m[1].trim();
  if (/^无$|^none$/i.test(body)) return [];
  const idx = Array.from(body.matchAll(/\d+/g))
    .map((x) => parseInt(x[0], 10) - 1)
    .filter((i) => i >= 0 && i < chunkCount);
  return [...new Set(idx)];
}

/** 去掉引用标记行 + 清洗残留内部片段标记 */
export function cleanAnswerText(raw: string): string {
  return cleanFragmentMarkers(raw.replace(USED_RE, "").trim());
}

/**
 * 基于检索到的片段生成回答（非流式）。
 * 返回清理后的回答文本 + 实际引用的片段下标。
 */
export async function generateAnswer(
  question: string,
  chunks: SearchResult[]
): Promise<{ answer: string; usedIndices: number[] }> {
  const client = getClient();
  const completion = await client.chat.completions.create({
    model: MODEL,
    temperature: 0.2,
    messages: buildAnswerMessages(question, chunks),
  });
  const raw = completion.choices[0]?.message?.content?.trim() || "（模型未返回内容）";
  return {
    answer: cleanAnswerText(raw),
    usedIndices: parseUsedIndices(raw, chunks.length),
  };
}

/**
 * 流式生成回答。返回智谱的流式响应（async iterable），
 * 由调用方逐块读取 delta.content。引用标记的解析/剥离在调用方完成。
 */
export async function createAnswerStream(question: string, chunks: SearchResult[]) {
  const client = getClient();
  return client.chat.completions.create({
    model: MODEL,
    temperature: 0.2,
    stream: true,
    messages: buildAnswerMessages(question, chunks),
  });
}

/** 标记关键字，供流式输出时做"尾部 holdback"判断 */
export const USED_MARKER_KEYWORD = "引用片段";

export { MODEL as LLM_MODEL };
