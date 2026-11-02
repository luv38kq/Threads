"use client";

import { useActionState } from "react";
import { Alert, Field, Input, Select } from "@/components/ui";
import { SubmitButton } from "@/components/submit-button";
import type { UserStatus } from "@/lib/supabase/database.types";
import type { FormState } from "@/lib/validation";
import { setSignupPassphrase, updateMember } from "./actions";

/** ISO日時 → 日本時間の "YYYY-MM-DD"（日付入力欄用） */
function toJstDate(value: string | null): string {
  if (!value) return "";
  return new Intl.DateTimeFormat("sv-SE", { timeZone: "Asia/Tokyo" }).format(new Date(value));
}

export function MemberForm({
  member,
  returnTo,
}: {
  member: { id: string; status: UserStatus; accessExpiresAt: string | null; adminNote: string };
  returnTo: string;
}) {
  const [state, action] = useActionState<FormState, FormData>(updateMember, {});
  const p = `m-${member.id}`;

  return (
    <form action={action} className="space-y-3 border-t border-zinc-200 pt-4 dark:border-zinc-800">
      {state.message && <Alert tone={state.ok ? "success" : "error"}>{state.message}</Alert>}
      <input type="hidden" name="userId" value={member.id} />
      <input type="hidden" name="returnTo" value={returnTo} />
      <div className="grid gap-3 sm:grid-cols-3">
        <Field label="状態" htmlFor={`${p}-status`}>
          <Select id={`${p}-status`} name="status" defaultValue={member.status}>
            <option value="pending">承認待ち</option>
            <option value="approved">承認（利用可）</option>
            <option value="suspended">停止</option>
          </Select>
        </Field>
        <Field label="利用期限" htmlFor={`${p}-expires`} hint="空欄なら無期限">
          <Input
            id={`${p}-expires`}
            name="accessExpiresAt"
            type="date"
            defaultValue={toJstDate(member.accessExpiresAt)}
          />
        </Field>
        <Field label="管理メモ（本人には見えません）" htmlFor={`${p}-note`}>
          <Input id={`${p}-note`} name="adminNote" maxLength={2000} defaultValue={member.adminNote} />
        </Field>
      </div>
      <SubmitButton variant="secondary" pendingText="保存中…">
        保存
      </SubmitButton>
    </form>
  );
}

export function PassphraseForm() {
  const [state, action] = useActionState<FormState, FormData>(setSignupPassphrase, {});
  return (
    <form action={action} className="space-y-3">
      {state.message && <Alert tone={state.ok ? "success" : "error"}>{state.message}</Alert>}
      <div className="flex flex-wrap items-end gap-2">
        <div className="min-w-64 flex-1">
          <Field
            label="新しい合言葉"
            htmlFor="passphrase"
            hint="6文字以上。推測されにくいものにしてください"
            error={state.errors?.passphrase}
          >
            <Input id="passphrase" name="passphrase" autoComplete="off" required minLength={6} />
          </Field>
        </div>
        <SubmitButton pendingText="保存中…">合言葉を設定</SubmitButton>
      </div>
    </form>
  );
}
