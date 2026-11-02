"use client";

import { useActionState } from "react";
import { Alert, Field, Input, Select, Textarea } from "@/components/ui";
import { ProviderSelect } from "@/components/provider-select";
import { SubmitButton } from "@/components/submit-button";
import { POST_TYPES } from "@/lib/ai/prompts/generate";
import type { AiProvider } from "@/lib/supabase/database.types";
import type { FormState } from "@/lib/validation";
import { runGenerate } from "./actions";

export function GenerateForm({
  accounts,
  providers,
  defaultAccountId,
  defaultProvider,
  defaultTheme,
}: {
  accounts: { id: string; name: string }[];
  providers: { provider: AiProvider; model: string }[];
  defaultAccountId?: string;
  defaultProvider?: AiProvider;
  defaultTheme?: string;
}) {
  const [state, action, pending] = useActionState<FormState, FormData>(runGenerate, {});
  const v = state.values ?? {};
  const e = state.errors ?? {};

  return (
    <form action={action} className="space-y-5">
      {state.message && <Alert tone="error">{state.message}</Alert>}

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="アカウント" htmlFor="accountId" error={e.accountId}>
          <Select id="accountId" name="accountId" defaultValue={v.accountId ?? defaultAccountId}>
            {accounts.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name}
              </option>
            ))}
          </Select>
        </Field>
        <ProviderSelect providers={providers} defaultValue={v.provider ?? defaultProvider} error={e.provider} />
      </div>

      <Field label="テーマ" htmlFor="theme" hint="何について投稿したいか。具体的なほど良い投稿になります" error={e.theme}>
        <Textarea
          id="theme"
          name="theme"
          required
          maxLength={1000}
          rows={3}
          defaultValue={v.theme ?? defaultTheme}
          placeholder="例：在宅ワークを始めたいけど、何から手をつければいいか分からない人向けに、最初の1週間でやること"
        />
      </Field>

      <Field
        label="今回のターゲット（任意）"
        htmlFor="targetOverride"
        hint="空欄ならアカウント設定のターゲットを使います"
        error={e.targetOverride}
      >
        <Input id="targetOverride" name="targetOverride" maxLength={1000} defaultValue={v.targetOverride} />
      </Field>

      <div className="grid gap-4 sm:grid-cols-4">
        <Field label="投稿の型" htmlFor="postType" error={e.postType}>
          <Select id="postType" name="postType" defaultValue={v.postType ?? "auto"}>
            {POST_TYPES.map((t) => (
              <option key={t.id} value={t.id}>
                {t.label}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="パターン数" htmlFor="patternCount" error={e.patternCount}>
          <Select id="patternCount" name="patternCount" defaultValue={v.patternCount ?? "3"}>
            {[1, 2, 3, 4, 5].map((n) => (
              <option key={n} value={n}>
                {n}パターン
              </option>
            ))}
          </Select>
        </Field>
        <Field label="コメント欄の数" htmlFor="commentCount" error={e.commentCount}>
          <Select id="commentCount" name="commentCount" defaultValue={v.commentCount ?? "1"}>
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

      <Field label="追加の指示（任意）" htmlFor="extra" error={e.extra}>
        <Textarea
          id="extra"
          name="extra"
          maxLength={1000}
          rows={2}
          defaultValue={v.extra}
          placeholder="例：最後は質問で終える／数字を入れる"
        />
      </Field>

      <div className="flex flex-wrap items-center gap-3">
        <SubmitButton pendingText="AIが作成中…（30秒〜2分ほど）">投稿案を作る</SubmitButton>
        {pending && (
          <span className="text-xs text-zinc-500">画面を閉じずにお待ちください。AIの利用料金はご自身のAPIキーに請求されます。</span>
        )}
      </div>
    </form>
  );
}
