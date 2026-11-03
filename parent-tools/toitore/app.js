// トイトレおたすけ帖：画面の動き
import { CHECK_KINDS, checkText, groupFindings, splitByFindings } from "./check.js";
import { CHECK_SAMPLE, QA_SCIENCE, READINESS, SCIENCE, TOILET_AGES, TOILET_SCENES, TOILET_STAGES } from "./data.js";
import * as types from "./types.js";
import {
  LOG_KINDS,
  addLog,
  concernsFor,
  lastWeek,
  phraseListText,
  phrasesFor,
  readinessResult,
  searchConcerns,
  toiletAnswer,
  toiletAnswerText,
  undoLog,
} from "./logic.js";
import { $, chips, copy, createStore, el, setupChecker, setupTabs, setupTypeTab, toast } from "./ui.js";

const store = createStore("toitore");

// ---------------------------------------------------------------- お悩みQ&A
const q = {
  age: store.get("age", "2-3"),
  stage: store.get("stage", "pee"),
  concern: store.get("concern", "refuse"),
  query: "",
  ready: store.get("ready", []),
};
if (!TOILET_AGES.some((a) => a.id === q.age)) q.age = "2-3";
if (!TOILET_STAGES.some((s) => s.id === q.stage)) q.stage = "pee";

function renderQa() {
  const searching = q.query.trim() !== "";
  const list = searching ? searchConcerns(q.query) : concernsFor(q.stage);
  if (!list.some((c) => c.id === q.concern && c.stage === (searching ? c.stage : q.stage))) q.concern = list[0]?.id;
  const current = list.find((c) => c.id === q.concern) ?? list[0];
  if (current && !searching) q.stage = current.stage;
  store.set("age", q.age);
  store.set("stage", q.stage);
  store.set("concern", q.concern);

  chips($("t-age"), TOILET_AGES, q.age, (id) => {
    q.age = id;
    renderQa();
  });
  $("stage-block").hidden = searching;
  chips($("t-stage"), TOILET_STAGES, q.stage, (id) => {
    q.stage = id;
    renderQa();
  }, "step");
  $("concern-label").textContent = searching ? `悩み（${list.length}件見つかりました）` : "悩み";
  $("t-concern").replaceChildren(
    ...(list.length
      ? list.map((c) =>
          el("button", {
            type: "button", class: "concern", "aria-pressed": current?.id === c.id && current?.stage === c.stage,
            onclick: () => {
              q.concern = c.id;
              q.stage = c.stage;
              renderQa();
            },
          }, c.concern),
        )
      : [el("p", { class: "empty" }, "見つかりませんでした。別の言葉で探すか、段階から選んでみてください。")]),
  );

  const answer = $("t-answer");
  if (!current) {
    answer.hidden = true;
  } else {
    answer.hidden = false;
    const a = toiletAnswer(q.age, current.stage, current.id);
    const sci = SCIENCE.find((x) => x.id === QA_SCIENCE[current.id]);
    answer.replaceChildren(
      el("h3", {}, a.concern),
      el("p", { class: "empathy" }, a.empathy),
      el("div", {}, el("p", { class: "label" }, "小さなコツ"), el("ul", {}, ...a.tips.map((t) => el("li", {}, t)))),
      el("p", { class: "note" }, el("b", {}, "焦らなくて大丈夫"), a.relax),
      el("p", { class: "note" }, el("b", {}, `${a.ageLabel}のころ`), a.ageNote),
      ...(a.consult ? [el("p", { class: "consult" }, el("b", {}, "相談の目安"), a.consult)] : []),
      ...(sci
        ? [el("details", { class: "science" },
            el("summary", {}, `なぜ？ ${sci.title}`),
            el("div", {}, el("p", {}, sci.body), el("p", { class: "source" }, `参考：${sci.source}`)),
          )]
        : []),
      el("div", { class: "toolbar" },
        el("button", { type: "button", class: "btn primary", onclick: () => copy(toiletAnswerText(a)) }, "この答えをコピー"),
      ),
    );
  }

  // 「始める前」のときだけ、はじめどきチェックを出す
  const ready = $("readiness");
  ready.hidden = searching || q.stage !== "before";
  if (!ready.hidden) renderReadiness();
}

function renderReadiness() {
  const r = readinessResult(q.ready);
  $("readiness").replaceChildren(
    el("h3", {}, "はじめどきチェック"),
    el("p", { class: "hint" }, "当てはまるものに印を付けてください。全部そろわなくても始めて大丈夫です。"),
    el("div", { class: "checklist" },
      ...READINESS.map((item) =>
        el("label", { class: "checkitem" },
          el("input", {
            type: "checkbox", id: `ready-${item.id}`, checked: q.ready.includes(item.id),
            onchange: (e) => {
              q.ready = e.target.checked ? [...q.ready, item.id] : q.ready.filter((x) => x !== item.id);
              store.set("ready", q.ready);
              renderReadiness();
            },
          }),
          el("span", {}, item.label, el("small", {}, item.hint)),
        ),
      ),
    ),
    el("div", { class: "meter", role: "img", "aria-label": `${r.total}個中${r.count}個` },
      el("span", { style: `width:${Math.round((r.count / r.total) * 100)}%` }),
    ),
    el("p", { class: "note" }, el("b", {}, `${r.total}個中 ${r.count}個`), r.message),
  );
}

$("qa-search").addEventListener("input", (e) => {
  q.query = e.target.value;
  renderQa();
});

// ---------------------------------------------------------------- 声かけ
let pScene = store.get("p-scene", "invite");
if (!TOILET_SCENES.some((s) => s.id === pScene)) pScene = "invite";

function renderPhrases() {
  chips($("p-scene"), TOILET_SCENES, pScene, (id) => {
    pScene = id;
    store.set("p-scene", id);
    renderPhrases();
  });
  $("p-list").replaceChildren(
    ...phrasesFor(pScene).map((p) =>
      el("article", { class: "phrase" },
        el("p", { class: "ngline" }, el("span", { class: "tag ng" }, "つい"), el("s", {}, p.ng)),
        el("p", { class: "okline" }, el("span", { class: "tag ok" }, "言い換え"), el("q", {}, p.ok)),
        el("p", { class: "why" }, p.why),
        el("div", { class: "meta" },
          el("span", {}),
          el("div", { class: "actions" },
            el("button", { type: "button", class: "btn", onclick: () => copy(`✕ ${p.ng}\n→ ${p.ok}\n（${p.why}）`) }, "コピー"),
          ),
        ),
      ),
    ),
  );
}
$("p-copy").addEventListener("click", () => {
  const items = phrasesFor(pScene);
  copy(phraseListText(pScene, items), `${items.length}個の言い換えをコピーしました`);
});

// ---------------------------------------------------------------- きろく
let log = store.get("log", {});
const history = [];

function renderLog() {
  const today = new Date();
  const week = lastWeek(log, today);
  const todayRow = week[week.length - 1];
  $("log-buttons").replaceChildren(
    ...LOG_KINDS.map((k) =>
      el("button", {
        type: "button", class: "logbtn", "aria-label": `${k.label}を1回記録（今日${todayRow[k.id]}回）`,
        onclick: () => {
          log = addLog(log, new Date(), k.id);
          history.push(k.id);
          store.set("log", log);
          renderLog();
          toast(`「${k.label}」を記録しました`);
        },
      }, el("small", {}, k.label), el("b", {}, todayRow[k.id]), el("small", {}, "回")),
    ),
  );
  $("log-undo").disabled = history.length === 0;
  const total = todayRow.sit + todayRow.success + todayRow.accident;
  $("log-note").textContent = total ? `今日は${total}回トイレと向き合いました。` : "";

  const fmt = new Intl.DateTimeFormat("ja-JP", { month: "numeric", day: "numeric", weekday: "short" });
  $("log-week").replaceChildren(
    el("thead", {}, el("tr", {}, el("th", { scope: "col" }, "日にち"), ...LOG_KINDS.map((k) => el("th", { scope: "col" }, k.label)))),
    el("tbody", {},
      ...week.map((d) =>
        el("tr", {}, el("td", { class: "day" }, fmt.format(d.date)), ...LOG_KINDS.map((k) => el("td", {}, d[k.id] || "—"))),
      ),
    ),
  );
}
$("log-undo").addEventListener("click", () => {
  const kind = history.pop();
  if (!kind) return;
  log = undoLog(log, new Date(), kind);
  store.set("log", log);
  renderLog();
  toast("ひとつ戻しました");
});

// ---------------------------------------------------------------- しくみ・タイプ
$("science-list").replaceChildren(
  ...SCIENCE.map((x) =>
    el("details", { class: "typecard" },
      el("summary", {}, el("b", {}, x.title)),
      el("div", { class: "typebody" }, el("p", {}, x.body), el("p", { class: "source" }, `参考：${x.source}`)),
    ),
  ),
);

const typeBanner = setupTypeTab({
  container: $("type-root"),
  store,
  field: "toitore",
  types,
  onChange: () => renderBanner(),
});
function renderBanner() {
  const b = typeBanner();
  $("type-banner").replaceChildren(...(b ? [b] : []));
}
renderBanner();

// ---------------------------------------------------------------- 起動
setupTabs(["qa", "koekake", "type", "kiroku", "check"], (tab) => {
  if (tab === "kiroku") renderLog();
});
renderQa();
renderPhrases();
renderLog();
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
