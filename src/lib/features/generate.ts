import {
  buildGeneratePrompt,
  buildRepairPrompt,
  GENERATE_SYSTEM_PROMPT,
  generateOutputSchema,
  POST_TYPES,
  type GenerateInput,
  type GenerateOutput,
} from "@/lib/ai/prompts/generate";
import type { AccountContext, KnowledgeContext } from "@/lib/ai/prompts/context";
import { checkPost, type RuleViolation } from "@/lib/posts/rules";

// 投稿生成の流れ（AIの呼び出し方は外から渡すので、テストでは偽物のAIを使えます）
//   1. AIに投稿案を作ってもらう
//   2. 文字数・禁止表現をプログラムで確認
//   3. 守れていなければ、その部分だけ1回だけ直してもらう（料金を抑えるため1回まで）
//   4. それでも残った違反は、画面に注意として表示する

export type CallAi = (args: {
  system: string;
  prompt: string;
  schema: typeof generateOutputSchema;
}) => Promise<GenerateOutput>;

export type GenerateResult = GenerateOutput & {
  /** 直しきれなかったルール違反（画面で注意表示する） */
  warnings: RuleViolation[];
  repaired: boolean;
};

export function checkAll(
  output: GenerateOutput,
  input: Pick<GenerateInput, "maxChars">,
  bannedExpressions: string[],
): RuleViolation[] {
  return output.patterns.flatMap((p, i) =>
    checkPost(p, { maxBodyChars: input.maxChars, bannedExpressions }, i),
  );
}

export async function generatePosts(
  callAi: CallAi,
  input: GenerateInput,
  account: AccountContext,
  knowledge: KnowledgeContext[],
): Promise<GenerateResult> {
  const postType = POST_TYPES.find((t) => t.id === input.postType) ?? POST_TYPES[0];
  const postTypeLabel = postType.id === "auto" ? "おまかせ（テーマに最適な型を選ぶ）" : `${postType.label}（${postType.hint}）`;

  let output = await callAi({
    system: GENERATE_SYSTEM_PROMPT,
    prompt: buildGeneratePrompt(input, account, knowledge, postTypeLabel),
    schema: generateOutputSchema,
  });
  output = { patterns: output.patterns.slice(0, input.patternCount) };

  let violations = checkAll(output, input, account.banned_expressions);
  let repaired = false;

  if (violations.length > 0) {
    const fixed = await callAi({
      system: GENERATE_SYSTEM_PROMPT,
      prompt: buildRepairPrompt(output, violations, input),
      schema: generateOutputSchema,
    });
    // 直した結果の数が変わってしまった場合は、違反のあるパターンだけ差し替える
    const fixedPatterns = output.patterns.map((original, i) => {
      const hadViolation = violations.some((v) => v.index === i);
      return hadViolation && fixed.patterns[i] ? fixed.patterns[i] : original;
    });
    output = { patterns: fixedPatterns };
    violations = checkAll(output, input, account.banned_expressions);
    repaired = true;
  }

  return { ...output, warnings: violations, repaired };
}
