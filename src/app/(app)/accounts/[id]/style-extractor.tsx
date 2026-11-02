"use client";

import { useActionState } from "react";
import { ProviderSelect } from "@/components/provider-select";
import { SubmitButton } from "@/components/submit-button";
import { Alert, ButtonLink, Card } from "@/components/ui";
import type { AiProvider } from "@/lib/supabase/database.types";
import type { FormState } from "@/lib/validation";
import { extractWritingStyle } from "../actions";

/** 過去の投稿の見本から、文章のクセをAIで読み取るボタン */
export function StyleExtractor({
  accountId,
  providers,
  defaultProvider,
  hasSamples,
}: {
  accountId: string;
  providers: { provider: AiProvider; model: string }[];
  defaultProvider?: AiProvider;
  hasSamples: boolean;
}) {
  const [state, action] = useActionState<FormState, FormData>(extractWritingStyle, {});

  return (
    <Card className="space-y-3">
      <h2 className="font-semibold">文章のクセをAIで読み取る</h2>
      <p className="text-sm text-zinc-600 dark:text-zinc-400">
        「過去の投稿の見本」から、一人称・語尾・改行・絵文字・書き出しや締め方のクセを読み取り、「文章のクセ」欄に書き込みます（今の内容は上書きされます）。
      </p>
      {state.message && <Alert tone={state.ok ? "success" : "error"}>{state.message}</Alert>}
      {providers.length === 0 ? (
        <ButtonLink href="/settings/ai" variant="secondary">
          先にAIのAPIキーを登録する
        </ButtonLink>
      ) : (
        <form action={action} className="flex flex-wrap items-end gap-3">
          <input type="hidden" name="accountId" value={accountId} />
          <div className="min-w-56 flex-1">
            <ProviderSelect providers={providers} defaultValue={defaultProvider} />
          </div>
          <SubmitButton
            variant="secondary"
            pendingText="読み取り中…"
            disabled={!hasSamples}
            confirmMessage="「文章のクセ」欄を、AIが読み取った内容で上書きします。よろしいですか？"
          >
            見本から読み取る
          </SubmitButton>
        </form>
      )}
      {!hasSamples && providers.length > 0 && (
        <p className="text-xs text-zinc-500">先に上の「過去の投稿の見本」に投稿を貼り付けて保存してください。</p>
      )}
    </Card>
  );
}
