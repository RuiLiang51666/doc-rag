/**
 * search-cli.mjs — 命令行检索测试
 * 用法: npm run search "如何创建时序数据库"
 */

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { pipeline, env } from "@huggingface/transformers";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const INDEX_PATH = path.join(ROOT, "data", "embeddings.json");

env.cacheDir = path.join(ROOT, ".model-cache");
env.allowLocalModels = true;

const MODEL_NAME = "Xenova/bge-small-zh-v1.5";
const QUERY_PREFIX = "为这个句子生成表示以用于检索相关文章：";

const query = process.argv.slice(2).join(" ").trim();
if (!query) {
  console.error('用法: npm run search "你的问题"');
  process.exit(1);
}

if (!fs.existsSync(INDEX_PATH)) {
  console.error(`索引不存在: ${INDEX_PATH}，请先运行 npm run build-index`);
  process.exit(1);
}

console.log(`🔍 问题: ${query}\n`);

const index = JSON.parse(fs.readFileSync(INDEX_PATH, "utf-8"));
const extractor = await pipeline("feature-extraction", MODEL_NAME, { device: "cpu" });
const out = await extractor([QUERY_PREFIX + query], { pooling: "mean", normalize: true });
const qVec = out.tolist()[0];

const dot = (a, b) => { let s = 0; for (let i = 0; i < a.length; i++) s += a[i] * b[i]; return s; };

const scored = index.chunks
  .map((c) => ({ score: dot(qVec, c.embedding), ...c }))
  .sort((a, b) => b.score - a.score)
  .slice(0, 5);

console.log("═".repeat(70));
console.log("Top 5 检索结果:");
console.log("═".repeat(70));
scored.forEach((r, i) => {
  console.log(`\n#${i + 1}  相似度: ${r.score.toFixed(4)}`);
  console.log(`📄 ${r.filePath}  |  🏷️  ${r.heading}`);
  console.log("─".repeat(70));
  console.log(r.content.slice(0, 400) + (r.content.length > 400 ? "\n…(截断)" : ""));
});
