import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { PostPreview } from "@/components/post-preview";
import { Alert, Badge, ButtonLink, Card, PageHeader, formatDate } from "@/components/ui";
import { requireActiveUser } from "@/lib/auth";
import { PROVIDERS } from "@/lib/ai/providers";
import { splitComments } from "@/lib/ai/prompts/analyze";
import type { RewriteInput } from "@/lib/ai/prompts/rewrite";
import type { RewriteResult } from "@/lib/features/rewrite";
import { createClient } from "@/lib/supabase/server";
import { DeleteHistoryButton } from "../../history/delete-button";
import { getAccountName } from "../../history/queries";

export const metadata: Metadata = { title: "リライト結果" };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async function RewriteResultPage({ params }: PageProps<"/rewrite/[id]">) {
  await requireActiveUser();
  const { id } = await params;
  if (!UUID.test(id)) notFound();

  const supabase = await createClient();
  const { data } = await supabase
    .from("generations")
    .select("id, account_id, provider, model, input, output, created_at")
    .eq("id", id)
    .eq("kind", "rewrite")
    .maybeSingle();
  if (!data) notFound();

  const input = data.input as unknown as RewriteInput;
  const out = data.output as unknown as RewriteResult;
  const accountName = await getAccountName(data.account_id);

  return (
    <div className="space-y-6">
      <PageHeader
        title="リライト結果"
        description={`${formatDate(data.created_at)} ／ ${PROVIDERS[data.provider].label}（${data.model}）${accountName ? ` ／ ${accountName}` : ""}`}
        actions={<ButtonLink href="/rewrite">新しくリライト</ButtonLink>}
      />

      {out.warnings.length > 0 && (
        <Alert tone="warning">
          <p className="mb-1 font-medium">AIがルールを守りきれなかった箇所があります。投稿前に手直ししてください。</p>
          <ul className="list-disc pl-5">
            {out.warnings.map((w, i) => (
              <li key={i}>
                案{w.index + 1}：{w.message}
              </li>
            ))}
          </ul>
        </Alert>
      )}

      <details className="rounded-xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900">
        <summary className="cursor-pointer text-sm font-medium">元の投稿を見る</summary>
        <div className="mt-4">
          <PostPreview body={input.body} comments={splitComments(input.comments)} />
        </div>
      </details>

      {out.patterns.map((p, i) => (
        <Card key={i} className="space-y-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="flex items-center gap-2">
              <Badge tone="info">案{i + 1}</Badge>
              <h2 className="font-semibold">{p.angle}</h2>
            </div>
            <ButtonLink
              href={{ pathname: "/analyze", query: { from: data.id, pattern: String(i) } }}
              variant="secondary"
              className="text-xs"
            >
              この案を分析する
            </ButtonLink>
          </div>
          <div className="grid gap-3 text-sm md:grid-cols-2">
            <div>
              <p className="mb-1 text-xs font-medium text-zinc-500">変えたところ</p>
              <ul className="list-disc space-y-1 pl-5">
                {p.changes.map((c, j) => (
                  <li key={j}>{c}</li>
                ))}
              </ul>
            </div>
            <div>
              <p className="mb-1 text-xs font-medium text-zinc-500">残した良さ</p>
              <ul className="list-disc space-y-1 pl-5">
                {p.kept.map((k, j) => (
                  <li key={j}>{k}</li>
                ))}
              </ul>
            </div>
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
