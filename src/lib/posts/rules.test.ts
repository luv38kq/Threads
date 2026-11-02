import { describe, expect, it } from "vitest";
import { checkPost, countChars, findBannedExpressions } from "./rules";

describe("文字数の数え方", () => {
  it("日本語・改行・絵文字を1文字ずつ数える", () => {
    expect(countChars("あいう")).toBe(3);
    expect(countChars("あ\nい")).toBe(3);
    expect(countChars("👍")).toBe(1);
  });
});

describe("禁止表現", () => {
  it("全角半角や大文字小文字の違いがあっても見つける", () => {
    expect(findBannedExpressions("これで絶対稼げる！ＡＩ最強", ["絶対稼げる", "ai最強", "楽して"])).toEqual([
      "絶対稼げる",
      "ai最強",
    ]);
  });

  it("空の禁止表現は無視する", () => {
    expect(findBannedExpressions("なんでも", [""])).toEqual([]);
  });
});

describe("投稿ルールの確認", () => {
  it("文字数オーバーと禁止表現を指摘する", () => {
    const violations = checkPost(
      { body: "あ".repeat(11), comments: ["い".repeat(501), "誰でも簡単"] },
      { maxBodyChars: 10, bannedExpressions: ["誰でも簡単"] },
      2,
    );
    expect(violations.map((v) => v.index)).toEqual([2, 2, 2]);
    expect(violations[0].message).toContain("本文が11文字");
    expect(violations[1].message).toContain("コメント1が501文字");
    expect(violations[2].message).toContain("誰でも簡単");
  });

  it("ルールを守っていれば何も返さない", () => {
    expect(checkPost({ body: "短い本文", comments: [] }, { maxBodyChars: 10, bannedExpressions: [] })).toEqual([]);
  });
});
