import { z } from "zod";
import { countChars, findBannedExpressions } from "@/lib/posts/rules";
import { accountContextText, type AccountContext, type KnowledgeContext } from "./context";

// ---------------------------------------------------------------------
// 投稿分析：入力・AIの答えの形・指示文
// ---------------------------------------------------------------------

/** コメント欄の入力欄では、「---」だけの行で区切る */
export function splitComments(value: string): string[] {
  return value
    .split(/^\s*-{3,}\s*$/m)
    .map((c) => c.trim())
    .filter(Boolean);
}

export const analyzeInputSchema = z.object({
  accountId: z.union([z.uuid(), z.literal("")]),
  body: z
    .string()
    .trim()
    .min(1, { error: "分析する投稿の本文を入力してください" })
    .max(3000, { error: "本文は3000文字以内にしてください" }),
  comments: z.string().max(10000, { error: "コメント欄は合計10000文字以内にしてください" }),
  focus: z.string().trim().max(500, { error: "気になっている点は500文字以内にしてください" }),
  provider: z.enum(["anthropic", "openai", "gemini"], { error: "AIを選んでください" }),
});

export type AnalyzeInput = z.infer<typeof analyzeInputSchema>;

export const CRITERIA = [
  { key: "hook", label: "冒頭の引き", hint: "1〜2行目でスクロールが止まるか" },
  { key: "flow", label: "続きを読みたくなる構成", hint: "最後まで読ませる流れ・読みやすさ" },
  { key: "comment_guidance", label: "コメント欄への誘導", hint: "コメント欄（続き）を読みたくなるか、返信したくなるか" },
  { key: "profile_guidance", label: "プロフィールへの誘導", hint: "投稿者に興味を持ち、プロフィールや誘導先を見たくなるか" },
  { key: "target_fit", label: "ターゲットへの刺さり", hint: "届けたい相手の悩みや言葉になっているか" },
] as const;

export type CriterionKey = (typeof CRITERIA)[number]["key"];

export const analyzeOutputSchema = z.object({
  overall_score: z.number().describe("総合点（0〜100の整数）"),
  summary: z.string().describe("この投稿の総評（2〜4文）"),
  criteria: z
    .array(
      z.object({
        key: z.enum(CRITERIA.map((c) => c.key) as [CriterionKey, ...CriterionKey[]]),
        score: z.number().describe("1〜5の整数（5が最高）"),
        good: z.string().describe("良い点（具体的に）"),
        issues: z.string().describe("足りない点・もったいない点（具体的に。なければ空文字）"),
        improvements: z.array(z.string()).describe("具体的な改善案（書き換え例を含めて1〜3個）"),
      }),
    )
    .describe("評価項目ごとの分析。指定された5項目すべて"),
  hook_alternatives: z.array(z.string()).describe("改善した冒頭（1〜2行目）の書き換え案を3つ"),
  priorities: z.array(z.string()).describe("まず直すべきことを優先順に最大3つ"),
  keep: z.array(z.string()).describe("リライトしても残すべき、この投稿の良さ（最大3つ）"),
});

export type AnalyzeOutput = z.infer<typeof analyzeOutputSchema>;

export const ANALYZE_SYSTEM_PROMPT = `あなたは、日本語のThreads（Meta社のSNS）運用を専門とする編集者・アナリストです。
利用者が書いた投稿を分析し、反応を増やすための具体的な改善点を示します。

# 評価の観点
${CRITERIA.map((c) => `- ${c.label}（${c.key}）：${c.hint}`).join("\n")}

# 分析の姿勢
- 「もっと具体的に」のような抽象的な指摘ではなく、どの文をどう変えるかまで書きます。改善案には書き換え例を入れます。
- 良い点も具体的に挙げます。リライトで失われないように「残すべき良さ」を明確にします。
- アカウント情報（ターゲット・誘導先・文章のクセ）が渡された場合は、それに照らして評価します。改善案もアカウントの口調に合わせます。
- コメント欄が無い投稿の場合、コメント欄への誘導は「返信したくなる仕掛けがあるか」「コメント欄を使うべきだったか」で評価します。
- 点数は甘くしすぎず、改善の余地があれば正直に付けます（5は「直すところがほぼない」）。
- 事実関係（実績や数字）を勝手に作った改善案は出しません。必要なら「〇〇」と穴埋めにします。`;

export function buildAnalyzePrompt(
  input: AnalyzeInput,
  account: { account: AccountContext; knowledge: KnowledgeContext[] } | null,
): string {
  const comments = splitComments(input.comments);
  const banned = account
    ? findBannedExpressions([input.body, ...comments].join("\n"), account.account.banned_expressions)
    : [];
  const commentPart = comments.length
    ? comments.map((c, i) => `<comment index="${i + 1}" chars="${countChars(c)}">\n${c}\n</comment>`).join("\n")
    : "（コメント欄なし）";

  return `次のThreads投稿を分析してください。

<post>
<body chars="${countChars(input.body)}">
${input.body}
</body>
${commentPart}
</post>

${account ? `# アカウント情報\n${accountContextText(account.account, account.knowledge)}` : "# アカウント情報\n（指定なし）"}
${banned.length ? `\n# 注意\nこの投稿には禁止表現「${banned.join("」「")}」が含まれています。改善案で必ず言い換えてください。\n` : ""}${input.focus ? `\n# 利用者が気になっている点\n${input.focus}\n` : ""}`;
}

export function clampScore(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  return Math.min(max, Math.max(min, Math.round(value)));
}
