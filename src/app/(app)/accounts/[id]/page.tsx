import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Alert, Card, PageHeader } from "@/components/ui";
import { SubmitButton } from "@/components/submit-button";
import { requireActiveUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { AccountForm } from "../account-form";
import { deleteAccount } from "../actions";
import { KnowledgeSection } from "./knowledge";

export const metadata: Metadata = { title: "アカウント設定" };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async function AccountPage({ params, searchParams }: PageProps<"/accounts/[id]">) {
  await requireActiveUser();
  const { id } = await params;
  const { saved } = await searchParams;
  if (!UUID.test(id)) notFound();

  const supabase = await createClient();
  // 安全ルール（RLS）により、他人のアカウントIDを指定しても何も返りません
  const [{ data: account }, { data: knowledge }] = await Promise.all([
    supabase.from("managed_accounts").select("*").eq("id", id).maybeSingle(),
    supabase
      .from("knowledge_items")
      .select("id, title, content, updated_at")
      .eq("account_id", id)
      .order("created_at", { ascending: true }),
  ]);
  if (!account) notFound();

  return (
    <div className="space-y-8">
      <PageHeader
        title={account.name}
        description={account.threads_username ? `@${account.threads_username}` : undefined}
      />

      {saved && <Alert tone="success">保存しました。</Alert>}

      <Card>
        <AccountForm key={account.updated_at} account={account} />
      </Card>

      <KnowledgeSection accountId={account.id} items={knowledge ?? []} />

      <Card className="border-red-200 dark:border-red-900">
        <h2 className="mb-2 font-semibold text-red-700 dark:text-red-400">アカウントの削除</h2>
        <p className="mb-4 text-sm text-zinc-600 dark:text-zinc-400">
          このアカウントと、登録したナレッジがすべて削除されます。元に戻せません。
        </p>
        <form action={deleteAccount}>
          <input type="hidden" name="id" value={account.id} />
          <SubmitButton
            variant="danger"
            pendingText="削除中…"
            confirmMessage={`「${account.name}」を削除します。よろしいですか？`}
          >
            削除する
          </SubmitButton>
        </form>
      </Card>
    </div>
  );
}
