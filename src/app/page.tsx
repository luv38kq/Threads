import { ButtonLink } from "@/components/ui";

const FEATURES = [
  {
    title: "投稿生成",
    body: "テーマとターゲットを入れるだけで、あなたの文章のクセを反映した本文とコメント欄を複数パターン提案します。",
  },
  {
    title: "投稿分析",
    body: "冒頭の引き・構成・コメント欄やプロフィールへの誘導を評価し、改善点を具体的に示します。",
  },
  {
    title: "リライト",
    body: "元の投稿の良さを残したまま、分析結果を反映した改善案を、指定した文字数とルールで作ります。",
  },
  {
    title: "アカウント管理",
    body: "アカウントごとにターゲット・文章のクセ・禁止表現・ナレッジを保存して、毎回の生成に反映します。",
  },
];

export default function HomePage() {
  return (
    <main className="mx-auto flex w-full max-w-4xl flex-1 flex-col px-4 py-16">
      <section className="space-y-6 text-center">
        <p className="text-sm font-medium text-zinc-500">購入者専用ツール</p>
        <h1 className="text-3xl font-bold tracking-tight sm:text-4xl">
          Threads 投稿スタジオ
        </h1>
        <p className="mx-auto max-w-2xl text-zinc-600 dark:text-zinc-400">
          Threads の投稿づくり・分析・改善を、AIでまとめて支援します。
          AIはご自身のAPIキー（Claude / ChatGPT / Gemini）で動くため、使った分だけのお支払いです。
        </p>
        <div className="flex justify-center gap-3">
          <ButtonLink href="/login">ログイン</ButtonLink>
          <ButtonLink href="/signup" variant="secondary">
            新規登録
          </ButtonLink>
        </div>
      </section>

      <section className="mt-16 grid gap-4 sm:grid-cols-2">
        {FEATURES.map((f) => (
          <div
            key={f.title}
            className="rounded-xl border border-zinc-200 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-900"
          >
            <h2 className="mb-2 font-semibold">{f.title}</h2>
            <p className="text-sm text-zinc-600 dark:text-zinc-400">{f.body}</p>
          </div>
        ))}
      </section>
    </main>
  );
}
