import type { Metadata } from "next";
import { AiSetupGuard } from "@/components/ai-setup-guard";
import { pickProvider } from "@/components/provider-select";
import { Button, Card, PageHeader } from "@/components/ui";
import { requireActiveUser } from "@/lib/auth";
import { listRegisteredProviders } from "@/lib/ai/run";
import { BUZZ_MAX_POSTS_PER_USER } from "@/lib/buzz/import";
import { createClient } from "@/lib/supabase/server";
import { RecentHistory } from "../history/recent";
import { deleteBuzzGenre } from "./actions";
import { BuzzImportForm } from "./import-form";
import { BuzzRunForm } from "./run-form";

export const metadata: Metadata = { title: "バズ量産" };

export default async function BuzzPage({ searchParams }: PageProps<"/buzz">) {
  const profile = await requireActiveUser();
  const params = await searchParams;
  const supabase = await createClient();
  const [{ data: summary }, { data: accounts }, providers] = await Promise.all([
    supabase.from("buzz_genre_summary").select("genre, post_count, max_likes"),
    supabase.from("managed_accounts").select("id, name").order("created_at", { ascending: true }),
    listRegisteredProviders(),
  ]);

  const genres = [...(summary ?? [])].sort((a, b) => b.post_count - a.post_count);
  const total = genres.reduce((sum, g) => sum + g.post_count, 0);
  const hasAccount = (accounts?.length ?? 0) > 0;
  const hasProvider = providers.length > 0;
  const defaultGenre = typeof params.genre === "string" ? params.genre : genres[0]?.genre;

  return (
    <div className="space-y-8">
      <PageHeader
        title="バズ量産"
        description="集めたバズ投稿から、ジャンルごとに伸びた型（冒頭・構成・反応を生む仕掛け）を抜き出し、自分のアカウント用の投稿案をまとめて作ります。"
      />

      <section className="space-y-3">
        <h2 className="text-lg font-semibold">1. バズ投稿のストック</h2>
        {genres.length === 0 ? (
          <Card className="text-sm text-zinc-600 dark:text-zinc-400">
            まだバズ投稿がありません。下の「取り込む」から追加してください。
          </Card>
        ) : (
          <Card className="space-y-3 p-0">
            <p className="px-4 pt-4 text-sm text-zinc-600 dark:text-zinc-400">
              合計 {total.toLocaleString()}件（上限 {BUZZ_MAX_POSTS_PER_USER.toLocaleString()}件）
            </p>
            <ul className="divide-y divide-zinc-200 dark:divide-zinc-800">
              {genres.map((g) => (
                <li key={g.genre} className="flex flex-wrap items-center gap-x-4 gap-y-1 px-4 py-2 text-sm">
                  <span className="font-medium">{g.genre || "未分類"}</span>
                  <span className="text-zinc-500">{g.post_count.toLocaleString()}件</span>
                  <span className="text-xs text-zinc-400">最高 いいね{g.max_likes.toLocaleString()}</span>
                  <form action={deleteBuzzGenre} className="ml-auto">
                    <input type="hidden" name="genre" value={g.genre} />
                    <Button type="submit" variant="ghost" className="px-2 py-1 text-xs text-zinc-500">
                      削除
                    </Button>
                  </form>
                </li>
              ))}
            </ul>
          </Card>
        )}
        <Card>
          <BuzzImportForm />
        </Card>
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold">2. 型を抜き出して投稿案を作る</h2>
        {genres.length === 0 ? (
          <Card className="text-sm text-zinc-600 dark:text-zinc-400">先にバズ投稿を取り込んでください。</Card>
        ) : hasAccount && hasProvider ? (
          <Card>
            <BuzzRunForm
              accounts={accounts ?? []}
              providers={providers}
              genres={genres.map((g) => ({ genre: g.genre, count: g.post_count }))}
              defaultGenre={defaultGenre}
              defaultProvider={pickProvider(providers, profile.preferred_ai_provider)}
            />
          </Card>
        ) : (
          <AiSetupGuard hasAccount={hasAccount} hasProvider={hasProvider} />
        )}
      </section>

      <RecentHistory kind="buzz" />
    </div>
  );
}
