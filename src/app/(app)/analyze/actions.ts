"use server";

import { redirect } from "next/navigation";
import { requireActiveUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import {
  analyzeInputSchema,
  analyzeOutputSchema,
  ANALYZE_SYSTEM_PROMPT,
  buildAnalyzePrompt,
  clampScore,
  CRITERIA,
} from "@/lib/ai/prompts/analyze";
import { generateStructured } from "@/lib/ai/structured";
import { errorMessage, loadAccountWithKnowledge, requireApiKey } from "@/lib/ai/run";
import { fieldErrors, formValues, type FormState } from "@/lib/validation";

export async function runAnalyze(_prev: FormState, formData: FormData): Promise<FormState> {
  const profile = await requireActiveUser();
  const values = formValues(formData);
  const parsed = analyzeInputSchema.safeParse(values);
  if (!parsed.success) return { errors: fieldErrors(parsed.error), values, message: "入力内容を確認してください。" };
  const input = parsed.data;

  let generationId: string;
  try {
    const account = input.accountId ? await loadAccountWithKnowledge(input.accountId) : null;
    if (input.accountId && !account) return { message: "アカウントが見つかりません。", values };
    const { apiKey, model } = await requireApiKey(profile, input.provider);

    const raw = await generateStructured({
      provider: input.provider,
      apiKey,
      model,
      system: ANALYZE_SYSTEM_PROMPT,
      prompt: buildAnalyzePrompt(input, account),
      schema: analyzeOutputSchema,
    });
    // 点数を範囲内に整え、評価項目を決まった順番にそろえる
    const output = {
      ...raw,
      overall_score: clampScore(raw.overall_score, 0, 100),
      criteria: CRITERIA.map((c) => raw.criteria.find((x) => x.key === c.key))
        .filter((c): c is NonNullable<typeof c> => Boolean(c))
        .map((c) => ({ ...c, score: clampScore(c.score, 1, 5) })),
    };

    const supabase = await createClient();
    const { data, error } = await supabase
      .from("generations")
      .insert({
        account_id: input.accountId || null,
        kind: "analyze",
        provider: input.provider,
        model,
        input: { ...input, postText: input.body },
        output,
      })
      .select("id")
      .single();
    if (error) {
      console.error("[runAnalyze] save", error.message);
      return { message: "結果の保存に失敗しました。もう一度お試しください。", values };
    }
    generationId = data.id;
  } catch (error) {
    return { message: errorMessage(error), values };
  }
  redirect(`/analyze/${generationId}`);
}
