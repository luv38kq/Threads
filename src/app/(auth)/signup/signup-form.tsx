"use client";

import { useActionState } from "react";
import { Alert, Field, Input } from "@/components/ui";
import { SubmitButton } from "@/components/submit-button";
import type { FormState } from "@/lib/validation";
import { signup } from "../actions";

export function SignupForm() {
  const [state, action] = useActionState<FormState, FormData>(signup, {});

  if (state.ok) {
    return <Alert tone="success">{state.message}</Alert>;
  }

  return (
    <form action={action} className="space-y-4">
      {state.message && <Alert tone="error">{state.message}</Alert>}
      <Field label="お名前（表示名）" htmlFor="displayName" error={state.errors?.displayName}>
        <Input
          id="displayName"
          name="displayName"
          autoComplete="nickname"
          required
          maxLength={50}
          defaultValue={state.values?.displayName}
        />
      </Field>
      <Field
        label="Brainのユーザー名"
        htmlFor="brainName"
        hint="購入の確認に使います。Brainのマイページに表示されている名前を入力してください。"
        error={state.errors?.brainName}
      >
        <Input
          id="brainName"
          name="brainName"
          required
          maxLength={100}
          defaultValue={state.values?.brainName}
        />
      </Field>
      <Field label="メールアドレス" htmlFor="email" error={state.errors?.email}>
        <Input
          id="email"
          name="email"
          type="email"
          autoComplete="email"
          required
          defaultValue={state.values?.email}
        />
      </Field>
      <Field
        label="パスワード"
        htmlFor="password"
        hint="8文字以上。他のサービスと同じパスワードは避けてください。"
        error={state.errors?.password}
      >
        <Input
          id="password"
          name="password"
          type="password"
          autoComplete="new-password"
          required
          minLength={8}
        />
      </Field>
      <Field
        label="合言葉"
        htmlFor="passphrase"
        hint="購入した記事に書かれている合言葉を入力してください。"
        error={state.errors?.passphrase}
      >
        <Input id="passphrase" name="passphrase" autoComplete="off" required />
      </Field>
      <SubmitButton className="w-full" pendingText="登録中…">
        登録する
      </SubmitButton>
    </form>
  );
}
