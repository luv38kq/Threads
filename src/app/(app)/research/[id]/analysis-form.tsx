"use client";

import { useActionState } from "react";
import { Alert, Field, Input, Select } from "@/components/ui";
import { ProviderSelect } from "@/components/provider-select";
import { SubmitButton } from "@/components/submit-button";
import type { AiProvider } from "@/lib/supabase/database.types";
import type { FormState } from "@/lib/validation";
import { runResearchAnalysis } from "../actions";

export function ResearchAnalysisForm({
  researchSetId,
  accounts,
  providers,
  defaultAccountId,
  defaultProvider,
  postCount,
}: {
  researchSetId: string;
  accounts: { id: string; name: string }[];
  providers: { provider: AiProvider; model: string }[];
  defaultAccountId: string;
  defaultProvider?: AiProvider;
  postCount: number;
}) {
  const [state, action] = useActionState<FormState, FormData>(runResearchAnalysis, {});
  const v = state.values ?? {};
  const counts = [10, 20, 30, 50].filter((n) => n <= Math.max(postCount, 10));

  return (
    <form action={action} className="space-y-4">
      {state.message && <Alert tone="error">{state.message}</Alert>}
      <input type="hidden" name="researchSetId" value={researchSetId} />
      <div className="grid gap-4 sm:grid-cols-3">
        <Field label="どのアカウント向けに？" htmlFor="accountId" hint="テンプレートの例文に使います">
          <Select id="accountId" name="accountId" defaultValue={v.accountId ?? defaultAccountId}>
            <option value="">指定しない</option>
            {accounts.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="分析する投稿の数" htmlFor="topCount" hint="反応の良い順に">
          <Select id="topCount" name="topCount" defaultValue={v.topCount ?? String(Math.min(20, Math.max(postCount, 3)))}>
            {counts.map((n) => (
              <option key={n} value={n}>
                上位{n}件
              </option>
            ))}
            {!counts.includes(postCount) && postCount >= 3 && postCount < 50 && (
              <option value={postCount}>すべて（{postCount}件）</option>
            )}
          </Select>
        </Field>
        <ProviderSelect providers={providers} defaultValue={v.provider ?? defaultProvider} error={state.errors?.provider} />
      </div>
      <Field label="特に知りたいこと（任意）" htmlFor="focus" error={state.errors?.focus}>
        <Input id="focus" name="focus" maxLength={500} defaultValue={v.focus} placeholder="例：返信が多い投稿の締め方を詳しく" />
      </Field>
      <SubmitButton pendingText="AIが分析中…（1〜3分ほど）">分析する</SubmitButton>
    </form>
  );
}
