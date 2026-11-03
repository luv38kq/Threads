// トイトレおたすけ帖：画面に依存しない処理（テストできるように分けています）
import { READINESS, TOILET_AGES, TOILET_PHRASES, TOILET_QA, TOILET_SCENES, TOILET_STAGES } from "./data.js";

export function concernsFor(stageId) {
  return TOILET_QA.filter((q) => q.stage === stageId);
}

function normalize(text) {
  return text
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[ァ-ヶ]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0x60));
}

/** 悩みを言葉で探す（スペース区切りはすべて含むもの） */
export function searchConcerns(query) {
  const words = normalize(query).split(/\s+/).filter(Boolean);
  if (words.length === 0) return [];
  return TOILET_QA.filter((q) => {
    const stage = TOILET_STAGES.find((s) => s.id === q.stage)?.label ?? "";
    const hay = normalize([q.concern, q.empathy, ...q.tips, q.relax, stage].join(" "));
    return words.every((w) => hay.includes(w));
  });
}

/** トイトレの答え（年齢のひとことを添える） */
export function toiletAnswer(ageId, stageId, concernId) {
  const qa = TOILET_QA.find((q) => q.stage === stageId && q.id === concernId) ?? concernsFor(stageId)[0];
  if (!qa) return null;
  const age = TOILET_AGES.find((a) => a.id === ageId) ?? TOILET_AGES[0];
  const stage = TOILET_STAGES.find((s) => s.id === qa.stage);
  return { ...qa, ageLabel: age.label, ageNote: age.note, stageLabel: stage?.label ?? "" };
}

export function toiletAnswerText(a) {
  const parts = [
    `【トイトレ｜${a.stageLabel}】${a.concern}`,
    a.empathy,
    `小さなコツ\n${a.tips.map((t) => `・${t}`).join("\n")}`,
    a.relax,
  ];
  if (a.consult) parts.push(`相談の目安\n${a.consult}`);
  return parts.join("\n\n");
}

export function phrasesFor(sceneId) {
  return TOILET_PHRASES.filter((p) => p.scene === sceneId);
}

export function phraseListText(sceneId, items) {
  const label = TOILET_SCENES.find((s) => s.id === sceneId)?.label ?? "";
  return `【トイトレ｜${label}の声かけ】\n\n${items.map((p) => `✕ ${p.ng}\n→ ${p.ok}`).join("\n\n")}`;
}

/**
 * はじめどきチェックの結果。締め切りではなく「目安」として、やわらかく返す。
 * checked はチェックした項目の id の配列
 */
export function readinessResult(checked) {
  const count = READINESS.filter((r) => checked.includes(r.id)).length;
  const total = READINESS.length;
  if (count === 0) {
    return { count, total, level: "none", message: "当てはまるものに印を付けてみてください。全部そろわなくても大丈夫です。" };
  }
  if (count <= 2) {
    return { count, total, level: "early", message: "今は「トイレに慣れる」時期かもしれません。座ってみる・絵本で知るなど、楽しい準備から始めてみましょう。" };
  }
  if (count <= 5) {
    return { count, total, level: "soon", message: "始めどきのサインが見えてきています。誘うタイミングを決めて、気軽に座るところから始めてみましょう。" };
  }
  return { count, total, level: "ready", message: "始めどきのサインがたくさんそろっています。大人の気持ちに余裕のある日から、ゆっくり始めてみましょう。" };
}

// ---------------------------------------------------------------- きろく

export const LOG_KINDS = [
  { id: "sit", label: "座れた" },
  { id: "success", label: "できた" },
  { id: "accident", label: "出ちゃった" },
];

/** 日付をキーにする（端末の時刻で YYYY-MM-DD） */
export function dateKey(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

/** 記録を1つ足す（元の記録は書き換えない） */
export function addLog(log, date, kind) {
  const key = dateKey(date);
  const day = { sit: 0, success: 0, accident: 0, ...(log[key] ?? {}) };
  day[kind] = (day[kind] ?? 0) + 1;
  return pruneLog({ ...log, [key]: day }, date);
}

/** 最後の1回を取り消す（その日の、指定した種類から1つ減らす） */
export function undoLog(log, date, kind) {
  const key = dateKey(date);
  const day = log[key];
  if (!day || !day[kind]) return log;
  return { ...log, [key]: { ...day, [kind]: day[kind] - 1 } };
}

/** 60日より前の記録は消す（端末の保存量を増やしすぎないため） */
export function pruneLog(log, today) {
  const limit = new Date(today.getFullYear(), today.getMonth(), today.getDate() - 60);
  const out = {};
  for (const [key, value] of Object.entries(log)) {
    const [y, m, d] = key.split("-").map(Number);
    if (new Date(y, m - 1, d) >= limit) out[key] = value;
  }
  return out;
}

/** 直近7日分（今日を最後に） */
export function lastWeek(log, today) {
  const days = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date(today.getFullYear(), today.getMonth(), today.getDate() - i);
    const key = dateKey(d);
    days.push({ key, date: d, sit: 0, success: 0, accident: 0, ...(log[key] ?? {}) });
  }
  return days;
}
