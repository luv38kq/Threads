import type { Metadata } from "next";
import { Alert, Badge, Card, PageHeader, formatDate } from "@/components/ui";
import { SubmitButton } from "@/components/submit-button";
import { requireActiveUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { PROVIDER_IDS, PROVIDERS } from "@/lib/ai/providers";
import { deleteApiKey, setPreferredProvider } from "./actions";
import { ApiKeyForm, ModelForm } from "./forms";

export const metadata: Metadata = { title: "AI設定" };

export default async function AiSettingsPage() {
  const profile = await requireActiveUser();
  const supabase = await createClient();
  // 暗号化されたキー本体は画面側に持ってこない
  const { data: credentials, error } = await supabase
    .from("ai_credentials")
    .select("provider, key_hint, model, available_models, verified_at");
  if (error) throw new Error(error.message);

  const byProvider = new Map(credentials.map((c) => [c.provider, c]));

  return (
    <div className="space-y-6">
      <PageHeader
        title="AI設定"
        description="投稿の生成・分析に使うAIのAPIキーを登録します。AIの利用料金は、各社からあなたに直接請求されます。"
      />

      <Alert tone="info">
        APIキーは暗号化して保存し、画面には末尾4文字だけを表示します。運営者も中身を見ることはできません。
        使わなくなったキーは、ここで削除したうえで各社の管理画面でも無効にしてください。
      </Alert>

      {PROVIDER_IDS.map((id) => {
        const info = PROVIDERS[id];
        const cred = byProvider.get(id);
        const isPreferred = profile.preferred_ai_provider === id;
        return (
          <Card key={id} className="space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <h2 className="text-lg font-semibold">{info.label}</h2>
                <span className="text-sm text-zinc-500">（{info.company}）</span>
                {cred ? <Badge tone="success">登録済み</Badge> : <Badge>未登録</Badge>}
                {isPreferred && <Badge tone="info">普段使うAI</Badge>}
              </div>
              {cred && !isPreferred && (
                <form action={setPreferredProvider}>
                  <input type="hidden" name="provider" value={id} />
                  <SubmitButton variant="ghost" className="text-xs">
                    普段使うAIにする
                  </SubmitButton>
                </form>
              )}
            </div>
            <p className="text-sm text-zinc-600 dark:text-zinc-400">{info.note}</p>

            {cred && (
              <div className="space-y-3 rounded-lg bg-zinc-50 p-4 text-sm dark:bg-zinc-800">
                <p>
                  登録中のキー：<span className="font-mono">••••{cred.key_hint}</span>
                  <span className="ml-3 text-xs text-zinc-500">
                    確認日時：{formatDate(cred.verified_at)}
                  </span>
                </p>
                <ModelForm provider={id} model={cred.model} models={cred.available_models} />
                <form action={deleteApiKey}>
                  <input type="hidden" name="provider" value={id} />
                  <SubmitButton
                    variant="ghost"
                    className="px-2 py-1 text-xs text-red-600"
                    pendingText="削除中…"
                    confirmMessage={`${info.label} のAPIキーを削除しますか？`}
                  >
                    このキーを削除
                  </SubmitButton>
                </form>
              </div>
            )}

            <details className="group" open={!cred}>
              <summary className="cursor-pointer text-sm font-medium text-zinc-700 dark:text-zinc-300">
                {cred ? "キーを変更する" : "APIキーを登録する"}
              </summary>
              <div className="mt-4 space-y-4">
                <ol className="list-decimal space-y-1 pl-5 text-sm text-zinc-600 dark:text-zinc-400">
                  <li>
                    <a href={info.keyUrl} target="_blank" rel="noopener noreferrer" className="underline">
                      {info.company} のAPIキー発行ページ
                    </a>
                    を開いてログインします。
                  </li>
                  <li>新しいキーを作成し、表示されたキー（{info.keyPrefixHint}〜）をコピーします。</li>
                  <li>下の欄に貼り付けて「接続を確認して保存」を押します。</li>
                </ol>
                <ApiKeyForm provider={id} />
              </div>
            </details>
          </Card>
        );
      })}
    </div>
  );
}
