import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { CopyButton } from "@/components/copy-button";
import { ButtonLink, Card, PageHeader, formatDate } from "@/components/ui";
import { requireActiveUser } from "@/lib/auth";
import { PROVIDERS } from "@/lib/ai/providers";
import type { ResearchInput, ResearchOutput } from "@/lib/ai/prompts/research";
import { createClient } from "@/lib/supabase/server";
import { DeleteHistoryButton } from "../../../history/delete-button";
import { getAccountName } from "../../../history/queries";

export const metadata: Metadata = { title: "競合分析レポート" };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async function ResearchReportPage({ params }: PageProps<"/research/report/[id]">) {
  await requireActiveUser();
  const { id } = await params;
  if (!UUID.test(id)) notFound();

  const supabase = await createClient();
  const { data } = await supabase
    .from("generations")
    .select("id, account_id, provider, model, input, output, created_at")
    .eq("id", id)
    .eq("kind", "research")
    .maybeSingle();
  if (!data) notFound();

  const input = data.input as unknown as ResearchInput & { sourceUsername?: string };
  const out = data.output as unknown as ResearchOutput;
  const accountName = await getAccountName(data.account_id);
  const generateHref = (theme: string, angle: string) => ({
    pathname: "/generate",
    query: { theme: `${theme}\n（使う型：${angle}）`, ...(data.account_id ? { account: data.account_id } : {}) },
  });

  return (
    <div className="space-y-6">
      <PageHeader
        title={`競合分析レポート${input.sourceUsername ? `：@${input.sourceUsername}` : ""}`}
        description={`${formatDate(data.created_at)} ／ ${PROVIDERS[data.provider].label}（${data.model}）${accountName ? ` ／ ${accountName} 向け` : ""}`}
        actions={
          <ButtonLink href={`/research/${input.researchSetId}`} variant="secondary">
            元の投稿を見る
          </ButtonLink>
        }
      />

      <Card>
        <h2 className="mb-2 font-semibold">全体の傾向</h2>
        <p className="whitespace-pre-wrap text-sm leading-relaxed">{out.summary}</p>
      </Card>

      <Section title="冒頭（1行目）の型">
        {out.hook_patterns.map((h, i) => (
          <Item key={i} title={h.name}>
            <p>{h.description}</p>
            <p className="text-zinc-600 dark:text-zinc-400">なぜ効く：{h.why_it_works}</p>
            {h.examples.length > 0 && (
              <ul className="list-disc pl-5 text-zinc-500">
                {h.examples.map((e, j) => (
                  <li key={j}>{e}</li>
                ))}
              </ul>
            )}
          </Item>
        ))}
      </Section>

      <Section title="最後まで読ませる構成の型">
        {out.structure_patterns.map((s, i) => (
          <Item key={i} title={s.name}>
            <ol className="list-decimal pl-5">
              {s.steps.map((step, j) => (
                <li key={j}>{step}</li>
              ))}
            </ol>
            <p className="text-zinc-600 dark:text-zinc-400">なぜ効く：{s.why_it_works}</p>
          </Item>
        ))}
      </Section>

      <div className="grid gap-6 md:grid-cols-2">
        <Section title="返信を生んでいる特徴">
          {out.reply_triggers.map((r, i) => (
            <Item key={i} title={r.feature}>
              <p>{r.description}</p>
              <p className="text-zinc-500">例：{r.example}</p>
            </Item>
          ))}
        </Section>
        <Section title="感情を動かす言葉の置き方">
          {out.word_techniques.map((w, i) => (
            <Item key={i} title={w.technique}>
              <p>{w.description}</p>
              <p className="text-zinc-500">例：{w.example}</p>
            </Item>
          ))}
        </Section>
      </div>

      <Section title="穴埋め式テンプレート">
        {out.templates.map((t, i) => (
          <Item key={i} title={t.name}>
            <div className="rounded-lg bg-zinc-50 p-3 dark:bg-zinc-950">
              <div className="mb-1 flex justify-end">
                <CopyButton text={t.template} />
              </div>
              <p className="whitespace-pre-wrap">{t.template}</p>
            </div>
            <p className="text-zinc-600 dark:text-zinc-400">使い方：{t.how_to_use}</p>
            <details>
              <summary className="cursor-pointer text-zinc-500">例文を見る</summary>
              <p className="mt-2 whitespace-pre-wrap">{t.example}</p>
            </details>
          </Item>
        ))}
      </Section>

      <Section title="次に投稿すると良さそうなテーマ">
        {out.post_ideas.map((idea, i) => (
          <div key={i} className="flex flex-wrap items-center justify-between gap-3 border-b border-zinc-100 pb-3 last:border-0 dark:border-zinc-800">
            <div className="text-sm">
              <p className="font-medium">{idea.theme}</p>
              <p className="text-zinc-500">{idea.angle}</p>
            </div>
            <ButtonLink href={generateHref(idea.theme, idea.angle)} variant="secondary" className="text-xs">
              この内容で投稿を作る
            </ButtonLink>
          </div>
        ))}
      </Section>

      <div className="flex justify-end">
        <DeleteHistoryButton id={data.id} />
      </div>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <Card className="space-y-4">
      <h2 className="font-semibold">{title}</h2>
      {children}
    </Card>
  );
}

function Item({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5 text-sm">
      <h3 className="font-medium">{title}</h3>
      {children}
    </div>
  );
}
