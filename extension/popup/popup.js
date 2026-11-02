// ポップアップ（拡張機能のアイコンを押したときに出る小さな画面）の動き。
(function () {
  "use strict";
  const C = globalThis.ThreadsCollector;
  const $ = (id) => document.getElementById(id);

  const REVERIFY_MS = 12 * 60 * 60 * 1000; // 12時間ごとに承認状態を確認
  const OFFLINE_GRACE_MS = 3 * 24 * 60 * 60 * 1000; // 通信できないときは3日間だけ前回の確認結果を使う
  const MAX_SEND = 300;

  const SORT_LABELS = {
    likes: "いいねが多い順",
    replies: "返信が多い順",
    reposts: "再投稿・引用が多い順",
    engagement: "反応の合計が多い順",
    newest: "新しい順",
  };

  let state = null; // ページから受け取った投稿など
  let settings = {};

  // ---------------------------------------------------------------
  // 保存された設定
  // ---------------------------------------------------------------
  async function loadSettings() {
    settings = await chrome.storage.local.get([
      "studioUrl",
      "token",
      "verifiedAt",
      "displayName",
      "accounts",
      "filters",
    ]);
  }

  function originOf(url) {
    try {
      const u = new URL(url);
      if (u.protocol !== "https:" && !["localhost", "127.0.0.1"].includes(u.hostname)) return null;
      return u.origin;
    } catch {
      return null;
    }
  }

  async function callStudio(path, body) {
    const origin = originOf(settings.studioUrl);
    if (!origin) throw new Error("スタジオのURLが正しくありません。");
    const res = await fetch(`${origin}${path}`, {
      method: "POST",
      headers: { Authorization: `Bearer ${settings.token}`, "Content-Type": "application/json" },
      body: JSON.stringify(body ?? {}),
    });
    let data = null;
    try {
      data = await res.json();
    } catch {
      data = null;
    }
    if (!res.ok) {
      const error = new Error(data?.message || `スタジオでエラーが発生しました（${res.status}）`);
      error.status = res.status;
      throw error;
    }
    return data;
  }

  async function verify() {
    const data = await callStudio("/api/extension/verify");
    settings.verifiedAt = Date.now();
    settings.displayName = data.displayName;
    settings.accounts = data.accounts ?? [];
    await chrome.storage.local.set({
      verifiedAt: settings.verifiedAt,
      displayName: settings.displayName,
      accounts: settings.accounts,
    });
  }

  /** 承認済みの購入者として使える状態かを確認する */
  async function ensureVerified() {
    if (!settings.studioUrl || !settings.token) return false;
    const age = Date.now() - (settings.verifiedAt ?? 0);
    if (settings.verifiedAt && age < REVERIFY_MS) return true;
    try {
      await verify();
      return true;
    } catch (error) {
      if (error.status === 401 || error.status === 403) {
        await chrome.storage.local.remove(["verifiedAt"]);
        settings.verifiedAt = undefined;
        $("settings-message").textContent = error.message;
        $("settings-message").className = "message error";
        return false;
      }
      // 通信できないだけなら、最近確認できていれば使える
      return Boolean(settings.verifiedAt) && age < OFFLINE_GRACE_MS;
    }
  }

  // ---------------------------------------------------------------
  // 画面の切り替え
  // ---------------------------------------------------------------
  function showSettings() {
    $("settings-view").hidden = false;
    $("main-view").hidden = true;
    $("studio-url").value = settings.studioUrl ?? "";
    $("token").value = settings.token ?? "";
  }

  function showMain() {
    $("settings-view").hidden = true;
    $("main-view").hidden = false;
  }

  $("open-settings").addEventListener("click", () => {
    if ($("settings-view").hidden) showSettings();
    else if (settings.verifiedAt) {
      showMain();
      loadPageState();
    }
  });

  $("save-settings").addEventListener("click", async () => {
    const message = $("settings-message");
    const origin = originOf($("studio-url").value.trim());
    const token = $("token").value.trim();
    if (!origin) {
      message.textContent = "スタジオのURL（https:// から始まるもの）を入力してください。";
      message.className = "message error";
      return;
    }
    if (!token) {
      message.textContent = "連携コードを入力してください。";
      message.className = "message error";
      return;
    }
    // スタジオと通信する許可をもらう（Chrome の確認画面が出ます）
    const granted = await chrome.permissions.request({ origins: [`${origin}/*`] });
    if (!granted) {
      message.textContent = "スタジオと通信する許可が必要です。";
      message.className = "message error";
      return;
    }
    settings.studioUrl = origin;
    settings.token = token;
    await chrome.storage.local.set({ studioUrl: origin, token });
    message.textContent = "確認中…";
    message.className = "message";
    try {
      await verify();
      message.textContent = `連携しました（${settings.displayName} さん）`;
      message.className = "message success";
      showMain();
      fillAccounts();
      loadPageState();
    } catch (error) {
      message.textContent = error.message;
      message.className = "message error";
    }
  });

  // ---------------------------------------------------------------
  // Threads のページから投稿を受け取る
  // ---------------------------------------------------------------
  async function activeTab() {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    return tab;
  }

  async function loadPageState() {
    const status = $("status");
    const tab = await activeTab();
    try {
      state = await chrome.tabs.sendMessage(tab.id, { type: "getState" });
    } catch {
      state = null;
    }
    if (!state?.ok) {
      status.textContent =
        "Threads（threads.com）のページで使ってください。開いているのに表示されない場合は、ページを再読み込みしてください。";
      $("controls").hidden = true;
      return;
    }
    $("controls").hidden = false;
    const total = state.posts.length;
    status.textContent =
      total === 0
        ? "まだ投稿が集まっていません。ページを下にスクロールしてください。"
        : `このページで ${total} 件の投稿を集めました。もっと集めるには、ページを下にスクロールしてから開き直してください。`;
    if (state.username) {
      $("only-account-label").textContent = `@${state.username} の投稿だけ`;
      $("only-account").disabled = false;
    } else {
      $("only-account-label").textContent = "このアカウントの投稿だけ（プロフィールを開いたときに使えます）";
      $("only-account").checked = false;
      $("only-account").disabled = true;
    }
    updateSelection();
  }

  function filters() {
    return {
      onlyAccount: $("only-account").checked,
      sortBy: $("sort-by").value,
      limit: Number($("limit").value),
      sinceDays: Number($("since-days").value),
      minLikes: Math.max(0, Number($("min-likes").value) || 0),
      excludeReplies: $("exclude-replies").checked,
      includeTree: $("include-tree").checked,
      includePrompt: $("include-prompt").checked,
    };
  }

  function selected() {
    if (!state?.ok) return [];
    const f = filters();
    return C.selectPosts(state.posts, {
      username: f.onlyAccount ? state.username : null,
      sortBy: f.sortBy,
      limit: f.limit,
      sinceDays: f.sinceDays,
      minLikes: f.minLikes,
      excludeReplies: f.excludeReplies,
    });
  }

  function updateSelection() {
    const posts = selected();
    const f = filters();
    $("selection").textContent = `書き出す投稿：${posts.length}件（${SORT_LABELS[f.sortBy]}）`;
    for (const id of ["copy-md", "download-csv", "send-studio"]) $(id).disabled = posts.length === 0;
    chrome.storage.local.set({ filters: f });
  }

  function restoreFilters() {
    const f = settings.filters;
    if (!f) return;
    $("sort-by").value = f.sortBy ?? "likes";
    $("limit").value = String(f.limit ?? 20);
    $("since-days").value = String(f.sinceDays ?? 0);
    $("min-likes").value = String(f.minLikes ?? 0);
    $("exclude-replies").checked = f.excludeReplies ?? true;
    $("include-tree").checked = f.includeTree ?? true;
    $("include-prompt").checked = f.includePrompt ?? true;
  }

  for (const id of ["only-account", "sort-by", "limit", "since-days", "min-likes", "exclude-replies", "include-tree", "include-prompt"]) {
    $(id).addEventListener("change", updateSelection);
  }
  $("min-likes").addEventListener("input", updateSelection);

  function fillAccounts() {
    const select = $("account-id");
    select.length = 1;
    for (const account of settings.accounts ?? []) {
      const option = document.createElement("option");
      option.value = account.id;
      option.textContent = `${account.name} 向けに分析`;
      select.appendChild(option);
    }
  }

  function showMessage(text, tone) {
    const el = $("message");
    el.textContent = text;
    el.className = `message ${tone ?? ""}`;
  }

  // ---------------------------------------------------------------
  // 書き出し
  // ---------------------------------------------------------------
  function exportMeta() {
    const f = filters();
    return {
      username: f.onlyAccount ? state.username : null,
      sourceUrl: state.url,
      sortLabel: SORT_LABELS[f.sortBy],
      includeTree: f.includeTree,
      includePrompt: f.includePrompt,
    };
  }

  $("copy-md").addEventListener("click", async () => {
    const text = C.toMarkdown(selected(), exportMeta());
    await navigator.clipboard.writeText(text);
    showMessage("コピーしました。ChatGPT や Claude に貼り付けてください。", "success");
  });

  $("download-csv").addEventListener("click", () => {
    const csv = C.toCsv(selected(), exportMeta());
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const a = document.createElement("a");
    const name = state.username ? `threads_${state.username}` : "threads_posts";
    a.href = URL.createObjectURL(blob);
    a.download = `${name}_${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 5000);
    showMessage("CSVを保存しました。", "success");
  });

  $("send-studio").addEventListener("click", async () => {
    const posts = selected().slice(0, MAX_SEND);
    const button = $("send-studio");
    button.disabled = true;
    showMessage("スタジオに送っています…");
    try {
      const f = filters();
      const data = await callStudio("/api/extension/research", {
        sourceUsername: f.onlyAccount ? state.username : null,
        sourceUrl: state.url,
        accountId: $("account-id").value || null,
        posts: posts.map((p) => ({
          ...p,
          tree: f.includeTree ? p.tree : [],
        })),
      });
      showMessage("送りました。スタジオを開きます。", "success");
      chrome.tabs.create({ url: data.url });
    } catch (error) {
      if (error.status === 401 || error.status === 403) {
        await chrome.storage.local.remove(["verifiedAt"]);
      }
      showMessage(error.message, "error");
    } finally {
      button.disabled = false;
    }
  });

  $("clear").addEventListener("click", async () => {
    if (!confirm("このページで集めた投稿をリセットしますか？")) return;
    const tab = await activeTab();
    await chrome.tabs.sendMessage(tab.id, { type: "clear" }).catch(() => {});
    await loadPageState();
    showMessage("リセットしました。");
  });

  $("diagnostics").addEventListener("click", async () => {
    const manifest = chrome.runtime.getManifest();
    const info = {
      version: manifest.version,
      userAgent: navigator.userAgent,
      page: state?.url ? new URL(state.url).pathname : null,
      stats: state?.stats ?? null,
      samplePostKeys: state?.posts?.[0] ? Object.keys(state.posts[0]) : null,
    };
    await navigator.clipboard.writeText(JSON.stringify(info, null, 2));
    showMessage("診断情報をコピーしました（投稿の本文は含まれていません）。", "success");
  });

  // ---------------------------------------------------------------
  // 起動
  // ---------------------------------------------------------------
  (async function start() {
    await loadSettings();
    restoreFilters();
    if (await ensureVerified()) {
      showMain();
      fillAccounts();
      await loadPageState();
    } else {
      showSettings();
    }
  })();
})();
