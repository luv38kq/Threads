import type { AiProvider } from "@/lib/supabase/database.types";

// 利用者が選べるAIの一覧と、画面に出す説明文。
// モデル名は時期によって変わるため固定せず、APIキーの確認時に
// 「そのキーで実際に使えるモデル一覧」を各社から取得して選んでもらいます。

export type ProviderInfo = {
  id: AiProvider;
  label: string;
  company: string;
  keyUrl: string;
  keyPrefixHint: string;
  note: string;
  /** 一覧に見つかれば最初から選んでおくモデル（見つからなければ一覧の先頭） */
  preferredModels: string[];
};

export const PROVIDERS: Record<AiProvider, ProviderInfo> = {
  anthropic: {
    id: "anthropic",
    label: "Claude",
    company: "Anthropic",
    keyUrl: "https://platform.claude.com/settings/keys",
    keyPrefixHint: "sk-ant-",
    note: "日本語の自然さと、細かいルールを守る力が強いAIです。使った分だけ料金がかかります。",
    preferredModels: ["claude-opus-5-5", "claude-sonnet-5-5", "claude-haiku-5-5"],
  },
  openai: {
    id: "openai",
    label: "ChatGPT",
    company: "OpenAI",
    keyUrl: "https://platform.openai.com/api-keys",
    keyPrefixHint: "sk-",
    note: "ChatGPT の会社のAIです。ChatGPT の月額プランとは別に、API の料金がかかります。",
    preferredModels: [],
  },
  gemini: {
    id: "gemini",
    label: "Gemini",
    company: "Google",
    keyUrl: "https://aistudio.google.com/apikey",
    keyPrefixHint: "AIza",
    note: "回数制限つきの無料枠があります。無料枠では入力内容が Google のサービス改善に使われる場合があります（条件は時期により変わります）。",
    preferredModels: [],
  },
};

export const PROVIDER_IDS = Object.keys(PROVIDERS) as AiProvider[];

export function isProvider(value: unknown): value is AiProvider {
  return typeof value === "string" && value in PROVIDERS;
}

export function pickDefaultModel(provider: AiProvider, models: string[]): string {
  for (const preferred of PROVIDERS[provider].preferredModels) {
    if (models.includes(preferred)) return preferred;
  }
  return models[0] ?? "";
}
