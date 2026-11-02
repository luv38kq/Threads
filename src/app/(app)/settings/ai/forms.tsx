"use client";

import { useActionState } from "react";
import { Alert, Field, Input, Select } from "@/components/ui";
import { SubmitButton } from "@/components/submit-button";
import type { AiProvider } from "@/lib/supabase/database.types";
import type { FormState } from "@/lib/validation";
import { saveApiKey, updateModel } from "./actions";

export function ApiKeyForm({ provider }: { provider: AiProvider }) {
  const [state, action] = useActionState<FormState, FormData>(saveApiKey, {});
  const inputId = `apiKey-${provider}`;

  return (
    <form action={action} className="space-y-3">
      {state.message && <Alert tone={state.ok ? "success" : "error"}>{state.message}</Alert>}
      <input type="hidden" name="provider" value={provider} />
      <Field label="APIキー" htmlFor={inputId} error={state.errors?.apiKey}>
        <Input
          id={inputId}
          name="apiKey"
          type="password"
          autoComplete="off"
          spellCheck={false}
          required
          placeholder="ここに貼り付け"
        />
      </Field>
      <SubmitButton pendingText="確認中…">接続を確認して保存</SubmitButton>
    </form>
  );
}

export function ModelForm({
  provider,
  model,
  models,
}: {
  provider: AiProvider;
  model: string;
  models: string[];
}) {
  const [state, action] = useActionState<FormState, FormData>(updateModel, {});
  const selectId = `model-${provider}`;

  return (
    <form action={action} className="flex flex-wrap items-end gap-2">
      <input type="hidden" name="provider" value={provider} />
      <div className="min-w-60 flex-1">
        <Field label="使うモデル" htmlFor={selectId} error={state.ok ? undefined : state.message}>
          <Select id={selectId} name="model" defaultValue={model}>
            {models.map((m) => (
              <option key={m} value={m}>
                {m}
              </option>
            ))}
          </Select>
        </Field>
      </div>
      <SubmitButton variant="secondary" pendingText="保存中…">
        変更
      </SubmitButton>
      {state.ok && <span className="text-xs text-emerald-600">{state.message}</span>}
    </form>
  );
}
