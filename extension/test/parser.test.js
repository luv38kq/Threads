import { describe, expect, it } from "vitest";

await import("../src/parser.js");
await import("../src/export.js");
const C = globalThis.ThreadsCollector;

// Threads が読み込むデータを、形だけまねたテスト用データ
function rawPost({ code, username = "rival", text, likes = 0, replies = 0, reposts = 0, takenAt = 1767225600, replyTo }) {
  return {
    pk: `pk_${code}`,
    code,
    taken_at: takenAt,
    like_count: likes,
    user: { username, pk: "1" },
    caption: text == null ? null : { text },
    text_post_app_info: {
      direct_reply_count: replies,
      repost_count: reposts,
      quote_count: 0,
      ...(replyTo ? { reply_to_author: { username: replyTo } } : {}),
    },
  };
}

const sample = {
  data: {
    mediaData: {
      edges: [
        {
          node: {
            thread_items: [
              { post: rawPost({ code: "A1", text: "冒頭の一文", likes: 300, replies: 40 }) },
              { post: rawPost({ code: "A2", text: "ツリーの続き1", likes: 10 }) },
              { post: rawPost({ code: "A3", text: "ツリーの続き2", likes: 5 }) },
              { post: rawPost({ code: "X9", username: "someone", text: "他人の返信", replyTo: "rival" }) },
            ],
          },
        },
        { node: { thread_items: [{ post: rawPost({ code: "B1", text: "2つ目の投稿", likes: 50, replies: 90 }) }] } },
        {
          node: {
            thread_items: [{ post: rawPost({ code: "C1", text: "他人への返信", likes: 999, replyTo: "other" }) }],
          },
        },
      ],
    },
  },
};

describe("投稿の取り出し", () => {
  it("形で投稿を見つけ、数字と本文を取り出す", () => {
    const { posts } = C.extractFromJson(sample);
    const a1 = posts.find((p) => p.code === "A1");
    expect(a1).toMatchObject({
      username: "rival",
      text: "冒頭の一文",
      likeCount: 300,
      replyCount: 40,
      url: "https://www.threads.com/@rival/post/A1",
      mediaType: "text",
    });
  });

  it("同じ人が続けて書いた部分をツリーとしてつなげ、他人の返信で止める", () => {
    const { trees } = C.extractFromJson(sample);
    expect(trees).toEqual([["A1", "A2", "A3"]]);
  });

  it("投稿ではないデータは無視する", () => {
    const { posts } = C.extractFromJson({ code: "x", user: { username: "u" } });
    expect(posts).toEqual([]);
  });

  it("本文がテキスト断片に分かれていても読み取る", () => {
    const post = rawPost({ code: "F1", text: null });
    post.text_post_app_info.text_fragments = { fragments: [{ plaintext: "前半" }, { plaintext: "後半" }] };
    expect(C.extractFromJson(post).posts[0].text).toBe("前半後半");
  });
});

describe("通信の中身の読み取り", () => {
  it("先頭の for (;;); を取り除いて読む", () => {
    expect(C.parseJsonText('for (;;);{"a":1}')).toEqual([{ a: 1 }]);
  });
  it("改行区切りの複数のJSONも読む", () => {
    expect(C.parseJsonText('{"a":1}\n{"b":2}')).toEqual([{ a: 1 }, { b: 2 }]);
  });
  it("JSONでなければ null", () => {
    expect(C.parseJsonText("<html>")).toBeNull();
  });
});

describe("集めた投稿の管理", () => {
  it("同じ投稿は1件にまとめ、ツリーの続きは親の中に入れる", () => {
    const store = C.createStore();
    store.ingest(sample);
    store.ingest(sample); // 同じデータがもう一度届いても増えない
    const list = store.list();
    expect(list.map((p) => p.code).sort()).toEqual(["B1", "C1", "X9", "A1"].sort());
    const a1 = list.find((p) => p.code === "A1");
    expect(a1.tree.map((t) => t.text)).toEqual(["ツリーの続き1", "ツリーの続き2"]);
    expect(store.size()).toBe(4);
  });

  it("あとから届いたデータの数字が大きければ更新する", () => {
    const store = C.createStore();
    store.ingest(rawPost({ code: "Z1", text: "本文", likes: 10 }));
    store.ingest(rawPost({ code: "Z1", text: "本文", likes: 25 }));
    expect(store.list()[0].likeCount).toBe(25);
  });
});

describe("絞り込みと並べ替え", () => {
  const store = C.createStore();
  store.ingest(sample);
  const posts = store.list();

  it("指定アカウントの投稿だけ・他人への返信を除いて、いいね順に並べる", () => {
    const selected = C.selectPosts(posts, { username: "rival" });
    expect(selected.map((p) => p.code)).toEqual(["A1", "B1"]);
  });

  it("返信数順・件数制限", () => {
    const selected = C.selectPosts(posts, { username: "rival", sortBy: "replies", limit: 1 });
    expect(selected.map((p) => p.code)).toEqual(["B1"]);
  });

  it("いいね数の下限", () => {
    expect(C.selectPosts(posts, { username: "rival", minLikes: 100 }).map((p) => p.code)).toEqual(["A1"]);
  });
});

describe("書き出し", () => {
  const store = C.createStore();
  store.ingest(sample);
  const posts = C.selectPosts(store.list(), { username: "rival" });

  it("AIに渡せる文章にする（ツリーと分析のお願い文つき）", () => {
    const md = C.toMarkdown(posts, { username: "rival", includeTree: true, includePrompt: true });
    expect(md).toContain("# Threads 競合リサーチ：@rival");
    expect(md).toContain("いいね 300");
    expect(md).toContain("ツリーの続き2");
    expect(md).toContain("穴埋め式テンプレート");
  });

  it("CSVでは改行やカンマを含む本文も壊れない", () => {
    const csv = C.toCsv([{ ...posts[0], text: 'a,b\n"c"' }], { includeTree: false });
    expect(csv.startsWith("﻿順位")).toBe(true);
    expect(csv).toContain('"a,b\n""c"""');
  });
});

describe("URLからアカウント名", () => {
  it("プロフィールと投稿のURLに対応する", () => {
    expect(C.usernameFromUrl("https://www.threads.com/@rival")).toBe("rival");
    expect(C.usernameFromUrl("https://www.threads.com/@rival.jp/post/abc")).toBe("rival.jp");
    expect(C.usernameFromUrl("https://www.threads.com/")).toBeNull();
  });
});
