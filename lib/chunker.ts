import fs from "fs";
import path from "path";

export interface Chunk {
  filePath: string; // 相对于 DOCS_DIR 的路径
  heading: string;
  content: string;
}

const DOCS_DIR = "/Users/shuaidong/docs";
const MAX_CHUNK_CHARS = 1500;
const MIN_CHUNK_CHARS = 80;
const HARD_MAX = 3000;

const EXCLUDE_DIRS = new Set(["en", "static", ".git", "node_modules"]);
const EXCLUDE_FILES = new Set([
  "CONTRIBUTING.md",
  "CONTRIBUTING_EN.md",
  "LICENSE",
  "README.en.md",
  "style-guide.md",
]);

function collectMdFiles(dir: string): string[] {
  const results: string[] = [];
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

function stripFrontmatter(text: string): string {
  return text.replace(/^---[\s\S]*?---\n?/, "");
}

function stripImages(text: string): string {
  return text.replace(/!\[([^\]]*)\]\([^)]*\)/g, (_, alt) => alt || "");
}

function splitLongText(text: string, maxLen = MAX_CHUNK_CHARS): string[] {
  if (text.length <= maxLen) return [text];

  const parts: string[] = [];
  let current = "";

  const flush = () => {
    if (current.trim()) parts.push(current.trim());
    current = "";
  };

  for (const para of text.split(/\n{2,}/)) {
    if (para.length > maxLen) {
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

  return parts.flatMap((p) => {
    if (p.length <= HARD_MAX) return [p];
    const chunks: string[] = [];
    for (let i = 0; i < p.length; i += HARD_MAX) chunks.push(p.slice(i, i + HARD_MAX));
    return chunks;
  });
}

function parseSections(text: string) {
  const lines = text.split("\n");
  const sections: { heading: string; level: number; lines: string[] }[] = [];
  let current = { heading: "(文档开头)", level: 1, lines: [] as string[] };

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

function chunkFile(filePath: string): Chunk[] {
  const raw = fs.readFileSync(filePath, "utf-8");
  const text = stripImages(stripFrontmatter(raw));
  const relPath = path.relative(DOCS_DIR, filePath);
  const sections = parseSections(text);

  const chunks: Chunk[] = [];

  for (const { heading, lines } of sections) {
    const rawContent = lines.join("\n").trim();
    if (!rawContent || rawContent.length < 5) continue;

    const parts = splitLongText(rawContent);
    parts.forEach((part, i) => {
      if (part.length < MIN_CHUNK_CHARS && chunks.length > 0) {
        const prev = chunks[chunks.length - 1];
        if (
          prev.filePath === relPath &&
          prev.content.length + part.length < MAX_CHUNK_CHARS
        ) {
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

/**
 * 计算 chunk 的"实质正文"长度：
 * 去掉 # 开头的标题行、单独成行的代码围栏符（``` 或 ~~~），再去空白。
 * 保留含真实代码/命令的行（围栏内部内容不受影响）。
 */
export function effectiveBodyLength(content: string): number {
  const body = content
    .split("\n")
    .filter((line) => {
      const t = line.trim();
      // 去掉纯标题行
      if (/^#{1,6}\s/.test(t)) return false;
      // 去掉单独成行的代码围栏开闭符（只有 ``` 或 ~~~ 加可选语言标识，无其他内容）
      if (/^(`{3,}|~{3,})\s*\w*\s*$/.test(t)) return false;
      return true;
    })
    .join("\n")
    .trim();
  return body.length;
}

/**
 * 判断一个 chunk 是否应被过滤掉：
 * 实质正文 < 20 字符视为无效。
 * 注意：包含真实代码行（围栏内部内容）的块不会被过滤，
 * 因为围栏内部行不会被 effectiveBodyLength 剔除。
 */
export function isNearEmpty(chunk: Chunk): boolean {
  return effectiveBodyLength(chunk.content) < 20;
}

let _cache: Chunk[] | null = null;

/** 读取并切分所有文档，过滤无效块后缓存 */
export function loadAllChunks(): Chunk[] {
  if (_cache) return _cache;
  const files = collectMdFiles(DOCS_DIR);
  const chunks: Chunk[] = [];
  for (const f of files) chunks.push(...chunkFile(f));
  _cache = chunks.filter((c) => !isNearEmpty(c));
  return _cache;
}

/** 仅供诊断：返回未过滤的原始列表和被过滤列表 */
export function loadAllChunksWithStats(): {
  before: Chunk[];
  after: Chunk[];
  filtered: Chunk[];
} {
  const files = collectMdFiles(DOCS_DIR);
  const before: Chunk[] = [];
  for (const f of files) before.push(...chunkFile(f));
  const filtered = before.filter((c) => isNearEmpty(c));
  const after = before.filter((c) => !isNearEmpty(c));
  return { before, after, filtered };
}

export { DOCS_DIR };
