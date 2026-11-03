// 子育てことば帖：画面の動き
import { AGES, CHECK_KINDS, CHECK_SAMPLE, SCENES, TOILET_AGES, TOILET_STAGES } from "./data.js";
import {
  checkText,
  concernsFor,
  filterPhrases,
  groupFindings,
  phraseListText,
  phraseText,
  splitByFindings,
  toiletAnswer,
  toiletAnswerText,
} from "./logic.js";

const $ = (id) => document.getElementById(id);

function el(tag, attrs = {}, ...children) {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v === undefined || v === null || v === false) continue;
    if (k === "class") node.className = v;
    else if (k === "onclick") node.addEventListener("click", v);
    else node.setAttribute(k, v === true ? "" : String(v));
  }
  for (const c of children.flat()) {
    if (c === null || c === undefined || c === false) continue;
    node.append(c instanceof Node ? c : document.createTextNode(String(c)));
  }
  return node;
}

// この端末だけに覚えておく（使えない環境でも動くようにする）
const store = {
  get(key, fallback) {
    try {
      const v = localStorage.getItem(`kotobacho:${key}`);
      return v === null ? fallback : JSON.parse(v);
    } catch {
      return fallback;
    }
  },
  set(key, value) {
    try {
      localStorage.setItem(`kotobacho:${key}`, JSON.stringify(value));
    } catch {
      /* 保存できなくても使える */
    }
  },
};

let toastTimer;
function toast(message) {
  const t = $("toast");
  t.textContent = message;
  t.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => (t.hidden = true), 1800);
}

async function copy(text, done = "コピーしました") {
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

// ------------------------------------------------------------- タブ
const TABS = ["koekake", "toitore", "check"];
function showTab() {
  const name = location.hash.slice(1);
  const current = TABS.includes(name) ? name : "koekake";
  for (const t of TABS) $(`panel-${t}`).hidden = t !== current;
  for (const a of document.querySelectorAll("nav.tabs a")) {
    if (a.dataset.tab === current) a.setAttribute("aria-current", "page");
    else a.removeAttribute("aria-current");
  }
}
window.addEventListener("hashchange", showTab);

// ------------------------------------------------------------- 声かけ言い換え
const FAV = "fav";
const state = {
  scene: store.get("scene", "morning"),
  age: store.get("age", "all"),
  favs: new Set(store.get("favs", [])),
};
if (state.scene !== FAV && !SCENES.some((s) => s.id === state.scene)) state.scene = "morning";

const phraseKey = (p) => `${p.scene}|${p.ng}|${p.ok}`;

function currentPhrases() {
  if (state.scene === FAV) {
    return SCENES.flatMap((s) => filterPhrases(s.id, state.age)).filter((p) => state.favs.has(phraseKey(p)));
  }
  return filterPhrases(state.scene, state.age);
}

function renderKoekake() {
  const scenes = $("scene-chips");
  scenes.replaceChildren(
    ...SCENES.map((s) =>
      el("button", {
        type: "button", class: "chip", "aria-pressed": state.scene === s.id,
        onclick: () => { state.scene = s.id; store.set("scene", s.id); renderKoekake(); },
      }, s.label),
    ),
    el("button", {
      type: "button", class: "chip", "aria-pressed": state.scene === FAV,
      onclick: () => { state.scene = FAV; store.set("scene", FAV); renderKoekake(); },
    }, `★ 保存した言葉（${state.favs.size}）`),
  );

  $("age-chips").replaceChildren(
    ...[{ id: "all", label: "すべて" }, ...AGES].map((a) =>
      el("button", {
        type: "button", class: "chip", "aria-pressed": state.age === a.id,
        onclick: () => { state.age = a.id; store.set("age", a.id); renderKoekake(); },
      }, a.label),
    ),
  );

  const items = currentPhrases();
  const ageLabel = (id) => AGES.find((a) => a.id === id)?.label ?? "";
  const sceneLabel = (id) => SCENES.find((s) => s.id === id)?.label ?? "";
  $("phrase-list").replaceChildren(
    ...(items.length
      ? items.map((p) => {
          const saved = state.favs.has(phraseKey(p));
          return el("article", { class: "phrase" },
            el("p", { class: "ngline" }, el("span", { class: "tag ng" }, "つい"), el("s", {}, p.ng)),
            el("p", { class: "okline" }, el("span", { class: "tag ok" }, "言い換え"), el("q", {}, p.ok)),
            el("p", { class: "why" }, p.why),
            el("div", { class: "meta" },
              el("span", { class: "agebadge" }, state.scene === FAV ? `${sceneLabel(p.scene)}・${ageLabel(p.age)}` : ageLabel(p.age)),
              el("div", { class: "actions" },
                el("button", {
                  type: "button", class: "btn", "aria-pressed": saved,
                  "aria-label": saved ? "保存をやめる" : "この言葉を保存",
                  onclick: () => {
                    if (saved) state.favs.delete(phraseKey(p));
                    else state.favs.add(phraseKey(p));
                    store.set("favs", [...state.favs]);
                    renderKoekake();
                    toast(saved ? "保存をやめました" : "保存しました");
                  },
                }, saved ? "★ 保存済み" : "☆ 保存"),
                el("button", { type: "button", class: "btn", onclick: () => copy(phraseText(p)) }, "コピー"),
              ),
            ),
          );
        })
      : [el("p", { class: "empty" }, state.scene === FAV ? "まだ保存した言葉はありません。☆ 保存 を押すと、ここに集まります。" : "この年齢の言い換えは準備中です。「すべて」を選んでみてください。")]),
  );
  $("copy-list").disabled = items.length === 0;
}

$("copy-list").addEventListener("click", () => {
  const items = currentPhrases();
  if (!items.length) return;
  const text = state.scene === FAV
    ? `【保存した声かけ】\n\n${items.map((p) => `✕ ${p.ng}\n→ ${p.ok}`).join("\n\n")}`
    : phraseListText(state.scene, items);
  copy(text, `${items.length}個の言い換えをコピーしました`);
});

// ------------------------------------------------------------- トイトレQ&A
const tState = {
  age: store.get("t-age", "2-3"),
  stage: store.get("t-stage", "pee"),
  concern: store.get("t-concern", "refuse"),
};
if (!TOILET_AGES.some((a) => a.id === tState.age)) tState.age = "2-3";
if (!TOILET_STAGES.some((s) => s.id === tState.stage)) tState.stage = "pee";

function renderToitore() {
  const concerns = concernsFor(tState.stage);
  if (!concerns.some((c) => c.id === tState.concern)) tState.concern = concerns[0]?.id;
  store.set("t-age", tState.age);
  store.set("t-stage", tState.stage);
  store.set("t-concern", tState.concern);

  $("t-age").replaceChildren(
    ...TOILET_AGES.map((a) =>
      el("button", {
        type: "button", class: "chip", "aria-pressed": tState.age === a.id,
        onclick: () => { tState.age = a.id; renderToitore(); },
      }, a.label),
    ),
  );
  $("t-stage").replaceChildren(
    ...TOILET_STAGES.map((s) =>
      el("button", {
        type: "button", class: "step", "aria-pressed": tState.stage === s.id,
        onclick: () => { tState.stage = s.id; renderToitore(); },
      }, s.label),
    ),
  );
  $("t-concern").replaceChildren(
    ...concerns.map((c) =>
      el("button", {
        type: "button", class: "concern", "aria-pressed": tState.concern === c.id,
        onclick: () => { tState.concern = c.id; renderToitore(); },
      }, c.concern),
    ),
  );

  const a = toiletAnswer(tState.age, tState.stage, tState.concern);
  $("t-answer").replaceChildren(
    el("h3", {}, a.concern),
    el("p", { class: "empathy" }, a.empathy),
    el("div", {}, el("p", { class: "label" }, "小さなコツ"), el("ul", {}, ...a.tips.map((t) => el("li", {}, t)))),
    el("p", { class: "note" }, el("b", {}, "焦らなくて大丈夫"), a.relax),
    el("p", { class: "note" }, el("b", {}, `${a.ageLabel}のころ`), a.ageNote),
    ...(a.consult ? [el("p", { class: "consult" }, el("b", {}, "相談の目安"), a.consult)] : []),
    el("div", { class: "toolbar" },
      el("button", { type: "button", class: "btn primary", onclick: () => copy(toiletAnswerText(a)) }, "この答えをコピー"),
    ),
  );
}

// ------------------------------------------------------------- ことばチェック
const input = $("check-input");
const savedDraft = store.get("draft", null);
input.value = savedDraft ?? CHECK_SAMPLE;

const CHECK_TONE = (f) => CHECK_KINDS[f.rule.kind]?.tone ?? "strong";

function renderCheck() {
  const text = input.value;
  $("check-example-note").hidden = text !== CHECK_SAMPLE;
  const findings = checkText(text);
  const preview = $("check-preview");
  if (!text.trim()) {
    preview.replaceChildren(el("span", { class: "hint" }, "ここに、印を付けた文章が出ます。"));
  } else {
    preview.replaceChildren(
      ...splitByFindings(text, findings).map((part) =>
        part.finding
          ? el("mark", { class: CHECK_TONE(part.finding), title: part.finding.rule.reason }, part.text)
          : part.text,
      ),
    );
  }

  const groups = groupFindings(findings);
  const result = $("check-result");
  if (!text.trim()) {
    result.replaceChildren(el("p", { class: "empty" }, "言葉を入れると、ここに結果が出ます。"));
  } else if (groups.length === 0) {
    result.replaceChildren(
      el("p", { class: "summary" }, "気になる言い方は見つかりませんでした"),
      el("p", { class: "hint" }, "このチェックで分かるのは、よくある言い方の一部だけです。"),
    );
  } else {
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
}

input.addEventListener("input", () => {
  store.set("draft", input.value);
  renderCheck();
});
$("check-clear").addEventListener("click", () => {
  input.value = "";
  store.set("draft", "");
  renderCheck();
  input.focus();
});
$("check-sample").addEventListener("click", () => {
  input.value = CHECK_SAMPLE;
  store.set("draft", null);
  renderCheck();
});

// ------------------------------------------------------------- 起動
showTab();
renderKoekake();
renderToitore();
renderCheck();
