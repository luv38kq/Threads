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

/**
 * タイプチェックのタブ。field は "koekake" か "toitore"（どちらのコツを出すか）
 * onChange は、結果が変わったときに呼ばれる（ほかのタブの表示を更新するため）
 */
export function setupTypeTab({ container, store, field, types, onChange }) {
  const { TYPE_QUESTIONS, SENSORY_QUESTION, SENSORY_NOTE, TYPE_DISCLAIMER, TYPES, diagnose, isComplete } = types;
  let answers = store.get("type-answers", {});

  function choice(q, side, label) {
    return el("button", {
      type: "button", class: "choice", "aria-pressed": answers[q.id] === side,
      onclick: () => {
        answers = { ...answers, [q.id]: side };
        store.set("type-answers", answers);
        render();
        onChange?.();
      },
    }, label);
  }

  function typeDetail(t, open) {
    const advice = t[field];
    return el("details", { class: "typecard", open: open || undefined },
      el("summary", {}, el("b", {}, t.name), el("span", {}, t.catch)),
      el("div", { class: "typebody" },
        el("p", { class: "label" }, "よく見られる様子"), el("ul", {}, ...t.traits.map((x) => el("li", {}, x))),
        el("p", { class: "label" }, "この子の強み"), el("ul", {}, ...t.strengths.map((x) => el("li", {}, x))),
        el("p", { class: "label" }, "つまずきやすい場面"), el("ul", {}, ...t.hard.map((x) => el("li", {}, x))),
        el("p", { class: "label" }, field === "toitore" ? "トイトレの進め方" : "関わり方のコツ"),
        el("ul", {}, ...advice.tips.map((x) => el("li", {}, x))),
        ...(advice.examples ? [el("p", { class: "label" }, "声かけの例"), el("ul", {}, ...advice.examples.map((x) => el("li", {}, `「${x}」`)))] : []),
      ),
    );
  }

  function render() {
    const done = isComplete(answers);
    const result = done ? diagnose(answers) : null;
    const answered = TYPE_QUESTIONS.filter((q) => answers[q.id]).length;
    container.replaceChildren(
      el("p", { class: "note" }, el("b", {}, "はじめに"), TYPE_DISCLAIMER),
      ...(result
        ? [
            el("article", { class: "answer typeresult" },
              el("p", { class: "label" }, "チェックの結果"),
              ...(result.near.length
                ? [el("p", { class: "hint" }, `${result.near.map((t) => t.name).join("・")}の面もあります。そちらのコツも参考にしてください。`)]
                : []),
              typeDetail(result.type, true),
              ...(result.sensory ? [el("p", { class: "consult" }, el("b", {}, SENSORY_NOTE.title), SENSORY_NOTE.body)] : []),
              el("div", { class: "toolbar" },
                el("button", {
                  type: "button", class: "btn", onclick: () => {
                    answers = {};
                    store.set("type-answers", answers);
                    render();
                    onChange?.();
                  },
                }, "チェックをやり直す"),
              ),
            ),
          ]
        : []),
      el("div", { class: "quiz" },
        el("p", { class: "label" }, `質問（${answered} / ${TYPE_QUESTIONS.length}）ふだんの様子に近いほうを選んでください`),
        ...TYPE_QUESTIONS.map((q, i) =>
          el("div", { class: "question" },
            el("p", {}, el("span", { class: "qnum" }, `Q${i + 1}`), q.text),
            el("div", { class: "choices" }, choice(q, "a", q.a), choice(q, "b", q.b)),
          ),
        ),
        el("div", { class: "question" },
          el("p", {}, el("span", { class: "qnum" }, "おまけ"), SENSORY_QUESTION.text),
          el("div", { class: "choices" },
            el("button", {
              type: "button", class: "choice", "aria-pressed": answers.sensory === true,
              onclick: () => { answers = { ...answers, sensory: true }; store.set("type-answers", answers); render(); onChange?.(); },
            }, "はい"),
            el("button", {
              type: "button", class: "choice", "aria-pressed": answers.sensory === false,
              onclick: () => { answers = { ...answers, sensory: false }; store.set("type-answers", answers); render(); onChange?.(); },
            }, "いいえ"),
          ),
        ),
        ...(done ? [] : [el("p", { class: "hint" }, "8つの質問に答えると、結果がこの上に出ます。")]),
      ),
      el("div", {},
        el("p", { class: "label" }, "4つのタイプ"),
        el("div", { class: "typelist" }, ...TYPES.map((t) => typeDetail(t, false))),
      ),
    );
  }
  render();

  /** ほかのタブに出す「わが子のタイプ」のひとこと */
  return function banner() {
    if (!isComplete(answers)) return null;
    const { type } = diagnose(answers);
    return el("a", { class: "typebanner", href: "#type" },
      el("b", {}, `わが子は「${type.name}」`),
      el("span", {}, type[field].tips[0]),
    );
  };
}
