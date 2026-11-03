import { describe, expect, it } from "vitest";
import { AGES, CHECK_KINDS, CHECK_RULES, CHECK_SAMPLE, PHRASES, SCENES, TOILET_QA, TOILET_STAGES } from "../data.js";
import {
  checkText,
  concernsFor,
  filterPhrases,
  groupFindings,
  phraseListText,
  splitByFindings,
  toiletAnswer,
  toiletAnswerText,
} from "../logic.js";

const kinds = (text) => checkText(text).map((f) => f.rule.kind);

describe("声かけ言い換えのデータ", () => {
  it("どの場面にも、どの年齢にも、言い換えが1つ以上ある", () => {
    for (const scene of SCENES) {
      expect(filterPhrases(scene.id, "all").length, scene.label).toBeGreaterThan(0);
    }
    for (const age of AGES) {
      expect(PHRASES.some((p) => p.age === age.id), age.label).toBe(true);
    }
  });

  it("場面と年齢の番号は、決まったものだけを使っている", () => {
    const scenes = new Set(SCENES.map((s) => s.id));
    const ages = new Set(AGES.map((a) => a.id));
    for (const p of PHRASES) {
      expect(scenes.has(p.scene), p.ok).toBe(true);
      expect(ages.has(p.age), p.ok).toBe(true);
      expect(p.ng && p.ok && p.why).toBeTruthy();
    }
  });

  it("言い換え後の言葉は、ことばチェックに引っかからない", () => {
    for (const p of PHRASES) {
      expect(checkText(p.ok), p.ok).toEqual([]);
    }
  });

  it("場面と年齢でしぼり込める", () => {
    const items = filterPhrases("morning", "3-4");
    expect(items.length).toBeGreaterThan(0);
    expect(items.every((p) => p.scene === "morning" && p.age === "3-4")).toBe(true);
  });

  it("リストを投稿用の文章にできる", () => {
    const text = phraseListText("morning", filterPhrases("morning", "3-4").slice(0, 1));
    expect(text).toBe("【朝の支度で使える声かけ】\n\n✕ 早くして！\n→ 時計の長い針が6になったら出発ね");
  });
});

describe("トイトレQ&Aのデータ", () => {
  it("どの段階にも悩みが1つ以上あり、コツは3つずつ", () => {
    for (const stage of TOILET_STAGES) {
      expect(concernsFor(stage.id).length, stage.label).toBeGreaterThan(0);
    }
    for (const q of TOILET_QA) {
      expect(q.tips, q.concern).toHaveLength(3);
      expect(q.empathy && q.relax).toBeTruthy();
    }
  });

  it("トイトレの答えの文章も、ことばチェックに引っかからない", () => {
    for (const q of TOILET_QA) {
      const text = [q.empathy, ...q.tips, q.relax, q.consult ?? ""].join("\n");
      expect(checkText(text), q.concern).toEqual([]);
    }
  });

  it("年齢・段階・悩みから答えを作り、文章にできる", () => {
    const a = toiletAnswer("2-3", "night", "bedwet");
    expect(a.ageLabel).toBe("2〜3歳");
    expect(a.consult).toContain("5歳を過ぎても");
    const text = toiletAnswerText(a);
    expect(text.startsWith("【トイトレ｜夜のオムツ】おねしょが続いて心配")).toBe(true);
    expect(text).toContain("相談の目安");
  });

  it("段階に合わない悩みが来たら、その段階の最初の悩みにする", () => {
    expect(toiletAnswer("2-3", "pee", "bedwet").id).toBe("refuse");
  });
});

describe("ことばチェック", () => {
  it("見本の文章から、急かし・おどし・比べる・恥ずかしさを見つける", () => {
    expect(kinds(CHECK_SAMPLE)).toEqual(["hurry", "threat", "compare", "shame"]);
  });

  it("トイトレでよくある断定を見つける", () => {
    expect(kinds("3歳までに外さないとダメ")).toEqual(["deadline", "deadline"]);
    expect(kinds("もう4歳なのに")).toEqual(["deadline"]);
    expect(kinds("この方法なら必ず外れる！3日で卒業")).toEqual(["promise", "promise"]);
  });

  it("怖がらせ・決めつけ・罰を見つける", () => {
    expect(kinds("寝ないとおばけが来るよ")).toEqual(["scare"]);
    expect(kinds("何回言ったらわかるの。お兄ちゃんなんだから")).toEqual(["label", "label"]);
    expect(kinds("片付けないと捨てるよ。おやつ抜きね")).toEqual(["punish", "punish"]);
    expect(kinds("〇〇ちゃんはもうできてるのに")).toEqual([]);
    expect(kinds("ゆうくんはもうできてたのに")).toEqual(["compare"]);
  });

  it("やさしい言い方には何も付けない", () => {
    expect(checkText("時計の長い針が6になったら出発ね。玄関で待ってるね。")).toEqual([]);
    expect(checkText("")).toEqual([]);
  });

  it("重なった箇所は1つにまとめ、文章を正しく分けられる", () => {
    const text = "早くしてよ、置いていくよ";
    const findings = checkText(text);
    const parts = splitByFindings(text, findings);
    expect(parts.map((p) => p.text).join("")).toBe(text);
    expect(parts.filter((p) => p.finding).map((p) => p.text)).toEqual(["早くして", "置いていく"]);
  });

  it("同じ種類の指摘はまとめる", () => {
    const groups = groupFindings(checkText("早くして！早くして！"));
    expect(groups).toHaveLength(1);
    expect(groups[0].matches).toEqual(["早くして"]);
    expect(groups[0].label).toBe("急かし");
  });

  it("すべての判定に、種類・理由・言い換えのヒントがある", () => {
    for (const rule of CHECK_RULES) {
      expect(CHECK_KINDS[rule.kind], rule.kind).toBeTruthy();
      expect(rule.reason && rule.hint).toBeTruthy();
      expect(rule.pattern.flags).toContain("g");
    }
  });
});
