import { describe, expect, it, vi } from "vitest";
import type { GenerateInput, GenerateOutput } from "@/lib/ai/prompts/generate";
import type { AccountContext } from "@/lib/ai/prompts/context";
import { generatePosts, type CallAi } from "./generate";

const account: AccountContext = {
  name: "副業垢",
  threads_username: "fukugyo",
  profile_summary: "在宅ワークの体験を発信",
  target_audience: "30代の子育て中の女性",
  goal: "プロフィールのLINEに誘導",
  writing_style: "語尾は「です」",
  style_samples: "",
  banned_expressions: ["絶対稼げる"],
  custom_rules: "",
};

const input: GenerateInput = {
  accountId: "00000000-0000-4000-8000-000000000000",
  theme: "在宅ワークの始め方",
  targetOverride: "",
  postType: "auto",
  patternCount: 2,
  commentCount: 1,
  maxChars: 20,
  extra: "",
  provider: "anthropic",
};

const pattern = (body: string) => ({ angle: "a", hook_reason: "h", body, comments: ["続き"] });

describe("投稿生成の流れ", () => {
  it("ルールを守れていれば、AIは1回だけ呼ばれる", async () => {
    const callAi = vi.fn<CallAi>().mockResolvedValue({ patterns: [pattern("短い本文"), pattern("もう一つ")] });
    const result = await generatePosts(callAi, input, account, []);
    expect(callAi).toHaveBeenCalledTimes(1);
    expect(result.patterns).toHaveLength(2);
    expect(result.warnings).toEqual([]);
    expect(result.repaired).toBe(false);
  });

  it("アカウント設定とナレッジがAIへの指示に含まれる", async () => {
    const callAi = vi.fn<CallAi>().mockResolvedValue({ patterns: [pattern("短い本文")] });
    await generatePosts(callAi, { ...input, patternCount: 1 }, account, [{ title: "商品", content: "月額980円の講座" }]);
    const prompt = callAi.mock.calls[0][0].prompt;
    expect(prompt).toContain("30代の子育て中の女性");
    expect(prompt).toContain("月額980円の講座");
    expect(prompt).toContain("絶対稼げる");
    expect(prompt).toContain("20文字以内");
  });

  it("違反があったパターンだけを直してもらい、問題のないパターンはそのまま残す", async () => {
    const first: GenerateOutput = { patterns: [pattern("これは長すぎる本文です。二十文字を超えています"), pattern("問題なし")] };
    const second: GenerateOutput = { patterns: [pattern("直した本文"), pattern("勝手に変わった")] };
    const callAi = vi.fn<CallAi>().mockResolvedValueOnce(first).mockResolvedValueOnce(second);
    const result = await generatePosts(callAi, input, account, []);
    expect(callAi).toHaveBeenCalledTimes(2);
    expect(callAi.mock.calls[1][0].prompt).toContain("パターン1：本文が");
    expect(result.patterns.map((p) => p.body)).toEqual(["直した本文", "問題なし"]);
    expect(result.warnings).toEqual([]);
    expect(result.repaired).toBe(true);
  });

  it("直しきれなかった違反は注意として返す（何度もAIを呼ばない）", async () => {
    const bad: GenerateOutput = { patterns: [pattern("絶対稼げる方法")] };
    const callAi = vi.fn<CallAi>().mockResolvedValue(bad);
    const result = await generatePosts(callAi, { ...input, patternCount: 1 }, account, []);
    expect(callAi).toHaveBeenCalledTimes(2);
    expect(result.warnings).toHaveLength(1);
    expect(result.warnings[0].message).toContain("絶対稼げる");
  });

  it("頼んだ数より多く返ってきたら、頼んだ数までにする", async () => {
    const callAi = vi.fn<CallAi>().mockResolvedValue({ patterns: [pattern("1"), pattern("2"), pattern("3")] });
    const result = await generatePosts(callAi, input, account, []);
    expect(result.patterns).toHaveLength(2);
  });
});
