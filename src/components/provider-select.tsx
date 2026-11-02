import { Field, Select } from "@/components/ui";
import { PROVIDERS } from "@/lib/ai/providers";
import type { AiProvider } from "@/lib/supabase/database.types";

/** 登録済みのAIから、今回使うAIを選ぶ欄 */
export function ProviderSelect({
  providers,
  defaultValue,
  error,
}: {
  providers: { provider: AiProvider; model: string }[];
  defaultValue?: string;
  error?: string;
}) {
  return (
    <Field label="使うAI" htmlFor="provider" error={error} hint="モデルはAI設定で変更できます">
      <Select id="provider" name="provider" defaultValue={defaultValue}>
        {providers.map((p) => (
          <option key={p.provider} value={p.provider}>
            {PROVIDERS[p.provider].label}（{p.model}）
          </option>
        ))}
      </Select>
    </Field>
  );
}

export function pickProvider(
  providers: { provider: AiProvider }[],
  preferred: AiProvider | null,
): AiProvider | undefined {
  if (preferred && providers.some((p) => p.provider === preferred)) return preferred;
  return providers[0]?.provider;
}
