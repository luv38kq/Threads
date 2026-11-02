import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { PostPreview } from "@/components/post-preview";
import { Alert, Badge, ButtonLink, Card, PageHeader, formatDate } from "@/components/ui";
import { requireActiveUser } from "@/lib/auth";
import { PROVIDERS } from "@/lib/ai/providers";
import type { GenerateInput } from "@/lib/ai/prompts/generate";
import type { GenerateResult } from "@/lib/features/generate";
import { createClient } from "@/lib/supabase/server";
import { DeleteHistoryButton } from "../../history/delete-button";
import { getAccountName } from "../../history/queries";

export const metadata: Metadata = { title: "生成結果" };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async function GenerationPage({ params }: PageProps<"/generate/[id]">) {
  await requireActiveUser();
  const { id } = await params;
  if (!UUID.test(id)) notFound();

  const supabase = await createClient();
  const { data } = await supabase
    .from("generations")
    .select("id, account_id, provider, model, input, output, created_at")
    .eq("id", id)
    .eq("kind", "generate")
    .maybeSingle();
  if (!data) notFound();

  const input = data.input as unknown as GenerateInput;
  const output = data.output as unknown as GenerateResult;
  const accountName = await getAccountName(data.account_id);

  return (
    <div className="space-y-6">
      <PageHeader
        title="生成結果"
        description={`${formatDate(data.created_at)} ／ ${PROVIDERS[data.provider].label}（${data.model}）${accountName ? ` ／ ${accountName}` : ""}`}
        actions={
          <>
            <ButtonLink
              href={{ pathname: "/generate", query: { theme: input.theme, ...(data.account_id ? { account: data.account_id } : {}) } }}
              variant="secondary"
            >
              同じテーマで作り直す
            </ButtonLink>
            <ButtonLink href="/generate">新しく作る</ButtonLink>
          </>
        }
      />

      <Card className="space-y-1 text-sm">
        <p>
          <span className="text-zinc-500">テーマ：</span>
          {input.theme}
        </p>
        {input.targetOverride && (
          <p>
            <span className="text-zinc-500">ターゲット：</span>
            {input.targetOverride}
          </p>
        )}
      </Card>

      {output.warnings.length > 0 && (
        <Alert tone="warning">
          <p className="mb-1 font-medium">AIがルールを守りきれなかった箇所があります。投稿前に手直ししてください。</p>
          <ul className="list-disc pl-5">
            {output.warnings.map((w, i) => (
              <li key={i}>
                パターン{w.index + 1}：{w.message}
              </li>
            ))}
          </ul>
        </Alert>
      )}

      {output.patterns.map((p, i) => (
        <Card key={i} className="space-y-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <Badge tone="info">パターン{i + 1}</Badge>
                <h2 className="font-semibold">{p.angle}</h2>
              </div>
              <p className="text-sm text-zinc-600 dark:text-zinc-400">冒頭のねらい：{p.hook_reason}</p>
            </div>
            <ButtonLink
              href={{ pathname: "/analyze", query: { from: data.id, pattern: String(i) } }}
              variant="secondary"
              className="text-xs"
            >
              この投稿を分析する
            </ButtonLink>
          </div>
          <PostPreview body={p.body} comments={p.comments} maxBodyChars={input.maxChars} />
        </Card>
      ))}

      <div className="flex justify-end">
        <DeleteHistoryButton id={data.id} />
      </div>
    </div>
  );
}
