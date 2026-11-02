import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";
import type { AiProvider } from "@/lib/supabase/database.types";

// 3社のAIに同じ形で「決まった形（JSON）の答え」を出してもらうための共通の入口。
// 利用者本人のAPIキーで呼び出し、答えは必ず zod で形をチェックしてから返します。

export class AiError extends Error {
  constructor(
    message: string,
    /** 画面にそのまま出してよい日本語のメッセージ */
    public readonly userMessage: string,
  ) {
    super(message);
    this.name = "AiError";
  }
}

export type StructuredRequest<T extends z.ZodType> = {
  provider: AiProvider;
  apiKey: string;
  model: string;
  system: string;
  prompt: string;
  schema: T;
  maxTokens?: number;
};

const TIMEOUT_MS = 180_000;

export async function generateStructured<T extends z.ZodType>(
  req: StructuredRequest<T>,
): Promise<z.infer<T>> {
  let raw: unknown;
  switch (req.provider) {
    case "anthropic":
      raw = await callAnthropic(req);
      break;
    case "openai":
      raw = await callOpenAI(req);
      break;
    case "gemini":
      raw = await callGemini(req);
      break;
  }
  const parsed = req.schema.safeParse(raw);
  if (!parsed.success) {
    throw new AiError(
      `invalid structured output: ${parsed.error.message}`,
      "AIの答えの形が正しくありませんでした。もう一度お試しください。",
    );
  }
  return parsed.data;
}

// ---------------------------------------------------------------------
// Claude（Anthropic 公式SDK）
// ---------------------------------------------------------------------

// 安全上の理由でAIが回答を断った場合に、自動で別のモデルが引き継ぐ設定（Anthropic 側の機能）。
// 対応しているモデルでだけ有効にします。
const SERVER_FALLBACK_MODELS = new Set(["claude-opus-5-5", "claude-sonnet-5-5"]);

async function callAnthropic<T extends z.ZodType>(req: StructuredRequest<T>): Promise<unknown> {
  const client = new Anthropic({ apiKey: req.apiKey, maxRetries: 2, timeout: TIMEOUT_MS });
  const fallback = SERVER_FALLBACK_MODELS.has(req.model)
    ? { betas: ["server-side-fallback-2026-07-01"], fallbacks: "default" as const }
    : {};
  try {
    // 「決まった形（JSON）」で答えるよう指定する。答えの読み取りと形のチェックは自分で行い、
    // 断られた・途中で切れた場合を先に見分けられるようにしている
    const response = await client.beta.messages.create({
      model: req.model,
      max_tokens: req.maxTokens ?? 16000,
      system: req.system,
      messages: [{ role: "user", content: req.prompt }],
      output_config: { format: { type: "json_schema", schema: jsonSchemaFor(req.schema) } },
      ...fallback,
    });
    if (response.stop_reason === "refusal") {
      throw new AiError("refusal", "AIがこの内容の作成を断りました。テーマや表現を変えてお試しください。");
    }
    if (response.stop_reason === "max_tokens") {
      throw new AiError("max_tokens", "AIの答えが長すぎて途中で切れました。パターン数を減らしてお試しください。");
    }
    const text = response.content
      .map((block) => (block.type === "text" ? block.text : ""))
      .join("");
    return parseJsonText(text);
  } catch (error) {
    if (error instanceof AiError) throw error;
    throw mapAnthropicError(error);
  }
}

function mapAnthropicError(error: unknown): AiError {
  const message = error instanceof Error ? error.message : String(error);
  if (error instanceof Anthropic.AuthenticationError) {
    return new AiError(message, "Claude のAPIキーが無効になっています。AI設定で登録し直してください。");
  }
  if (error instanceof Anthropic.PermissionDeniedError) {
    return new AiError(message, "このAPIキーでは、選んだモデルを使う権限がありません。AI設定で別のモデルを選んでください。");
  }
  if (error instanceof Anthropic.NotFoundError) {
    return new AiError(message, "選んだモデルが見つかりません。AI設定でモデルを選び直してください。");
  }
  if (error instanceof Anthropic.RateLimitError) {
    return new AiError(message, "Claude の利用上限に達しました。少し時間をおいてからお試しください。");
  }
  if (error instanceof Anthropic.BadRequestError) {
    if (/credit|billing|balance/i.test(message)) {
      return new AiError(message, "Claude のクレジット残高が不足しています。Anthropic の管理画面でチャージしてください。");
    }
    return new AiError(message, "選んだモデルではこの機能を使えない可能性があります。AI設定で新しいモデルを選んでお試しください。");
  }
  if (error instanceof Anthropic.InternalServerError) {
    return new AiError(message, "Claude が混み合っています。少し時間をおいてからお試しください。");
  }
  if (error instanceof Anthropic.APIConnectionError) {
    return new AiError(message, "Claude につながりませんでした。少し時間をおいてからお試しください。");
  }
  return new AiError(message, "AIの呼び出しでエラーが発生しました。もう一度お試しください。");
}

// ---------------------------------------------------------------------
// ChatGPT（OpenAI）
// ---------------------------------------------------------------------

function jsonSchemaFor(schema: z.ZodType): Record<string, unknown> {
  const json = z.toJSONSchema(schema) as Record<string, unknown>;
  delete json.$schema;
  return json;
}

async function callOpenAI<T extends z.ZodType>(req: StructuredRequest<T>): Promise<unknown> {
  const res = await safeFetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${req.apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: req.model,
      max_completion_tokens: req.maxTokens ?? 16000,
      messages: [
        { role: "system", content: req.system },
        { role: "user", content: req.prompt },
      ],
      response_format: {
        type: "json_schema",
        json_schema: { name: "result", strict: true, schema: jsonSchemaFor(req.schema) },
      },
    }),
  });

  if (!res.ok) {
    const text = await res.text();
    if (res.status === 401) throw new AiError(text, "ChatGPT のAPIキーが無効になっています。AI設定で登録し直してください。");
    if (res.status === 404) throw new AiError(text, "選んだモデルが見つかりません。AI設定でモデルを選び直してください。");
    if (res.status === 429) {
      if (/insufficient_quota/.test(text)) {
        throw new AiError(text, "OpenAI の残高が不足しています。OpenAI の管理画面で支払い設定を確認してください。");
      }
      throw new AiError(text, "ChatGPT の利用上限に達しました。少し時間をおいてからお試しください。");
    }
    if (res.status === 400) throw new AiError(text, "選んだモデルではこの機能を使えない可能性があります。AI設定で新しいモデルを選んでお試しください。");
    throw new AiError(text, "ChatGPT が混み合っています。少し時間をおいてからお試しください。");
  }

  const body = (await res.json()) as {
    choices?: { finish_reason?: string; message?: { content?: string | null; refusal?: string | null } }[];
  };
  const choice = body.choices?.[0];
  if (choice?.message?.refusal) {
    throw new AiError("refusal", "AIがこの内容の作成を断りました。テーマや表現を変えてお試しください。");
  }
  if (choice?.finish_reason === "length") {
    throw new AiError("length", "AIの答えが長すぎて途中で切れました。パターン数を減らしてお試しください。");
  }
  return parseJsonText(choice?.message?.content);
}

// ---------------------------------------------------------------------
// Gemini（Google）
// ---------------------------------------------------------------------

/** Gemini が受け付けない項目（additionalProperties など）を取り除く */
function geminiSchema(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(geminiSchema);
  if (value && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [key, v] of Object.entries(value)) {
      if (key === "additionalProperties" || key === "$schema") continue;
      out[key] = geminiSchema(v);
    }
    return out;
  }
  return value;
}

async function callGemini<T extends z.ZodType>(req: StructuredRequest<T>): Promise<unknown> {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(req.model)}:generateContent`;
  const res = await safeFetch(url, {
    method: "POST",
    headers: { "x-goog-api-key": req.apiKey, "Content-Type": "application/json" },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: req.system }] },
      contents: [{ role: "user", parts: [{ text: req.prompt }] }],
      generationConfig: {
        maxOutputTokens: req.maxTokens ?? 16000,
        responseMimeType: "application/json",
        responseSchema: geminiSchema(jsonSchemaFor(req.schema)),
      },
    }),
  });

  if (!res.ok) {
    const text = await res.text();
    if (res.status === 400 && /API key/i.test(text)) {
      throw new AiError(text, "Gemini のAPIキーが無効になっています。AI設定で登録し直してください。");
    }
    if (res.status === 401 || res.status === 403) {
      throw new AiError(text, "Gemini のAPIキーが無効になっています。AI設定で登録し直してください。");
    }
    if (res.status === 404) throw new AiError(text, "選んだモデルが見つかりません。AI設定でモデルを選び直してください。");
    if (res.status === 429) throw new AiError(text, "Gemini の利用上限（無料枠など）に達しました。時間をおいてからお試しください。");
    if (res.status === 400) throw new AiError(text, "選んだモデルではこの機能を使えない可能性があります。AI設定で新しいモデルを選んでお試しください。");
    throw new AiError(text, "Gemini が混み合っています。少し時間をおいてからお試しください。");
  }

  const body = (await res.json()) as {
    promptFeedback?: { blockReason?: string };
    candidates?: { finishReason?: string; content?: { parts?: { text?: string; thought?: boolean }[] } }[];
  };
  if (body.promptFeedback?.blockReason) {
    throw new AiError(body.promptFeedback.blockReason, "AIがこの内容の作成を断りました。テーマや表現を変えてお試しください。");
  }
  const candidate = body.candidates?.[0];
  if (candidate?.finishReason === "MAX_TOKENS") {
    throw new AiError("MAX_TOKENS", "AIの答えが長すぎて途中で切れました。パターン数を減らしてお試しください。");
  }
  if (candidate?.finishReason === "SAFETY" || candidate?.finishReason === "PROHIBITED_CONTENT") {
    throw new AiError(candidate.finishReason, "AIがこの内容の作成を断りました。テーマや表現を変えてお試しください。");
  }
  const text = (candidate?.content?.parts ?? [])
    .filter((p) => !p.thought)
    .map((p) => p.text ?? "")
    .join("");
  return parseJsonText(text);
}

// ---------------------------------------------------------------------
// 共通
// ---------------------------------------------------------------------

async function safeFetch(url: string, init: RequestInit): Promise<Response> {
  try {
    return await fetch(url, { ...init, signal: AbortSignal.timeout(TIMEOUT_MS) });
  } catch (error) {
    throw new AiError(
      error instanceof Error ? error.message : String(error),
      "AIにつながりませんでした（時間切れ）。少し時間をおいてからお試しください。",
    );
  }
}

function parseJsonText(text: string | null | undefined): unknown {
  if (!text) {
    throw new AiError("empty response", "AIから答えが返ってきませんでした。もう一度お試しください。");
  }
  try {
    return JSON.parse(text);
  } catch {
    throw new AiError("invalid json", "AIの答えを読み取れませんでした。もう一度お試しください。");
  }
}
