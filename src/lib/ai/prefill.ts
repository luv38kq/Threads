import "server-only";
import type { AnalyzeInput } from "@/lib/ai/prompts/analyze";
import type { GenerateResult } from "@/lib/features/generate";
import type { RewriteResult } from "@/lib/features/rewrite";
import { createClient } from "@/lib/supabase/server";

// 「生成結果 → 分析」「分析 → リライト」のように、前の結果を次の画面に引き継ぐための読み込み。
// 安全ルール（RLS）により、本人の履歴しか読めません。

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export type PostPrefill = { accountId: string; body: string; comments: string; analysisId?: string };

export function joinComments(comments: string[]): string {
  return comments.join("\n---\n");
}

/** 生成結果・リライト結果の n 番目の案を読み込む */
export async function prefillFromPattern(id: unknown, patternIndex: unknown): Promise<PostPrefill | null> {
  if (typeof id !== "string" || !UUID.test(id)) return null;
  const index = Number(patternIndex ?? 0);
  if (!Number.isInteger(index) || index < 0) return null;

  const supabase = await createClient();
  const { data } = await supabase
    .from("generations")
    .select("kind, account_id, output")
    .eq("id", id)
    .in("kind", ["generate", "rewrite"])
    .maybeSingle();
  if (!data) return null;
  const output = data.output as unknown as GenerateResult | RewriteResult;
  const pattern = output.patterns?.[index];
  if (!pattern) return null;
  return { accountId: data.account_id ?? "", body: pattern.body, comments: joinComments(pattern.comments) };
}

/** 分析結果から、分析した元の投稿を読み込む */
export async function prefillFromAnalysis(id: unknown): Promise<PostPrefill | null> {
  if (typeof id !== "string" || !UUID.test(id)) return null;
  const supabase = await createClient();
  const { data } = await supabase
    .from("generations")
    .select("id, account_id, input")
    .eq("id", id)
    .eq("kind", "analyze")
    .maybeSingle();
  if (!data) return null;
  const input = data.input as unknown as AnalyzeInput;
  return { accountId: data.account_id ?? "", body: input.body, comments: input.comments, analysisId: data.id };
}
