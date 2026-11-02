import type { Metadata } from "next";
import { AiSetupGuard } from "@/components/ai-setup-guard";
import { pickProvider } from "@/components/provider-select";
import { Card, PageHeader } from "@/components/ui";
import { requireActiveUser } from "@/lib/auth";
import { prefillFromPattern } from "@/lib/ai/prefill";
import { listRegisteredProviders } from "@/lib/ai/run";
import { createClient } from "@/lib/supabase/server";
import { RecentHistory } from "../history/recent";
import { AnalyzeForm } from "./analyze-form";

export const metadata: Metadata = { title: "投稿分析" };

export default async function AnalyzePage({ searchParams }: PageProps<"/analyze">) {
  const profile = await requireActiveUser();
  const params = await searchParams;
  const supabase = await createClient();
  const [{ data: accounts }, providers, prefill] = await Promise.all([
    supabase.from("managed_accounts").select("id, name").order("created_at", { ascending: true }),
    listRegisteredProviders(),
    prefillFromPattern(params.from, params.pattern),
  ]);

  return (
    <div className="space-y-8">
      <PageHeader
        title="投稿分析"
        description="投稿を貼り付けると、冒頭の引き・構成・コメント欄やプロフィールへの誘導を評価し、具体的な改善点を示します。"
      />
      {providers.length > 0 ? (
        <Card>
          <AnalyzeForm
            accounts={accounts ?? []}
            providers={providers}
            defaultProvider={pickProvider(providers, profile.preferred_ai_provider)}
            prefill={prefill}
          />
        </Card>
      ) : (
        <AiSetupGuard hasProvider={false} hasAccount needsAccount={false} />
      )}
      <RecentHistory kind="analyze" />
    </div>
  );
}
