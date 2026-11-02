"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { Alert, Button, Card, Field, Input, Textarea } from "@/components/ui";
import { SubmitButton } from "@/components/submit-button";
import type { FormState } from "@/lib/validation";
import { addKnowledge, deleteKnowledge, updateKnowledge } from "../actions";

type Item = { id: string; title: string; content: string; updated_at: string };

export function KnowledgeSection({ accountId, items }: { accountId: string; items: Item[] }) {
  return (
    <Card>
      <h2 className="font-semibold">ナレッジ</h2>
      <p className="mb-4 mt-1 text-sm text-zinc-600 dark:text-zinc-400">
        商品の情報、実績、よく受ける質問、あなたの体験談など。投稿を作るときにAIが参考にします。
      </p>

      {items.length > 0 && (
        <ul className="mb-6 divide-y divide-zinc-200 rounded-lg border border-zinc-200 dark:divide-zinc-800 dark:border-zinc-800">
          {items.map((item) => (
            <KnowledgeItem key={`${item.id}-${item.updated_at}`} item={item} />
          ))}
        </ul>
      )}

      <AddKnowledgeForm accountId={accountId} />
    </Card>
  );
}

function AddKnowledgeForm({ accountId }: { accountId: string }) {
  const [state, action] = useActionState<FormState, FormData>(addKnowledge, {});
  const formRef = useRef<HTMLFormElement>(null);

  // 追加に成功したら入力欄を空にする
  useEffect(() => {
    if (state.ok) formRef.current?.reset();
  }, [state]);

  return (
    <form ref={formRef} action={action} className="space-y-3">
      <h3 className="text-sm font-semibold">ナレッジを追加</h3>
      {state.message && <Alert tone={state.ok ? "success" : "error"}>{state.message}</Alert>}
      <input type="hidden" name="accountId" value={accountId} />
      <Field label="タイトル" htmlFor="knowledge-title" error={state.errors?.title}>
        <Input
          id="knowledge-title"
          name="title"
          maxLength={100}
          required
          defaultValue={state.ok ? "" : state.values?.title}
          placeholder="例：主力商品の特徴"
        />
      </Field>
      <Field label="内容" htmlFor="knowledge-content" error={state.errors?.content}>
        <Textarea
          id="knowledge-content"
          name="content"
          rows={5}
          maxLength={10000}
          required
          defaultValue={state.ok ? "" : state.values?.content}
        />
      </Field>
      <SubmitButton variant="secondary" pendingText="追加中…">
        追加する
      </SubmitButton>
    </form>
  );
}

function KnowledgeItem({ item }: { item: Item }) {
  const [editing, setEditing] = useState(false);
  const [state, action] = useActionState<FormState, FormData>(updateKnowledge, {});

  if (editing && !state.ok) {
    return (
      <li className="p-4">
        <form action={action} className="space-y-3">
          {state.message && <Alert tone="error">{state.message}</Alert>}
          <input type="hidden" name="id" value={item.id} />
          <Field label="タイトル" htmlFor={`title-${item.id}`} error={state.errors?.title}>
            <Input id={`title-${item.id}`} name="title" maxLength={100} required defaultValue={state.values?.title ?? item.title} />
          </Field>
          <Field label="内容" htmlFor={`content-${item.id}`} error={state.errors?.content}>
            <Textarea id={`content-${item.id}`} name="content" rows={5} maxLength={10000} required defaultValue={state.values?.content ?? item.content} />
          </Field>
          <div className="flex gap-2">
            <SubmitButton pendingText="保存中…">保存</SubmitButton>
            <Button type="button" variant="ghost" onClick={() => setEditing(false)}>
              キャンセル
            </Button>
          </div>
        </form>
      </li>
    );
  }

  return (
    <li className="space-y-2 p-4">
      <div className="flex items-start justify-between gap-4">
        <h4 className="font-medium">{item.title}</h4>
        <div className="flex shrink-0 gap-1">
          <Button type="button" variant="ghost" className="px-2 py-1 text-xs" onClick={() => setEditing(true)}>
            編集
          </Button>
          <form action={deleteKnowledge}>
            <input type="hidden" name="id" value={item.id} />
            <SubmitButton
              variant="ghost"
              className="px-2 py-1 text-xs text-red-600"
              pendingText="削除中…"
              confirmMessage={`「${item.title}」を削除しますか？`}
            >
              削除
            </SubmitButton>
          </form>
        </div>
      </div>
      <p className="whitespace-pre-wrap text-sm text-zinc-600 dark:text-zinc-400">{item.content}</p>
    </li>
  );
}
