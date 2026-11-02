"use client";

import { useActionState } from "react";
import { Alert, Field, Input, Textarea } from "@/components/ui";
import { SubmitButton } from "@/components/submit-button";
import type { ManagedAccountRow } from "@/lib/supabase/database.types";
import type { FormState } from "@/lib/validation";
import { saveAccount } from "./actions";

type Props = { account?: ManagedAccountRow };

export function AccountForm({ account }: Props) {
  const [state, action] = useActionState<FormState, FormData>(saveAccount, {});
  const v = state.values;
  const initial = {
    name: v?.name ?? account?.name ?? "",
    threadsUsername: v?.threadsUsername ?? account?.threads_username ?? "",
    profileSummary: v?.profileSummary ?? account?.profile_summary ?? "",
    targetAudience: v?.targetAudience ?? account?.target_audience ?? "",
    goal: v?.goal ?? account?.goal ?? "",
    writingStyle: v?.writingStyle ?? account?.writing_style ?? "",
    styleSamples: v?.styleSamples ?? account?.style_samples ?? "",
    bannedExpressions: v?.bannedExpressions ?? account?.banned_expressions.join("\n") ?? "",
    customRules: v?.customRules ?? account?.custom_rules ?? "",
  };
  const e = state.errors ?? {};

  return (
    <form action={action} className="space-y-8">
      {state.message && <Alert tone="error">{state.message}</Alert>}
      {account && <input type="hidden" name="id" value={account.id} />}

      <section className="space-y-4">
        <h2 className="font-semibold">基本情報</h2>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="アカウント名（管理用）" htmlFor="name" error={e.name}>
            <Input id="name" name="name" required maxLength={50} defaultValue={initial.name} placeholder="例：副業ノウハウ垢" />
          </Field>
          <Field label="Threadsのユーザー名" htmlFor="threadsUsername" error={e.threadsUsername}>
            <Input id="threadsUsername" name="threadsUsername" maxLength={50} defaultValue={initial.threadsUsername} placeholder="例：threads_user" />
          </Field>
        </div>
        <Field
          label="アカウントの概要"
          htmlFor="profileSummary"
          hint="どんな人が、何について発信しているアカウントか"
          error={e.profileSummary}
        >
          <Textarea id="profileSummary" name="profileSummary" maxLength={1000} defaultValue={initial.profileSummary} placeholder="例：元OLが在宅ワークで月10万円を稼ぐまでの実体験を発信" />
        </Field>
      </section>

      <section className="space-y-4">
        <h2 className="font-semibold">ターゲットと目的</h2>
        <Field
          label="ターゲット（届けたい相手）"
          htmlFor="targetAudience"
          hint="年齢・状況・悩み・欲しい未来などを具体的に"
          error={e.targetAudience}
        >
          <Textarea id="targetAudience" name="targetAudience" maxLength={2000} defaultValue={initial.targetAudience} placeholder="例：30代の子育て中の女性。スキマ時間で収入を得たいが、何から始めればいいか分からない" />
        </Field>
        <Field
          label="誘導したい先"
          htmlFor="goal"
          hint="プロフィール、固定投稿、LINE、商品など"
          error={e.goal}
        >
          <Textarea id="goal" name="goal" maxLength={1000} defaultValue={initial.goal} placeholder="例：プロフィールのリンクから無料のLINE登録をしてもらう" />
        </Field>
      </section>

      <section className="space-y-4">
        <h2 className="font-semibold">文章のクセ</h2>
        <Field
          label="文章のクセ・口調"
          htmlFor="writingStyle"
          hint="語尾、改行の多さ、絵文字の使い方、一人称など"
          error={e.writingStyle}
        >
          <Textarea id="writingStyle" name="writingStyle" maxLength={3000} defaultValue={initial.writingStyle} placeholder="例：一人称は「わたし」。語尾は「〜です」「〜なんです」。1文ごとに改行。絵文字は使わない" />
        </Field>
        <Field
          label="過去の投稿の見本"
          htmlFor="styleSamples"
          hint="反応が良かった投稿を2〜5本ほど貼り付けてください。AIがクセを読み取ります（投稿の間は空行で区切ってください）"
          error={e.styleSamples}
        >
          <Textarea id="styleSamples" name="styleSamples" rows={10} maxLength={10000} defaultValue={initial.styleSamples} />
        </Field>
      </section>

      <section className="space-y-4">
        <h2 className="font-semibold">ルール</h2>
        <Field
          label="禁止表現"
          htmlFor="bannedExpressions"
          hint="1行に1つずつ入力。生成された文章にこれらが入らないようにします"
          error={e.bannedExpressions}
        >
          <Textarea id="bannedExpressions" name="bannedExpressions" rows={5} defaultValue={initial.bannedExpressions} placeholder={"例：\n絶対稼げる\n誰でも簡単"} />
        </Field>
        <Field label="その他のルール" htmlFor="customRules" error={e.customRules}>
          <Textarea id="customRules" name="customRules" maxLength={3000} defaultValue={initial.customRules} placeholder="例：数字は半角。ハッシュタグは付けない" />
        </Field>
      </section>

      <SubmitButton pendingText="保存中…">{account ? "変更を保存" : "アカウントを作成"}</SubmitButton>
    </form>
  );
}
