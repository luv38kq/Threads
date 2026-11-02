import { THREADS_MAX_CHARS, checkPost, type PostParts, type RuleViolation } from "@/lib/posts/rules";

// 投稿案（生成・リライト共通）のルールチェックと、1回だけの手直しの流れ。
//   1. 文字数・禁止表現をプログラムで確認
//   2. 守れていなければ、違反のあったパターンだけAIに直してもらう（料金を抑えるため1回まで）
//   3. それでも残った違反は、画面に注意として表示する

export type Rules = { maxBodyChars: number; bannedExpressions: string[]; commentCount: number };

export function checkAllPatterns(patterns: PostParts[], rules: Rules): RuleViolation[] {
  return patterns.flatMap((p, i) =>
    checkPost(p, { maxBodyChars: rules.maxBodyChars, bannedExpressions: rules.bannedExpressions }, i),
  );
}

export function buildRepairPrompt(
  original: { patterns: PostParts[] },
  violations: RuleViolation[],
  rules: Rules,
): string {
  const lines = violations.map((v) => `- パターン${v.index + 1}：${v.message}`).join("\n");
  return `先ほど作った投稿案に、ルールを守れていない箇所があります。

<problems>
${lines}
</problems>

<previous_output>
${JSON.stringify(original, null, 2)}
</previous_output>

指摘のあるパターンだけを、内容と良さをできるだけ保ったまま直してください。指摘のないパターンは一字一句そのまま残してください。
本文は${rules.maxBodyChars}文字以内、コメントは各${THREADS_MAX_CHARS}文字以内、コメント欄の数は${rules.commentCount}です。
同じ形（patterns 配列）で、すべてのパターンを返してください。`;
}

export async function enforceRules<T extends PostParts>(
  output: { patterns: T[] },
  rules: Rules,
  repair: (prompt: string) => Promise<{ patterns: T[] }>,
): Promise<{ patterns: T[]; warnings: RuleViolation[]; repaired: boolean }> {
  let patterns = output.patterns;
  let violations = checkAllPatterns(patterns, rules);
  if (violations.length === 0) return { patterns, warnings: [], repaired: false };

  const fixed = await repair(buildRepairPrompt({ patterns }, violations, rules));
  // 違反のあったパターンだけ差し替える（問題のないパターンは元のまま）
  patterns = patterns.map((original, i) =>
    violations.some((v) => v.index === i) && fixed.patterns[i] ? fixed.patterns[i] : original,
  );
  violations = checkAllPatterns(patterns, rules);
  return { patterns, warnings: violations, repaired: true };
}
