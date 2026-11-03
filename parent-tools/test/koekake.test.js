import { describe, expect, it } from "vitest";
import { checkText } from "../koekake/check.js";
import { AGES, BASICS, CHECK_SAMPLE, PHRASES, SCENES, TIPS } from "../koekake/data.js";
import { filterPhrases, phraseListText, searchPhrases, todaysPhrase } from "../koekake/logic.js";

describe("声かけことば帖", () => {
  it("どの場面にも、どの年齢にも、言い換えが1つ以上ある", () => {
    for (const scene of SCENES) expect(filterPhrases(scene.id, "all").length, scene.label).toBeGreaterThan(0);
    for (const age of AGES) expect(PHRASES.some((p) => p.age === age.id), age.label).toBe(true);
  });

  it("場面と年齢の番号は決まったものだけ。言い換えは150個前後あり、重ならない", () => {
    const scenes = new Set(SCENES.map((s) => s.id));
    const ages = new Set(AGES.map((a) => a.id));
    for (const p of PHRASES) {
      expect(scenes.has(p.scene), p.ok).toBe(true);
      expect(ages.has(p.age), p.ok).toBe(true);
      expect(p.ng && p.ok && p.why).toBeTruthy();
    }
    expect(PHRASES.length).toBeGreaterThanOrEqual(145);
    const keys = PHRASES.map((p) => `${p.scene}|${p.ok}`);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it("言い換え後の言葉と、コツの例は、ことばチェックに引っかからない", () => {
    for (const p of PHRASES) expect(checkText(p.ok), p.ok).toEqual([]);
    for (const t of TIPS) for (const x of [t.body, ...t.examples]) expect(checkText(x), x).toEqual([]);
  });

  it("見本の文章は、ことばチェックで印が付く", () => {
    expect(checkText(CHECK_SAMPLE).length).toBeGreaterThanOrEqual(3);
  });

  it("言葉で探せる（カタカナとひらがなの違いは区別しない・年齢でもしぼれる）", () => {
    const hits = searchPhrases("早く");
    expect(hits.length).toBeGreaterThan(3);
    expect(hits.every((p) => `${p.ng}${p.ok}${p.why}`.includes("早く"))).toBe(true);
    expect(searchPhrases("タイマー").length).toBe(searchPhrases("たいまー").length);
    expect(searchPhrases("早く", "school").every((p) => p.age === "school")).toBe(true);
    expect(searchPhrases("   ")).toEqual([]);
  });

  it("今日のひとことは、同じ日なら同じ、日が変われば変わる", () => {
    const a = todaysPhrase(new Date(2026, 10, 3, 8));
    expect(todaysPhrase(new Date(2026, 10, 3, 23))).toBe(a);
    expect(todaysPhrase(new Date(2026, 10, 4, 8))).not.toBe(a);
  });

  it("リストを投稿用の文章にできる", () => {
    const text = phraseListText("朝の支度で使える声かけ", filterPhrases("morning", "3-4").slice(0, 1));
    expect(text).toBe("【朝の支度で使える声かけ】\n\n✕ 早くして！\n→ 時計の長い針が6になったら出発ね");
  });

  it("コツは7つで、すべてに「なぜ効く？」の説明がある", () => {
    expect(TIPS).toHaveLength(7);
    for (const t of TIPS) expect(t.science.length, t.title).toBeGreaterThan(40);
  });

  it("心と脳のきほんには出典の手がかりがあり、文章はことばチェックに引っかからない", () => {
    expect(BASICS.length).toBeGreaterThanOrEqual(5);
    for (const b of BASICS) {
      expect(b.source, b.title).toBeTruthy();
      expect(checkText(`${b.title}\n${b.body}`), b.title).toEqual([]);
    }
    for (const t of TIPS) expect(checkText(t.science), t.title).toEqual([]);
  });
});
