import fs from "fs";
import path from "path";
import { pipeline, env, type FeatureExtractionPipeline } from "@huggingface/transformers";

export interface SearchResult {
  score: number;
  content: string;
  filePath: string;
  heading: string;
}

interface IndexedChunk {
  filePath: string;
  heading: string;
  content: string;
  embedding: number[];
}

interface IndexFile {
  model: string;
  dim: number;
  total: number;
  chunks: IndexedChunk[];
}

const ROOT = process.cwd();
const INDEX_PATH = path.join(ROOT, "data", "embeddings.json");
const MODEL_NAME = "Xenova/bge-small-zh-v1.5";
// BGE 检索：query 需加指令前缀，passage（文档块）不加
const QUERY_PREFIX = "为这个句子生成表示以用于检索相关文章：";

// 模型随仓库打包在 models/(Vercel serverless 只读文件系统,禁止运行时下载)。
// 检索用 q8 量化模型(23MB vs fp32 90MB);索引仍是 fp32 构建,已实测两者
// Top-1 完全一致、Top-5 仅近分项微调,对 Top-8 召回无影响。
env.cacheDir = path.join(ROOT, "models");
env.allowLocalModels = true;
env.allowRemoteModels = false;

let _index: IndexFile | null = null;
let _extractor: FeatureExtractionPipeline | null = null;

/** 懒加载索引文件（首次调用时读入内存） */
function getIndex(): IndexFile {
  if (_index) return _index;
  if (!fs.existsSync(INDEX_PATH)) {
    throw new Error(`索引文件不存在: ${INDEX_PATH}，请先运行 npm run build-index`);
  }
  _index = JSON.parse(fs.readFileSync(INDEX_PATH, "utf-8")) as IndexFile;
  return _index;
}

/** 懒加载本地 embedding 模型（单例，避免重复加载） */
async function getExtractor(): Promise<FeatureExtractionPipeline> {
  if (_extractor) return _extractor;
  _extractor = await pipeline("feature-extraction", MODEL_NAME, { device: "cpu", dtype: "q8" });
  return _extractor;
}

/** 把问题文本转成归一化向量 */
async function embedQuery(text: string): Promise<number[]> {
  const extractor = await getExtractor();
  const output = await extractor([QUERY_PREFIX + text], { pooling: "mean", normalize: true });
  return output.tolist()[0] as number[];
}

/** 点积（向量已归一化，等价于余弦相似度） */
function dot(a: number[], b: number[]): number {
  let s = 0;
  for (let i = 0; i < a.length; i++) s += a[i] * b[i];
  return s;
}

/**
 * 检索：输入问题 → 返回 Top K 最相关 chunk。
 */
export async function search(query: string, topK = 5): Promise<SearchResult[]> {
  const { results } = await searchWithTiming(query, topK);
  return results;
}

/**
 * 同 search，但额外返回各阶段耗时（ms）：
 * embedMs = 问题本地向量化；scoreMs = 向量检索（打分+排序）。
 */
export async function searchWithTiming(
  query: string,
  topK = 5
): Promise<{ results: SearchResult[]; embedMs: number; scoreMs: number }> {
  const index = getIndex();

  const t0 = performance.now();
  const qVec = await embedQuery(query);
  const t1 = performance.now();

  const scored = index.chunks.map((c) => ({
    score: dot(qVec, c.embedding),
    content: c.content,
    filePath: c.filePath,
    heading: c.heading,
  }));
  scored.sort((a, b) => b.score - a.score);
  const results = scored.slice(0, topK);
  const t2 = performance.now();

  return { results, embedMs: t1 - t0, scoreMs: t2 - t1 };
}

export { MODEL_NAME, INDEX_PATH };
