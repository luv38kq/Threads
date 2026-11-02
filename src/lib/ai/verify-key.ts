import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import type { AiProvider } from "@/lib/supabase/database.types";

// APIキーが本当に使えるかを確認します。
// 各社の「使えるモデル一覧」を取得するだけなので、AIの利用料金はかかりません。

export type VerifyResult =
  | { ok: true; models: string[] }
  | { ok: false; message: string };

const TIMEOUT_MS = 15_000;

export async function verifyApiKey(
  provider: AiProvider,
  apiKey: string,
): Promise<VerifyResult> {
  try {
    switch (provider) {
      case "anthropic":
        return await verifyAnthropic(apiKey);
      case "openai":
        return await verifyOpenAI(apiKey);
      case "gemini":
        return await verifyGemini(apiKey);
    }
  } catch (error) {
    console.error(`[verifyApiKey] ${provider}`, error instanceof Error ? error.message : error);
    return {
      ok: false,
      message: "AIの会社のサーバーにつながりませんでした。少し待ってからもう一度お試しください。",
    };
  }
}

async function verifyAnthropic(apiKey: string): Promise<VerifyResult> {
  const client = new Anthropic({ apiKey, maxRetries: 1, timeout: TIMEOUT_MS });
  try {
    const models: string[] = [];
    for await (const model of client.models.list({ limit: 100 })) {
      models.push(model.id);
    }
    return { ok: true, models: sortModels(models) };
  } catch (error) {
    if (error instanceof Anthropic.AuthenticationError) {
      return { ok: false, message: "APIキーが正しくありません。コピーし直して、もう一度お試しください。" };
    }
    if (error instanceof Anthropic.PermissionDeniedError) {
      return { ok: false, message: "このAPIキーには利用権限がありません。Anthropic の管理画面で設定を確認してください。" };
    }
    if (error instanceof Anthropic.RateLimitError) {
      return { ok: false, message: "短時間に使いすぎています。少し待ってからお試しください。" };
    }
    throw error;
  }
}

async function verifyOpenAI(apiKey: string): Promise<VerifyResult> {
  const res = await fetch("https://api.openai.com/v1/models", {
    headers: { Authorization: `Bearer ${apiKey}` },
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  if (res.status === 401) {
    return { ok: false, message: "APIキーが正しくありません。コピーし直して、もう一度お試しください。" };
  }
  if (res.status === 429) {
    return { ok: false, message: "利用上限に達しているか、OpenAI の支払い設定が済んでいません。OpenAI の管理画面を確認してください。" };
  }
  if (!res.ok) throw new Error(`OpenAI responded ${res.status}`);
  const body = (await res.json()) as { data?: { id: string }[] };
  // 文章を作れる種類のモデルだけに絞る
  const models = (body.data ?? [])
    .map((m) => m.id)
    .filter((id) => /^(gpt-|o\d|chatgpt-)/.test(id))
    .filter((id) => !/(audio|realtime|transcribe|tts|image|search|embedding)/.test(id));
  return { ok: true, models: sortModels(models) };
}

async function verifyGemini(apiKey: string): Promise<VerifyResult> {
  const res = await fetch(
    "https://generativelanguage.googleapis.com/v1beta/models?pageSize=1000",
    {
      headers: { "x-goog-api-key": apiKey },
      signal: AbortSignal.timeout(TIMEOUT_MS),
    },
  );
  if (res.status === 400 || res.status === 401 || res.status === 403) {
    return { ok: false, message: "APIキーが正しくありません。Google AI Studio でキーを確認してください。" };
  }
  if (res.status === 429) {
    return { ok: false, message: "無料枠の上限に達しています。時間をおいてからお試しください。" };
  }
  if (!res.ok) throw new Error(`Gemini responded ${res.status}`);
  const body = (await res.json()) as {
    models?: { name: string; supportedGenerationMethods?: string[] }[];
  };
  const models = (body.models ?? [])
    .filter((m) => m.supportedGenerationMethods?.includes("generateContent"))
    .map((m) => m.name.replace(/^models\//, ""))
    .filter((id) => id.startsWith("gemini-"))
    .filter((id) => !/(embedding|image|tts|audio|live)/.test(id));
  return { ok: true, models: sortModels(models) };
}

function sortModels(models: string[]): string[] {
  return [...new Set(models)].sort((a, b) => b.localeCompare(a));
}
