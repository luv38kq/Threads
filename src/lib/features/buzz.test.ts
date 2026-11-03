import { describe, expect, it, vi } from "vitest";
import type { BuzzInput, BuzzOutput, BuzzSourcePost } from "@/lib/ai/prompts/buzz";
import type { AccountContext } from "@/lib/ai/prompts/context";
import { generateFromBuzz, rankBuzzPosts, type CallBuzzAi } from "./buzz";

const account: AccountContext = {
  name: "トイトレ垢",
  threads_username: "toitore",
  profile_summary: "2歳児のトイトレ記録",
  target_audience: "トイトレ中の親",
  goal: "共感とフォロワー増加",
  writing_style: "やさしい口調",
  style_samples: "",
  banned_expressions: ["絶対外れる"],
  custom_rules: "",
};

const input: BuzzInput = {
  accountId: "00000000-0000-4000-8000-000000000000",
  genre: "育児・教育",
  sourceCount: 2,
  draftCount: 2,
  ctaMode: "none",
  commentCount: 0,
  maxChars: 20,
  theme: "",
  provider: "anthropic",
};

const post = (text: string, likes: number, replies = 0): BuzzSourcePost => ({
  text,
  thread: [],
  likes,
  replies,
  reposts: 0,
  genre: "育児・教育",
  platform: "threads",
});

const draft = (body: string) => ({ pattern_name: "共感型", angle: "a", hook_reason: "h", body, comments: [] });

const output = (bodies: string[]): BuzzOutput => ({
  summary: "まとめ",
  patterns: [{ name: "共感型", hook: "h", structure: ["1"], engagement: "e", why_it_works: "w", source_ranks: [1] }],
  drafts: bodies.map(draft),
});

function fakeAi(first: BuzzOutput, repaired?: string[]) {
  return {
    analyze: vi.fn<CallBuzzAi["analyze"]>().mockResolvedValue(first),
    repair: vi.fn<CallBuzzAi["repair"]>().mockResolvedValue({ patterns: (repaired ?? []).map(draft) }),
  };
}

describe("バズ量産の流れ", () => {
  it("反応の良い順（返信を重めに）に並べ、指定の件数だけAIに渡す", async () => {
    const ai = fakeAi(output(["短い本文", "もう一つ"]));
    const posts = [post("いいね少なめ", 10), post("返信が多い", 100, 50), post("いいね多め", 200)];
    const result = await generateFromBuzz(ai, input, posts, account, []);
    const prompt = ai.analyze.mock.calls[0][0].prompt;
    expect(prompt.indexOf("返信が多い")).toBeLessThan(prompt.indexOf("いいね多め"));
    expect(prompt).not.toContain("いいね少なめ");
    expect(result.sourceCount).toBe(2);
    expect(ai.repair).not.toHaveBeenCalled();
    expect(result.drafts).toHaveLength(2);
  });

  it("「誘導しない」を選ぶと、誘導しない指示とアカウント設定がAIに渡る", async () => {
    const ai = fakeAi(output(["短い本文"]));
    await generateFromBuzz(ai, { ...input, draftCount: 1 }, [post("a", 1), post("b", 2)], account, []);
    const prompt = ai.analyze.mock.calls[0][0].prompt;
    expect(prompt).toContain("誘導の扱い：誘導しない");
    expect(prompt).toContain("トイトレ中の親");
    expect(prompt).toContain("絶対外れる");
    expect(prompt).toContain("ジャンル：育児・教育");
  });

  it("文字数オーバーの投稿案だけを1回直してもらう", async () => {
    const ai = fakeAi(output(["これは長すぎる本文です。二十文字を超えています", "問題なし"]), ["直した本文", "勝手に変更"]);
    const result = await generateFromBuzz(ai, input, [post("a", 1), post("b", 2)], account, []);
    expect(ai.repair).toHaveBeenCalledTimes(1);
    expect(result.drafts.map((d) => d.body)).toEqual(["直した本文", "問題なし"]);
    expect(result.repaired).toBe(true);
    expect(result.warnings).toEqual([]);
  });

  it("AIが多めに作っても、指定の本数にそろえる", async () => {
    const ai = fakeAi(output(["一", "二", "三"]));
    const result = await generateFromBuzz(ai, input, [post("a", 1), post("b", 2)], account, []);
    expect(result.drafts).toHaveLength(2);
  });

  it("並べ替えは元の配列を変えない", () => {
    const posts = [post("a", 1), post("b", 2)];
    expect(rankBuzzPosts(posts).map((p) => p.text)).toEqual(["b", "a"]);
    expect(posts.map((p) => p.text)).toEqual(["a", "b"]);
  });
});
