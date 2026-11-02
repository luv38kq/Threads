import type { Metadata } from "next";
import Link from "next/link";
import { Badge, Card, PageHeader, formatDate } from "@/components/ui";
import { requireActiveUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { RecentHistory } from "../history/recent";

export const metadata: Metadata = { title: "ホーム" };

const FEATURES = [
  { title: "投稿生成", body: "テーマとターゲットから、本文とコメント欄を複数パターン作成", href: "/generate" },
  { title: "投稿分析", body: "冒頭の引き・構成・誘導を評価して改善点を提示", href: "/analyze" },
  { title: "リライト", body: "分析結果を反映し、文字数とルールを守った改善案を作成", href: "/rewrite" },
  { title: "競合リサーチ", body: "拡張機能で集めた競合の投稿から、伸びる型とテンプレートを作成", href: "/research" },
];

export default async function DashboardPage() {
  const profile = await requireActiveUser();
  const supabase = await createClient();

  const [{ count: accountCount }, { data: credentials }] = await Promise.all([
    supabase.from("managed_accounts").select("id", { count: "exact", head: true }),
    supabase.from("ai_credentials").select("provider"),
  ]);

  const hasAccount = (accountCount ?? 0) > 0;
  const hasAiKey = (credentials?.length ?? 0) > 0;

  const steps = [
    {
      done: hasAiKey,
      title: "AIのAPIキーを登録する",
      body: "Claude・ChatGPT・Gemini のどれか1つでOKです。",
      href: "/settings/ai",
    },
    {
      done: hasAccount,
      title: "運用アカウントを作る",
      body: "ターゲット・文章のクセ・禁止表現を登録します。",
      href: "/accounts/new",
    },
  ];

  return (
    <div className="space-y-8">
      <PageHeader
        title={`こんにちは、${profile.display_name || "ゲスト"}さん`}
        description={
          profile.access_expires_at
            ? `利用期限：${formatDate(profile.access_expires_at)}`
            : undefined
        }
      />

      <section className="space-y-3">
        <h2 className="font-semibold">はじめにやること</h2>
        <div className="grid gap-3 sm:grid-cols-2">
          {steps.map((step, i) => (
            <Link key={step.href} href={step.href}>
              <Card className="h-full transition-colors hover:border-zinc-400 dark:hover:border-zinc-600">
                <div className="mb-2 flex items-center gap-2">
                  <span className="text-sm text-zinc-500">ステップ {i + 1}</span>
                  {step.done ? (
                    <Badge tone="success">完了</Badge>
                  ) : (
                    <Badge tone="warning">未設定</Badge>
                  )}
                </div>
                <h3 className="font-semibold">{step.title}</h3>
                <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">{step.body}</p>
              </Card>
            </Link>
          ))}
        </div>
      </section>

      <section className="space-y-3">
        <h2 className="font-semibold">AI機能</h2>
        <div className="grid gap-3 sm:grid-cols-2">
          {FEATURES.map((f) => (
            <Link key={f.href} href={f.href}>
              <Card className="h-full transition-colors hover:border-zinc-400 dark:hover:border-zinc-600">
                <h3 className="font-semibold">{f.title}</h3>
                <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">{f.body}</p>
              </Card>
            </Link>
          ))}
        </div>
      </section>

      <RecentHistory />
    </div>
  );
}
