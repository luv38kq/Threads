import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { PostPreview } from "@/components/post-preview";
import { Alert, Badge, ButtonLink, Card, PageHeader, formatDate } from "@/components/ui";
import { requireActiveUser } from "@/lib/auth";
import { PROVIDERS } from "@/lib/ai/providers";
import { CTA_MODES, type BuzzInput } from "@/lib/ai/prompts/buzz";
import type { BuzzResult } from "@/lib/features/buzz";
import { createClient } from "@/lib/supabase/server";
import { DeleteHistoryButton } from "../../history/delete-button";
import { getAccountName } from "../../history/queries";

export const metadata: Metadata = { title: "バズ量産の結果" };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async function BuzzResultPage({ params }: PageProps<"/buzz/[id]">) {
  await requireActiveUser();
  const { id } = await params;
  if (!UUID.test(id)) notFound();

  const supabase = await createClient();
  const { data } = await supabase
    .from("generations")
    .select("id, account_id, provider, model, input, output, created_at")
    .eq("id", id)
    .eq("kind", "buzz")
    .maybeSingle();
  if (!data) notFound();

  const input = data.input as unknown as BuzzInput;
  const out = data.output as unknown as BuzzResult;
  const accountName = await getAccountName(data.account_id);
  const cta = CTA_MODES.find((m) => m.id === input.ctaMode);

  return (
    <div className="space-y-6">
      <PageHeader
        title={`バズ量産：${input.genre || "全ジャンル"}`}
        description={`${formatDate(data.created_at)} ／ ${PROVIDERS[data.provider].label}（${data.model}）${accountName ? ` ／ ${accountName} 向け` : ""}`}
        actions={
          <ButtonLink href={{ pathname: "/buzz", query: input.genre ? { genre: input.genre } : {} }}>
            もう一度作る
          </ButtonLink>
        }
      />

      <Card className="space-y-1 text-sm">
        <p>
          <span className="text-zinc-500">参考にした投稿：</span>
          {input.genre || "全ジャンル"}の反応が良い{out.sourceCount}件
        </p>
        {cta && (
          <p>
            <span className="text-zinc-500">誘導：</span>
            {cta.label}
          </p>
        )}
        {input.theme && (
          <p>
            <span className="text-zinc-500">テーマ：</span>
            {input.theme}
          </p>
        )}
      </Card>

      <Card>
        <h2 className="mb-2 font-semibold">伸びた投稿の共通点</h2>
        <p className="whitespace-pre-wrap text-sm leading-relaxed">{out.summary}</p>
      </Card>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold">抜き出した型</h2>
        <div className="grid gap-3 sm:grid-cols-2">
          {out.patterns.map((p, i) => (
            <Card key={i} className="space-y-2 text-sm">
              <h3 className="font-medium">{p.name}</h3>
              <p>
                <span className="text-zinc-500">冒頭：</span>
                {p.hook}
              </p>
              <ol className="list-decimal space-y-0.5 pl-5">
                {p.structure.map((s, j) => (
                  <li key={j}>{s}</li>
                ))}
              </ol>
              <p>
                <span className="text-zinc-500">反応を生む仕掛け：</span>
                {p.engagement}
              </p>
              <p className="text-zinc-600 dark:text-zinc-400">なぜ効く：{p.why_it_works}</p>
            </Card>
          ))}
        </div>
      </section>

      {out.warnings.length > 0 && (
        <Alert tone="warning">
          <p className="mb-1 font-medium">AIがルールを守りきれなかった箇所があります。投稿前に手直ししてください。</p>
          <ul className="list-disc pl-5">
            {out.warnings.map((w, i) => (
              <li key={i}>
                投稿案{w.index + 1}：{w.message}
              </li>
            ))}
          </ul>
        </Alert>
      )}

      <section className="space-y-3">
        <h2 className="text-lg font-semibold">投稿案（{out.drafts.length}本）</h2>
        <p className="text-sm text-zinc-600 dark:text-zinc-400">
          「〇〇」の部分は、ご自身の実際の体験や数字に書き換えてから投稿してください。
        </p>
        {out.drafts.map((d, i) => (
          <Card key={i} className="space-y-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="space-y-1">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge tone="info">投稿案{i + 1}</Badge>
                  <Badge>{d.pattern_name}</Badge>
                  <h3 className="font-semibold">{d.angle}</h3>
                </div>
                <p className="text-sm text-zinc-600 dark:text-zinc-400">冒頭のねらい：{d.hook_reason}</p>
              </div>
            </div>
            <PostPreview body={d.body} comments={d.comments} maxBodyChars={input.maxChars} />
          </Card>
        ))}
      </section>

      <div className="flex justify-end">
        <DeleteHistoryButton id={data.id} />
      </div>
    </div>
  );
}
