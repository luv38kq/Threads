"use client";

import { useActionState } from "react";
import { PostInputFields } from "@/components/post-input-fields";
import { ProviderSelect } from "@/components/provider-select";
import { SubmitButton } from "@/components/submit-button";
import { Alert, Field, Input } from "@/components/ui";
import type { PostPrefill } from "@/lib/ai/prefill";
import type { AiProvider } from "@/lib/supabase/database.types";
import type { FormState } from "@/lib/validation";
import { runAnalyze } from "./actions";

export function AnalyzeForm({
  accounts,
  providers,
  defaultProvider,
  prefill,
}: {
  accounts: { id: string; name: string }[];
  providers: { provider: AiProvider; model: string }[];
  defaultProvider?: AiProvider;
  prefill: PostPrefill | null;
}) {
  const [state, action] = useActionState<FormState, FormData>(runAnalyze, {});
  const v = state.values ?? {};
  const e = state.errors ?? {};

  return (
    <form action={action} className="space-y-5">
      {state.message && <Alert tone="error">{state.message}</Alert>}
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-5 sm:col-span-2">
          <PostInputFields
            accounts={accounts}
            values={{
              accountId: v.accountId ?? prefill?.accountId ?? accounts[0]?.id,
              body: v.body ?? prefill?.body,
              comments: v.comments ?? prefill?.comments,
            }}
            errors={e}
            accountHint="選ぶと、そのアカウントのターゲットや誘導先に照らして評価します"
          />
        </div>
        <Field label="気になっている点（任意）" htmlFor="focus" error={e.focus}>
          <Input id="focus" name="focus" maxLength={500} defaultValue={v.focus} placeholder="例：いいねは付くのに返信が来ない" />
        </Field>
        <ProviderSelect providers={providers} defaultValue={v.provider ?? defaultProvider} error={e.provider} />
      </div>
      <SubmitButton pendingText="AIが分析中…（30秒〜1分ほど）">分析する</SubmitButton>
    </form>
  );
}
