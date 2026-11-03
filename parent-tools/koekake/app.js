// 声かけことば帖：画面の動き
import { CHECK_KINDS, checkText, groupFindings, splitByFindings } from "./check.js";
import { AGES, CHECK_SAMPLE, SCENES, TIPS } from "./data.js";
import { ageLabel, filterPhrases, phraseKey, phraseListText, phraseText, sceneLabel, searchPhrases, todaysPhrase } from "./logic.js";
import { $, chips, copy, createStore, el, setupChecker, setupTabs, toast } from "./ui.js";

const store = createStore("koekake");
const FAV = "fav";

const state = {
  scene: store.get("scene", "morning"),
  age: store.get("age", "all"),
  query: "",
  favs: new Set(store.get("favs", [])),
};
if (state.scene !== FAV && !SCENES.some((s) => s.id === state.scene)) state.scene = "morning";
if (state.age !== "all" && !AGES.some((a) => a.id === state.age)) state.age = "all";

function currentPhrases() {
  if (state.query.trim()) return searchPhrases(state.query, state.age);
  if (state.scene === FAV) {
    return SCENES.flatMap((s) => filterPhrases(s.id, state.age)).filter((p) => state.favs.has(phraseKey(p)));
  }
  return filterPhrases(state.scene, state.age);
}

function listTitle() {
  if (state.query.trim()) return `「${state.query.trim()}」の言い換え`;
  if (state.scene === FAV) return "保存した声かけ";
  return `${sceneLabel(state.scene)}で使える声かけ`;
}

function phraseCard(p, showScene) {
  const saved = state.favs.has(phraseKey(p));
  return el("article", { class: "phrase" },
    el("p", { class: "ngline" }, el("span", { class: "tag ng" }, "つい"), el("s", {}, p.ng)),
    el("p", { class: "okline" }, el("span", { class: "tag ok" }, "言い換え"), el("q", {}, p.ok)),
    el("p", { class: "why" }, p.why),
    el("div", { class: "meta" },
      el("span", { class: "agebadge" }, showScene ? `${sceneLabel(p.scene)}・${ageLabel(p.age)}` : ageLabel(p.age)),
      el("div", { class: "actions" },
        el("button", {
          type: "button", class: "btn", "aria-pressed": saved, "aria-label": saved ? "保存をやめる" : "この言葉を保存",
          onclick: () => {
            if (saved) state.favs.delete(phraseKey(p));
            else state.favs.add(phraseKey(p));
            store.set("favs", [...state.favs]);
            render();
            toast(saved ? "保存をやめました" : "保存しました");
          },
        }, saved ? "★ 保存済み" : "☆ 保存"),
        el("button", { type: "button", class: "btn", onclick: () => copy(phraseText(p)) }, "コピー"),
      ),
    ),
  );
}

function renderToday() {
  const p = todaysPhrase();
  $("today").replaceChildren(
    el("p", { class: "label" }, `今日のひとこと（${sceneLabel(p.scene)}・${ageLabel(p.age)}）`),
    el("p", { class: "ngline" }, el("span", { class: "tag ng" }, "つい"), el("s", {}, p.ng)),
    el("p", { class: "okline" }, el("span", { class: "tag ok" }, "言い換え"), el("q", {}, p.ok)),
    el("p", { class: "why" }, p.why),
  );
}

function render() {
  const searching = state.query.trim() !== "";
  $("filters").querySelector("div").hidden = searching;
  chips($("scene-chips"), [...SCENES, { id: FAV, label: `★ 保存した言葉（${state.favs.size}）` }], state.scene, (id) => {
    state.scene = id;
    store.set("scene", id);
    render();
  });
  chips($("age-chips"), [{ id: "all", label: "すべて" }, ...AGES], state.age, (id) => {
    state.age = id;
    store.set("age", id);
    render();
  });

  const items = currentPhrases();
  $("count").textContent = searching ? `${items.length}件見つかりました` : `${items.length}件`;
  $("phrase-list").replaceChildren(
    ...(items.length
      ? items.map((p) => phraseCard(p, searching || state.scene === FAV))
      : [el("p", { class: "empty" },
          searching
            ? "見つかりませんでした。別の言葉で探すか、場面から選んでみてください。"
            : state.scene === FAV
              ? "まだ保存した言葉はありません。☆ 保存 を押すと、ここに集まります。"
              : "この年齢の言い換えは準備中です。「すべて」を選んでみてください。")]),
  );
  $("copy-list").disabled = items.length === 0;
}

$("search").addEventListener("input", (e) => {
  state.query = e.target.value;
  render();
});

$("copy-list").addEventListener("click", () => {
  const items = currentPhrases();
  if (!items.length) return;
  copy(phraseListText(listTitle(), items), `${items.length}個の言い換えをコピーしました`);
});

function renderTips() {
  $("tips").replaceChildren(
    ...TIPS.map((t, i) =>
      el("article", { class: "tipcard" },
        el("h3", {}, el("span", {}, `コツ${i + 1}`), t.title),
        el("p", {}, t.body),
        el("ul", {}, ...t.examples.map((x) => el("li", {}, `「${x}」`))),
      ),
    ),
  );
}

setupTabs(["iikae", "kotsu", "check"]);
renderToday();
render();
renderTips();
setupChecker({
  input: $("check-input"),
  preview: $("check-preview"),
  result: $("check-result"),
  note: $("check-example-note"),
  clear: $("check-clear"),
  sample: $("check-sample"),
  store,
  sampleText: CHECK_SAMPLE,
  checkText,
  splitByFindings,
  groupFindings,
  CHECK_KINDS,
});
