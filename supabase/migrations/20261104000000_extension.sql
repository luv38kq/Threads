-- =====================================================================
-- 段階C：Chrome拡張機能（投稿リサーチ）との連携
--
-- 使い方：Supabase の「SQL Editor」に貼り付けて「Run」を押してください。
-- （20261103000000_generations.sql を実行したあとに実行します）
-- =====================================================================

-- ---------------------------------------------------------------------
-- 連携コード（拡張機能が「承認済みの購入者か」を確認するための合鍵）
-- コードそのものは保存せず、元に戻せない形（ハッシュ）だけを保存する
-- ---------------------------------------------------------------------
create table public.extension_tokens (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  name text not null default '' check (char_length(name) <= 50),
  token_hash text not null unique check (char_length(token_hash) = 64),
  token_hint text not null check (char_length(token_hint) <= 8),
  last_used_at timestamptz,
  created_at timestamptz not null default now()
);

create index extension_tokens_user_idx on public.extension_tokens (user_id);

alter table public.extension_tokens enable row level security;
revoke all on table public.extension_tokens from anon, authenticated;
-- 本人は「一覧を見る（ハッシュは見えない）・発行する・削除する」だけ
grant select (id, user_id, name, token_hint, last_used_at, created_at)
  on table public.extension_tokens to authenticated;
grant insert (user_id, name, token_hash, token_hint) on table public.extension_tokens to authenticated;
grant delete on table public.extension_tokens to authenticated;
grant all on table public.extension_tokens to service_role;

create policy "extension_tokens_owner_active"
  on public.extension_tokens for all
  to authenticated
  using (user_id = (select auth.uid()) and (select public.is_active_user()))
  with check (user_id = (select auth.uid()) and (select public.is_active_user()));

-- ---------------------------------------------------------------------
-- 拡張機能から送られてきた競合投稿のまとまり
-- ---------------------------------------------------------------------
create table public.research_sets (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  account_id uuid,
  source_username text not null default '' check (char_length(source_username) <= 100),
  source_url text not null default '' check (char_length(source_url) <= 2000),
  posts jsonb not null,
  post_count integer not null check (post_count between 0 and 300),
  created_at timestamptz not null default now(),
  check (pg_column_size(posts) < 4000000),
  foreign key (account_id, user_id)
    references public.managed_accounts (id, user_id) on delete set null (account_id)
);

create index research_sets_user_created_idx on public.research_sets (user_id, created_at desc);

alter table public.research_sets enable row level security;
revoke all on table public.research_sets from anon, authenticated;
grant select, insert, delete on table public.research_sets to authenticated;
grant all on table public.research_sets to service_role;

create policy "research_sets_owner_active"
  on public.research_sets for all
  to authenticated
  using (user_id = (select auth.uid()) and (select public.is_active_user()))
  with check (user_id = (select auth.uid()) and (select public.is_active_user()));
