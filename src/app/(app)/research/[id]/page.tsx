import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { AiSetupGuard } from "@/components/ai-setup-guard";
import { pickProvider } from "@/components/provider-select";
import { Badge, Card, PageHeader, formatDate } from "@/components/ui";
import { SubmitButton } from "@/components/submit-button";
import { requireActiveUser } from "@/lib/auth";
import { rankPosts } from "@/lib/ai/prompts/research";
import { listRegisteredProviders } from "@/lib/ai/run";
import type { ResearchPost } from "@/lib/extension/research-schema";
import { createClient } from "@/lib/supabase/server";
import { deleteResearchSet } from "../actions";
import { ResearchAnalysisForm } from "./analysis-form";

export const metadata: Metadata = { title: "リサーチ結果" };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async function ResearchSetPage({ params }: PageProps<"/research/[id]">) {
  const profile = await requireActiveUser();
  const { id } = await params;
  if (!UUID.test(id)) notFound();

  const supabase = await createClient();
  const [{ data: set }, { data: accounts }, providers] = await Promise.all([
    supabase.from("research_sets").select("*").eq("id", id).maybeSingle(),
    supabase.from("managed_accounts").select("id, name").order("created_at", { ascending: true }),
    listRegisteredProviders(),
  ]);
  if (!set) notFound();

  const posts = rankPosts(set.posts as unknown as ResearchPost[]);

  return (
    <div className="space-y-6">
      <PageHeader
        title={set.source_username ? `@${set.source_username} のリサーチ` : "リサーチ結果"}
        description={`${formatDate(set.created_at)} に集めた ${set.post_count} 件（反応の良い順）`}
      />

      <Card className="space-y-4">
        <h2 className="font-semibold">AIで分析する</h2>
        <p className="text-sm text-zinc-600 dark:text-zinc-400">
          反応の良い投稿から「冒頭の型」「構成の型」「返信を生む特徴」を取り出し、あなたのアカウント向けの穴埋めテンプレートと投稿案を作ります。
        </p>
        {providers.length > 0 ? (
          <ResearchAnalysisForm
            researchSetId={set.id}
            accounts={accounts ?? []}
            providers={providers}
            defaultAccountId={set.account_id ?? ""}
            defaultProvider={pickProvider(providers, profile.preferred_ai_provider)}
            postCount={posts.length}
          />
        ) : (
          <AiSetupGuard hasProvider={false} hasAccount needsAccount={false} />
        )}
      </Card>

      <section className="space-y-3">
        <h2 className="font-semibold">集めた投稿</h2>
        {posts.map((p, i) => (
          <Card key={p.code} className="space-y-2">
            <div className="flex flex-wrap items-center gap-2 text-xs text-zinc-500">
              <Badge tone="info">{i + 1}位</Badge>
              <span>いいね {p.likeCount.toLocaleString()}</span>
              <span>返信 {p.replyCount.toLocaleString()}</span>
              <span>再投稿 {(p.repostCount + p.quoteCount).toLocaleString()}</span>
              <span>{formatDate(p.takenAt)}</span>
              {p.tree.length > 0 && <Badge>ツリー {p.tree.length + 1}件</Badge>}
              <a href={p.url} target="_blank" rel="noopener noreferrer" className="ml-auto underline">
                Threadsで見る
              </a>
            </div>
            <p className="whitespace-pre-wrap text-sm leading-relaxed">{p.text || "（本文なし）"}</p>
            {p.tree.length > 0 && (
              <details className="text-sm">
                <summary className="cursor-pointer text-zinc-500">ツリーの続きを見る</summary>
                <div className="mt-2 space-y-2 border-l-2 border-zinc-200 pl-3 dark:border-zinc-700">
                  {p.tree.map((t) => (
                    <p key={t.code} className="whitespace-pre-wrap">
                      {t.text}
                    </p>
                  ))}
                </div>
              </details>
            )}
          </Card>
        ))}
      </section>

      <div className="flex justify-end">
        <form action={deleteResearchSet}>
          <input type="hidden" name="id" value={set.id} />
          <SubmitButton variant="ghost" className="text-xs text-red-600" confirmMessage="このリサーチを削除しますか？">
            このリサーチを削除
          </SubmitButton>
        </form>
      </div>
    </div>
  );
}
