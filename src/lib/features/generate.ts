import {
  buildGeneratePrompt,
  GENERATE_SYSTEM_PROMPT,
  generateOutputSchema,
  POST_TYPES,
  type GenerateInput,
  type GenerateOutput,
} from "@/lib/ai/prompts/generate";
import type { AccountContext, KnowledgeContext } from "@/lib/ai/prompts/context";
import type { RuleViolation } from "@/lib/posts/rules";
import { enforceRules } from "./repair";

// 投稿生成の流れ（AIの呼び出し方は外から渡すので、テストでは偽物のAIを使えます）

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

export async function generatePosts(
  callAi: CallAi,
  input: GenerateInput,
  account: AccountContext,
  knowledge: KnowledgeContext[],
): Promise<GenerateResult> {
  const postType = POST_TYPES.find((t) => t.id === input.postType) ?? POST_TYPES[0];
  const postTypeLabel =
    postType.id === "auto" ? "おまかせ（テーマに最適な型を選ぶ）" : `${postType.label}（${postType.hint}）`;

  const first = await callAi({
    system: GENERATE_SYSTEM_PROMPT,
    prompt: buildGeneratePrompt(input, account, knowledge, postTypeLabel),
    schema: generateOutputSchema,
  });

  return enforceRules(
    { patterns: first.patterns.slice(0, input.patternCount) },
    {
      maxBodyChars: input.maxChars,
      bannedExpressions: account.banned_expressions,
      commentCount: input.commentCount,
    },
    (prompt) => callAi({ system: GENERATE_SYSTEM_PROMPT, prompt, schema: generateOutputSchema }),
  );
}
