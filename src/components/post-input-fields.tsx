import { Field, Select, Textarea } from "@/components/ui";

/** 分析・リライトで共通の「アカウント」「本文」「コメント欄」の入力欄 */
export function PostInputFields({
  accounts,
  values,
  errors,
  accountHint,
}: {
  accounts: { id: string; name: string }[];
  values: { accountId?: string; body?: string; comments?: string };
  errors: Record<string, string>;
  accountHint: string;
}) {
  return (
    <>
      <Field label="アカウント" htmlFor="accountId" hint={accountHint} error={errors.accountId}>
        <Select id="accountId" name="accountId" defaultValue={values.accountId ?? ""}>
          <option value="">指定しない</option>
          {accounts.map((a) => (
            <option key={a.id} value={a.id}>
              {a.name}
            </option>
          ))}
        </Select>
      </Field>
      <Field label="本文" htmlFor="body" error={errors.body}>
        <Textarea id="body" name="body" rows={8} required maxLength={3000} defaultValue={values.body} />
      </Field>
      <Field
        label="コメント欄（任意）"
        htmlFor="comments"
        hint="本文に続けて自分で返信した投稿。複数あるときは「---」だけの行で区切ってください"
        error={errors.comments}
      >
        <Textarea
          id="comments"
          name="comments"
          rows={5}
          maxLength={10000}
          defaultValue={values.comments}
          placeholder={"1つ目のコメント\n---\n2つ目のコメント"}
        />
      </Field>
    </>
  );
}
