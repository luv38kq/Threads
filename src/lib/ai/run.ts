import "server-only";
import { getApiKeyForCurrentUser } from "@/lib/ai/credentials";
import { AiError } from "@/lib/ai/structured";
import type { CurrentProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import type { AiProvider, KnowledgeItemRow, ManagedAccountRow } from "@/lib/supabase/database.types";

// AI機能（生成・分析・リライト）で共通の下準備：
// 「アカウント設定とナレッジの読み込み」と「本人のAPIキーの取り出し」

export async function loadAccountWithKnowledge(accountId: string): Promise<{
  account: ManagedAccountRow;
  knowledge: Pick<KnowledgeItemRow, "title" | "content">[];
} | null> {
  const supabase = await createClient();
  // 安全ルール（RLS）により、本人のアカウントしか読めません
  const [{ data: account }, { data: knowledge }] = await Promise.all([
    supabase.from("managed_accounts").select("*").eq("id", accountId).maybeSingle(),
    supabase
      .from("knowledge_items")
      .select("title, content")
      .eq("account_id", accountId)
      .order("created_at", { ascending: true }),
  ]);
  if (!account) return null;
  return { account, knowledge: knowledge ?? [] };
}

export async function requireApiKey(
  profile: CurrentProfile,
  provider: AiProvider,
): Promise<{ apiKey: string; model: string }> {
  const credential = await getApiKeyForCurrentUser(profile.id, provider);
  if (!credential) {
    throw new AiError("no credential", "このAIのAPIキーが登録されていません。AI設定で登録してください。");
  }
  if (!credential.model) {
    throw new AiError("no model", "使うモデルが選ばれていません。AI設定でモデルを選んでください。");
  }
  return credential;
}

/** 登録済みのAIの一覧（画面の選択肢用） */
export async function listRegisteredProviders(): Promise<{ provider: AiProvider; model: string }[]> {
  const supabase = await createClient();
  const { data } = await supabase.from("ai_credentials").select("provider, model");
  return data ?? [];
}

export function errorMessage(error: unknown): string {
  if (error instanceof AiError) {
    console.error("[ai]", error.message.slice(0, 500));
    return error.userMessage;
  }
  console.error("[ai] unexpected", error);
  return "エラーが発生しました。時間をおいてもう一度お試しください。";
}
