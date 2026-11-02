import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Button, Card, formatDate } from "@/components/ui";
import { accessState, requireUser } from "@/lib/auth";
import { signOut } from "@/app/(auth)/actions";

export const metadata: Metadata = { title: "ご利用状況" };

const MESSAGES = {
  pending: {
    title: "承認をお待ちください",
    body: "ご登録ありがとうございます。管理者がBrainでのご購入を確認したあと、利用できるようになります。承認されたら、このページを再読み込みしてください。",
  },
  suspended: {
    title: "ご利用を停止しています",
    body: "このアカウントは現在ご利用いただけません。心当たりがない場合は、購入時の連絡先までお問い合わせください。",
  },
  expired: {
    title: "利用期限が切れています",
    body: "ご利用期限を過ぎました。継続をご希望の場合は、購入時の連絡先までお問い合わせください。",
  },
} as const;

export default async function PendingPage() {
  const profile = await requireUser();
  const state = accessState(profile);
  if (state === "active") redirect("/dashboard");

  const message = MESSAGES[state];

  return (
    <main className="flex flex-1 items-center justify-center px-4 py-12">
      <Card className="w-full max-w-md space-y-4">
        <h1 className="text-xl font-bold">{message.title}</h1>
        <p className="text-sm text-zinc-600 dark:text-zinc-400">{message.body}</p>
        <dl className="space-y-1 rounded-lg bg-zinc-50 p-4 text-sm dark:bg-zinc-800">
          <div className="flex gap-2">
            <dt className="text-zinc-500">メール：</dt>
            <dd>{profile.email}</dd>
          </div>
          <div className="flex gap-2">
            <dt className="text-zinc-500">Brainのユーザー名：</dt>
            <dd>{profile.brain_name || "—"}</dd>
          </div>
          {state === "expired" && (
            <div className="flex gap-2">
              <dt className="text-zinc-500">利用期限：</dt>
              <dd>{formatDate(profile.access_expires_at)}</dd>
            </div>
          )}
        </dl>
        <form action={signOut}>
          <Button type="submit" variant="secondary" className="w-full">
            ログアウト
          </Button>
        </form>
      </Card>
    </main>
  );
}
