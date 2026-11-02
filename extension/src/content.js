// 拡張機能の本体（Threads のページごとに1つ動く）。
// interceptor.js から届いたデータと、ページに最初から埋め込まれているデータを読み取り、
// 見つけた投稿をこのタブの中に貯めておきます。ポップアップから頼まれたら一覧を返します。

(function () {
  "use strict";
  const C = globalThis.ThreadsCollector;
  if (!C || globalThis.__threadsCollectorContent) return;
  globalThis.__threadsCollectorContent = true;

  const store = C.createStore();
  const stats = {
    payloads: 0,
    parsedPayloads: 0,
    postsFound: 0,
    embeddedScripts: 0,
    paths: [],
    nearMiss: null,
    startedAt: new Date().toISOString(),
  };

  function rememberPath(path) {
    if (!path || stats.paths.includes(path)) return;
    stats.paths.push(path);
    if (stats.paths.length > 20) stats.paths.shift();
  }

  /** 投稿が見つからなかったときの手がかり（形を直すための診断用。本文は記録しない） */
  function recordNearMiss(json) {
    if (stats.nearMiss) return;
    const seen = new WeakSet();
    (function visit(node, depth) {
      if (stats.nearMiss || !node || typeof node !== "object" || depth > 40 || seen.has(node)) return;
      seen.add(node);
      if (!Array.isArray(node) && "taken_at" in node) {
        stats.nearMiss = {
          keys: Object.keys(node).slice(0, 60),
          userKeys: node.user && typeof node.user === "object" ? Object.keys(node.user).slice(0, 30) : null,
          captionType: node.caption === null ? "null" : typeof node.caption,
        };
        return;
      }
      for (const key of Object.keys(node)) visit(node[key], depth + 1);
    })(json, 0);
  }

  function ingestText(text, path) {
    stats.payloads++;
    rememberPath(path);
    const jsons = C.parseJsonText(text);
    if (!jsons) return;
    stats.parsedPayloads++;
    for (const json of jsons) {
      const { found } = store.ingest(json);
      stats.postsFound += found;
      if (found === 0 && text.includes('"taken_at"')) recordNearMiss(json);
    }
    scheduleBadgeUpdate();
  }

  // interceptor.js からのデータ
  window.addEventListener("message", (event) => {
    if (event.source !== window || event.origin !== location.origin) return;
    const data = event.data;
    if (!data || data.__threadsCollector !== true || typeof data.text !== "string") return;
    ingestText(data.text, data.path);
  });

  // ページに最初から埋め込まれているデータ
  const scannedScripts = new WeakSet();
  function scanEmbeddedScripts() {
    document.querySelectorAll('script[type="application/json"]').forEach((script) => {
      if (scannedScripts.has(script)) return;
      scannedScripts.add(script);
      const text = script.textContent || "";
      if (!text.includes('"taken_at"')) return;
      stats.embeddedScripts++;
      ingestText(text, "(embedded)");
    });
  }

  // 画面の右下に「何件集めたか」を小さく表示する
  let badge = null;
  let badgeTimer = null;
  function scheduleBadgeUpdate() {
    if (badgeTimer) return;
    badgeTimer = setTimeout(() => {
      badgeTimer = null;
      updateBadge();
    }, 300);
  }
  function updateBadge() {
    if (!document.body) return;
    if (!badge) {
      badge = document.createElement("div");
      badge.setAttribute("data-threads-collector", "badge");
      Object.assign(badge.style, {
        position: "fixed",
        right: "16px",
        bottom: "16px",
        zIndex: "2147483647",
        padding: "6px 12px",
        borderRadius: "999px",
        background: "rgba(24,24,27,.85)",
        color: "#fff",
        font: "12px/1.4 system-ui, sans-serif",
        pointerEvents: "none",
      });
      document.body.appendChild(badge);
    }
    badge.textContent = `投稿リサーチ：${store.size()}件 集めました`;
  }

  function init() {
    scanEmbeddedScripts();
    updateBadge();
    // ページ内の移動で新しいデータが埋め込まれることがあるので、時々確認する
    // （画面の変化のたびに調べると重くなるため、2秒に1回まで）
    let scanTimer = null;
    new MutationObserver(() => {
      if (scanTimer) return;
      scanTimer = setTimeout(() => {
        scanTimer = null;
        scanEmbeddedScripts();
      }, 2000);
    }).observe(document.documentElement, { childList: true, subtree: true });
  }
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init, { once: true });
  } else {
    init();
  }

  // ポップアップからの問い合わせ
  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (!message || typeof message.type !== "string") return;
    if (message.type === "getState") {
      scanEmbeddedScripts();
      sendResponse({
        ok: true,
        url: location.href,
        username: C.usernameFromUrl(location.href),
        posts: store.list(),
        stats: { ...stats, collected: store.size() },
      });
    } else if (message.type === "clear") {
      store.clear();
      stats.postsFound = 0;
      updateBadge();
      sendResponse({ ok: true });
    }
  });
})();
