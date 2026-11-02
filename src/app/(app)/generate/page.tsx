import type { Metadata } from "next";
import { AiSetupGuard } from "@/components/ai-setup-guard";
import { pickProvider } from "@/components/provider-select";
import { Card, PageHeader } from "@/components/ui";
import { requireActiveUser } from "@/lib/auth";
import { listRegisteredProviders } from "@/lib/ai/run";
import { createClient } from "@/lib/supabase/server";
import { RecentHistory } from "../history/recent";
import { GenerateForm } from "./generate-form";

export const metadata: Metadata = { title: "投稿生成" };

export default async function GeneratePage({ searchParams }: PageProps<"/generate">) {
  const profile = await requireActiveUser();
  const params = await searchParams;
  const supabase = await createClient();
  const [{ data: accounts }, providers] = await Promise.all([
    supabase.from("managed_accounts").select("id, name").order("created_at", { ascending: true }),
    listRegisteredProviders(),
  ]);

  const hasAccount = (accounts?.length ?? 0) > 0;
  const hasProvider = providers.length > 0;
  const defaultAccountId = typeof params.account === "string" ? params.account : accounts?.[0]?.id;
  const defaultTheme = typeof params.theme === "string" ? params.theme.slice(0, 1000) : "";

  return (
    <div className="space-y-8">
      <PageHeader
        title="投稿生成"
        description="テーマを入れると、アカウント設定（ターゲット・文章のクセ・禁止表現・ナレッジ）を反映した投稿案を作ります。"
      />
      {hasAccount && hasProvider ? (
        <Card>
          <GenerateForm
            accounts={accounts ?? []}
            providers={providers}
            defaultAccountId={defaultAccountId}
            defaultProvider={pickProvider(providers, profile.preferred_ai_provider)}
            defaultTheme={defaultTheme}
          />
        </Card>
      ) : (
        <AiSetupGuard hasAccount={hasAccount} hasProvider={hasProvider} />
      )}
      <RecentHistory kind="generate" />
    </div>
  );
}
