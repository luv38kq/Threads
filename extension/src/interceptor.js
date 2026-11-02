// Threads のページの中で動き、ページが受け取ったデータ（通信の中身）のコピーを
// 拡張機能の本体（content.js）に渡します。
// ・データを外部に送ることはありません（このパソコンのブラウザの中だけで処理します）
// ・ページへの操作（いいね・投稿・自動スクロールなど）は一切しません

(function () {
  "use strict";
  if (window.__threadsCollectorInstalled) return;
  window.__threadsCollectorInstalled = true;

  const MESSAGE_KEY = "__threadsCollector";
  const MAX_BYTES = 8 * 1024 * 1024;
  const INTERESTING = /\/(graphql|api)\//;

  function forward(url, text) {
    if (typeof text !== "string" || text.length === 0 || text.length > MAX_BYTES) return;
    // 投稿データが含まれていそうなものだけ渡す
    if (!text.includes('"taken_at"')) return;
    let path = "";
    try {
      path = new URL(url, location.href).pathname;
    } catch {
      path = "";
    }
    window.postMessage({ [MESSAGE_KEY]: true, path, text }, location.origin);
  }

  function isInteresting(url) {
    try {
      const u = new URL(url, location.href);
      return u.origin === location.origin && INTERESTING.test(u.pathname);
    } catch {
      return false;
    }
  }

  // fetch で受け取ったデータ
  const originalFetch = window.fetch;
  window.fetch = async function (...args) {
    const response = await originalFetch.apply(this, args);
    try {
      const input = args[0];
      const url = typeof input === "string" ? input : input instanceof Request ? input.url : String(input);
      if (isInteresting(url)) {
        response
          .clone()
          .text()
          .then((text) => forward(url, text))
          .catch(() => {});
      }
    } catch {
      // 失敗してもページの動作には影響させない
    }
    return response;
  };

  // XMLHttpRequest で受け取ったデータ
  const originalOpen = XMLHttpRequest.prototype.open;
  const originalSend = XMLHttpRequest.prototype.send;
  XMLHttpRequest.prototype.open = function (method, url, ...rest) {
    this.__threadsCollectorUrl = String(url);
    return originalOpen.call(this, method, url, ...rest);
  };
  XMLHttpRequest.prototype.send = function (...args) {
    const url = this.__threadsCollectorUrl;
    if (url && isInteresting(url)) {
      this.addEventListener("load", () => {
        try {
          if (this.responseType === "" || this.responseType === "text") {
            forward(url, this.responseText);
          } else if (this.responseType === "json" && this.response) {
            forward(url, JSON.stringify(this.response));
          }
        } catch {
          // 何もしない
        }
      });
    }
    return originalSend.apply(this, args);
  };
})();
