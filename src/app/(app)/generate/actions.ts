"use server";

import { redirect } from "next/navigation";
import { requireActiveUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { generateInputSchema } from "@/lib/ai/prompts/generate";
import { generateStructured } from "@/lib/ai/structured";
import { errorMessage, loadAccountWithKnowledge, requireApiKey } from "@/lib/ai/run";
import { generatePosts } from "@/lib/features/generate";
import { fieldErrors, formValues, type FormState } from "@/lib/validation";

export async function runGenerate(_prev: FormState, formData: FormData): Promise<FormState> {
  const profile = await requireActiveUser();
  const values = formValues(formData);
  const parsed = generateInputSchema.safeParse(values);
  if (!parsed.success) {
    return { errors: fieldErrors(parsed.error), values, message: "入力内容を確認してください。" };
  }
  const input = parsed.data;

  let generationId: string;
  try {
    const loaded = await loadAccountWithKnowledge(input.accountId);
    if (!loaded) return { message: "アカウントが見つかりません。", values };
    const { apiKey, model } = await requireApiKey(profile, input.provider);

    const result = await generatePosts(
      ({ system, prompt, schema }) =>
        generateStructured({ provider: input.provider, apiKey, model, system, prompt, schema }),
      input,
      loaded.account,
      loaded.knowledge,
    );

    const supabase = await createClient();
    const { data, error } = await supabase
      .from("generations")
      .insert({
        account_id: input.accountId,
        kind: "generate",
        provider: input.provider,
        model,
        input,
        output: result,
      })
      .select("id")
      .single();
    if (error) {
      console.error("[runGenerate] save", error.message);
      return { message: "結果の保存に失敗しました。もう一度お試しください。", values };
    }
    generationId = data.id;
  } catch (error) {
    return { message: errorMessage(error), values };
  }

  redirect(`/generate/${generationId}`);
}
