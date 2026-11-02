// 集めた投稿を、AIに貼り付けやすい文章（Markdown）や表（CSV）にする処理。

(function (root) {
  "use strict";

  function formatDate(iso) {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return "";
    return new Intl.DateTimeFormat("ja-JP", {
      timeZone: "Asia/Tokyo",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    }).format(d);
  }

  const MEDIA_LABEL = { text: "テキストのみ", image: "画像", video: "動画", carousel: "複数画像" };

  const ANALYSIS_PROMPT = `# お願い
上の投稿は、Threadsで反応が良かった競合アカウントの投稿です。次の観点で分析してください。
1. 1行目（冒頭）の型：読者の手を止めている書き出しのパターンを分類し、それぞれ例を挙げる
2. 構成の型：本文やツリー（続きの投稿）で最後まで読ませている流れ
3. 返信（コメント）を生んでいる投稿の特徴：問いかけ・締めの一文など
4. 読者の感情を動かしている言葉の置き方
5. 上の型を、私のジャンルに置き換えて使える「穴埋め式テンプレート」を5つ
※ 文章をそのまま真似るのではなく、伸びている理由（構造）を抜き出してください。`;

  function toMarkdown(posts, meta) {
    const lines = [];
    lines.push(`# Threads 競合リサーチ${meta.username ? `：@${meta.username}` : ""}`);
    lines.push("");
    lines.push(`- 収集日時：${formatDate(new Date().toISOString())}`);
    lines.push(`- 件数：${posts.length}件（${meta.sortLabel ?? "いいね数の多い順"}）`);
    if (meta.sourceUrl) lines.push(`- 収集したページ：${meta.sourceUrl}`);
    lines.push("");

    posts.forEach((p, i) => {
      lines.push(`## ${i + 1}. いいね ${p.likeCount} ／ 返信 ${p.replyCount} ／ 再投稿 ${p.repostCount + p.quoteCount}`);
      lines.push(`- 投稿者：@${p.username}`);
      lines.push(`- 投稿日：${formatDate(p.takenAt)}（${MEDIA_LABEL[p.mediaType] ?? p.mediaType}）`);
      lines.push(`- URL：${p.url}`);
      lines.push("");
      lines.push("```");
      lines.push(p.text || "（本文なし）");
      lines.push("```");
      if (meta.includeTree && p.tree.length > 0) {
        lines.push("");
        lines.push(`ツリー（続き ${p.tree.length}件）：`);
        p.tree.forEach((t, j) => {
          lines.push("");
          lines.push(`(${j + 2})`);
          lines.push("```");
          lines.push(t.text || "（本文なし）");
          lines.push("```");
        });
      }
      lines.push("");
    });

    if (meta.includePrompt) {
      lines.push("---");
      lines.push("");
      lines.push(ANALYSIS_PROMPT);
    }
    return lines.join("\n");
  }

  function csvCell(value) {
    const s = String(value ?? "");
    return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  }

  function toCsv(posts, meta) {
    const header = ["順位", "投稿者", "投稿日", "いいね", "返信", "再投稿", "引用", "種類", "本文", "ツリーの続き", "URL"];
    const rows = posts.map((p, i) => [
      i + 1,
      `@${p.username}`,
      formatDate(p.takenAt),
      p.likeCount,
      p.replyCount,
      p.repostCount,
      p.quoteCount,
      MEDIA_LABEL[p.mediaType] ?? p.mediaType,
      p.text,
      meta.includeTree ? p.tree.map((t) => t.text).join("\n---\n") : "",
      p.url,
    ]);
    // 先頭の BOM で、Excel でも文字化けせずに開ける
    return "﻿" + [header, ...rows].map((r) => r.map(csvCell).join(",")).join("\r\n");
  }

  root.ThreadsCollector = Object.assign(root.ThreadsCollector || {}, {
    toMarkdown,
    toCsv,
    ANALYSIS_PROMPT,
  });
})(globalThis);
