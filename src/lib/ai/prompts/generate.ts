import { z } from "zod";
import { THREADS_MAX_CHARS } from "@/lib/posts/rules";
import { accountContextText, type AccountContext, type KnowledgeContext } from "./context";

// ---------------------------------------------------------------------
// 投稿生成：入力・AIの答えの形・指示文
// ---------------------------------------------------------------------

export const POST_TYPES = [
  { id: "auto", label: "おまかせ", hint: "テーマに合う型をAIが選びます" },
  { id: "empathy", label: "共感・あるある", hint: "ターゲットの気持ちを代弁して共感を集める" },
  { id: "howto", label: "ノウハウ・リスト", hint: "すぐ使えるコツを箇条書きで伝える" },
  { id: "story", label: "体験談・ストーリー", hint: "失敗や変化の物語で引き込む" },
  { id: "question", label: "問いかけ・議論", hint: "返信したくなる問いで会話を生む" },
  { id: "before_after", label: "ビフォーアフター", hint: "変化の前後を対比して見せる" },
  { id: "opinion", label: "主張・逆張り", hint: "常識と違う意見で目を止める" },
  { id: "promotion", label: "商品・サービス紹介", hint: "売り込み感を抑えて魅力を伝える" },
] as const;

export type PostTypeId = (typeof POST_TYPES)[number]["id"];

export const generateInputSchema = z.object({
  accountId: z.uuid({ error: "アカウントを選んでください" }),
  theme: z
    .string()
    .trim()
    .min(1, { error: "テーマを入力してください" })
    .max(1000, { error: "テーマは1000文字以内にしてください" }),
  targetOverride: z.string().trim().max(1000, { error: "ターゲットは1000文字以内にしてください" }),
  postType: z.enum(POST_TYPES.map((t) => t.id) as [PostTypeId, ...PostTypeId[]]),
  patternCount: z.coerce.number().int().min(1).max(5),
  commentCount: z.coerce.number().int().min(0).max(5),
  maxChars: z.coerce
    .number()
    .int()
    .min(50, { error: "本文の文字数は50文字以上にしてください" })
    .max(THREADS_MAX_CHARS, { error: `本文の文字数は${THREADS_MAX_CHARS}文字以内にしてください` }),
  extra: z.string().trim().max(1000, { error: "追加の指示は1000文字以内にしてください" }),
  provider: z.enum(["anthropic", "openai", "gemini"], { error: "AIを選んでください" }),
});

export type GenerateInput = z.infer<typeof generateInputSchema>;

export const generatedPatternSchema = z.object({
  angle: z.string().describe("このパターンの切り口を一言で（例：失敗談から入る共感型）"),
  hook_reason: z.string().describe("冒頭の1〜2行で読者の手が止まる理由の説明（1〜2文）"),
  body: z.string().describe("Threadsに投稿する本文。改行を含めてそのまま投稿できる形"),
  comments: z
    .array(z.string())
    .describe("本文に続けて自分で返信として投稿するコメント欄の文章。順番どおりに並べる"),
});

export const generateOutputSchema = z.object({
  patterns: z.array(generatedPatternSchema).describe("切り口の違う投稿案"),
});

export type GeneratedPattern = z.infer<typeof generatedPatternSchema>;
export type GenerateOutput = z.infer<typeof generateOutputSchema>;

export const GENERATE_SYSTEM_PROMPT = `あなたは、日本語のThreads（Meta社のSNS）運用を専門とするプロの編集者です。
利用者のアカウント設定に沿って、そのまま投稿できる質の高い投稿案を作ります。

# 良いThreads投稿の原則
- 冒頭の1〜2行がすべてです。タイムラインで指が止まるように、ターゲットの悩みや本音の言語化、意外な事実、具体的な数字、強い言い切り、問いかけなどを使います。冒頭は短く。
- 本文は、冒頭で生まれた「続きが気になる」に応える構成にします。1文を短くし、スマホで読みやすいように適度に改行します。
- 最後まで読んだ読者が、次の行動（コメント欄を読む・返信する・プロフィールを見る）を自然にとれるように締めます。
- 売り込み感や誇張は信頼を失います。誠実で、読者の役に立つことを優先します。

# コメント欄について
- 「コメント欄」とは、本文の投稿に投稿者自身が返信としてつなげる続きの投稿です。
- コメント欄の数が1以上のときは、本文の最後でコメント欄へ自然に誘導し（例：「続きはコメント欄に書きます👇」など、アカウントの口調に合わせる）、コメント欄に本文の続き・具体例・補足・まとめを書きます。
- 最後のコメントでは、アカウントの「誘導したい先」（プロフィール、固定投稿、LINEなど）へ自然に誘導します。
- コメント欄の数が0のときは、本文の最後で誘導したい先へ自然に誘導します。

# 必ず守ること
- アカウントの「文章のクセ」と「過去の投稿の見本」の書き方（一人称、語尾、改行の頻度、絵文字の有無、文の長さ、口調）を忠実に再現します。見本の内容や文章そのものはコピーしません。
- 「禁止表現」は、言い回しを変えた形も含めて絶対に使いません。
- 「その他のルール」に従います。
- ナレッジに書かれていない実績・数字・体験談・お客様の声を作り上げてはいけません。具体的な事実が必要なのに情報がない場合は「〇〇」のような穴埋めにして、利用者が書き換えられるようにします。
- ルールで指定がない限り、ハッシュタグは付けません。
- 文字数の上限は、改行や空白も1文字として数えます。上限を必ず守ってください。
- 複数のパターンを作るときは、切り口（型・冒頭の作り方・展開）をはっきり変えます。`;

export function buildGeneratePrompt(
  input: GenerateInput,
  account: AccountContext,
  knowledge: KnowledgeContext[],
  postTypeLabel: string,
): string {
  const request = [
    `テーマ：${input.theme}`,
    `投稿の型：${postTypeLabel}`,
    `作るパターン数：${input.patternCount}`,
    `コメント欄の数：${input.commentCount}（各パターンの comments 配列の要素数をこの数にする）`,
    `本文の文字数：${input.maxChars}文字以内`,
    `コメント1つあたりの文字数：${THREADS_MAX_CHARS}文字以内`,
    input.extra ? `追加の指示：${input.extra}` : "",
  ]
    .filter(Boolean)
    .join("\n");

  return `以下のアカウント情報をもとに、Threadsの投稿案を作ってください。

${accountContextText(account, knowledge, { targetOverride: input.targetOverride })}

<request>
${request}
</request>`;
}
