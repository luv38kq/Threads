import type { Metadata } from "next";
import { AiSetupGuard } from "@/components/ai-setup-guard";
import { pickProvider } from "@/components/provider-select";
import { Card, PageHeader } from "@/components/ui";
import { requireActiveUser } from "@/lib/auth";
import { prefillFromAnalysis, prefillFromPattern } from "@/lib/ai/prefill";
import { listRegisteredProviders } from "@/lib/ai/run";
import { createClient } from "@/lib/supabase/server";
import { RecentHistory } from "../history/recent";
import { RewriteForm } from "./rewrite-form";

export const metadata: Metadata = { title: "リライト" };

export default async function RewritePage({ searchParams }: PageProps<"/rewrite">) {
  const profile = await requireActiveUser();
  const params = await searchParams;
  const supabase = await createClient();
  const [{ data: accounts }, providers, fromAnalysis, fromPattern] = await Promise.all([
    supabase.from("managed_accounts").select("id, name").order("created_at", { ascending: true }),
    listRegisteredProviders(),
    prefillFromAnalysis(params.analysis),
    prefillFromPattern(params.from, params.pattern),
  ]);

  return (
    <div className="space-y-8">
      <PageHeader
        title="リライト"
        description="元の投稿の良さを残したまま、反応が増えるように書き直します。文字数やルールも守ります。"
      />
      {providers.length > 0 ? (
        <Card>
          <RewriteForm
            accounts={accounts ?? []}
            providers={providers}
            defaultProvider={pickProvider(providers, profile.preferred_ai_provider)}
            prefill={fromAnalysis ?? fromPattern}
          />
        </Card>
      ) : (
        <AiSetupGuard hasProvider={false} hasAccount needsAccount={false} />
      )}
      <RecentHistory kind="rewrite" />
    </div>
  );
}
