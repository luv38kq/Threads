import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { CopyButton } from "@/components/copy-button";
import { PostPreview } from "@/components/post-preview";
import { Badge, ButtonLink, Card, PageHeader, formatDate } from "@/components/ui";
import { requireActiveUser } from "@/lib/auth";
import { PROVIDERS } from "@/lib/ai/providers";
import { CRITERIA, splitComments, type AnalyzeInput, type AnalyzeOutput } from "@/lib/ai/prompts/analyze";
import { createClient } from "@/lib/supabase/server";
import { DeleteHistoryButton } from "../../history/delete-button";
import { getAccountName } from "../../history/queries";

export const metadata: Metadata = { title: "分析結果" };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function scoreTone(score: number): "success" | "warning" | "error" {
  if (score >= 4) return "success";
  if (score >= 3) return "warning";
  return "error";
}

export default async function AnalysisPage({ params }: PageProps<"/analyze/[id]">) {
  await requireActiveUser();
  const { id } = await params;
  if (!UUID.test(id)) notFound();

  const supabase = await createClient();
  const { data } = await supabase
    .from("generations")
    .select("id, account_id, provider, model, input, output, created_at")
    .eq("id", id)
    .eq("kind", "analyze")
    .maybeSingle();
  if (!data) notFound();

  const input = data.input as unknown as AnalyzeInput;
  const out = data.output as unknown as AnalyzeOutput;
  const accountName = await getAccountName(data.account_id);

  return (
    <div className="space-y-6">
      <PageHeader
        title="分析結果"
        description={`${formatDate(data.created_at)} ／ ${PROVIDERS[data.provider].label}（${data.model}）${accountName ? ` ／ ${accountName}` : ""}`}
        actions={
          <ButtonLink href={{ pathname: "/rewrite", query: { analysis: data.id } }}>
            この分析をもとにリライト
          </ButtonLink>
        }
      />

      <Card className="flex flex-wrap items-center gap-6">
        <div className="text-center">
          <p className="text-xs text-zinc-500">総合点</p>
          <p className="text-4xl font-bold">{out.overall_score}</p>
          <p className="text-xs text-zinc-500">/ 100</p>
        </div>
        <p className="min-w-60 flex-1 whitespace-pre-wrap text-sm leading-relaxed">{out.summary}</p>
      </Card>

      {out.priorities.length > 0 && (
        <Card>
          <h2 className="mb-2 font-semibold">まず直すべきこと</h2>
          <ol className="list-decimal space-y-1 pl-5 text-sm">
            {out.priorities.map((p, i) => (
              <li key={i}>{p}</li>
            ))}
          </ol>
        </Card>
      )}

      <section className="space-y-3">
        {out.criteria.map((c) => {
          const meta = CRITERIA.find((x) => x.key === c.key);
          return (
            <Card key={c.key} className="space-y-3">
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="font-semibold">{meta?.label ?? c.key}</h2>
                <Badge tone={scoreTone(c.score)}>{c.score} / 5</Badge>
                <span className="text-xs text-zinc-500">{meta?.hint}</span>
              </div>
              <div className="grid gap-3 text-sm md:grid-cols-2">
                <div>
                  <p className="mb-1 text-xs font-medium text-emerald-700 dark:text-emerald-400">良い点</p>
                  <p className="whitespace-pre-wrap">{c.good || "—"}</p>
                </div>
                <div>
                  <p className="mb-1 text-xs font-medium text-amber-700 dark:text-amber-400">もったいない点</p>
                  <p className="whitespace-pre-wrap">{c.issues || "特になし"}</p>
                </div>
              </div>
              {c.improvements.length > 0 && (
                <div className="text-sm">
                  <p className="mb-1 text-xs font-medium text-zinc-500">改善案</p>
                  <ul className="list-disc space-y-1 pl-5">
                    {c.improvements.map((imp, i) => (
                      <li key={i} className="whitespace-pre-wrap">
                        {imp}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </Card>
          );
        })}
      </section>

      <div className="grid gap-6 md:grid-cols-2">
        <Card className="space-y-3">
          <h2 className="font-semibold">冒頭の書き換え案</h2>
          {out.hook_alternatives.map((h, i) => (
            <div key={i} className="flex items-start justify-between gap-2 rounded-lg bg-zinc-50 p-3 text-sm dark:bg-zinc-950">
              <p className="whitespace-pre-wrap">{h}</p>
              <CopyButton text={h} />
            </div>
          ))}
        </Card>
        <Card className="space-y-2">
          <h2 className="font-semibold">残すべき良さ</h2>
          <ul className="list-disc space-y-1 pl-5 text-sm">
            {out.keep.map((k, i) => (
              <li key={i}>{k}</li>
            ))}
          </ul>
        </Card>
      </div>

      <Card className="space-y-3">
        <h2 className="font-semibold">分析した投稿</h2>
        <PostPreview body={input.body} comments={splitComments(input.comments)} />
      </Card>

      <div className="flex justify-end">
        <DeleteHistoryButton id={data.id} />
      </div>
    </div>
  );
}
