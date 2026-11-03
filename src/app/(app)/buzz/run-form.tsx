"use client";

import { useActionState } from "react";
import { Alert, Field, Input, Select, Textarea } from "@/components/ui";
import { ProviderSelect } from "@/components/provider-select";
import { SubmitButton } from "@/components/submit-button";
import { CTA_MODES } from "@/lib/ai/prompts/buzz";
import type { AiProvider } from "@/lib/supabase/database.types";
import type { FormState } from "@/lib/validation";
import { runBuzz } from "./actions";

export function BuzzRunForm({
  accounts,
  providers,
  genres,
  defaultGenre,
  defaultProvider,
}: {
  accounts: { id: string; name: string }[];
  providers: { provider: AiProvider; model: string }[];
  genres: { genre: string; count: number }[];
  defaultGenre?: string;
  defaultProvider?: AiProvider;
}) {
  const [state, action, pending] = useActionState<FormState, FormData>(runBuzz, {});
  const v = state.values ?? {};
  const e = state.errors ?? {};
  const total = genres.reduce((sum, g) => sum + g.count, 0);

  return (
    <form action={action} className="space-y-5">
      {state.message && <Alert tone="error">{state.message}</Alert>}

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="参考にするジャンル" htmlFor="genre" error={e.genre}>
          <Select id="genre" name="genre" defaultValue={v.genre ?? defaultGenre ?? ""}>
            {genres.map((g) => (
              <option key={g.genre} value={g.genre}>
                {g.genre || "未分類"}（{g.count.toLocaleString()}件）
              </option>
            ))}
            <option value="">すべてのジャンル（{total.toLocaleString()}件）</option>
          </Select>
        </Field>
        <Field label="投稿案を作るアカウント" htmlFor="accountId" error={e.accountId}>
          <Select id="accountId" name="accountId" defaultValue={v.accountId ?? accounts[0]?.id}>
            {accounts.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name}
              </option>
            ))}
          </Select>
        </Field>
      </div>

      <Field label="誘導の扱い" htmlFor="ctaMode" error={e.ctaMode}>
        <Select id="ctaMode" name="ctaMode" defaultValue={v.ctaMode ?? "none"}>
          {CTA_MODES.map((m) => (
            <option key={m.id} value={m.id}>
              {m.label}
            </option>
          ))}
        </Select>
      </Field>

      <Field
        label="書きたいテーマ・方向性（任意）"
        htmlFor="theme"
        hint="空欄なら、アカウントのジャンルとターゲットに合うテーマをAIが選びます"
        error={e.theme}
      >
        <Textarea
          id="theme"
          name="theme"
          maxLength={500}
          rows={2}
          defaultValue={v.theme}
          placeholder="例：イヤイヤ期の朝の支度で使える声かけ／トイトレを嫌がる子への声かけ"
        />
      </Field>

      <div className="grid gap-4 sm:grid-cols-4">
        <Field label="参考にする投稿数" htmlFor="sourceCount" hint="反応の良い順に使います" error={e.sourceCount}>
          <Select id="sourceCount" name="sourceCount" defaultValue={v.sourceCount ?? "30"}>
            {[10, 20, 30, 40].map((n) => (
              <option key={n} value={n}>
                上位{n}件
              </option>
            ))}
          </Select>
        </Field>
        <Field label="作る投稿案の数" htmlFor="draftCount" error={e.draftCount}>
          <Select id="draftCount" name="draftCount" defaultValue={v.draftCount ?? "5"}>
            {[3, 5, 7, 10].map((n) => (
              <option key={n} value={n}>
                {n}本
              </option>
            ))}
          </Select>
        </Field>
        <Field label="コメント欄の数" htmlFor="commentCount" error={e.commentCount}>
          <Select id="commentCount" name="commentCount" defaultValue={v.commentCount ?? "0"}>
            {[0, 1, 2, 3].map((n) => (
              <option key={n} value={n}>
                {n === 0 ? "なし（本文のみ）" : `${n}つ`}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="本文の文字数（上限）" htmlFor="maxChars" error={e.maxChars}>
          <Input id="maxChars" name="maxChars" type="number" min={50} max={500} step={10} defaultValue={v.maxChars ?? "300"} />
        </Field>
      </div>

      <ProviderSelect providers={providers} defaultValue={v.provider ?? defaultProvider} error={e.provider} />

      <div className="flex flex-wrap items-center gap-3">
        <SubmitButton pendingText="AIが型を抜き出して作成中…（1〜3分ほど）">型を抜き出して投稿案を作る</SubmitButton>
        {pending && (
          <span className="text-xs text-zinc-500">画面を閉じずにお待ちください。AIの利用料金はご自身のAPIキーに請求されます。</span>
        )}
      </div>
    </form>
  );
}
