"use client";

import { useActionState } from "react";
import { CopyButton } from "@/components/copy-button";
import { Alert, Field, Input } from "@/components/ui";
import { SubmitButton } from "@/components/submit-button";
import { createExtensionToken, type TokenFormState } from "./actions";

export function TokenForm() {
  const [state, action] = useActionState<TokenFormState, FormData>(createExtensionToken, {});

  return (
    <div className="space-y-4">
      {state.token && (
        <Alert tone="success">
          <p className="mb-2 font-medium">連携コードを発行しました。このコードは今しか表示されません。</p>
          <div className="flex flex-wrap items-center gap-2">
            <code className="break-all rounded bg-white px-2 py-1 font-mono text-xs text-zinc-900">{state.token}</code>
            <CopyButton text={state.token} />
          </div>
          <p className="mt-2 text-xs">拡張機能の「連携設定」に、スタジオのURLと一緒に貼り付けてください。</p>
        </Alert>
      )}
      {state.message && <Alert tone="error">{state.message}</Alert>}
      <form action={action} className="flex flex-wrap items-end gap-2">
        <div className="min-w-56 flex-1">
          <Field label="使うパソコンの名前（管理用）" htmlFor="token-name">
            <Input id="token-name" name="name" maxLength={50} placeholder="例：自宅のMac" />
          </Field>
        </div>
        <SubmitButton pendingText="発行中…">連携コードを発行</SubmitButton>
      </form>
    </div>
  );
}
