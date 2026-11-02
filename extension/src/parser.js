// Threads の画面が読み込むデータ（JSON）の中から「投稿らしいもの」を見つけて取り出す処理。
//
// Threads の画面の作り（HTMLの見た目）はよく変わるため、見た目ではなく
// 「code・taken_at・user.username を持つもの＝投稿」という“形”で探します。
// こうしておくと、データの置き場所が変わっても動き続けやすくなります。
//
// このファイルは拡張機能（ブラウザ）とテスト（Node.js）の両方から使います。

(function (root) {
  "use strict";

  const MAX_DEPTH = 60;

  function isObject(value) {
    return value !== null && typeof value === "object";
  }

  function num(value) {
    return typeof value === "number" && Number.isFinite(value) ? value : null;
  }

  /** 投稿のデータかどうかを、形で判定する */
  function isPostLike(o) {
    return (
      isObject(o) &&
      typeof o.code === "string" &&
      o.code.length > 0 &&
      typeof o.taken_at === "number" &&
      isObject(o.user) &&
      typeof o.user.username === "string" &&
      ("caption" in o || "text_post_app_info" in o)
    );
  }

  function postText(o) {
    if (isObject(o.caption) && typeof o.caption.text === "string") return o.caption.text;
    const fragments = o.text_post_app_info?.text_fragments?.fragments;
    if (Array.isArray(fragments)) {
      return fragments.map((f) => (typeof f?.plaintext === "string" ? f.plaintext : "")).join("");
    }
    return "";
  }

  function mediaType(o) {
    if (Array.isArray(o.carousel_media) && o.carousel_media.length > 0) return "carousel";
    if (Array.isArray(o.video_versions) && o.video_versions.length > 0) return "video";
    if (isObject(o.image_versions2) && Array.isArray(o.image_versions2.candidates) && o.image_versions2.candidates.length > 0) {
      return "image";
    }
    return "text";
  }

  /** 生のデータを、扱いやすい形の投稿にする */
  function normalizePost(o) {
    const info = isObject(o.text_post_app_info) ? o.text_post_app_info : {};
    const username = o.user.username;
    const replyTo = info.reply_to_author?.username;
    return {
      code: o.code,
      url: `https://www.threads.com/@${username}/post/${o.code}`,
      username,
      text: postText(o),
      likeCount: num(o.like_count) ?? 0,
      replyCount: num(info.direct_reply_count) ?? 0,
      repostCount: num(info.repost_count) ?? num(o.reshare_count) ?? 0,
      quoteCount: num(info.quote_count) ?? 0,
      takenAt: new Date(o.taken_at * 1000).toISOString(),
      mediaType: mediaType(o),
      replyToUsername: typeof replyTo === "string" ? replyTo : null,
      tree: [],
    };
  }

  /**
   * JSON の中を全部たどって、投稿と「ツリー（同じ人が続けて返信した投稿のつながり）」を見つける。
   * 戻り値: { posts: 投稿の一覧, trees: [[親のcode, 続きのcode, ...], ...] }
   */
  function extractFromJson(json) {
    const posts = [];
    const trees = [];
    const seen = new WeakSet();

    function visit(node, depth) {
      if (!isObject(node) || depth > MAX_DEPTH || seen.has(node)) return;
      seen.add(node);

      if (Array.isArray(node)) {
        for (const item of node) visit(item, depth + 1);
        return;
      }

      // ツリーのまとまり（thread_items）を見つけたら、同じ人が続けて書いた部分をつなげる
      if (Array.isArray(node.thread_items)) {
        const items = node.thread_items.map((i) => (isObject(i) && isPostLike(i.post) ? i.post : null));
        const first = items[0];
        if (first) {
          const chain = [first.code];
          for (let i = 1; i < items.length; i++) {
            const item = items[i];
            if (!item || item.user.username !== first.user.username) break;
            chain.push(item.code);
          }
          if (chain.length > 1) trees.push(chain);
        }
      }

      if (isPostLike(node)) posts.push(normalizePost(node));

      for (const key of Object.keys(node)) visit(node[key], depth + 1);
    }

    visit(json, 0);
    return { posts, trees };
  }

  /** 通信の中身（文字列）を JSON として読む。先頭に付くことがある "for (;;);" も取り除く */
  function parseJsonText(text) {
    if (typeof text !== "string") return null;
    let body = text.trim();
    if (body.startsWith("for (;;);")) body = body.slice("for (;;);".length);
    if (!body.startsWith("{") && !body.startsWith("[")) return null;
    // 1回の通信に複数の JSON が改行区切りで入っていることがある
    try {
      return [JSON.parse(body)];
    } catch {
      const results = [];
      for (const line of body.split("\n")) {
        const t = line.trim();
        if (!t.startsWith("{")) continue;
        try {
          results.push(JSON.parse(t));
        } catch {
          // 読めない行は飛ばす
        }
      }
      return results.length ? results : null;
    }
  }

  /** 集めた投稿の入れ物。同じ投稿が何度届いても1件にまとめる */
  function createStore() {
    const byCode = new Map();
    const treeChildren = new Set();
    const treeMap = new Map(); // 親code -> 続きのcode一覧

    function addPost(post) {
      const existing = byCode.get(post.code);
      if (!existing) {
        byCode.set(post.code, post);
        return true;
      }
      // 数字は新しい（大きい）方、本文は長い方を残す
      existing.likeCount = Math.max(existing.likeCount, post.likeCount);
      existing.replyCount = Math.max(existing.replyCount, post.replyCount);
      existing.repostCount = Math.max(existing.repostCount, post.repostCount);
      existing.quoteCount = Math.max(existing.quoteCount, post.quoteCount);
      if (post.text.length > existing.text.length) existing.text = post.text;
      if (!existing.replyToUsername && post.replyToUsername) existing.replyToUsername = post.replyToUsername;
      return false;
    }

    function addTree(chain) {
      const [rootCode, ...rest] = chain;
      const current = treeMap.get(rootCode) ?? [];
      if (rest.length > current.length) treeMap.set(rootCode, rest);
      for (const code of rest) treeChildren.add(code);
    }

    return {
      /** JSON を取り込み、新しく見つかった投稿の数を返す */
      ingest(json) {
        const { posts, trees } = extractFromJson(json);
        let added = 0;
        for (const p of posts) if (addPost(p)) added++;
        for (const t of trees) addTree(t);
        return { added, found: posts.length };
      },
      /** ツリーの続きを親にまとめた、投稿の一覧 */
      list() {
        const result = [];
        for (const post of byCode.values()) {
          if (treeChildren.has(post.code)) continue;
          const children = (treeMap.get(post.code) ?? [])
            .map((code) => byCode.get(code))
            .filter(Boolean)
            .map((c) => ({ code: c.code, text: c.text }));
          result.push({ ...post, tree: children });
        }
        return result;
      },
      size() {
        return byCode.size - treeChildren.size;
      },
      clear() {
        byCode.clear();
        treeChildren.clear();
        treeMap.clear();
      },
    };
  }

  /** 並べ替え・絞り込み */
  function selectPosts(posts, options) {
    const opts = {
      username: null,
      excludeReplies: true,
      minLikes: 0,
      sinceDays: 0,
      sortBy: "likes",
      limit: 0,
      now: Date.now(),
      ...options,
    };
    const since = opts.sinceDays > 0 ? opts.now - opts.sinceDays * 86400000 : 0;
    const score = {
      likes: (p) => p.likeCount,
      replies: (p) => p.replyCount,
      reposts: (p) => p.repostCount + p.quoteCount,
      engagement: (p) => p.likeCount + p.replyCount * 3 + (p.repostCount + p.quoteCount) * 5,
      newest: (p) => Date.parse(p.takenAt),
    }[opts.sortBy] ?? ((p) => p.likeCount);

    const filtered = posts.filter((p) => {
      if (opts.username && p.username.toLowerCase() !== opts.username.toLowerCase()) return false;
      if (opts.excludeReplies && p.replyToUsername && p.replyToUsername !== p.username) return false;
      if (p.likeCount < opts.minLikes) return false;
      if (since && Date.parse(p.takenAt) < since) return false;
      return true;
    });
    filtered.sort((a, b) => score(b) - score(a));
    return opts.limit > 0 ? filtered.slice(0, opts.limit) : filtered;
  }

  /** プロフィールや投稿のURLから、アカウント名を取り出す */
  function usernameFromUrl(url) {
    try {
      const { pathname } = new URL(url);
      const match = pathname.match(/^\/@([A-Za-z0-9._]+)/);
      return match ? match[1] : null;
    } catch {
      return null;
    }
  }

  root.ThreadsCollector = Object.assign(root.ThreadsCollector || {}, {
    isPostLike,
    extractFromJson,
    parseJsonText,
    createStore,
    selectPosts,
    usernameFromUrl,
  });
})(globalThis);
