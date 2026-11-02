import { afterEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { AiError, generateStructured } from "./structured";

// 本物のAIには接続せず、各社のサーバーの返事を偽物に差し替えて確認します

const schema = z.object({
  patterns: z.array(z.object({ body: z.string(), comments: z.array(z.string()) })),
});
const answer = { patterns: [{ body: "本文", comments: ["続き"] }] };

type Captured = { url: string; init: RequestInit; headers: Headers; body: Record<string, unknown> };

function mockFetch(respond: (url: string) => Response) {
  const calls: Captured[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const request = input instanceof Request ? input : new Request(input, init);
      const text = await request.clone().text();
      calls.push({
        url: request.url,
        init: init ?? {},
        headers: request.headers,
        body: text ? JSON.parse(text) : {},
      });
      return respond(request.url);
    }),
  );
  return calls;
}

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("Claude", () => {
  const message = (text: string, stop_reason = "end_turn") => ({
    id: "msg_1",
    type: "message",
    role: "assistant",
    model: "claude-opus-5-5",
    content: [{ type: "text", text }],
    stop_reason,
    stop_sequence: null,
    usage: { input_tokens: 10, output_tokens: 10 },
  });

  it("決まった形（JSON）を指定して呼び出し、答えを読み取る", async () => {
    const calls = mockFetch(() => json(message(JSON.stringify(answer))));
    const result = await generateStructured({
      provider: "anthropic",
      apiKey: "sk-ant-test",
      model: "claude-opus-5-5",
      system: "sys",
      prompt: "user",
      schema,
    });
    expect(result).toEqual(answer);
    const call = calls[0];
    expect(call.url).toContain("/v1/messages");
    expect(call.headers.get("authorization") ?? call.headers.get("x-api-key")).toContain("sk-ant-test");
    expect((call.body.output_config as { format: { type: string } }).format.type).toBe("json_schema");
    expect(call.body.system).toBe("sys");
    // 対応モデルでは、断られたときに自動で引き継ぐ設定を付ける
    expect(call.body.fallbacks).toBe("default");
    expect(call.headers.get("anthropic-beta")).toContain("server-side-fallback-2026-07-01");
  });

  it("対応していないモデルでは引き継ぎ設定を付けない", async () => {
    const calls = mockFetch(() => json(message(JSON.stringify(answer))));
    await generateStructured({ provider: "anthropic", apiKey: "k", model: "claude-haiku-5-5", system: "s", prompt: "p", schema });
    expect(calls[0].body.fallbacks).toBeUndefined();
  });

  it("キーが無効なら、日本語の案内を返す", async () => {
    mockFetch(() => json({ type: "error", error: { type: "authentication_error", message: "invalid x-api-key" } }, 401));
    await expect(
      generateStructured({ provider: "anthropic", apiKey: "bad", model: "claude-opus-5-5", system: "s", prompt: "p", schema }),
    ).rejects.toMatchObject({ userMessage: expect.stringContaining("APIキーが無効") });
  });

  it("AIが断った場合も分かる言葉で伝える", async () => {
    mockFetch(() => json(message("", "refusal")));
    await expect(
      generateStructured({ provider: "anthropic", apiKey: "k", model: "claude-opus-5-5", system: "s", prompt: "p", schema }),
    ).rejects.toMatchObject({ userMessage: expect.stringContaining("断りました") });
  });
});

describe("ChatGPT", () => {
  it("strict な JSON Schema を指定して呼び出す", async () => {
    const calls = mockFetch(() =>
      json({ choices: [{ finish_reason: "stop", message: { content: JSON.stringify(answer) } }] }),
    );
    const result = await generateStructured({ provider: "openai", apiKey: "sk-test", model: "gpt-x", system: "s", prompt: "p", schema });
    expect(result).toEqual(answer);
    const body = calls[0].body as { response_format: { json_schema: { strict: boolean; schema: Record<string, unknown> } }; messages: unknown[] };
    expect(calls[0].url).toBe("https://api.openai.com/v1/chat/completions");
    expect(calls[0].headers.get("authorization")).toBe("Bearer sk-test");
    expect(body.response_format.json_schema.strict).toBe(true);
    expect(body.response_format.json_schema.schema.$schema).toBeUndefined();
    expect(body.response_format.json_schema.schema.additionalProperties).toBe(false);
  });

  it("残高不足を見分ける", async () => {
    mockFetch(() => json({ error: { code: "insufficient_quota" } }, 429));
    await expect(
      generateStructured({ provider: "openai", apiKey: "k", model: "gpt-x", system: "s", prompt: "p", schema }),
    ).rejects.toMatchObject({ userMessage: expect.stringContaining("残高が不足") });
  });
});

describe("Gemini", () => {
  it("Gemini が受け付けない項目を取り除いて呼び出す", async () => {
    const calls = mockFetch(() =>
      json({ candidates: [{ finishReason: "STOP", content: { parts: [{ text: JSON.stringify(answer) }] } }] }),
    );
    const result = await generateStructured({ provider: "gemini", apiKey: "AIza", model: "gemini-x", system: "s", prompt: "p", schema });
    expect(result).toEqual(answer);
    expect(calls[0].url).toContain("/models/gemini-x:generateContent");
    expect(calls[0].headers.get("x-goog-api-key")).toBe("AIza");
    const config = calls[0].body.generationConfig as { responseSchema: unknown; responseMimeType: string };
    expect(config.responseMimeType).toBe("application/json");
    expect(JSON.stringify(config.responseSchema)).not.toContain("additionalProperties");
  });

  it("答えの形が違えばエラーにする", async () => {
    mockFetch(() => json({ candidates: [{ content: { parts: [{ text: '{"patterns":"x"}' }] } }] }));
    await expect(
      generateStructured({ provider: "gemini", apiKey: "k", model: "gemini-x", system: "s", prompt: "p", schema }),
    ).rejects.toBeInstanceOf(AiError);
  });
});
