import type { Metadata } from "next";
import Link from "next/link";
import { ButtonLink, Card, PageHeader, formatDate } from "@/components/ui";
import { requireActiveUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { RecentHistory } from "../history/recent";

export const metadata: Metadata = { title: "競合リサーチ" };

export default async function ResearchListPage() {
  await requireActiveUser();
  const supabase = await createClient();
  const [{ data: sets }, { data: accounts }] = await Promise.all([
    supabase
      .from("research_sets")
      .select("id, source_username, post_count, account_id, created_at")
      .order("created_at", { ascending: false })
      .limit(100),
    supabase.from("managed_accounts").select("id, name"),
  ]);
  const names = new Map((accounts ?? []).map((a) => [a.id, a.name]));

  return (
    <div className="space-y-6">
      <PageHeader
        title="競合リサーチ"
        description="拡張機能（投稿リサーチ）で集めた競合の投稿です。AIで分析して、自分のアカウントで使える型とテンプレートを作れます。"
        actions={<ButtonLink href="/settings/extension" variant="secondary">拡張機能の準備</ButtonLink>}
      />

      {!sets || sets.length === 0 ? (
        <Card className="space-y-3 text-center text-sm text-zinc-600 dark:text-zinc-400">
          <p>まだリサーチがありません。</p>
          <p>
            拡張機能を入れて、Threadsで競合のプロフィールを開き、拡張機能の「スタジオに送る」を押すとここに表示されます。
          </p>
          <ButtonLink href="/settings/extension">拡張機能を準備する</ButtonLink>
        </Card>
      ) : (
        <Card className="p-0">
          <ul className="divide-y divide-zinc-200 dark:divide-zinc-800">
            {sets.map((s) => (
              <li key={s.id}>
                <Link
                  href={`/research/${s.id}`}
                  className="flex flex-wrap items-center gap-x-4 gap-y-1 px-4 py-3 hover:bg-zinc-50 dark:hover:bg-zinc-800"
                >
                  <span className="font-medium">{s.source_username ? `@${s.source_username}` : "（複数アカウント）"}</span>
                  <span className="text-sm text-zinc-500">{s.post_count}件</span>
                  {s.account_id && names.get(s.account_id) && (
                    <span className="text-xs text-zinc-500">→ {names.get(s.account_id)} 向け</span>
                  )}
                  <span className="ml-auto text-xs text-zinc-400">{formatDate(s.created_at)}</span>
                </Link>
              </li>
            ))}
          </ul>
        </Card>
      )}

      <RecentHistory kind="research" />
    </div>
  );
}
