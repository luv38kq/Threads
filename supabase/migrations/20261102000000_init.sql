-- =====================================================================
-- Threads 投稿支援ツール：データベース初期設定（段階1）
--
-- 使い方：Supabase の管理画面「SQL Editor」にこのファイルの中身を
-- まるごと貼り付けて「Run」を押してください。
--
-- 安全対策の考え方
--   1. すべてのデータに「持ち主（user_id）」を記録する
--   2. 行レベルセキュリティ（RLS）で「本人のデータしか読み書きできない」
--      ルールをデータベース自体にかける
--   3. さらに「管理者に承認された利用者」でなければ一切使えないようにする
--   4. 承認状態や管理者フラグは、利用者本人には変更できないようにする
-- =====================================================================

-- ---------------------------------------------------------------------
-- 共通：更新日時を自動で書き換える仕組み
-- ---------------------------------------------------------------------
create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- ---------------------------------------------------------------------
-- 利用者（会員）情報
-- ---------------------------------------------------------------------
create type public.user_status as enum ('pending', 'approved', 'suspended');
create type public.ai_provider as enum ('anthropic', 'openai', 'gemini');

create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  email text not null default '',
  display_name text not null default '' check (char_length(display_name) <= 50),
  -- Brain で購入したときのユーザー名（購入確認に使う）
  brain_name text not null default '' check (char_length(brain_name) <= 100),
  -- pending=承認待ち / approved=利用可 / suspended=停止
  status public.user_status not null default 'pending',
  is_admin boolean not null default false,
  -- 登録時に正しい合言葉を入力したか（サーバーだけが書き換える）
  passphrase_verified boolean not null default false,
  -- 利用期限（空なら無期限）
  access_expires_at timestamptz,
  -- 管理者用メモ（利用者本人には見せない）
  admin_note text not null default '' check (char_length(admin_note) <= 2000),
  -- 普段使うAI
  preferred_ai_provider public.ai_provider,
  approved_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger profiles_set_updated_at
  before update on public.profiles
  for each row execute function public.set_updated_at();

-- 会員登録されたら、自動で profiles に1行つくる
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, email, display_name, brain_name)
  values (
    new.id,
    coalesce(new.email, ''),
    left(coalesce(new.raw_user_meta_data ->> 'display_name', ''), 50),
    left(coalesce(new.raw_user_meta_data ->> 'brain_name', ''), 100)
  );
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ログイン中の利用者が「承認済み・期限内」かどうか
create or replace function public.is_active_user()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.profiles p
    where p.id = auth.uid()
      and p.status = 'approved'
      and (p.access_expires_at is null or p.access_expires_at > now())
  );
$$;

revoke all on function public.is_active_user() from public, anon;
grant execute on function public.is_active_user() to authenticated, service_role;

-- 権限：本人は自分の行を「見る」ことと、名前などの一部の項目の「変更」だけできる。
-- 承認状態・管理者フラグ・管理者メモなどは見ることも変えることもできない列にする。
alter table public.profiles enable row level security;
revoke all on table public.profiles from anon, authenticated;
grant select (
  id, email, display_name, brain_name, status, is_admin,
  access_expires_at, preferred_ai_provider, approved_at, created_at, updated_at
) on table public.profiles to authenticated;
grant update (display_name, brain_name, preferred_ai_provider)
  on table public.profiles to authenticated;
grant all on table public.profiles to service_role;

create policy "profiles_select_own"
  on public.profiles for select
  to authenticated
  using (id = (select auth.uid()));

create policy "profiles_update_own"
  on public.profiles for update
  to authenticated
  using (id = (select auth.uid()))
  with check (id = (select auth.uid()));

-- ---------------------------------------------------------------------
-- アプリ全体の設定（登録用の合言葉など）。サーバー（管理者操作）からのみ使う
-- ---------------------------------------------------------------------
create table public.app_settings (
  id boolean primary key default true check (id),
  -- 合言葉そのものではなく、元に戻せない形（ハッシュ）で保存する
  signup_passphrase_hash text,
  updated_at timestamptz not null default now()
);

insert into public.app_settings (id) values (true);

create trigger app_settings_set_updated_at
  before update on public.app_settings
  for each row execute function public.set_updated_at();

alter table public.app_settings enable row level security;
revoke all on table public.app_settings from anon, authenticated;
grant all on table public.app_settings to service_role;
-- ポリシーを1つも作らない＝ログイン利用者からは一切読めない

-- ---------------------------------------------------------------------
-- 運用アカウント（Threads アカウントごとの設定）
-- ---------------------------------------------------------------------
create table public.managed_accounts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  name text not null check (char_length(name) between 1 and 50),
  threads_username text not null default '' check (char_length(threads_username) <= 50),
  -- どんな発信をしているアカウントか
  profile_summary text not null default '' check (char_length(profile_summary) <= 1000),
  -- 届けたい相手
  target_audience text not null default '' check (char_length(target_audience) <= 2000),
  -- 誘導したい先（プロフィール、商品、LINE など）
  goal text not null default '' check (char_length(goal) <= 1000),
  -- 文章のクセ（語尾・改行・絵文字・口調など）
  writing_style text not null default '' check (char_length(writing_style) <= 3000),
  -- 過去の投稿の見本（クセの分析に使う）
  style_samples text not null default '' check (char_length(style_samples) <= 10000),
  -- 使ってはいけない表現
  banned_expressions text[] not null default '{}'
    check (cardinality(banned_expressions) <= 200),
  -- その他の決まりごと
  custom_rules text not null default '' check (char_length(custom_rules) <= 3000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- ナレッジから「同じ持ち主のアカウントか」を確認するために使う
  unique (id, user_id)
);

create index managed_accounts_user_id_idx on public.managed_accounts (user_id);

create trigger managed_accounts_set_updated_at
  before update on public.managed_accounts
  for each row execute function public.set_updated_at();

alter table public.managed_accounts enable row level security;
revoke all on table public.managed_accounts from anon, authenticated;
grant select, insert, update, delete on table public.managed_accounts to authenticated;
grant all on table public.managed_accounts to service_role;

create policy "managed_accounts_owner_active"
  on public.managed_accounts for all
  to authenticated
  using (user_id = (select auth.uid()) and (select public.is_active_user()))
  with check (user_id = (select auth.uid()) and (select public.is_active_user()));

-- ---------------------------------------------------------------------
-- ナレッジ（アカウントごとの知識メモ）
-- ---------------------------------------------------------------------
create table public.knowledge_items (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  account_id uuid not null,
  title text not null check (char_length(title) between 1 and 100),
  content text not null check (char_length(content) between 1 and 10000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- 他人のアカウントにナレッジを付けられないよう、持ち主ごと紐づける
  foreign key (account_id, user_id)
    references public.managed_accounts (id, user_id) on delete cascade
);

create index knowledge_items_account_id_idx on public.knowledge_items (account_id);
create index knowledge_items_user_id_idx on public.knowledge_items (user_id);

create trigger knowledge_items_set_updated_at
  before update on public.knowledge_items
  for each row execute function public.set_updated_at();

alter table public.knowledge_items enable row level security;
revoke all on table public.knowledge_items from anon, authenticated;
grant select, insert, update, delete on table public.knowledge_items to authenticated;
grant all on table public.knowledge_items to service_role;

create policy "knowledge_items_owner_active"
  on public.knowledge_items for all
  to authenticated
  using (user_id = (select auth.uid()) and (select public.is_active_user()))
  with check (user_id = (select auth.uid()) and (select public.is_active_user()));

-- ---------------------------------------------------------------------
-- 利用者のAIのAPIキー（暗号化して保存）
-- ---------------------------------------------------------------------
create table public.ai_credentials (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  provider public.ai_provider not null,
  -- サーバーの鍵で暗号化した値。データベースが漏れてもそのままでは使えない
  encrypted_key text not null,
  -- 画面表示用（末尾4文字だけ）
  key_hint text not null check (char_length(key_hint) <= 8),
  model text not null default '' check (char_length(model) <= 100),
  available_models text[] not null default '{}',
  verified_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, provider)
);

create trigger ai_credentials_set_updated_at
  before update on public.ai_credentials
  for each row execute function public.set_updated_at();

alter table public.ai_credentials enable row level security;
revoke all on table public.ai_credentials from anon, authenticated;
grant select, insert, update, delete on table public.ai_credentials to authenticated;
grant all on table public.ai_credentials to service_role;

create policy "ai_credentials_owner_active"
  on public.ai_credentials for all
  to authenticated
  using (user_id = (select auth.uid()) and (select public.is_active_user()))
  with check (user_id = (select auth.uid()) and (select public.is_active_user()));
