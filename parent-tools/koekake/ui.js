// 画面づくりの共通部品（声かけ帖・トイトレ帖で共通。2つのフォルダに同じものを置いています）

export const $ = (id) => document.getElementById(id);

export function el(tag, attrs = {}, ...children) {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v === undefined || v === null || v === false) continue;
    if (k === "class") node.className = v;
    else if (k === "onclick") node.addEventListener("click", v);
    else if (k === "onchange") node.addEventListener("change", v);
    else node.setAttribute(k, v === true ? "" : String(v));
  }
  for (const c of children.flat()) {
    if (c === null || c === undefined || c === false) continue;
    node.append(c instanceof Node ? c : document.createTextNode(String(c)));
  }
  return node;
}

/** この端末だけに覚えておく（使えない環境でも動くようにする） */
export function createStore(prefix) {
  return {
    get(key, fallback) {
      try {
        const v = localStorage.getItem(`${prefix}:${key}`);
        return v === null ? fallback : JSON.parse(v);
      } catch {
        return fallback;
      }
    },
    set(key, value) {
      try {
        localStorage.setItem(`${prefix}:${key}`, JSON.stringify(value));
      } catch {
        /* 保存できなくても使える */
      }
    },
  };
}

let toastTimer;
export function toast(message) {
  const t = $("toast");
  t.textContent = message;
  t.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => (t.hidden = true), 1800);
}

export async function copy(text, done = "コピーしました") {
  try {
    await navigator.clipboard.writeText(text);
    toast(done);
  } catch {
    // コピーできない環境では、選んだ状態の文章を出して手でコピーしてもらう
    const area = el("textarea", { readonly: true, "aria-label": "コピーする文章" });
    area.value = text;
    area.style.cssText = "position:fixed;left:16px;right:16px;bottom:72px;width:auto;height:40vh;z-index:30";
    document.body.append(area);
    area.focus();
    area.select();
    toast("文章を選びました。長押しでコピーしてください");
    area.addEventListener("blur", () => area.remove());
  }
}

/** タブの切り替え（URLの #名前 で開くタブが決まる） */
export function setupTabs(names, onShow) {
  function show() {
    const name = location.hash.slice(1);
    const current = names.includes(name) ? name : names[0];
    for (const n of names) $(`panel-${n}`).hidden = n !== current;
    for (const a of document.querySelectorAll("nav.tabs a")) {
      if (a.dataset.tab === current) a.setAttribute("aria-current", "page");
      else a.removeAttribute("aria-current");
    }
    onShow?.(current);
  }
  window.addEventListener("hashchange", show);
  show();
}

/** 日付から決まる番号（同じ日なら同じ「今日のひとこと」を出すため） */
export function dayIndex(date, length) {
  const d = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const days = Math.floor(d.getTime() / 86400000);
  return ((days % length) + length) % length;
}

export function chips(container, items, selected, onSelect, cls = "chip") {
  container.replaceChildren(
    ...items.map((it) =>
      el("button", { type: "button", class: cls, "aria-pressed": selected === it.id, onclick: () => onSelect(it.id) }, it.label),
    ),
  );
}

/** ことばチェックの画面（入力・印付きの文章・結果） */
export function setupChecker({ input, preview, result, note, clear, sample, store, sampleText, checkText, splitByFindings, groupFindings, CHECK_KINDS }) {
  const tone = (f) => CHECK_KINDS[f.rule.kind]?.tone ?? "strong";
  const saved = store.get("draft", null);
  input.value = saved ?? sampleText;

  function render() {
    const text = input.value;
    note.hidden = text !== sampleText;
    const findings = checkText(text);
    if (!text.trim()) {
      preview.replaceChildren(el("span", { class: "hint" }, "ここに、印を付けた文章が出ます。"));
      result.replaceChildren(el("p", { class: "empty" }, "言葉を入れると、ここに結果が出ます。"));
      return;
    }
    preview.replaceChildren(
      ...splitByFindings(text, findings).map((part) =>
        part.finding ? el("mark", { class: tone(part.finding), title: part.finding.rule.reason }, part.text) : part.text,
      ),
    );
    const groups = groupFindings(findings);
    if (groups.length === 0) {
      result.replaceChildren(
        el("p", { class: "summary" }, "気になる言い方は見つかりませんでした"),
        el("p", { class: "hint" }, "このチェックで分かるのは、よくある言い方の一部だけです。"),
      );
      return;
    }
    result.replaceChildren(
      el("p", { class: "summary" }, `気をつけたい言い方が${groups.length}種類ありました`),
      ...groups.map((g) =>
        el("div", { class: "finding" },
          el("div", { class: "head" },
            el("span", { class: `kind ${g.tone}` }, g.label),
            el("span", { class: "words" }, g.matches.map((m) => `「${m}」`).join(" ")),
          ),
          el("p", {}, g.rule.reason),
          el("p", { class: "tip" }, `言い換えのヒント：${g.rule.hint}`),
        ),
      ),
    );
  }
  input.addEventListener("input", () => {
    store.set("draft", input.value);
    render();
  });
  clear.addEventListener("click", () => {
    input.value = "";
    store.set("draft", "");
    render();
    input.focus();
  });
  sample.addEventListener("click", () => {
    input.value = sampleText;
    store.set("draft", null);
    render();
  });
  render();
}
