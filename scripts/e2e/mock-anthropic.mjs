// 動作確認（E2Eテスト）専用：Claude API のまね。本物のAIは呼ばず、決まった答えを返します。
import http from "node:http";

const PATTERN = (body) => ({
  angle: "失敗談から入る共感型",
  hook_reason: "ターゲットの本音を代弁して手を止める",
  body,
  comments: ["続きです。まずは1日15分から始めました。", "詳しくはプロフィールのLINEで配っています。"],
});

function responseFor(system, prompt) {
  if (system.includes("そのまま投稿できる質の高い投稿案")) {
    // 1回目はわざと禁止表現を入れ、手直しの流れを確認する
    if (!prompt.includes("<problems>")) {
      return { patterns: [PATTERN("在宅ワークは誰でも簡単に始められます。\nでも最初の1週間が大事。"), PATTERN("子どもが寝たあとの30分。\nそれが私の在宅ワークの始まりでした。")] };
    }
    return { patterns: [PATTERN("在宅ワークは、今日から少しずつ始められます。\nでも最初の1週間が大事。"), PATTERN("子どもが寝たあとの30分。\nそれが私の在宅ワークの始まりでした。")] };
  }
  if (system.includes("利用者が書いた投稿を分析")) {
    return {
      overall_score: 68,
      summary: "共感は作れているが、冒頭がやや説明的です。",
      criteria: [
        { key: "hook", score: 3, good: "具体的な時間が入っている", issues: "1行目が長い", improvements: ["「30分」を1行目の頭に出す"] },
        { key: "flow", score: 4, good: "短い文で読みやすい", issues: "", improvements: [] },
        { key: "comment_guidance", score: 2, good: "続きがある", issues: "コメント欄への誘導がない", improvements: ["本文の最後に「続きはコメント欄へ」"] },
        { key: "profile_guidance", score: 3, good: "LINEに触れている", issues: "唐突", improvements: ["体験談の流れで自然に"] },
        { key: "target_fit", score: 7, good: "子育て中の人に刺さる", issues: "", improvements: [] },
      ],
      hook_alternatives: ["30分だけ。それで人生が変わった。", "子どもが寝たあと、何してますか？", "在宅ワーク、最初の1週間で9割決まる。"],
      priorities: ["冒頭を短くする", "コメント欄へ誘導する"],
      keep: ["子どもが寝たあとの30分という具体性"],
    };
  }
  if (system.includes("リライトします")) {
    return {
      patterns: [
        {
          angle: "冒頭を短くして誘導を追加",
          changes: ["1行目を短くした", "コメント欄への誘導を追加"],
          kept: ["30分という具体性"],
          body: "30分だけ。\n子どもが寝たあとの時間で、在宅ワークを始めました。\n続きはコメント欄へ👇",
          comments: ["最初の1週間でやったこと。", "詳しくはプロフィールのLINEで。"],
        },
      ],
    };
  }
  if (system.includes("競合アカウントで反応が良かった投稿を分析")) {
    return {
      summary: "本音の代弁と数字で手を止める投稿が強い。",
      hook_patterns: [{ name: "本音の代弁型", description: "読者が言えないことを言う", why_it_works: "共感", examples: ["正直、毎日しんどい。"] }],
      structure_patterns: [{ name: "失敗→気づき→行動", steps: ["失敗", "気づき", "行動"], why_it_works: "物語で最後まで読める" }],
      reply_triggers: [{ feature: "二択の問いかけ", description: "答えやすい", example: "あなたはどっち？" }],
      word_techniques: [{ technique: "数字の具体化", description: "信頼感", example: "30分" }],
      templates: [{ name: "本音テンプレ", template: "正直、【〇〇】がしんどい。\nでも【〇〇】で変わった。", how_to_use: "悩みと解決を入れる", example: "正直、家事と仕事の両立がしんどい。" }],
      post_ideas: [{ theme: "在宅ワークの最初の1週間", angle: "失敗→気づき→行動" }],
    };
  }
  return { error: "unknown prompt" };
}

export function createMockAnthropic() {
  const requests = [];
  const server = http.createServer(async (req, res) => {
    let raw = "";
    for await (const chunk of req) raw += chunk;
    const path = new URL(req.url, "http://x").pathname;
    const auth = req.headers["x-api-key"] ?? (req.headers.authorization ?? "").replace(/^Bearer /, "");
    if (auth !== "sk-ant-e2e-valid-key") {
      res.writeHead(401, { "Content-Type": "application/json" });
      return res.end(JSON.stringify({ type: "error", error: { type: "authentication_error", message: "invalid key" } }));
    }
    if (req.method === "GET" && path === "/v1/models") {
      res.writeHead(200, { "Content-Type": "application/json" });
      const data = ["claude-opus-5-5", "claude-sonnet-5-5", "claude-haiku-5-5"].map((id) => ({
        id,
        type: "model",
        display_name: id,
        created_at: "2026-01-01T00:00:00Z",
      }));
      return res.end(JSON.stringify({ data, has_more: false, first_id: data[0].id, last_id: data.at(-1).id }));
    }
    if (req.method === "POST" && path === "/v1/messages") {
      const body = JSON.parse(raw);
      requests.push({ body, headers: req.headers });
      const system = typeof body.system === "string" ? body.system : JSON.stringify(body.system);
      const prompt = body.messages.map((m) => (typeof m.content === "string" ? m.content : JSON.stringify(m.content))).join("\n");
      const answer = responseFor(system, prompt);
      res.writeHead(200, { "Content-Type": "application/json" });
      return res.end(
        JSON.stringify({
          id: `msg_${requests.length}`,
          type: "message",
          role: "assistant",
          model: body.model,
          content: [{ type: "text", text: JSON.stringify(answer) }],
          stop_reason: "end_turn",
          stop_sequence: null,
          usage: { input_tokens: 100, output_tokens: 100 },
        }),
      );
    }
    res.writeHead(404);
    res.end();
  });
  return { server, requests };
}
