"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireActiveUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { researchInputSchema, researchOutputSchema, buildResearchPrompt, rankPosts, RESEARCH_SYSTEM_PROMPT } from "@/lib/ai/prompts/research";
import { generateStructured } from "@/lib/ai/structured";
import { errorMessage, loadAccountWithKnowledge, requireApiKey } from "@/lib/ai/run";
import type { ResearchPost } from "@/lib/extension/research-schema";
import { fieldErrors, formValues, type FormState } from "@/lib/validation";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function runResearchAnalysis(_prev: FormState, formData: FormData): Promise<FormState> {
  const profile = await requireActiveUser();
  const values = formValues(formData);
  const parsed = researchInputSchema.safeParse(values);
  if (!parsed.success) return { errors: fieldErrors(parsed.error), values, message: "入力内容を確認してください。" };
  const input = parsed.data;

  let generationId: string;
  try {
    const supabase = await createClient();
    const { data: set } = await supabase
      .from("research_sets")
      .select("id, source_username, posts")
      .eq("id", input.researchSetId)
      .maybeSingle();
    if (!set) return { message: "リサーチが見つかりません。", values };

    const account = input.accountId ? await loadAccountWithKnowledge(input.accountId) : null;
    if (input.accountId && !account) return { message: "アカウントが見つかりません。", values };

    const posts = rankPosts(set.posts as unknown as ResearchPost[]).slice(0, input.topCount);
    const { apiKey, model } = await requireApiKey(profile, input.provider);
    const output = await generateStructured({
      provider: input.provider,
      apiKey,
      model,
      system: RESEARCH_SYSTEM_PROMPT,
      prompt: buildResearchPrompt(input, posts, set.source_username, account),
      schema: researchOutputSchema,
    });

    const { data, error } = await supabase
      .from("generations")
      .insert({
        account_id: input.accountId || null,
        kind: "research",
        provider: input.provider,
        model,
        input: { ...input, sourceUsername: set.source_username, theme: `@${set.source_username || "競合"} の分析` },
        output,
      })
      .select("id")
      .single();
    if (error) {
      console.error("[runResearchAnalysis] save", error.message);
      return { message: "結果の保存に失敗しました。もう一度お試しください。", values };
    }
    generationId = data.id;
  } catch (error) {
    return { message: errorMessage(error), values };
  }
  redirect(`/research/report/${generationId}`);
}

export async function deleteResearchSet(formData: FormData) {
  await requireActiveUser();
  const id = String(formData.get("id") ?? "");
  if (!UUID.test(id)) return;
  const supabase = await createClient();
  await supabase.from("research_sets").delete().eq("id", id);
  revalidatePath("/research");
  redirect("/research");
}
