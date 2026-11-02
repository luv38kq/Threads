import { z } from "zod";
import { THREADS_MAX_CHARS, countChars } from "@/lib/posts/rules";
import type { AnalyzeOutput } from "./analyze";
import { CRITERIA, splitComments } from "./analyze";
import { accountContextText, type AccountContext, type KnowledgeContext } from "./context";

// ---------------------------------------------------------------------
// リライト：入力・AIの答えの形・指示文
// ---------------------------------------------------------------------

export const rewriteInputSchema = z.object({
  accountId: z.union([z.uuid(), z.literal("")]),
  analysisId: z.union([z.uuid(), z.literal("")]),
  body: z
    .string()
    .trim()
    .min(1, { error: "元の投稿の本文を入力してください" })
    .max(3000, { error: "本文は3000文字以内にしてください" }),
  comments: z.string().max(10000, { error: "コメント欄は合計10000文字以内にしてください" }),
  patternCount: z.coerce.number().int().min(1).max(3),
  commentCount: z.coerce.number().int().min(0).max(5),
  maxChars: z.coerce
    .number()
    .int()
    .min(50, { error: "本文の文字数は50文字以上にしてください" })
    .max(THREADS_MAX_CHARS, { error: `本文の文字数は${THREADS_MAX_CHARS}文字以内にしてください` }),
  strength: z.enum(["light", "medium", "strong"]),
  rules: z.string().trim().max(1000, { error: "守ってほしいことは1000文字以内にしてください" }),
  provider: z.enum(["anthropic", "openai", "gemini"], { error: "AIを選んでください" }),
});

export type RewriteInput = z.infer<typeof rewriteInputSchema>;

export const STRENGTHS = {
  light: { label: "軽め", hint: "言い回しと冒頭を中心に整える。構成と内容はほぼそのまま" },
  medium: { label: "ふつう", hint: "伝えたいことは変えずに、冒頭・構成・誘導を改善する" },
  strong: { label: "大きく", hint: "伝えたいことと良さは残しつつ、構成から作り直す" },
} as const;

export const rewritePatternSchema = z.object({
  angle: z.string().describe("このリライトの方針を一言で"),
  changes: z.array(z.string()).describe("元の投稿から何をどう変えたか（2〜4個）"),
  kept: z.array(z.string()).describe("元の投稿から残した良さ（1〜3個）"),
  body: z.string().describe("リライト後の本文。改行を含めてそのまま投稿できる形"),
  comments: z.array(z.string()).describe("リライト後のコメント欄（本文に続けて自分で返信する投稿）"),
});

export const rewriteOutputSchema = z.object({
  patterns: z.array(rewritePatternSchema).describe("リライト案"),
});

export type RewritePattern = z.infer<typeof rewritePatternSchema>;
export type RewriteOutput = z.infer<typeof rewriteOutputSchema>;

export const REWRITE_SYSTEM_PROMPT = `あなたは、日本語のThreads（Meta社のSNS）運用を専門とするプロの編集者です。
利用者の投稿を、元の良さを残したまま、反応が増えるようにリライトします。

# リライトの原則
- 元の投稿の「伝えたいこと」「書き手らしさ（口調・一人称・語尾・改行・絵文字の使い方）」「良い表現」は残します。別人が書いたような文章にしてはいけません。
- 分析結果が渡された場合は、その改善点（特に優先度の高いもの）を反映し、「残すべき良さ」は必ず残します。
- 冒頭の1〜2行で読者の手が止まるようにし、最後まで読みたくなる流れにします。
- コメント欄の数が1以上なら、本文の最後でコメント欄へ自然に誘導し、コメント欄に続き・具体例・まとめを書き、最後のコメントで誘導したい先へ自然につなげます。コメント欄が0なら本文の最後で誘導します。
- 元の投稿やナレッジにない実績・数字・体験談を作り上げてはいけません。必要なら「〇〇」と穴埋めにします。
- 「禁止表現」は言い回しを変えた形も含めて使いません。「守ってほしいこと」に従います。
- 文字数の上限は、改行や空白も1文字として数えます。必ず守ってください。
- 複数案を作るときは、方針をはっきり変えます。
- changes には「何をどう変えたか」を、kept には「残した良さ」を、利用者が判断しやすいように具体的に書きます。`;

export function buildRewritePrompt(
  input: RewriteInput,
  account: { account: AccountContext; knowledge: KnowledgeContext[] } | null,
  analysis: AnalyzeOutput | null,
): string {
  const comments = splitComments(input.comments);
  const original = `<body chars="${countChars(input.body)}">
${input.body}
</body>
${comments.length ? comments.map((c, i) => `<comment index="${i + 1}">\n${c}\n</comment>`).join("\n") : "（コメント欄なし）"}`;

  const analysisPart = analysis
    ? `# 分析結果
総評：${analysis.summary}
まず直すべきこと：
${analysis.priorities.map((p) => `- ${p}`).join("\n")}
残すべき良さ：
${analysis.keep.map((k) => `- ${k}`).join("\n")}
項目ごとの改善案：
${analysis.criteria
  .map((c) => {
    const label = CRITERIA.find((x) => x.key === c.key)?.label ?? c.key;
    return `- ${label}（${c.score}/5）：${c.issues || "問題なし"}${c.improvements.length ? ` → ${c.improvements.join(" ／ ")}` : ""}`;
  })
  .join("\n")}`
    : "";

  const strength = STRENGTHS[input.strength];
  return `次のThreads投稿をリライトしてください。

<original>
${original}
</original>

${account ? `# アカウント情報\n${accountContextText(account.account, account.knowledge)}` : "# アカウント情報\n（指定なし。元の投稿の口調に合わせてください）"}

${analysisPart}

<request>
作る案の数：${input.patternCount}
直す強さ：${strength.label}（${strength.hint}）
本文の文字数：${input.maxChars}文字以内
コメント欄の数：${input.commentCount}（各案の comments 配列の要素数をこの数にする）
コメント1つあたりの文字数：${THREADS_MAX_CHARS}文字以内
${input.rules ? `守ってほしいこと：${input.rules}` : ""}
</request>`;
}
