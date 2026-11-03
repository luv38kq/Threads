// 子育てことば帖：画面に依存しない処理（テストできるように分けています）
import { CHECK_KINDS, CHECK_RULES, PHRASES, SCENES, TOILET_AGES, TOILET_QA, TOILET_STAGES } from "./data.js";

/** 場面と年齢で言い換えをしぼる（age が "all" なら全年齢） */
export function filterPhrases(sceneId, ageId) {
  return PHRASES.filter((p) => p.scene === sceneId && (ageId === "all" || p.age === ageId));
}

export function sceneLabel(sceneId) {
  return SCENES.find((s) => s.id === sceneId)?.label ?? "";
}

/** 言い換えリストを、そのまま投稿・メモに貼れる文章にする */
export function phraseListText(sceneId, items) {
  const lines = items.map((p) => `✕ ${p.ng}\n→ ${p.ok}`);
  return `【${sceneLabel(sceneId)}で使える声かけ】\n\n${lines.join("\n\n")}`;
}

export function phraseText(p) {
  return `✕ ${p.ng}\n→ ${p.ok}\n（${p.why}）`;
}

export function concernsFor(stageId) {
  return TOILET_QA.filter((q) => q.stage === stageId);
}

/** トイトレの答え（年齢のひとことを添える） */
export function toiletAnswer(ageId, stageId, concernId) {
  const qa = TOILET_QA.find((q) => q.stage === stageId && q.id === concernId) ?? concernsFor(stageId)[0];
  if (!qa) return null;
  const age = TOILET_AGES.find((a) => a.id === ageId) ?? TOILET_AGES[0];
  const stage = TOILET_STAGES.find((s) => s.id === stageId);
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

/**
 * ことばチェック。見つかった箇所を、文章の前から順に返す。
 * 重なった箇所は、先に始まる（同じなら長い）ほうを残す。
 */
export function checkText(text) {
  const found = [];
  for (const rule of CHECK_RULES) {
    const re = new RegExp(rule.pattern.source, "g");
    let m;
    while ((m = re.exec(text)) !== null) {
      if (m[0].length === 0) {
        re.lastIndex++;
        continue;
      }
      found.push({ start: m.index, end: m.index + m[0].length, match: m[0], rule });
    }
  }
  found.sort((a, b) => a.start - b.start || b.end - a.end);
  const kept = [];
  let until = -1;
  for (const f of found) {
    if (f.start < until) continue;
    kept.push(f);
    until = f.end;
  }
  return kept;
}

/** 文章を「ふつうの部分」と「印を付ける部分」に分ける（画面の表示用） */
export function splitByFindings(text, findings) {
  const parts = [];
  let pos = 0;
  for (const f of findings) {
    if (f.start > pos) parts.push({ text: text.slice(pos, f.start) });
    parts.push({ text: f.match, finding: f });
    pos = f.end;
  }
  if (pos < text.length) parts.push({ text: text.slice(pos) });
  return parts;
}

/** 種類ごとにまとめる（同じ種類の指摘を1つのカードにする） */
export function groupFindings(findings) {
  const groups = new Map();
  for (const f of findings) {
    const key = f.rule.kind;
    if (!groups.has(key)) groups.set(key, { kind: key, ...CHECK_KINDS[key], rule: f.rule, matches: [] });
    const g = groups.get(key);
    if (!g.matches.includes(f.match)) g.matches.push(f.match);
  }
  return [...groups.values()];
}
