"use client";

import { useActionState } from "react";
import { PostInputFields } from "@/components/post-input-fields";
import { ProviderSelect } from "@/components/provider-select";
import { SubmitButton } from "@/components/submit-button";
import { Alert, Field, Input, Select } from "@/components/ui";
import type { PostPrefill } from "@/lib/ai/prefill";
import { splitComments } from "@/lib/ai/prompts/analyze";
import { STRENGTHS } from "@/lib/ai/prompts/rewrite";
import type { AiProvider } from "@/lib/supabase/database.types";
import type { FormState } from "@/lib/validation";
import { runRewrite } from "./actions";

export function RewriteForm({
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
  const [state, action] = useActionState<FormState, FormData>(runRewrite, {});
  const v = state.values ?? {};
  const e = state.errors ?? {};
  const prefillCommentCount = prefill ? splitComments(prefill.comments).length : 1;

  return (
    <form action={action} className="space-y-5">
      {state.message && <Alert tone="error">{state.message}</Alert>}
      {prefill?.analysisId && (
        <Alert tone="info">分析結果（直すべきこと・残すべき良さ）を反映してリライトします。</Alert>
      )}
      <input type="hidden" name="analysisId" value={v.analysisId ?? prefill?.analysisId ?? ""} />

      <PostInputFields
        accounts={accounts}
        values={{
          accountId: v.accountId ?? prefill?.accountId ?? accounts[0]?.id,
          body: v.body ?? prefill?.body,
          comments: v.comments ?? prefill?.comments,
        }}
        errors={e}
        accountHint="選ぶと、そのアカウントの文章のクセ・禁止表現・誘導先を守ってリライトします"
      />

      <div className="grid gap-4 sm:grid-cols-4">
        <Field label="直す強さ" htmlFor="strength" error={e.strength}>
          <Select id="strength" name="strength" defaultValue={v.strength ?? "medium"}>
            {Object.entries(STRENGTHS).map(([key, s]) => (
              <option key={key} value={key}>
                {s.label}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="案の数" htmlFor="patternCount" error={e.patternCount}>
          <Select id="patternCount" name="patternCount" defaultValue={v.patternCount ?? "2"}>
            {[1, 2, 3].map((n) => (
              <option key={n} value={n}>
                {n}案
              </option>
            ))}
          </Select>
        </Field>
        <Field label="コメント欄の数" htmlFor="commentCount" error={e.commentCount}>
          <Select id="commentCount" name="commentCount" defaultValue={v.commentCount ?? String(Math.min(prefillCommentCount, 5))}>
            {[0, 1, 2, 3, 4, 5].map((n) => (
              <option key={n} value={n}>
                {n === 0 ? "なし（本文のみ）" : `${n}つ`}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="本文の文字数（上限）" htmlFor="maxChars" error={e.maxChars}>
          <Input id="maxChars" name="maxChars" type="number" min={50} max={500} step={10} defaultValue={v.maxChars ?? "400"} />
        </Field>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="守ってほしいこと（任意）" htmlFor="rules" error={e.rules}>
          <Input id="rules" name="rules" maxLength={1000} defaultValue={v.rules} placeholder="例：最後の一文はそのまま残す" />
        </Field>
        <ProviderSelect providers={providers} defaultValue={v.provider ?? defaultProvider} error={e.provider} />
      </div>

      <SubmitButton pendingText="AIがリライト中…（30秒〜2分ほど）">リライトする</SubmitButton>
    </form>
  );
}
