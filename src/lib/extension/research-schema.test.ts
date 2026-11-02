import { describe, expect, it } from "vitest";
import { researchUploadSchema } from "./research-schema";
import { generateToken, hashToken, looksLikeToken, tokenFromHeader } from "./token";

const post = {
  code: "A1",
  url: "https://www.threads.com/@rival/post/A1",
  username: "rival",
  text: "本文",
  likeCount: 10,
  replyCount: 2,
  repostCount: 1,
  quoteCount: 0,
  takenAt: new Date("2026-01-01T00:00:00Z").toISOString(),
  mediaType: "text",
  replyToUsername: null,
  tree: [{ code: "A2", text: "続き" }],
};

describe("拡張機能から届くデータのチェック", () => {
  it("拡張機能が送る形をそのまま受け付ける", () => {
    const parsed = researchUploadSchema.safeParse({
      sourceUsername: "rival",
      sourceUrl: "https://www.threads.com/@rival",
      accountId: null,
      posts: [post],
    });
    expect(parsed.success).toBe(true);
  });

  it("Threads 以外のURLは受け付けない", () => {
    const parsed = researchUploadSchema.safeParse({
      sourceUsername: null,
      sourceUrl: "",
      accountId: null,
      posts: [{ ...post, url: "https://evil.example.com/x" }],
    });
    expect(parsed.success).toBe(false);
  });

  it("301件以上は受け付けない", () => {
    const parsed = researchUploadSchema.safeParse({
      sourceUsername: null,
      sourceUrl: "",
      accountId: null,
      posts: Array.from({ length: 301 }, (_, i) => ({ ...post, code: `c${i}` })),
    });
    expect(parsed.success).toBe(false);
  });
});

describe("連携コード", () => {
  it("発行したコードは形のチェックを通り、ハッシュは毎回同じになる", async () => {
    const token = generateToken();
    expect(looksLikeToken(token)).toBe(true);
    expect(await hashToken(token)).toBe(await hashToken(token));
    expect(await hashToken(token)).toMatch(/^[0-9a-f]{64}$/);
  });

  it("Authorization ヘッダーから取り出す", () => {
    const token = generateToken();
    expect(tokenFromHeader(`Bearer ${token}`)).toBe(token);
    expect(tokenFromHeader("Bearer wrong")).toBeNull();
    expect(tokenFromHeader(null)).toBeNull();
  });
});
