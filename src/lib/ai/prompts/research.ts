import { z } from "zod";
import type { ResearchPost } from "@/lib/extension/research-schema";
import { accountContextText, type AccountContext, type KnowledgeContext } from "./context";

// ---------------------------------------------------------------------
// 競合リサーチの分析：入力・AIの答えの形・指示文
// ---------------------------------------------------------------------

export const researchInputSchema = z.object({
  researchSetId: z.uuid(),
  accountId: z.union([z.uuid(), z.literal("")]),
  topCount: z.coerce.number().int().min(3).max(50),
  focus: z.string().trim().max(500, { error: "分析の観点は500文字以内にしてください" }),
  provider: z.enum(["anthropic", "openai", "gemini"], { error: "AIを選んでください" }),
});

export type ResearchInput = z.infer<typeof researchInputSchema>;

export const researchOutputSchema = z.object({
  summary: z.string().describe("反応の良い投稿に共通する傾向の要約（3〜5文）"),
  hook_patterns: z
    .array(
      z.object({
        name: z.string().describe("冒頭の型の名前（例：本音の代弁型）"),
        description: z.string().describe("どんな書き出しか"),
        why_it_works: z.string().describe("読者の手が止まる理由"),
        examples: z.array(z.string()).describe("該当する投稿の1行目の引用（短く、最大3つ）"),
      }),
    )
    .describe("1行目（冒頭）の型"),
  structure_patterns: z
    .array(
      z.object({
        name: z.string().describe("構成の型の名前"),
        steps: z.array(z.string()).describe("本文・ツリーの流れを順番に"),
        why_it_works: z.string().describe("最後まで読まれる理由"),
      }),
    )
    .describe("最後まで読ませる構成の型（ツリーを含む）"),
  reply_triggers: z
    .array(
      z.object({
        feature: z.string().describe("返信を生んでいる特徴"),
        description: z.string(),
        example: z.string().describe("該当する一文の引用（短く）"),
      }),
    )
    .describe("返信（コメント）を生んでいる投稿の特徴"),
  word_techniques: z
    .array(z.object({ technique: z.string(), description: z.string(), example: z.string() }))
    .describe("読者の感情を動かしている言葉の置き方"),
  templates: z
    .array(
      z.object({
        name: z.string().describe("テンプレートの名前"),
        template: z.string().describe("【】や〇〇の穴埋め式テンプレート。改行を含めてそのまま使える形"),
        how_to_use: z.string().describe("使いどころと埋め方のコツ"),
        example: z.string().describe("利用者のアカウントのジャンルで埋めた例文"),
      }),
    )
    .describe("利用者のジャンルに置き換えて使える穴埋め式テンプレート"),
  post_ideas: z
    .array(z.object({ theme: z.string().describe("投稿のテーマ"), angle: z.string().describe("使う型と切り口") }))
    .describe("利用者のアカウントで次に投稿すると良さそうなテーマ"),
});

export type ResearchOutput = z.infer<typeof researchOutputSchema>;

export const RESEARCH_SYSTEM_PROMPT = `あなたは、日本語のThreads（Meta社のSNS）運用を専門とするアナリストです。
競合アカウントで反応が良かった投稿を分析し、利用者が自分のアカウントで再現できる「型」を取り出します。

# 分析の姿勢
- 文章をそのまま真似るのではなく、伸びている理由（構造・心理・言葉の置き方）を抜き出します。
- いいね・返信・再投稿の数字と本文を見比べて、反応の差がどこから生まれているかを具体的に説明します。
- 一般論ではなく、渡された投稿から読み取れることだけを根拠にします。例として引用するときは短く（1行程度）にします。
- 返信数が多い投稿は、問いかけ・共感・意見が割れる話題など「返信したくなる仕掛け」に注目します。
- ツリー（続きの投稿）がある場合は、どこで興味を深め、どう締めているかを分析します。

# テンプレートと投稿案
- テンプレートは【】や〇〇の穴埋め式にし、利用者のアカウント（ジャンル・ターゲット・誘導先）に合わせて例文を作ります。
- 競合の固有の体験・実績・商品名を、利用者のものとして使ってはいけません。
- 利用者の「禁止表現」は使いません。
- アカウント情報が渡されていない場合は、どのジャンルでも使える形にします。

# 分量
- 冒頭の型・構成の型：それぞれ3〜5個
- 返信を生む特徴・言葉の置き方：それぞれ3〜5個
- テンプレート：5個
- 投稿案：5個`;

function formatPosts(posts: ResearchPost[]): string {
  return posts
    .map((p, i) => {
      const tree = p.tree.length
        ? `\n[ツリーの続き]\n${p.tree.map((t, j) => `(${j + 2}) ${t.text}`).join("\n")}`
        : "";
      return `<post rank="${i + 1}" likes="${p.likeCount}" replies="${p.replyCount}" reposts="${p.repostCount + p.quoteCount}" date="${p.takenAt.slice(0, 10)}">
${p.text}${tree}
</post>`;
    })
    .join("\n\n");
}

export function buildResearchPrompt(
  input: ResearchInput,
  posts: ResearchPost[],
  sourceUsername: string,
  account: { account: AccountContext; knowledge: KnowledgeContext[] } | null,
): string {
  const accountPart = account
    ? `# 利用者のアカウント情報\n${accountContextText(account.account, account.knowledge)}`
    : "# 利用者のアカウント情報\n（指定なし。どのジャンルでも使える形にしてください）";

  return `# 競合アカウントの投稿${sourceUsername ? `（@${sourceUsername}）` : ""}
反応が良い順に${posts.length}件です。

${formatPosts(posts)}

${accountPart}
${input.focus ? `\n# 特に知りたいこと\n${input.focus}\n` : ""}
上の投稿を分析し、利用者が自分のアカウントで使える型・テンプレート・投稿案を作ってください。`;
}

/** 反応の良い順（返信・再投稿を重めに数える） */
export function rankPosts(posts: ResearchPost[]): ResearchPost[] {
  const score = (p: ResearchPost) => p.likeCount + p.replyCount * 3 + (p.repostCount + p.quoteCount) * 5;
  return [...posts].sort((a, b) => score(b) - score(a));
}
