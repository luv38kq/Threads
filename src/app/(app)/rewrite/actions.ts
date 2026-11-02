"use server";

import { redirect } from "next/navigation";
import { requireActiveUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import type { AnalyzeOutput } from "@/lib/ai/prompts/analyze";
import { rewriteInputSchema } from "@/lib/ai/prompts/rewrite";
import { generateStructured } from "@/lib/ai/structured";
import { errorMessage, loadAccountWithKnowledge, requireApiKey } from "@/lib/ai/run";
import { rewritePost } from "@/lib/features/rewrite";
import { fieldErrors, formValues, type FormState } from "@/lib/validation";

export async function runRewrite(_prev: FormState, formData: FormData): Promise<FormState> {
  const profile = await requireActiveUser();
  const values = formValues(formData);
  const parsed = rewriteInputSchema.safeParse(values);
  if (!parsed.success) return { errors: fieldErrors(parsed.error), values, message: "入力内容を確認してください。" };
  const input = parsed.data;

  let generationId: string;
  try {
    const supabase = await createClient();
    const account = input.accountId ? await loadAccountWithKnowledge(input.accountId) : null;
    if (input.accountId && !account) return { message: "アカウントが見つかりません。", values };

    let analysis: AnalyzeOutput | null = null;
    if (input.analysisId) {
      const { data } = await supabase
        .from("generations")
        .select("output")
        .eq("id", input.analysisId)
        .eq("kind", "analyze")
        .maybeSingle();
      analysis = (data?.output as unknown as AnalyzeOutput) ?? null;
    }

    const { apiKey, model } = await requireApiKey(profile, input.provider);
    const result = await rewritePost(
      ({ system, prompt, schema }) =>
        generateStructured({ provider: input.provider, apiKey, model, system, prompt, schema }),
      input,
      account,
      analysis,
    );

    const { data, error } = await supabase
      .from("generations")
      .insert({
        account_id: input.accountId || null,
        kind: "rewrite",
        provider: input.provider,
        model,
        input: { ...input, postText: input.body },
        output: result,
      })
      .select("id")
      .single();
    if (error) {
      console.error("[runRewrite] save", error.message);
      return { message: "結果の保存に失敗しました。もう一度お試しください。", values };
    }
    generationId = data.id;
  } catch (error) {
    return { message: errorMessage(error), values };
  }
  redirect(`/rewrite/${generationId}`);
}
