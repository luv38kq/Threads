import type { AnalyzeOutput } from "@/lib/ai/prompts/analyze";
import type { AccountContext, KnowledgeContext } from "@/lib/ai/prompts/context";
import {
  buildRewritePrompt,
  REWRITE_SYSTEM_PROMPT,
  rewriteOutputSchema,
  type RewriteInput,
  type RewriteOutput,
} from "@/lib/ai/prompts/rewrite";
import type { RuleViolation } from "@/lib/posts/rules";
import { enforceRules } from "./repair";

export type CallRewriteAi = (args: {
  system: string;
  prompt: string;
  schema: typeof rewriteOutputSchema;
}) => Promise<RewriteOutput>;

export type RewriteResult = RewriteOutput & { warnings: RuleViolation[]; repaired: boolean };

export async function rewritePost(
  callAi: CallRewriteAi,
  input: RewriteInput,
  account: { account: AccountContext; knowledge: KnowledgeContext[] } | null,
  analysis: AnalyzeOutput | null,
): Promise<RewriteResult> {
  const first = await callAi({
    system: REWRITE_SYSTEM_PROMPT,
    prompt: buildRewritePrompt(input, account, analysis),
    schema: rewriteOutputSchema,
  });
  return enforceRules(
    { patterns: first.patterns.slice(0, input.patternCount) },
    {
      maxBodyChars: input.maxChars,
      bannedExpressions: account?.account.banned_expressions ?? [],
      commentCount: input.commentCount,
    },
    (prompt) => callAi({ system: REWRITE_SYSTEM_PROMPT, prompt, schema: rewriteOutputSchema }),
  );
}
