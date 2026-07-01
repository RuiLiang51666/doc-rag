import { NextRequest, NextResponse } from "next/server";
import { search } from "@/lib/search";

// 本地模型推理需 Node runtime（非 Edge）
export const runtime = "nodejs";
// 不缓存，每次实时检索
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  try {
    const { query, topK } = await req.json();
    if (!query || typeof query !== "string" || !query.trim()) {
      return NextResponse.json({ error: "问题不能为空" }, { status: 400 });
    }

    const results = await search(query.trim(), topK ?? 5);
    return NextResponse.json({ results });
  } catch (err) {
    const message = err instanceof Error ? err.message : "检索失败";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
