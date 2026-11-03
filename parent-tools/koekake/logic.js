// 声かけことば帖：画面に依存しない処理（テストできるように分けています）
import { AGES, PHRASES, SCENES } from "./data.js";

export function sceneLabel(sceneId) {
  return SCENES.find((s) => s.id === sceneId)?.label ?? "";
}

export function ageLabel(ageId) {
  return AGES.find((a) => a.id === ageId)?.label ?? "";
}

/** 場面と年齢で言い換えをしぼる（age が "all" なら全年齢） */
export function filterPhrases(sceneId, ageId) {
  return PHRASES.filter((p) => p.scene === sceneId && (ageId === "all" || p.age === ageId));
}

/** 言葉で探す（スペース区切りはすべて含むもの。ひらがな・カタカナの違いは区別しない） */
export function searchPhrases(query, ageId = "all") {
  const words = normalize(query).split(/\s+/).filter(Boolean);
  if (words.length === 0) return [];
  return PHRASES.filter((p) => {
    if (ageId !== "all" && p.age !== ageId) return false;
    const hay = normalize(`${p.ng} ${p.ok} ${p.why} ${sceneLabel(p.scene)}`);
    return words.every((w) => hay.includes(w));
  });
}

function normalize(text) {
  return text
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[ァ-ヶ]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0x60));
}

/** 言い換えリストを、そのまま投稿・メモに貼れる文章にする */
export function phraseListText(title, items) {
  const lines = items.map((p) => `✕ ${p.ng}\n→ ${p.ok}`);
  return `【${title}】\n\n${lines.join("\n\n")}`;
}

export function phraseText(p) {
  return `✕ ${p.ng}\n→ ${p.ok}\n（${p.why}）`;
}

/** 今日のひとこと（同じ日なら同じものが出る） */
export function todaysPhrase(date = new Date()) {
  const d = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const days = Math.floor(d.getTime() / 86400000);
  return PHRASES[((days * 7) % PHRASES.length + PHRASES.length) % PHRASES.length];
}

export function phraseKey(p) {
  return `${p.scene}|${p.ng}|${p.ok}`;
}
