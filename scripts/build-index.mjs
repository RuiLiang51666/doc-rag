/**
 * build-index.mjs
 * 读取所有 chunk，用本地 all-MiniLM-L6-v2 生成 embedding，存入 data/embeddings.json。
 * 可重复运行：已存在索引文件时提示用户，加 --force 强制重建。
 */

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { pipeline, env } from "@huggingface/transformers";

// ── 路径设置 ────────────────────────────────────────────────────────
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const OUTPUT = path.join(ROOT, "data", "embeddings.json");

// 模型缓存放项目内，便于离线重用
env.cacheDir = path.join(ROOT, ".model-cache");
// 禁止自动联网下一个可用模型
env.allowLocalModels = true;

// 中文优化 embedding 模型（BGE）。文档块(passage)不加前缀，只有检索 query 加前缀。
const MODEL_NAME = "Xenova/bge-small-zh-v1.5";

// ── chunk 加载（复制自 lib/chunker.ts 的纯 JS 版本，避免 ts 编译依赖）──

const DOCS_DIR = "/Users/shuaidong/docs";
const MAX = 1500, MIN = 80, HARD_MAX = 3000;
const EXCLUDE_DIRS = new Set(["en", "static", ".git", "node_modules"]);
const EXCLUDE_FILES = new Set([
  "CONTRIBUTING.md", "CONTRIBUTING_EN.md", "LICENSE",
  "README.en.md", "style-guide.md",
]);

function collectMdFiles(dir) {
  const r = [];
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (e.isDirectory() && !EXCLUDE_DIRS.has(e.name))
      r.push(...collectMdFiles(path.join(dir, e.name)));
    else if (e.isFile() && e.name.endsWith(".md") && !EXCLUDE_FILES.has(e.name))
      r.push(path.join(dir, e.name));
  }
  return r;
}
const stripFm = (t) => t.replace(/^---[\s\S]*?---\n?/, "");
const stripImg = (t) => t.replace(/!\[([^\]]*)\]\([^)]*\)/g, (_, a) => a || "");

function splitLong(text, maxLen = MAX) {
  if (text.length <= maxLen) return [text];
  const parts = []; let cur = "";
  const flush = () => { if (cur.trim()) parts.push(cur.trim()); cur = ""; };
  for (const para of text.split(/\n{2,}/)) {
    if (para.length > maxLen) {
      flush(); let lb = "";
      for (const line of para.split("\n")) {
        if (lb.length + line.length + 1 > maxLen && lb) { parts.push(lb.trim()); lb = line; }
        else lb = lb ? lb + "\n" + line : line;
      }
      if (lb.trim()) parts.push(lb.trim());
    } else if (cur.length + para.length + 2 > maxLen && cur) { flush(); cur = para; }
    else cur = cur ? cur + "\n\n" + para : para;
  }
  flush();
  return parts.flatMap((p) => {
    if (p.length <= HARD_MAX) return [p];
    const c = []; for (let i = 0; i < p.length; i += HARD_MAX) c.push(p.slice(i, i + HARD_MAX));
    return c;
  });
}

function parseSections(text) {
  const lines = text.split("\n"), secs = [];
  let cur = { heading: "(文档开头)", lines: [] };
  for (const line of lines) {
    const m = line.match(/^(#{2,4})\s+(.+)/);
    if (m) { if (cur.lines.join("\n").trim()) secs.push(cur); cur = { heading: m[2].trim(), lines: [] }; }
    else cur.lines.push(line);
  }
  if (cur.lines.join("\n").trim()) secs.push(cur);
  return secs;
}

function effectiveBodyLength(content) {
  return content.split("\n").filter((l) => {
    const t = l.trim();
    if (/^#{1,6}\s/.test(t)) return false;
    if (/^(`{3,}|~{3,})\s*\w*\s*$/.test(t)) return false;
    return true;
  }).join("\n").trim().length;
}

function chunkFile(filePath) {
  const raw = fs.readFileSync(filePath, "utf-8");
  const text = stripImg(stripFm(raw));
  const relPath = path.relative(DOCS_DIR, filePath);
  const chunks = [];
  for (const { heading, lines } of parseSections(text)) {
    const rawContent = lines.join("\n").trim();
    if (!rawContent || rawContent.length < 5) continue;
    const parts = splitLong(rawContent);
    parts.forEach((part, i) => {
      if (part.length < MIN && chunks.length > 0) {
        const prev = chunks[chunks.length - 1];
        if (prev.filePath === relPath && prev.content.length + part.length < MAX) {
          prev.content += "\n\n" + part; return;
        }
      }
      chunks.push({
        filePath: relPath,
        heading: parts.length > 1 ? `${heading} (${i + 1}/${parts.length})` : heading,
        content: part,
      });
    });
  }
  return chunks;
}

function loadAllChunks() {
  const files = collectMdFiles(DOCS_DIR);
  const all = [];
  for (const f of files) all.push(...chunkFile(f));
  return all.filter((c) => effectiveBodyLength(c.content) >= 20);
}

// ── 主流程 ──────────────────────────────────────────────────────────

const force = process.argv.includes("--force");

if (fs.existsSync(OUTPUT) && !force) {
  const stat = fs.statSync(OUTPUT);
  const mb = (stat.size / 1024 / 1024).toFixed(1);
  console.log(`⚠️  索引文件已存在 (${mb} MB): ${OUTPUT}`);
  console.log("   使用 --force 强制重建，或直接跳过此步骤。");
  process.exit(0);
}

console.log("📂 加载文档 chunks…");
const chunks = loadAllChunks();
console.log(`   共 ${chunks.length} 个 chunk\n`);

console.log(`🤖 加载模型: ${MODEL_NAME}`);
console.log("   首次运行需下载模型（约 23 MB），请稍候…\n");

const extractor = await pipeline("feature-extraction", MODEL_NAME, {
  revision: "main",
  // 纯 CPU 推理，不需要 GPU
  device: "cpu",
});

const results = [];
const errors = [];
const BATCH = 32; // 每批处理数量，平衡速度与内存

const total = chunks.length;
let done = 0;

/**
 * 向量化输入文本：在正文前拼一行来源（文件路径 > 标题），
 * 提升"按主题/文件名"召回。注意：仅用于 embedding，
 * 存储的 content 仍是不含来源行的原文。
 */
function embedText(chunk) {
  return `来源: ${chunk.filePath} > ${chunk.heading}\n${chunk.content}`;
}

for (let i = 0; i < total; i += BATCH) {
  const batch = chunks.slice(i, i + BATCH);
  const texts = batch.map(embedText);

  try {
    // mean pooling + normalize
    const output = await extractor(texts, { pooling: "mean", normalize: true });
    const vecs = output.tolist(); // float[][]

    for (let j = 0; j < batch.length; j++) {
      results.push({
        filePath: batch[j].filePath,
        heading: batch[j].heading,
        content: batch[j].content,
        embedding: vecs[j],
      });
    }
  } catch (err) {
    // 单批出错时逐条重试，记录失败项
    for (const chunk of batch) {
      try {
        const out = await extractor([embedText(chunk)], { pooling: "mean", normalize: true });
        const vec = out.tolist()[0];
        results.push({ filePath: chunk.filePath, heading: chunk.heading, content: chunk.content, embedding: vec });
      } catch (e2) {
        errors.push({ filePath: chunk.filePath, heading: chunk.heading, error: e2.message });
        console.error(`   ❌ 跳过: ${chunk.filePath} | ${chunk.heading} — ${e2.message}`);
      }
    }
  }

  done = Math.min(i + BATCH, total);
  process.stdout.write(`\r   正在处理 ${done}/${total}… (${Math.round(done / total * 100)}%)`);
}

console.log("\n");

if (errors.length > 0) {
  console.log(`⚠️  ${errors.length} 个 chunk 处理失败（已跳过）：`);
  for (const e of errors) console.log(`   ${e.filePath} | ${e.heading}: ${e.error}`);
  console.log();
}

// 写索引文件
const dim = results[0]?.embedding?.length ?? 0;
const index = { model: MODEL_NAME, dim, total: results.length, chunks: results };
fs.writeFileSync(OUTPUT, JSON.stringify(index));

const sizeMb = (fs.statSync(OUTPUT).size / 1024 / 1024).toFixed(1);
console.log("✅ 索引构建完成！");
console.log(`   向量化 chunk 数: ${results.length}`);
console.log(`   向量维度:        ${dim}`);
console.log(`   索引文件:        ${OUTPUT}`);
console.log(`   文件大小:        ${sizeMb} MB`);
