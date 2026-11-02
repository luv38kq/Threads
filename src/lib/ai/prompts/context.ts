import type { KnowledgeItemRow, ManagedAccountRow } from "@/lib/supabase/database.types";

// アカウント設定とナレッジを、AIに渡す説明文にまとめる処理（生成・分析・リライトで共通）

export type AccountContext = Pick<
  ManagedAccountRow,
  | "name"
  | "threads_username"
  | "profile_summary"
  | "target_audience"
  | "goal"
  | "writing_style"
  | "style_samples"
  | "banned_expressions"
  | "custom_rules"
>;

export type KnowledgeContext = Pick<KnowledgeItemRow, "title" | "content">;

/** ナレッジはAIに渡す量に上限を設ける（料金と精度のバランスのため） */
const KNOWLEDGE_CHAR_LIMIT = 12_000;

function section(tag: string, body: string): string {
  const text = body.trim();
  return text ? `<${tag}>\n${text}\n</${tag}>` : "";
}

export function accountContextText(
  account: AccountContext,
  knowledge: KnowledgeContext[],
  options: { targetOverride?: string } = {},
): string {
  const parts = [
    section("account_name", account.name + (account.threads_username ? `（@${account.threads_username}）` : "")),
    section("account_summary", account.profile_summary),
    section("target_audience", options.targetOverride?.trim() || account.target_audience),
    section("goal", account.goal),
    section("writing_style", account.writing_style),
    section("style_samples", account.style_samples),
    section("custom_rules", account.custom_rules),
    section(
      "banned_expressions",
      account.banned_expressions.map((w) => `- ${w}`).join("\n"),
    ),
  ];

  let used = 0;
  const knowledgeParts: string[] = [];
  for (const item of knowledge) {
    const entry = `## ${item.title}\n${item.content}`;
    if (used + entry.length > KNOWLEDGE_CHAR_LIMIT) break;
    knowledgeParts.push(entry);
    used += entry.length;
  }
  parts.push(section("knowledge", knowledgeParts.join("\n\n")));

  return parts.filter(Boolean).join("\n\n");
}
