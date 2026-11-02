import { ButtonLink, Card } from "@/components/ui";

/** AI機能を使う前に必要な設定（APIキー・アカウント）が足りないときの案内 */
export function AiSetupGuard({
  hasProvider,
  hasAccount,
  needsAccount = true,
}: {
  hasProvider: boolean;
  hasAccount: boolean;
  needsAccount?: boolean;
}) {
  if (hasProvider && (hasAccount || !needsAccount)) return null;
  return (
    <Card className="space-y-4 text-center">
      <p className="text-sm text-zinc-600 dark:text-zinc-400">この機能を使う前に、次の設定をしてください。</p>
      <div className="flex flex-wrap justify-center gap-2">
        {!hasProvider && <ButtonLink href="/settings/ai">AIのAPIキーを登録する</ButtonLink>}
        {needsAccount && !hasAccount && (
          <ButtonLink href="/accounts/new" variant={hasProvider ? "primary" : "secondary"}>
            運用アカウントを作る
          </ButtonLink>
        )}
      </div>
    </Card>
  );
}
