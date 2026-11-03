import { describe, expect, it } from "vitest";
import { checkText } from "../toitore/check.js";
import { CHECK_SAMPLE, READINESS, TOILET_PHRASES, TOILET_QA, TOILET_SCENES, TOILET_STAGES } from "../toitore/data.js";
import {
  addLog,
  concernsFor,
  dateKey,
  lastWeek,
  phraseListText,
  phrasesFor,
  pruneLog,
  readinessResult,
  searchConcerns,
  toiletAnswer,
  toiletAnswerText,
  undoLog,
} from "../toitore/logic.js";

describe("トイトレおたすけ帖：お悩みQ&A", () => {
  it("どの段階にも悩みがあり、コツは3つずつ。悩みは30個以上で重ならない", () => {
    for (const stage of TOILET_STAGES) expect(concernsFor(stage.id).length, stage.label).toBeGreaterThan(0);
    for (const q of TOILET_QA) {
      expect(q.tips, q.concern).toHaveLength(3);
      expect(q.empathy && q.relax).toBeTruthy();
    }
    expect(TOILET_QA.length).toBeGreaterThanOrEqual(30);
    const keys = TOILET_QA.map((q) => `${q.stage}|${q.id}`);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it("答えの文章は、ことばチェックに引っかからない", () => {
    for (const q of TOILET_QA) {
      const text = [q.empathy, ...q.tips, q.relax, q.consult ?? ""].join("\n");
      expect(checkText(text), q.concern).toEqual([]);
    }
  });

  it("年齢・段階・悩みから答えを作り、文章にできる", () => {
    const a = toiletAnswer("2-3", "night", "bedwet");
    expect(a.ageLabel).toBe("2〜3歳");
    expect(a.consult).toContain("5歳を過ぎても");
    expect(toiletAnswerText(a).startsWith("【トイトレ｜夜のオムツ】おねしょが続いて心配")).toBe(true);
    expect(toiletAnswer("2-3", "pee", "bedwet").id).toBe("refuse");
  });

  it("悩みを言葉で探せる", () => {
    const hits = searchConcerns("うんち");
    expect(hits.length).toBeGreaterThanOrEqual(4);
    expect(searchConcerns("夜 オムツ").every((q) => q.stage === "night" || /夜/.test(q.concern + q.tips.join("")))).toBe(true);
    expect(searchConcerns("")).toEqual([]);
  });
});

describe("トイトレおたすけ帖：声かけ", () => {
  it("どの場面にも言い換えがあり、言い換え後はことばチェックに引っかからない", () => {
    for (const s of TOILET_SCENES) expect(phrasesFor(s.id).length, s.label).toBeGreaterThanOrEqual(3);
    for (const p of TOILET_PHRASES) expect(checkText(p.ok), p.ok).toEqual([]);
  });

  it("リストを投稿用の文章にできる", () => {
    expect(phraseListText("accident", phrasesFor("accident").slice(0, 1))).toBe(
      "【トイトレ｜失敗したときの声かけ】\n\n✕ また漏らしたの！\n→ 出ちゃったね。お着替えしよう",
    );
  });

  it("見本の文章は、ことばチェックで印が付く", () => {
    expect(new Set(checkText(CHECK_SAMPLE).map((f) => f.rule.kind))).toEqual(new Set(["deadline", "shame", "promise"]));
  });
});

describe("トイトレおたすけ帖：はじめどきチェック", () => {
  it("印の数に応じて、締め切りではなく目安を返す", () => {
    expect(readinessResult([]).level).toBe("none");
    expect(readinessResult(["walk"]).level).toBe("early");
    expect(readinessResult(READINESS.slice(0, 4).map((r) => r.id)).level).toBe("soon");
    expect(readinessResult(READINESS.map((r) => r.id))).toMatchObject({ level: "ready", count: READINESS.length });
    expect(readinessResult(["unknown"]).count).toBe(0);
    for (const r of [[], ["walk"], ["walk", "sit", "pants", "words"], READINESS.map((x) => x.id)]) {
      expect(checkText(readinessResult(r).message)).toEqual([]);
    }
  });
});

describe("トイトレおたすけ帖：きろく", () => {
  const day = new Date(2026, 10, 3, 9);

  it("日にちごとに回数を足し、元の記録は書き換えない", () => {
    const empty = {};
    const a = addLog(empty, day, "sit");
    const b = addLog(a, day, "success");
    expect(empty).toEqual({});
    expect(b["2026-11-03"]).toEqual({ sit: 1, success: 1, accident: 0 });
    expect(dateKey(day)).toBe("2026-11-03");
  });

  it("ひとつ戻せる（0より下にはならない）", () => {
    const a = addLog({}, day, "accident");
    expect(undoLog(a, day, "accident")["2026-11-03"].accident).toBe(0);
    expect(undoLog({}, day, "accident")).toEqual({});
  });

  it("直近7日を今日を最後に並べ、60日より前は消す", () => {
    const old = { "2026-08-01": { sit: 5, success: 0, accident: 0 } };
    const log = addLog(old, day, "sit");
    expect(log["2026-08-01"]).toBeUndefined();
    const week = lastWeek(log, day);
    expect(week).toHaveLength(7);
    expect(week[6].key).toBe("2026-11-03");
    expect(week[0].key).toBe("2026-10-28");
    expect(week[6].sit).toBe(1);
    expect(pruneLog({ "2026-10-01": { sit: 1 } }, day)).toEqual({ "2026-10-01": { sit: 1 } });
  });
});
