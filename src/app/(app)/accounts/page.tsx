import type { Metadata } from "next";
import Link from "next/link";
import { ButtonLink, Card, PageHeader, formatDate } from "@/components/ui";
import { requireActiveUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "アカウント" };

export default async function AccountsPage() {
  await requireActiveUser();
  const supabase = await createClient();
  const { data: accounts, error } = await supabase
    .from("managed_accounts")
    .select("id, name, threads_username, target_audience, updated_at")
    .order("created_at", { ascending: true });
  if (error) throw new Error(error.message);

  return (
    <div>
      <PageHeader
        title="運用アカウント"
        description="Threadsアカウントごとに、ターゲット・文章のクセ・禁止表現・ナレッジを管理します。"
        actions={<ButtonLink href="/accounts/new">＋ 新しいアカウント</ButtonLink>}
      />

      {accounts.length === 0 ? (
        <Card className="text-center">
          <p className="mb-4 text-sm text-zinc-600 dark:text-zinc-400">
            まだアカウントがありません。最初のアカウントを作りましょう。
          </p>
          <ButtonLink href="/accounts/new">アカウントを作る</ButtonLink>
        </Card>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          {accounts.map((a) => (
            <Link key={a.id} href={`/accounts/${a.id}`}>
              <Card className="h-full transition-colors hover:border-zinc-400 dark:hover:border-zinc-600">
                <h2 className="font-semibold">{a.name}</h2>
                {a.threads_username && (
                  <p className="text-sm text-zinc-500">@{a.threads_username}</p>
                )}
                <p className="mt-2 line-clamp-2 text-sm text-zinc-600 dark:text-zinc-400">
                  {a.target_audience || "ターゲット未設定"}
                </p>
                <p className="mt-3 text-xs text-zinc-400">更新：{formatDate(a.updated_at)}</p>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
