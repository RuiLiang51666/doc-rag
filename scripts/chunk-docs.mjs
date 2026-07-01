import fs from "fs";
import path from "path";

const DOCS_DIR = "/Users/shuaidong/docs";
const MAX_CHUNK_CHARS = 1500;
const MIN_CHUNK_CHARS = 80;
const HARD_MAX = 3000; // 绝对上限，超过就强制截断

const EXCLUDE_DIRS = new Set(["en", "static", ".git", "node_modules"]);
const EXCLUDE_FILES = new Set([
  "CONTRIBUTING.md",
  "CONTRIBUTING_EN.md",
  "LICENSE",
  "README.en.md",
  "style-guide.md",
]);

/** 递归收集 .md 文件 */
function collectMdFiles(dir) {
  const results = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      if (!EXCLUDE_DIRS.has(entry.name))
        results.push(...collectMdFiles(path.join(dir, entry.name)));
    } else if (
      entry.isFile() &&
      entry.name.endsWith(".md") &&
      !EXCLUDE_FILES.has(entry.name)
    ) {
      results.push(path.join(dir, entry.name));
    }
  }
  return results;
}

/** 去掉 frontmatter */
function stripFrontmatter(text) {
  return text.replace(/^---[\s\S]*?---\n?/, "");
}

/** 清理图片语法，只保留 alt 文字 */
function stripImages(text) {
  return text.replace(/!\[([^\]]*)\]\([^)]*\)/g, (_, alt) => alt || "");
}

/**
 * 按段落切分过长文本；若段落本身超限，按行切；再超就硬截。
 */
function splitLongText(text, maxLen = MAX_CHUNK_CHARS) {
  if (text.length <= maxLen) return [text];

  const parts = [];
  let current = "";

  const flush = () => {
    if (current.trim()) parts.push(current.trim());
    current = "";
  };

  for (const para of text.split(/\n{2,}/)) {
    if (para.length > maxLen) {
      // 段落本身太长（如大表格），按行切
      flush();
      let lineBuf = "";
      for (const line of para.split("\n")) {
        if (lineBuf.length + line.length + 1 > maxLen && lineBuf) {
          parts.push(lineBuf.trim());
          lineBuf = line;
        } else {
          lineBuf = lineBuf ? lineBuf + "\n" + line : line;
        }
      }
      if (lineBuf.trim()) parts.push(lineBuf.trim());
    } else if (current.length + para.length + 2 > maxLen && current) {
      flush();
      current = para;
    } else {
      current = current ? current + "\n\n" + para : para;
    }
  }
  flush();

  // 最终保险：硬截
  return parts.flatMap((p) => {
    if (p.length <= HARD_MAX) return [p];
    const chunks = [];
    for (let i = 0; i < p.length; i += HARD_MAX) chunks.push(p.slice(i, i + HARD_MAX));
    return chunks;
  });
}

/**
 * 把 markdown 文本按 ##、###、#### 标题切成 section[]
 * 每个 section: { heading: string, level: number, lines: string[] }
 */
function parseSections(text) {
  const lines = text.split("\n");
  const sections = [];
  let current = { heading: "(文档开头)", level: 1, lines: [] };

  for (const line of lines) {
    const m = line.match(/^(#{2,4})\s+(.+)/);
    if (m) {
      if (current.lines.join("\n").trim()) sections.push(current);
      current = { heading: m[2].trim(), level: m[1].length, lines: [] };
    } else {
      current.lines.push(line);
    }
  }
  if (current.lines.join("\n").trim()) sections.push(current);
  return sections;
}

/** 切一个 md 文件，返回 chunk[] */
function chunkFile(filePath) {
  const raw = fs.readFileSync(filePath, "utf-8");
  const text = stripImages(stripFrontmatter(raw));
  const relPath = path.relative(DOCS_DIR, filePath);
  const sections = parseSections(text);

  const chunks = [];

  for (const { heading, content: rawContent } of sections.map((s) => ({
    heading: s.heading,
    content: s.lines.join("\n").trim(),
  }))) {
    if (!rawContent || rawContent.length < 5) continue; // 过滤空/极短块

    const parts = splitLongText(rawContent);
    parts.forEach((part, i) => {
      if (part.length < MIN_CHUNK_CHARS && chunks.length > 0) {
        // 太短，合并到上一块（如果同文件）
        const prev = chunks[chunks.length - 1];
        if (prev.filePath === relPath && prev.content.length + part.length < MAX_CHUNK_CHARS) {
          prev.content += "\n\n" + part;
          return;
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

// ---- 主逻辑 ----
const files = collectMdFiles(DOCS_DIR);
console.log(`\n📂 共找到 ${files.length} 个 .md 文件\n`);

const allChunks = [];
for (const f of files) {
  allChunks.push(...chunkFile(f));
}

const lens = allChunks.map((c) => c.content.length);
const avg = Math.round(lens.reduce((a, b) => a + b, 0) / lens.length);

console.log(`✂️  共切出 ${allChunks.length} 个 chunk\n`);
console.log(`📊 chunk 长度分布:`);
console.log(`   最短: ${Math.min(...lens)} 字`);
console.log(`   最长: ${Math.max(...lens)} 字`);
console.log(`   平均: ${avg} 字`);
console.log(`   >1500字: ${lens.filter((l) => l > 1500).length} 个`);
console.log(`   <100字:  ${lens.filter((l) => l < 100).length} 个\n`);

console.log("=".repeat(60));
console.log("前 3 个 chunk 预览:");
console.log("=".repeat(60));
for (const chunk of allChunks.slice(0, 3)) {
  console.log(`\n📄 文件: ${chunk.filePath}`);
  console.log(`🏷️  标题: ${chunk.heading}`);
  console.log(`📝 内容 (${chunk.content.length} 字):\n`);
  const preview = chunk.content.slice(0, 500);
  console.log(preview + (chunk.content.length > 500 ? "\n…(截断)" : ""));
  console.log("-".repeat(60));
}

// 额外：展示来自不同文件的 chunk 样本
console.log("\n=".repeat(30));
console.log("📌 来自不同文件的 chunk 样本 (第 50、200、500 个):");
for (const idx of [50, 200, 500]) {
  const c = allChunks[idx];
  if (!c) continue;
  console.log(`\n[#${idx}] 📄 ${c.filePath} | 🏷️ ${c.heading} | ${c.content.length}字`);
  console.log(c.content.slice(0, 300) + (c.content.length > 300 ? "\n…" : ""));
}
