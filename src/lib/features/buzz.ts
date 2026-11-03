import {
  BUZZ_SYSTEM_PROMPT,
  buildBuzzPrompt,
  buzzOutputSchema,
  buzzRepairSchema,
  type BuzzInput,
  type BuzzOutput,
  type BuzzSourcePost,
} from "@/lib/ai/prompts/buzz";
import type { AccountContext, KnowledgeContext } from "@/lib/ai/prompts/context";
import type { RuleViolation } from "@/lib/posts/rules";
import { enforceRules } from "./repair";

// バズ量産の流れ（AIの呼び出し方は外から渡すので、テストでは偽物のAIを使えます）
//   1. バズ投稿から型を抜き出し、投稿案を作る（1回の呼び出し）
//   2. 文字数・禁止表現をプログラムで確認し、守れていなければ1回だけ手直し

export type CallBuzzAi = {
  analyze: (args: { system: string; prompt: string; schema: typeof buzzOutputSchema }) => Promise<BuzzOutput>;
  repair: (args: {
    system: string;
    prompt: string;
    schema: typeof buzzRepairSchema;
  }) => Promise<{ patterns: BuzzOutput["drafts"] }>;
};

export type BuzzResult = BuzzOutput & {
  /** 直しきれなかったルール違反（画面で注意表示する） */
  warnings: RuleViolation[];
  repaired: boolean;
  /** 分析に使った投稿の数 */
  sourceCount: number;
};

/** 反応の良い順（返信・再投稿を重めに数える） */
export function rankBuzzPosts<T extends Pick<BuzzSourcePost, "likes" | "replies" | "reposts">>(posts: T[]): T[] {
  const score = (p: T) => p.likes + p.replies * 3 + p.reposts * 5;
  return [...posts].sort((a, b) => score(b) - score(a));
}

export async function generateFromBuzz(
  ai: CallBuzzAi,
  input: BuzzInput,
  posts: BuzzSourcePost[],
  account: AccountContext,
  knowledge: KnowledgeContext[],
): Promise<BuzzResult> {
  const ranked = rankBuzzPosts(posts).slice(0, input.sourceCount);
  const first = await ai.analyze({
    system: BUZZ_SYSTEM_PROMPT,
    prompt: buildBuzzPrompt(input, ranked, account, knowledge),
    schema: buzzOutputSchema,
  });

  const checked = await enforceRules(
    { patterns: first.drafts.slice(0, input.draftCount) },
    { maxBodyChars: input.maxChars, bannedExpressions: account.banned_expressions, commentCount: input.commentCount },
    (prompt) => ai.repair({ system: BUZZ_SYSTEM_PROMPT, prompt, schema: buzzRepairSchema }),
  );

  return {
    summary: first.summary,
    patterns: first.patterns,
    drafts: checked.patterns,
    warnings: checked.warnings,
    repaired: checked.repaired,
    sourceCount: ranked.length,
  };
}
