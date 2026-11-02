# Threads 投稿スタジオ

Threads の投稿作成・分析・改善をAIで支援する、購入者専用のWebアプリです。

- **運営者の固定費は0円**：サーバー（Cloudflare）とデータベース（Supabase）は無料枠で動きます。AIの料金は、利用者が自分のAPIキーで支払います。
- **Brainで販売 → 合言葉で登録 → 管理者が承認**、という流れで購入者だけが使えます。
- **データは利用者ごとに分離**：データベース自体に「本人のデータしか読み書きできない」ルールをかけています。

## いまできること（段階1）

| 機能 | 内容 |
|---|---|
| 会員登録・ログイン | 合言葉つきの登録、ログイン、パスワード再設定 |
| 承認制 | 登録直後は「承認待ち」。管理者が承認すると使えるようになる。停止・利用期限も設定可能 |
| 運用アカウント管理 | アカウントごとのターゲット、誘導先、文章のクセ、過去投稿の見本、禁止表現、ルール |
| ナレッジ管理 | アカウントごとに、商品情報や体験談などのメモを登録 |
| AI設定 | Claude / ChatGPT / Gemini のAPIキーを、接続確認してから暗号化保存 |
| 管理者画面 | 購入者の承認・停止・利用期限・メモ、登録用の合言葉の設定 |

投稿生成・分析・リライトは次の段階で追加します。

---

## 公開までの手順

作業は**すべてブラウザの管理画面だけ**でできます。所要時間は30〜60分ほどです。

### 手順1：Supabase（データベースとログイン）を準備する

1. [Supabase](https://supabase.com/) に無料登録し、「New project」でプロジェクトを作成します。
   - Region（サーバーの場所）は **Northeast Asia (Tokyo)** を選びます。
   - Database Password は自動生成されたものをメモしておきます（普段は使いません）。
2. 左メニューの **SQL Editor** を開き、このリポジトリの
   [`supabase/migrations/20261102000000_init.sql`](supabase/migrations/20261102000000_init.sql)
   の中身をすべて貼り付けて **Run** を押します。「Success」と出ればOKです。
3. 左メニューの **Project Settings → API Keys** で次の2つをメモします。
   - **Publishable key**（`sb_publishable_` で始まる）… 公開してもよい鍵
   - **Secret key**（`sb_secret_` で始まる）… **絶対に他人に見せない鍵**
4. **Project Settings → Data API** で **Project URL**（`https://xxxx.supabase.co`）をメモします。
5. **Authentication → Sign In / Providers → Email** で、次のように設定することをおすすめします。
   - **Confirm email をオフ**：Supabase の無料のメール送信は1時間に数通までと少ないためです。承認制なので、確認メールがなくても不正利用は防げます。
   - パスワード再設定メールは引き続き送れます。購入者が増えたら、独自のメール送信サービス（SMTP）の設定を検討してください。

### 手順2：暗号化の鍵を作る

利用者のAPIキーを暗号化するための鍵です。次のどちらかの方法で作ります。

- パソコンに Node.js が入っている場合：
  ```bash
  node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
  ```
- 入っていない場合：Claude に「32バイトのランダムな値をBase64で1つ作るコマンドを、Macのターミナル用に教えて」と聞いて作ります。

出てきた文字列（44文字ほど）をメモします。

> ⚠️ **この鍵は絶対になくさず、変更もしないでください。** 変更すると、保存済みのAPIキーがすべて読めなくなります（利用者に登録し直してもらうことになります）。パスワード管理アプリなどに保管してください。

### 手順3：Cloudflare に公開する

1. [Cloudflare](https://dash.cloudflare.com/sign-up) に無料登録します。
2. **Workers & Pages → Create → Import a repository** を選び、GitHub と連携してこのリポジトリを選びます。
3. ビルドの設定を次のようにします。
   - Build command：`npx opennextjs-cloudflare build`
   - Deploy command：`npx opennextjs-cloudflare deploy`
4. **Build variables（ビルド時の変数）** に次の3つを追加します。

   | 名前 | 値 |
   |---|---|
   | `NEXT_PUBLIC_SUPABASE_URL` | 手順1-4 の Project URL |
   | `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | 手順1-3 の Publishable key |
   | `NEXT_PUBLIC_SITE_URL` | 公開URL（例：`https://threads-studio.あなたの名前.workers.dev`）。最初はわからないので、一度公開してから設定し直してください |

5. 公開できたら、Worker の **Settings → Variables and Secrets** に次を追加します。種類は **Secret**（秘密）を選びます。

   | 名前 | 値 |
   |---|---|
   | `SUPABASE_SECRET_KEY` | 手順1-3 の Secret key |
   | `ENCRYPTION_KEY` | 手順2 で作った鍵 |
   | `NEXT_PUBLIC_SUPABASE_URL` | 手順4と同じ |
   | `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | 手順4と同じ |
   | `NEXT_PUBLIC_SITE_URL` | 手順4と同じ |

6. もう一度デプロイ（Deployments → Retry / 再実行）すると、設定が反映されます。
7. Supabase に戻り、**Authentication → URL Configuration** で次を設定します。
   - Site URL：公開URL
   - Redirect URLs：`公開URL/auth/callback`

### 手順4：自分を管理者にする

最初の管理者はまだいないため、Supabase の画面で作ります。

1. Supabase の **Authentication → Users → Add user → Create new user** で、自分のメールアドレスとパスワードを入力し、**Auto Confirm User にチェック**を入れて作成します。
2. **SQL Editor** で次を実行します（メールアドレスは自分のものに書き換えてください）。
   ```sql
   update public.profiles
   set is_admin = true, status = 'approved', approved_at = now(), display_name = '管理者'
   where email = 'you@example.com';
   ```
3. 公開URLの `/login` からログインすると、上部メニューに「管理者」が表示されます。

### 手順5：販売の準備

1. 管理者画面で **登録用の合言葉** を設定します。
2. Brainの記事の **購入者だけが読める部分（有料部分）** に、次を書きます。
   - 登録ページのURL：`公開URL/signup`
   - 合言葉
   - 「登録後、管理者が購入を確認して承認します」という案内
3. 購入者が登録すると、管理者画面の「承認待ち」に表示されます。Brainの売上管理で購入者を確認してから「承認」してください。
   - 「合言葉なし（要注意）」と表示された人は、正規の登録ページを通らずに登録した可能性があります。

> 合言葉が漏れた場合は、管理者画面で新しい合言葉に変更し、Brainの記事も書き換えてください。承認制なので、合言葉だけでは使えません。

---

## 開発者向けの情報

### 使っている技術

| 役割 | 技術 |
|---|---|
| アプリ本体 | Next.js 16（App Router）+ TypeScript |
| 見た目 | Tailwind CSS 4 |
| データベース・ログイン | Supabase（PostgreSQL + Auth + 行レベルセキュリティ） |
| 公開先 | Cloudflare Workers（OpenNext アダプター） |
| AI | 利用者のAPIキー（Claude は公式SDK、ChatGPT / Gemini は公式API） |
| 入力チェック | Zod |
| テスト | Vitest、PostgreSQL での安全ルールのテスト |

### フォルダ構成

```
src/
  app/
    (auth)/        ログイン・会員登録・パスワード再設定
    (app)/         ログイン後の画面（承認済みの人だけ）
      dashboard/   ホーム
      accounts/    運用アカウントとナレッジ
      settings/ai/ AIのAPIキー設定
      admin/       管理者画面
    pending/       承認待ち・停止中・期限切れの案内
    auth/callback/ メールのリンクを開いたときの処理
  lib/
    auth.ts        「ログイン中か」「承認済みか」「管理者か」の確認
    crypto.ts      APIキーの暗号化、合言葉のハッシュ化
    validation.ts  入力チェックのルール
    ai/            AIの種類の一覧、APIキーの確認、暗号化キーの取り出し
    supabase/      データベースへの接続（本人用 / 管理者用）
  proxy.ts         すべてのページの前にログイン状態を更新する
supabase/
  migrations/      データベースの設計図（SQL）
  tests/           データ分離のテスト
```

### 手元のパソコンで動かす

```bash
npm install
cp .env.example .env.local   # 中身を自分の値に書き換える
npm run dev                  # http://localhost:3000
```

### チェック

```bash
npm run typecheck   # 型チェック
npm run lint        # 書き方のチェック
npm test            # 暗号化・入力チェックのテスト
npm run test:db     # データ分離のテスト（PostgreSQL が必要）
npm run preview     # Cloudflare と同じ環境で動作確認
```

### 安全のための決まりごと

- 普段のデータ操作は `lib/supabase/server.ts` の `createClient()` を使います。安全ルール（RLS）が効くので、本人のデータしか扱えません。
- `lib/supabase/admin.ts` の `createAdminClient()` は安全ルールを無視できるため、**管理者画面（`requireAdmin()` の後）と会員登録処理でだけ**使います。
- データを変更する処理（Server Action）は、毎回 `requireActiveUser()` などで本人確認をしてから実行します。
- テーブルを追加するときは、必ず `user_id` 列と RLS のルールを付け、`supabase/tests/` にテストを追加します。
- 秘密の値（`SUPABASE_SECRET_KEY`、`ENCRYPTION_KEY`、利用者のAPIキー）は、画面に返したりログに出したりしません。
