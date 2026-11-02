import type { Metadata } from "next";
import { headers } from "next/headers";
import { CopyButton } from "@/components/copy-button";
import { Alert, Card, PageHeader, formatDate } from "@/components/ui";
import { SubmitButton } from "@/components/submit-button";
import { requireActiveUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { deleteExtensionToken } from "./actions";
import { TokenForm } from "./token-form";

export const metadata: Metadata = { title: "拡張機能" };

export default async function ExtensionSettingsPage() {
  await requireActiveUser();
  const supabase = await createClient();
  const { data: tokens } = await supabase
    .from("extension_tokens")
    .select("id, name, token_hint, last_used_at, created_at")
    .order("created_at", { ascending: true });

  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "";
  const proto = h.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https");
  const studioUrl = host ? `${proto}://${host}` : "";

  return (
    <div className="space-y-6">
      <PageHeader
        title="拡張機能（投稿リサーチ）"
        description="Threadsで競合の投稿を集めて、反応の良い投稿をAIで分析できるChrome拡張機能です。パソコンのGoogle Chromeで使います。"
      />

      <Card className="space-y-4">
        <h2 className="font-semibold">1. 拡張機能を入れる</h2>
        <ol className="list-decimal space-y-2 pl-5 text-sm">
          <li>
            <a href="/downloads/threads-research-extension.zip" className="font-medium underline" download>
              拡張機能（zipファイル）をダウンロード
            </a>
            して、ダブルクリックで解凍（展開）します。できたフォルダは消さずに、分かりやすい場所に置いてください。
          </li>
          <li>
            Chromeのアドレスバーに <code className="rounded bg-zinc-100 px-1 dark:bg-zinc-800">chrome://extensions</code> と入力して開きます。
          </li>
          <li>右上の「デベロッパー モード」をオンにします。</li>
          <li>「パッケージ化されていない拡張機能を読み込む」を押し、解凍したフォルダを選びます。</li>
          <li>Chromeの右上のパズルのマークから「投稿リサーチ」をピン留めしておくと便利です。</li>
        </ol>
        <Alert tone="info">
          新しいバージョンが出たときは、同じ手順でzipをダウンロードしてフォルダを置き換え、
          <code className="mx-1">chrome://extensions</code>で「更新」（ぐるぐる矢印）を押してください。
        </Alert>
      </Card>

      <Card className="space-y-4">
        <h2 className="font-semibold">2. 連携コードを発行して、拡張機能に入れる</h2>
        <p className="text-sm text-zinc-600 dark:text-zinc-400">
          拡張機能のアイコンを押し、「連携設定」に次の2つを入れて「確認して保存」を押します。
        </p>
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <span className="text-zinc-500">スタジオのURL：</span>
          <code className="rounded bg-zinc-100 px-2 py-1 dark:bg-zinc-800">{studioUrl}</code>
          {studioUrl && <CopyButton text={studioUrl} />}
        </div>
        <TokenForm />

        {tokens && tokens.length > 0 && (
          <ul className="divide-y divide-zinc-200 rounded-lg border border-zinc-200 text-sm dark:divide-zinc-800 dark:border-zinc-800">
            {tokens.map((t) => (
              <li key={t.id} className="flex flex-wrap items-center justify-between gap-2 px-4 py-3">
                <div>
                  <p className="font-medium">{t.name || "（名前なし）"}</p>
                  <p className="text-xs text-zinc-500">
                    末尾 {t.token_hint} ／ 発行：{formatDate(t.created_at)} ／ 最終利用：{formatDate(t.last_used_at)}
                  </p>
                </div>
                <form action={deleteExtensionToken}>
                  <input type="hidden" name="id" value={t.id} />
                  <SubmitButton
                    variant="ghost"
                    className="text-xs text-red-600"
                    pendingText="削除中…"
                    confirmMessage="この連携コードを削除しますか？このコードを入れた拡張機能は使えなくなります。"
                  >
                    削除
                  </SubmitButton>
                </form>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Card className="space-y-3">
        <h2 className="font-semibold">3. 使い方</h2>
        <ol className="list-decimal space-y-2 pl-5 text-sm">
          <li>Chromeで競合アカウントのThreadsのプロフィール（threads.com/@ユーザー名）を開きます。</li>
          <li>ページを下にスクロールします。表示された投稿が自動で集まり、右下に件数が出ます。</li>
          <li>拡張機能のアイコンを押し、並べ方や件数を選びます。</li>
          <li>
            「AI用にコピー」でChatGPTやClaudeに貼り付けるか、「スタジオに送る」でこのスタジオに送って、あなたのアカウント向けに分析します。
          </li>
        </ol>
        <Alert tone="warning">
          この拡張機能は、あなたが開いて表示したページの情報だけを読み取ります（自動でほかのページを開いたり、いいね・投稿をしたりはしません）。
          ただし、Threadsの規約では自動的な情報収集が制限されています。短時間に大量のページを読み込むのは避け、集めた投稿の文章をそのまま使わず、伸びている理由（構造）を学ぶために使ってください。
        </Alert>
      </Card>
    </div>
  );
}
