import { describe, expect, it } from "vitest";
import {
  buzzImportChunkSchema,
  chunkPosts,
  normalizeBuzzItem,
  normalizeBuzzJson,
  normalizeBuzzText,
  textFingerprint,
} from "./import";

// スレハックの検索結果・保存済み一覧に近い形
const shPost = {
  id: "buzz_06e2846c3faa453223cb",
  platform: "threads",
  url: "https://www.threads.com/@michi_no_diet/post/DYzstKTjm8I",
  author: "michi_no_diet",
  genre: "健康",
  text: "もうそうめん食べてる人いる？",
  likes: 154,
  views: 100000,
  posted_at: "2026-05-26T16:00:04.000Z",
  public_ref: "SH-007503",
  thread: {
    replies: [
      { author: "michi_no_diet", text: "■豚しゃぶのごまだれそうめん", relation: "author_continuation" },
      { author: "someone_else", text: "おいしそう！", relation: "reply" },
    ],
  },
};

describe("バズ投稿の取り込み（形をそろえる）", () => {
  it("スレハックの形を読み、本人の続きの投稿だけをツリーに入れる", () => {
    const p = normalizeBuzzItem(shPost);
    expect(p).toEqual({
      source_ref: "SH-007503",
      genre: "健康",
      platform: "threads",
      author: "michi_no_diet",
      url: "https://www.threads.com/@michi_no_diet/post/DYzstKTjm8I",
      text: "もうそうめん食べてる人いる？",
      thread: ["■豚しゃぶのごまだれそうめん"],
      likes: 154,
      replies: 0,
      reposts: 0,
      views: 100000,
      posted_at: "2026-05-26T16:00:04.000Z",
    });
    expect(buzzImportChunkSchema.safeParse([p]).success).toBe(true);
  });

  it("本文がない投稿は取り込まない", () => {
    expect(normalizeBuzzItem({ text: "   ", likes: 10 })).toBeNull();
    expect(normalizeBuzzItem("文字列だけ")).toBeNull();
  });

  it("番号もURLもないときは本文から番号を作り、同じ本文は1件にまとめる", () => {
    const r = normalizeBuzzJson([{ text: "同じ本文" }, { text: "同じ本文" }, { text: "別の本文" }, { likes: 3 }]);
    expect(r.posts).toHaveLength(2);
    expect(r.duplicates).toBe(1);
    expect(r.skipped).toBe(1);
    expect(r.posts[0].source_ref).toBe(textFingerprint("同じ本文"));
    expect(textFingerprint("同じ本文")).not.toBe(textFingerprint("別の本文"));
  });

  it("{ posts: [...] } の形と、ジャンルの初期値に対応する", () => {
    const r = normalizeBuzzJson({ posts: [{ text: "a", like_count: "12" }, { text: "b", genre: "美容" }] }, { genre: "トイトレ" });
    expect(r.posts.map((p) => [p.genre, p.likes])).toEqual([
      ["トイトレ", 12],
      ["美容", 0],
    ]);
  });

  it("一覧が見つからないJSONはエラーにする", () => {
    expect(() => normalizeBuzzJson({ hello: 1 })).toThrow("投稿の一覧が見つかりません");
  });

  it("危ないURLや数字でない値は捨てる", () => {
    const p = normalizeBuzzItem({ text: "a", url: "javascript:alert(1)", likes: -5, replies: "abc", platform: "twitter" });
    expect(p?.url).toBe("");
    expect(p?.likes).toBe(0);
    expect(p?.replies).toBe(0);
    expect(p?.platform).toBe("x");
  });

  it("貼り付けたテキストを「---」で区切り、1行目のいいね数を読む", () => {
    const r = normalizeBuzzText("いいね:1,234\n1つ目\n2行目\n---\n2つ目の投稿\n  ---  \n\n", { genre: "声かけ" });
    expect(r.posts.map((p) => [p.text, p.likes, p.genre])).toEqual([
      ["1つ目\n2行目", 1234, "声かけ"],
      ["2つ目の投稿", 0, "声かけ"],
    ]);
  });

  it("長すぎる本文は切り詰め、サーバー側の形チェックを通る", () => {
    const p = normalizeBuzzItem({ text: "あ".repeat(6000), thread: Array(20).fill("続き") });
    expect(p?.text).toHaveLength(5000);
    expect(p?.thread).toHaveLength(10);
    expect(buzzImportChunkSchema.safeParse([p]).success).toBe(true);
  });

  it("サーバー側では、決まった形以外を受け付けない", () => {
    expect(buzzImportChunkSchema.safeParse([]).success).toBe(false);
    expect(buzzImportChunkSchema.safeParse([{ text: "a" }]).success).toBe(false);
  });

  it("件数の上限で分割する", () => {
    expect(chunkPosts([1, 2, 3, 4, 5], 2)).toEqual([[1, 2], [3, 4], [5]]);
  });

  it("データの大きさの上限でも分割する（日本語は1文字3バイトで数える）", () => {
    const items = ["あ".repeat(100), "い".repeat(100), "う".repeat(100)];
    // 1件 ≒ 303バイト。上限700バイトなら2件ずつ
    expect(chunkPosts(items, 200, 700).map((c) => c.length)).toEqual([2, 1]);
    // 1件だけで上限を超えても、その1件は送る
    expect(chunkPosts(items, 200, 10).map((c) => c.length)).toEqual([1, 1, 1]);
  });
});
