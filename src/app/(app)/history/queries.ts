import "server-only";
import { createClient } from "@/lib/supabase/server";
import type { GenerationKind } from "@/lib/supabase/database.types";

export const KIND_LABELS: Record<GenerationKind, string> = {
  generate: "投稿生成",
  analyze: "投稿分析",
  rewrite: "リライト",
  research: "競合分析",
};

export const KIND_PATHS: Record<GenerationKind, string> = {
  generate: "/generate",
  analyze: "/analyze",
  rewrite: "/rewrite",
  research: "/research/report",
};

export async function getAccountName(accountId: string | null): Promise<string | undefined> {
  if (!accountId) return undefined;
  const supabase = await createClient();
  const { data } = await supabase.from("managed_accounts").select("name").eq("id", accountId).maybeSingle();
  return data?.name;
}

export type HistoryItem = {
  id: string;
  kind: GenerationKind;
  createdAt: string;
  accountName?: string;
  summary: string;
};

/** 履歴の一覧（本人の分だけ。安全ルールで他人の分は返りません） */
export async function listHistory(options: { kind?: GenerationKind; limit: number }): Promise<HistoryItem[]> {
  const supabase = await createClient();
  let query = supabase
    .from("generations")
    .select("id, kind, account_id, input, created_at")
    .order("created_at", { ascending: false })
    .limit(options.limit);
  if (options.kind) query = query.eq("kind", options.kind);

  const [{ data: rows }, { data: accounts }] = await Promise.all([
    query,
    supabase.from("managed_accounts").select("id, name"),
  ]);
  const names = new Map((accounts ?? []).map((a) => [a.id, a.name]));

  return (rows ?? []).map((row) => {
    const input = (row.input ?? {}) as Record<string, unknown>;
    const summarySource =
      typeof input.theme === "string"
        ? input.theme
        : typeof input.postText === "string"
          ? input.postText
          : "";
    return {
      id: row.id,
      kind: row.kind,
      createdAt: row.created_at,
      accountName: row.account_id ? names.get(row.account_id) : undefined,
      summary: summarySource.replace(/\s+/g, " ").slice(0, 80),
    };
  });
}
