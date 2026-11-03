// =====================================================================
// 画面を実際に操作する動作確認（E2Eテスト）
//   node scripts/e2e/run.mjs
//
// 使い捨ての PostgreSQL ＋ Supabase のまね（mock-supabase.mjs）＋ Claude のまね（mock-anthropic.mjs）
// を起動し、本番と同じビルドのアプリをブラウザ（Playwright）で操作します。
// 必要なもの：PostgreSQL 15以上、Playwright（Chromium）
// =====================================================================

import { execSync, spawn } from "node:child_process";
import { randomBytes } from "node:crypto";
import { mkdirSync, readdirSync, rmSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";
import { createMockAnthropic } from "./mock-anthropic.mjs";
import { createMockSupabase } from "./mock-supabase.mjs";

const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT_PATH ?? "playwright");

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const WORK = join(ROOT, ".e2e");
const SHOTS = process.env.E2E_SCREENSHOTS ?? join(WORK, "screenshots");
const PG_PORT = 54330;
const SUPA_PORT = 54321;
const AI_PORT = 54322;
const APP_PORT = 3100;
const APP = `http://localhost:${APP_PORT}`;
const PUBLISHABLE = "sb_publishable_e2e";
const SECRET = "sb_secret_e2e";

const PG_BIN = dirname(
  (() => {
    try {
      return execSync("command -v initdb", { encoding: "utf8" }).trim();
    } catch {
      const versions = readdirSync("/usr/lib/postgresql").sort();
      return `/usr/lib/postgresql/${versions.at(-1)}/bin/initdb`;
    }
  })(),
);
const asPostgres = (cmd) =>
  process.getuid?.() === 0 ? `su postgres -s /bin/bash -c ${JSON.stringify(cmd)}` : cmd;

const results = [];
let appLogRef = () => "";
const appLogTail = () => appLogRef().slice(-3000);
function check(ok, label) {
  results.push({ ok, label });
  console.log(`${ok ? "✅" : "❌"} ${label}`);
}

const cleanups = [];
async function cleanup() {
  for (const fn of cleanups.reverse()) {
    try {
      await fn();
    } catch {
      // 後片付けの失敗は無視
    }
  }
}

async function main() {
  // ---------------------------------------------------------------- DB
  rmSync(WORK, { recursive: true, force: true });
  mkdirSync(join(WORK, "pg"), { recursive: true });
  mkdirSync(SHOTS, { recursive: true });
  if (process.getuid?.() === 0) execSync(`chown -R postgres ${join(WORK, "pg")}`);
  execSync(asPostgres(`'${PG_BIN}/initdb' -D '${WORK}/pg/data' -U postgres -E UTF8 --locale=C.UTF-8 >/dev/null`));
  execSync(
    asPostgres(`'${PG_BIN}/pg_ctl' -D '${WORK}/pg/data' -o '-p ${PG_PORT} -k ${WORK}/pg -c listen_addresses=' -l '${WORK}/pg/log' -w start >/dev/null`),
  );
  cleanups.push(() => execSync(asPostgres(`'${PG_BIN}/pg_ctl' -D '${WORK}/pg/data' -m immediate stop >/dev/null 2>&1`)));
  const psql = (file) =>
    execSync(`'${PG_BIN}/psql' -h '${WORK}/pg' -p ${PG_PORT} -U postgres -d postgres -v ON_ERROR_STOP=1 -q -f '${file}'`, {
      stdio: "pipe",
    });
  psql(join(ROOT, "supabase/tests/00_supabase_shim.sql"));
  for (const f of readdirSync(join(ROOT, "supabase/migrations")).sort()) psql(join(ROOT, "supabase/migrations", f));

  const pool = new pg.Pool({ host: join(WORK, "pg"), port: PG_PORT, user: "postgres", database: "postgres", max: 10 });
  cleanups.push(() => pool.end());

  // ---------------------------------------------------------------- まねサーバー
  const supa = createMockSupabase({ pool, jwtSecret: randomBytes(32).toString("hex"), publishableKey: PUBLISHABLE, secretKey: SECRET });
  await supa.setupAuthTables();
  await new Promise((r) => supa.server.listen(SUPA_PORT, "127.0.0.1", r));
  cleanups.push(() => {
    supa.server.closeAllConnections();
    return new Promise((r) => supa.server.close(r));
  });
  const ai = createMockAnthropic();
  await new Promise((r) => ai.server.listen(AI_PORT, "127.0.0.1", r));
  cleanups.push(() => {
    ai.server.closeAllConnections();
    return new Promise((r) => ai.server.close(r));
  });

  // ---------------------------------------------------------------- アプリ
  const env = {
    ...process.env,
    NEXT_PUBLIC_SUPABASE_URL: `http://127.0.0.1:${SUPA_PORT}`,
    NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: PUBLISHABLE,
    SUPABASE_SECRET_KEY: SECRET,
    ENCRYPTION_KEY: randomBytes(32).toString("base64"),
    NEXT_PUBLIC_SITE_URL: APP,
    ANTHROPIC_BASE_URL: `http://127.0.0.1:${AI_PORT}`,
    NEXT_TELEMETRY_DISABLED: "1",
  };
  if (!process.env.E2E_SKIP_BUILD) {
    console.log("アプリをビルドしています…");
    execSync("npm run build", { cwd: ROOT, env, stdio: "pipe" });
  }
  // 終了時にまとめて止められるよう、別のプロセスグループで起動する
  const app = spawn(join(ROOT, "node_modules/.bin/next"), ["start", "-p", String(APP_PORT)], {
    cwd: ROOT,
    env,
    stdio: ["ignore", "pipe", "pipe"],
    detached: true,
  });
  let appLog = "";
  app.stdout.on("data", (d) => (appLog += d));
  app.stderr.on("data", (d) => (appLog += d));
  appLogRef = () => appLog;
  cleanups.push(() => process.kill(-app.pid, "SIGKILL"));
  for (let i = 0; i < 60; i++) {
    try {
      await fetch(APP);
      break;
    } catch {
      await new Promise((r) => setTimeout(r, 500));
    }
  }

  const browser = await chromium.launch();
  cleanups.push(() => browser.close());
  const shot = (page, name) => page.screenshot({ path: join(SHOTS, `${name}.png`), fullPage: true });

  // ---------------------------------------------------------------- 1. 管理者の準備（README 手順4 と同じ）
  await supa.createUser("admin@example.com", "admin-password-1");
  await pool.query(
    "update public.profiles set is_admin = true, status = 'approved', approved_at = now(), display_name = '管理者' where email = 'admin@example.com'",
  );

  const adminCtx = await browser.newContext();
  const admin = await adminCtx.newPage();
  await admin.goto(`${APP}/admin`);
  check(admin.url().includes("/login"), "未ログインで管理画面を開くとログイン画面へ移動する");
  await admin.fill("#email", "admin@example.com");
  await admin.fill("#password", "admin-password-1");
  await admin.click('button[type="submit"]');
  await admin.waitForURL(/\/admin/);
  check(await admin.getByText("受付停止中").isVisible(), "合言葉が未設定なら「受付停止中」と表示される");
  await admin.fill("#passphrase", "threads-2026-secret");
  await admin.click('button:has-text("合言葉を設定")');
  await admin.getByText("合言葉を変更しました").waitFor();
  check(await admin.getByText("受付中").first().isVisible(), "管理者が合言葉を設定できる");

  // ---------------------------------------------------------------- 2. 購入者の会員登録
  const userCtx = await browser.newContext();
  const user = await userCtx.newPage();
  await user.goto(`${APP}/signup`);
  const fillSignup = async (passphrase) => {
    await user.fill("#displayName", "テスト購入者");
    await user.fill("#brainName", "brain_tester");
    await user.fill("#email", "buyer@example.com");
    await user.fill("#password", "buyer-password-1");
    await user.fill("#passphrase", passphrase);
    await user.click('button[type="submit"]');
  };
  await fillSignup("wrong-passphrase");
  await user.getByText("合言葉が違います").waitFor();
  check(true, "間違った合言葉では登録できない");
  await fillSignup("threads-2026-secret");
  await user.waitForURL(/\/pending/);
  check(await user.getByText("承認をお待ちください").isVisible(), "正しい合言葉で登録すると「承認待ち」になる");
  await shot(user, "01-pending");
  await user.goto(`${APP}/accounts/new`);
  check(user.url().includes("/pending"), "承認前は会員ページを開けない");

  // ---------------------------------------------------------------- 3. 管理者が承認
  await admin.goto(`${APP}/admin`);
  const card = admin.locator("div.rounded-xl", { hasText: "buyer@example.com" });
  check(await card.getByText("合言葉OK").isVisible(), "管理画面で「合言葉OK」の購入者が見える");
  check(await card.getByText("brain_tester").isVisible(), "管理画面で Brain のユーザー名が見える");
  await card.locator('select[name="status"]').selectOption("approved");
  await card.locator('input[name="adminNote"]').fill("Brainで購入確認済み");
  await card.locator('button:has-text("保存")').click();
  await admin.getByText("利用者の設定を保存しました").waitFor();
  check(!(await admin.getByText("buyer@example.com").isVisible()), "承認すると「承認待ち」の一覧から消え、保存したことが表示される");
  await admin.goto(`${APP}/admin?status=approved`);
  check(await admin.getByText("buyer@example.com").isVisible(), "承認した人は「利用中」の一覧に表示される");
  await shot(admin, "02-admin");

  // ---------------------------------------------------------------- 4. アカウント作成
  await user.goto(`${APP}/dashboard`);
  check(user.url().includes("/dashboard"), "承認されるとホームを開ける");
  await user.goto(`${APP}/accounts/new`);
  await user.fill("#name", "副業垢");
  await user.fill("#targetAudience", "30代の子育て中の女性");
  await user.fill("#goal", "プロフィールのLINE登録");
  await user.fill("#writingStyle", "語尾は「です」。1文ごとに改行");
  await user.fill("#bannedExpressions", "誰でも簡単\n絶対稼げる");
  await user.click('button:has-text("アカウントを作成")');
  await user.waitForURL(/\/accounts\/[0-9a-f-]+\?saved=1/);
  check(await user.getByText("保存しました").isVisible(), "アカウントを作成できる");
  const accountUrl = user.url().split("?")[0];
  await user.fill("#knowledge-title", "主力商品");
  await user.fill("#knowledge-content", "在宅ワーク入門講座（月額980円）");
  await user.click('button:has-text("追加する")');
  await user.getByText("ナレッジを追加しました").waitFor();
  check(await user.getByText("在宅ワーク入門講座（月額980円）").isVisible(), "ナレッジを追加できる");

  // ---------------------------------------------------------------- 5. APIキー登録
  await user.goto(`${APP}/settings/ai`);
  const claudeCard = user.locator("div.rounded-xl", { has: user.getByRole("heading", { name: "Claude" }) });
  await claudeCard.locator('input[name="apiKey"]').fill("sk-ant-wrong-key-0000");
  await claudeCard.locator('button:has-text("接続を確認して保存")').click();
  await claudeCard.getByText("APIキーが正しくありません").waitFor();
  check(true, "間違ったAPIキーは保存されない");
  await claudeCard.locator('input[name="apiKey"]').fill("sk-ant-e2e-valid-key");
  await claudeCard.locator('button:has-text("接続を確認して保存")').click();
  await claudeCard.getByText("登録済み").waitFor();
  check(await claudeCard.getByText("••••-key").isVisible(), "正しいAPIキーは暗号化して保存され、末尾4文字だけ表示される");
  const stored = await pool.query("select encrypted_key from public.ai_credentials");
  check(stored.rows.length === 1 && !stored.rows[0].encrypted_key.includes("sk-ant"), "データベースにはAPIキーが暗号化された形でしか残らない");
  await shot(user, "03-ai-settings");

  // ---------------------------------------------------------------- 5-2. 文章のクセの読み取り
  await user.goto(accountUrl);
  await user.fill("#styleSamples", "正直に言うと、在宅ワークは甘くないです。\nでも、わたしは続けてよかったと思っています。\n子どもが寝たあとの30分だけ。\nそれでも半年で景色が変わりました。\nあなたは、夜の30分を何に使っていますか？");
  await user.click('button:has-text("変更を保存")');
  await user.waitForURL(/saved=1/);
  user.once("dialog", (d) => d.accept());
  await user.click('button:has-text("見本から読み取る")');
  await user.getByText("文章のクセを読み取って").waitFor({ timeout: 60000 });
  check((await user.inputValue("#writingStyle")).includes("一人称：わたし"), "過去の投稿の見本から、文章のクセをAIで読み取って保存できる");

  // ---------------------------------------------------------------- 6. 投稿生成
  await user.goto(`${APP}/generate`);
  await user.fill("#theme", "在宅ワークの始め方");
  await user.selectOption("#patternCount", "2");
  await user.click('button:has-text("投稿案を作る")');
  await user.waitForURL(/\/generate\/[0-9a-f-]+$/, { timeout: 60000 });
  const genUrl = user.url();
  check(await user.getByText("子どもが寝たあとの30分。").first().isVisible(), "投稿生成の結果が表示される");
  check(!(await user.content()).includes("誰でも簡単"), "禁止表現は自動で手直しされ、結果に残らない");
  const genCalls = ai.requests.filter((r) => r.body.system.includes("そのまま投稿できる質の高い投稿案"));
  check(genCalls.length === 2, "禁止表現があったときだけ、AIにもう1回だけ直してもらう");
  check(genCalls[0].body.messages[0].content.includes("在宅ワーク入門講座"), "ナレッジがAIへの指示に含まれる");
  check(genCalls[0].body.output_config?.format?.type === "json_schema", "AIに決まった形（JSON）で答えるよう指定している");
  await shot(user, "04-generate-result");

  // ---------------------------------------------------------------- 7. 分析 → リライト
  await user.click('a:has-text("この投稿を分析する") >> nth=0');
  await user.waitForURL(/\/analyze\?/);
  check((await user.inputValue("#body")).includes("在宅ワーク"), "生成結果を分析画面に引き継げる");
  await user.click('button:has-text("分析する")');
  await user.waitForURL(/\/analyze\/[0-9a-f-]+$/, { timeout: 60000 });
  check(await user.getByText("68").first().isVisible(), "分析結果（総合点）が表示される");
  check(await user.getByText("5 / 5").isVisible(), "範囲外の点数（7/5）は5に丸めて表示される");
  await shot(user, "05-analyze-result");
  await user.click('a:has-text("この分析をもとにリライト")');
  await user.waitForURL(/\/rewrite\?analysis=/);
  check(await user.getByText("分析結果（直すべきこと・残すべき良さ）を反映してリライトします").isVisible(), "分析結果をリライトに引き継げる");
  await user.click('button:has-text("リライトする")');
  await user.waitForURL(/\/rewrite\/[0-9a-f-]+$/, { timeout: 60000 });
  check(await user.getByText("冒頭を短くして誘導を追加").isVisible(), "リライト結果が表示される");
  const rewriteCall = ai.requests.find((r) => r.body.system.includes("リライトします"));
  check(rewriteCall.body.messages[0].content.includes("子どもが寝たあとの30分という具体性"), "分析の「残すべき良さ」がリライトの指示に含まれる");
  await shot(user, "06-rewrite-result");

  // ---------------------------------------------------------------- 8. 拡張機能の連携
  await user.goto(`${APP}/settings/extension`);
  await user.fill("#token-name", "テスト用PC");
  await user.click('button:has-text("連携コードを発行")');
  const token = (await user.locator("code.font-mono").textContent()).trim();
  check(/^tsx_/.test(token), "連携コードを発行できる（1回だけ表示）");
  const zip = await fetch(`${APP}/downloads/threads-research-extension.zip`);
  check(zip.ok && (await zip.arrayBuffer()).byteLength > 1000, "拡張機能のzipをダウンロードできる");

  const call = (path, body, t = token) =>
    fetch(`${APP}${path}`, {
      method: "POST",
      headers: { Authorization: `Bearer ${t}`, "Content-Type": "application/json" },
      body: JSON.stringify(body ?? {}),
    });
  const verify = await call("/api/extension/verify");
  const verifyJson = await verify.json();
  check(verify.ok && verifyJson.accounts?.[0]?.name === "副業垢", "拡張機能から連携コードで確認できる");
  check((await call("/api/extension/verify", {}, `tsx_${"x".repeat(43)}`)).status === 401, "無効な連携コードは断られる");

  const accountId = verifyJson.accounts[0].id;
  const posts = Array.from({ length: 5 }, (_, i) => ({
    code: `P${i}`,
    url: `https://www.threads.com/@rival/post/P${i}`,
    username: "rival",
    text: `競合の投稿${i}`,
    likeCount: 100 * (i + 1),
    replyCount: i,
    repostCount: 0,
    quoteCount: 0,
    takenAt: new Date("2026-10-01T00:00:00Z").toISOString(),
    mediaType: "text",
    replyToUsername: null,
    tree: i === 4 ? [{ code: "P4b", text: "ツリーの続き" }] : [],
  }));
  const upload = await call("/api/extension/research", { sourceUsername: "rival", sourceUrl: "https://www.threads.com/@rival", accountId, posts });
  const uploadJson = await upload.json();
  check(upload.ok && uploadJson.url?.includes("/research/"), "拡張機能から競合の投稿を送れる");

  await user.goto(uploadJson.url);
  check(await user.getByText("@rival のリサーチ").isVisible(), "送った投稿がスタジオに表示される");
  check((await user.locator("text=1位").first().locator("..").textContent()).includes("いいね 500"), "反応の良い順に並ぶ");
  await user.click('button:has-text("分析する")');
  await user.waitForURL(/\/research\/report\//, { timeout: 60000 });
  check(await user.getByText("本音の代弁型").isVisible(), "競合分析レポートが表示される");
  await shot(user, "07-research-report");
  await user.click('a:has-text("この内容で投稿を作る")');
  await user.waitForURL(/\/generate\?/);
  check((await user.inputValue("#theme")).includes("在宅ワークの最初の1週間"), "レポートの投稿案から投稿生成に進める");

  // ---------------------------------------------------------------- 8b. バズ量産
  await user.goto(`${APP}/buzz`);
  check(await user.getByText("まだバズ投稿がありません").isVisible(), "バズ量産：最初はストックが空");
  await user.click('button:has-text("テキストを貼り付け")');
  const buzzText =
    "いいね:320\nトイトレあるある。\nパンツを見せると逃げる。\n---\nいいね:150\n「出た！」の瞬間、親が泣く。\n---\nいいね:90\n夜のオムツはまだ外せない。";
  await user.fill("#buzzText", buzzText);
  await user.fill("#buzzGenre", "トイトレ");
  await user.click('button:has-text("取り込む") >> nth=-1');
  await user.getByText("3件を取り込みました").waitFor({ timeout: 30000 });
  check(true, "バズ量産：貼り付けたテキストを取り込める");
  await user.fill("#buzzText", buzzText);
  await user.click('button:has-text("取り込む") >> nth=-1');
  await user.getByText("3件は取り込み済みだったので飛ばしました").waitFor({ timeout: 30000 });
  check(true, "バズ量産：同じ投稿は二重に取り込まない");

  await user.click('button:has-text("JSONファイル")');
  const shJson = JSON.stringify({
    posts: [
      { public_ref: "SH-900001", platform: "x", genre: "声かけ", text: "「早くして」を「長い針が6になったら出発ね」に。", likes: 500, url: "https://x.com/a/status/1" },
      {
        public_ref: "SH-900002",
        platform: "threads",
        genre: "声かけ",
        author: "koekake",
        text: "叱る前に言うこと。",
        likes: 210,
        thread: { replies: [{ author: "koekake", text: "「どうしたかったの？」", relation: "author_continuation" }] },
      },
    ],
  });
  await user.setInputFiles("#buzzFile", { name: "saved.json", mimeType: "application/json", buffer: Buffer.from(shJson) });
  await user.click('button:has-text("取り込む") >> nth=-1');
  await user.getByText("2件を取り込みました").waitFor({ timeout: 30000 });
  check(true, "バズ量産：スレハック形式のJSONファイルを取り込める");
  await user.reload();
  check((await user.locator("li", { hasText: "トイトレ" }).first().textContent()).includes("3件"), "バズ量産：ジャンルごとの件数が出る");
  check((await pool.query("select thread from public.buzz_posts where source_ref = 'SH-900002'")).rows[0].thread[0] === "「どうしたかったの？」", "バズ量産：ツリーの続きも保存される");

  await user.selectOption("#genre", "トイトレ");
  await user.selectOption("#ctaMode", "none");
  await user.selectOption("#draftCount", "3");
  await user.click('button:has-text("型を抜き出して投稿案を作る")');
  await user.waitForURL(/\/buzz\/[0-9a-f-]{36}$/, { timeout: 60000 });
  const buzzUrl = user.url();
  check(await user.getByRole("heading", { name: "あるある列挙→本音の一言型" }).isVisible(), "バズ量産：抜き出した型が表示される");
  check(await user.getByText("投稿案2", { exact: true }).isVisible(), "バズ量産：投稿案が表示される");
  check(!(await user.content()).includes("誰でも簡単"), "バズ量産：禁止表現は自動で手直しされる");
  const buzzCalls = ai.requests.filter((r) => r.body.system.includes("伸びた投稿（バズ投稿）"));
  const buzzPrompt = buzzCalls[0]?.body.messages[0].content ?? "";
  check(buzzCalls.length === 2, "バズ量産：違反があったときだけ、もう1回だけ直してもらう");
  check(buzzPrompt.includes("誘導の扱い：誘導しない") && buzzPrompt.includes("パンツを見せると逃げる") && !buzzPrompt.includes("叱る前に"), "バズ量産：選んだジャンルの投稿と「誘導しない」指示がAIに渡る");
  check(buzzPrompt.indexOf("パンツを見せると逃げる") < buzzPrompt.indexOf("親が泣く"), "バズ量産：反応の良い順にAIに渡す");
  await shot(user, "08-buzz-result");
  await user.goto(`${APP}/history?kind=buzz`);
  check(await user.getByText("トイトレのバズ投稿から量産").isVisible(), "バズ量産：履歴に残る");

  // ---------------------------------------------------------------- 9. 他人のデータは見えない
  await supa.createUser("other@example.com", "other-password-1");
  await pool.query("update public.profiles set status = 'approved' where email = 'other@example.com'");
  const otherCtx = await browser.newContext();
  const other = await otherCtx.newPage();
  await other.goto(`${APP}/login`);
  await other.fill("#email", "other@example.com");
  await other.fill("#password", "other-password-1");
  await other.click('button[type="submit"]');
  await other.waitForURL(/\/dashboard/);
  for (const url of [genUrl, accountUrl, uploadJson.url, buzzUrl]) {
    await other.goto(url);
    check(await other.getByText("ページが見つかりません").isVisible(), `他の利用者は ${new URL(url).pathname.split("/")[1]} の他人のページを開けない`);
  }
  await other.goto(`${APP}/history`);
  check(await other.getByText("まだ履歴はありません").isVisible(), "他の利用者の履歴には、自分の分しか出ない");
  await other.goto(`${APP}/buzz`);
  check(await other.getByText("まだバズ投稿がありません").isVisible(), "他の利用者のバズ投稿ストックは見えない");
  await other.goto(`${APP}/admin`);
  check(await other.getByText("ページが見つかりません").isVisible(), "管理者以外は管理画面を開けない");

  // ---------------------------------------------------------------- 10. 停止すると使えなくなる
  await pool.query("update public.profiles set status = 'suspended' where email = 'buyer@example.com'");
  await user.goto(`${APP}/dashboard`);
  check(user.url().includes("/pending") && (await user.getByText("ご利用を停止しています").isVisible()), "停止された利用者はホームを開けない");
  check((await call("/api/extension/verify")).status === 403, "停止された利用者の連携コードは使えない");

  // ---------------------------------------------------------------- 結果
  const failed = results.filter((r) => !r.ok);
  console.log(`\n${results.length - failed.length} / ${results.length} 項目 OK`);
  if (failed.length) {
    console.log(appLog.slice(-3000));
    process.exitCode = 1;
  }
}

main()
  .catch((error) => {
    console.error("❌ 動作確認が途中で止まりました:", error);
    console.error(appLogTail());
    process.exitCode = 1;
  })
  .finally(cleanup);
