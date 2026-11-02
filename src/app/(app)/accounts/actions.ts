"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireActiveUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { isProvider } from "@/lib/ai/providers";
import { buildStylePrompt, MIN_SAMPLE_CHARS, STYLE_SYSTEM_PROMPT, styleOutputSchema, styleToText } from "@/lib/ai/prompts/style";
import { errorMessage, requireApiKey } from "@/lib/ai/run";
import { generateStructured } from "@/lib/ai/structured";
import { countChars } from "@/lib/posts/rules";
import {
  accountSchema,
  fieldErrors,
  formValues,
  knowledgeSchema,
  type FormState,
} from "@/lib/validation";

// どの処理も、最初に「承認済みの本人か」を確認します。
// さらにデータベース側の安全ルール（RLS）で、他人のデータには触れられません。

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function toRow(input: ReturnType<typeof accountSchema.parse>) {
  return {
    name: input.name,
    threads_username: input.threadsUsername,
    profile_summary: input.profileSummary,
    target_audience: input.targetAudience,
    goal: input.goal,
    writing_style: input.writingStyle,
    style_samples: input.styleSamples,
    banned_expressions: input.bannedExpressions,
    custom_rules: input.customRules,
  };
}

export async function saveAccount(_prev: FormState, formData: FormData): Promise<FormState> {
  await requireActiveUser();
  const values = formValues(formData);
  const parsed = accountSchema.safeParse(values);
  if (!parsed.success) {
    return { errors: fieldErrors(parsed.error), values, message: "入力内容を確認してください。" };
  }

  const supabase = await createClient();
  const id = values.id;
  let accountId: string;

  if (id) {
    if (!UUID.test(id)) return { message: "アカウントが見つかりません。", values };
    const { data, error } = await supabase
      .from("managed_accounts")
      .update(toRow(parsed.data))
      .eq("id", id)
      .select("id")
      .maybeSingle();
    if (error || !data) {
      console.error("[saveAccount] update", error?.message);
      return { message: "保存できませんでした。もう一度お試しください。", values };
    }
    accountId = data.id;
  } else {
    const { data, error } = await supabase
      .from("managed_accounts")
      .insert(toRow(parsed.data))
      .select("id")
      .single();
    if (error) {
      console.error("[saveAccount] insert", error.message);
      return { message: "保存できませんでした。もう一度お試しください。", values };
    }
    accountId = data.id;
  }

  revalidatePath("/accounts");
  redirect(`/accounts/${accountId}?saved=1`);
}

export async function deleteAccount(formData: FormData) {
  await requireActiveUser();
  const id = String(formData.get("id") ?? "");
  if (!UUID.test(id)) return;
  const supabase = await createClient();
  const { error } = await supabase.from("managed_accounts").delete().eq("id", id);
  if (error) console.error("[deleteAccount]", error.message);
  revalidatePath("/accounts");
  redirect("/accounts");
}

export async function addKnowledge(_prev: FormState, formData: FormData): Promise<FormState> {
  await requireActiveUser();
  const values = formValues(formData);
  const accountId = values.accountId ?? "";
  if (!UUID.test(accountId)) return { message: "アカウントが見つかりません。" };

  const parsed = knowledgeSchema.safeParse(values);
  if (!parsed.success) return { errors: fieldErrors(parsed.error), values };

  const supabase = await createClient();
  const { error } = await supabase.from("knowledge_items").insert({
    account_id: accountId,
    title: parsed.data.title,
    content: parsed.data.content,
  });
  if (error) {
    console.error("[addKnowledge]", error.message);
    return { message: "保存できませんでした。もう一度お試しください。", values };
  }
  revalidatePath(`/accounts/${accountId}`);
  return { ok: true, message: "ナレッジを追加しました。" };
}

export async function updateKnowledge(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  await requireActiveUser();
  const values = formValues(formData);
  const id = values.id ?? "";
  if (!UUID.test(id)) return { message: "ナレッジが見つかりません。" };

  const parsed = knowledgeSchema.safeParse(values);
  if (!parsed.success) return { errors: fieldErrors(parsed.error), values };

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("knowledge_items")
    .update({ title: parsed.data.title, content: parsed.data.content })
    .eq("id", id)
    .select("account_id")
    .maybeSingle();
  if (error || !data) {
    console.error("[updateKnowledge]", error?.message);
    return { message: "保存できませんでした。もう一度お試しください。", values };
  }
  revalidatePath(`/accounts/${data.account_id}`);
  return { ok: true, message: "保存しました。" };
}

export async function deleteKnowledge(formData: FormData) {
  await requireActiveUser();
  const id = String(formData.get("id") ?? "");
  if (!UUID.test(id)) return;
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("knowledge_items")
    .delete()
    .eq("id", id)
    .select("account_id")
    .maybeSingle();
  if (error) console.error("[deleteKnowledge]", error.message);
  if (data) revalidatePath(`/accounts/${data.account_id}`);
}

// ---------------------------------------------------------------------
// 過去の投稿の見本から、文章のクセをAIで読み取って「文章のクセ」欄に入れる
// ---------------------------------------------------------------------
export async function extractWritingStyle(_prev: FormState, formData: FormData): Promise<FormState> {
  const profile = await requireActiveUser();
  const accountId = String(formData.get("accountId") ?? "");
  const provider = formData.get("provider");
  if (!UUID.test(accountId)) return { message: "アカウントが見つかりません。" };
  if (!isProvider(provider)) return { message: "AIを選んでください。" };

  try {
    const supabase = await createClient();
    const { data: account } = await supabase
      .from("managed_accounts")
      .select("style_samples")
      .eq("id", accountId)
      .maybeSingle();
    if (!account) return { message: "アカウントが見つかりません。" };
    if (countChars(account.style_samples.trim()) < MIN_SAMPLE_CHARS) {
      return {
        message: `先に「過去の投稿の見本」を${MIN_SAMPLE_CHARS}文字以上入れて保存してください（2〜5本ほどがおすすめです）。`,
      };
    }

    const { apiKey, model } = await requireApiKey(profile, provider);
    const style = await generateStructured({
      provider,
      apiKey,
      model,
      system: STYLE_SYSTEM_PROMPT,
      prompt: buildStylePrompt(account.style_samples),
      schema: styleOutputSchema,
      maxTokens: 4000,
    });

    const { error } = await supabase
      .from("managed_accounts")
      .update({ writing_style: styleToText(style) })
      .eq("id", accountId);
    if (error) return { message: "保存できませんでした。もう一度お試しください。" };
  } catch (error) {
    return { message: errorMessage(error) };
  }
  revalidatePath(`/accounts/${accountId}`);
  return { ok: true, message: "文章のクセを読み取って「文章のクセ」欄に入れました。必要に応じて手直しして保存してください。" };
}
