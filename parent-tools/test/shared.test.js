import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { CHECK_KINDS, CHECK_RULES, checkText, groupFindings, splitByFindings } from "../koekake/check.js";
import { SENSORY_NOTE, TYPE_DISCLAIMER, TYPE_QUESTIONS, TYPES, diagnose, isComplete } from "../koekake/types.js";

const kinds = (text) => checkText(text).map((f) => f.rule.kind);
const read = (path) => readFileSync(new URL(path, import.meta.url), "utf8");

describe("2つのツールで共通のファイル", () => {
  it("ことばチェック・画面部品・見た目は、両方のフォルダで同じ内容", () => {
    for (const file of ["check.js", "ui.js", "style.css", "types.js"]) {
      expect(read(`../toitore/${file}`), file).toBe(read(`../koekake/${file}`));
    }
  });
});

describe("ことばチェック", () => {
  it("急かし・おどし・比べる・恥ずかしさを見つける", () => {
    expect(kinds("早くしないと置いていくよ！お兄ちゃんはもうできてたのに。赤ちゃんみたい")).toEqual(["hurry", "threat", "compare", "shame"]);
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

  it("気持ちの否定・謝罪の強要・「みんな」との比較を見つける", () => {
    expect(kinds("泣かないの！大丈夫だから")).toEqual(["deny", "deny"]);
    expect(kinds("ごめんなさいは？")).toEqual(["apology"]);
    expect(kinds("みんなもっと頑張ってるよ")).toEqual(["compare"]);
    expect(kinds("泣くなら外でね")).toEqual([]);
    expect(kinds("焦らなくて大丈夫です")).toEqual([]);
  });

  it("やさしい言い方には何も付けない", () => {
    expect(checkText("時計の長い針が6になったら出発ね。玄関で待ってるね。")).toEqual([]);
    expect(checkText("")).toEqual([]);
  });

  it("重なった箇所は1つにまとめ、文章を正しく分けられる", () => {
    const text = "早くしてよ、置いていくよ";
    const parts = splitByFindings(text, checkText(text));
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

describe("タイプチェック", () => {
  const all = (side) => Object.fromEntries(TYPE_QUESTIONS.map((q) => [q.id, side]));
  const by = (approach, intensity) =>
    Object.fromEntries(TYPE_QUESTIONS.map((q) => [q.id, q.axis === "approach" ? approach : intensity]));

  it("2つの軸の組み合わせで、4つのタイプのどれかになる", () => {
    expect(diagnose(by("a", "b")).type.id).toBe("komayaka");
    expect(diagnose(by("a", "a")).type.id).toBe("jikkuri");
    expect(diagnose(by("b", "b")).type.id).toBe("gungun");
    expect(diagnose(by("b", "a")).type.id).toBe("nobinobi");
    expect(diagnose(all("a")).near).toEqual([]);
  });

  it("どちらとも言えない軸があると、近いタイプも返す", () => {
    const answers = { ...by("a", "a"), q1: "b", q2: "b" };
    const r = diagnose(answers);
    expect(r.type.id).toBe("nobinobi");
    expect(r.near.map((t) => t.id)).toEqual(["jikkuri"]);
  });

  it("8問すべて答えるまでは結果を出さない。感覚の質問は任意", () => {
    expect(isComplete({})).toBe(false);
    expect(isComplete({ ...all("a"), q8: undefined })).toBe(false);
    expect(isComplete(all("b"))).toBe(true);
    expect(diagnose({ ...all("b"), sensory: true }).sensory).toBe(true);
    expect(diagnose(all("b")).sensory).toBe(false);
  });

  it("タイプの説明・コツは、ことばチェックに引っかからない", () => {
    const texts = [TYPE_DISCLAIMER, SENSORY_NOTE.body];
    for (const t of TYPES) {
      texts.push(t.catch, ...t.traits, ...t.strengths, ...t.hard, ...t.koekake.tips, ...t.koekake.examples, ...t.toitore.tips);
      expect(t.koekake.tips.length).toBeGreaterThanOrEqual(3);
      expect(t.toitore.tips.length).toBeGreaterThanOrEqual(3);
    }
    for (const x of texts) expect(checkText(x), x).toEqual([]);
  });
});
