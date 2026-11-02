import { describe, expect, it, vi } from "vitest";
import { buildAnalyzePrompt, clampScore, splitComments, type AnalyzeOutput } from "@/lib/ai/prompts/analyze";
import { buildRewritePrompt, type RewriteInput } from "@/lib/ai/prompts/rewrite";
import type { AccountContext } from "@/lib/ai/prompts/context";
import { rewritePost, type CallRewriteAi } from "./rewrite";

const account: AccountContext = {
  name: "副業垢",
  threads_username: "",
  profile_summary: "",
  target_audience: "子育て中の女性",
  goal: "LINE登録",
  writing_style: "",
  style_samples: "",
  banned_expressions: ["誰でも簡単"],
  custom_rules: "",
};

const analysis: AnalyzeOutput = {
  overall_score: 62,
  summary: "冒頭が弱い",
  criteria: [{ key: "hook", score: 2, good: "誠実", issues: "1行目が説明的", improvements: ["数字を入れる"] }],
  hook_alternatives: ["案1"],
  priorities: ["冒頭に数字を入れる"],
  keep: ["体験談のリアルさ"],
};

const input: RewriteInput = {
  accountId: "",
  analysisId: "",
  body: "元の本文です",
  comments: "コメント1\n---\nコメント2",
  patternCount: 1,
  commentCount: 2,
  maxChars: 30,
  strength: "medium",
  rules: "絵文字は使わない",
  provider: "anthropic",
};

describe("コメント欄の区切り", () => {
  it("「---」だけの行で区切る", () => {
    expect(splitComments("一つ目\n---\n二つ目\n -----  \n三つ目")).toEqual(["一つ目", "二つ目", "三つ目"]);
    expect(splitComments("  ")).toEqual([]);
  });
});

describe("投稿分析の指示文", () => {
  it("本文・コメント・文字数・禁止表現の注意を含める", () => {
    const prompt = buildAnalyzePrompt(
      { accountId: "", body: "誰でも簡単に稼げる", comments: "続き", focus: "冒頭が弱い気がする", provider: "anthropic" },
      { account, knowledge: [] },
    );
    expect(prompt).toContain('chars="9"');
    expect(prompt).toContain("<comment index=\"1\"");
    expect(prompt).toContain("禁止表現「誰でも簡単」");
    expect(prompt).toContain("冒頭が弱い気がする");
  });

  it("点数は範囲内に丸める", () => {
    expect(clampScore(7.6, 1, 5)).toBe(5);
    expect(clampScore(-3, 0, 100)).toBe(0);
    expect(clampScore(Number.NaN, 1, 5)).toBe(1);
  });
});

describe("リライト", () => {
  it("分析結果（直すべきこと・残すべき良さ）と守ってほしいことを指示に含める", () => {
    const prompt = buildRewritePrompt(input, { account, knowledge: [] }, analysis);
    expect(prompt).toContain("冒頭に数字を入れる");
    expect(prompt).toContain("体験談のリアルさ");
    expect(prompt).toContain("絵文字は使わない");
    expect(prompt).toContain("30文字以内");
    expect(prompt).toContain("<comment index=\"2\">");
  });

  it("禁止表現が残ったら1回だけ直してもらう", async () => {
    const bad = { angle: "a", changes: [], kept: [], body: "誰でも簡単です", comments: ["c1", "c2"] };
    const good = { ...bad, body: "今日から始められます" };
    const callAi = vi.fn<CallRewriteAi>().mockResolvedValueOnce({ patterns: [bad] }).mockResolvedValueOnce({ patterns: [good] });
    const result = await rewritePost(callAi, input, { account, knowledge: [] }, analysis);
    expect(callAi).toHaveBeenCalledTimes(2);
    expect(result.patterns[0].body).toBe("今日から始められます");
    expect(result.warnings).toEqual([]);
  });
});
