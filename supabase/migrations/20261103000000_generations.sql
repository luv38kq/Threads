-- =====================================================================
-- 段階2：AIで作った結果（投稿生成・分析・リライト）の履歴
--
-- 使い方：Supabase の「SQL Editor」に貼り付けて「Run」を押してください。
-- （20261102000000_init.sql を実行したあとに実行します）
-- =====================================================================

create type public.generation_kind as enum ('generate', 'analyze', 'rewrite', 'research');

create table public.generations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  -- どの運用アカウント向けか（アカウントを削除しても履歴は残す）
  account_id uuid,
  kind public.generation_kind not null,
  provider public.ai_provider not null,
  model text not null check (char_length(model) <= 100),
  -- 画面で入力した内容
  input jsonb not null,
  -- AIの結果
  output jsonb not null,
  created_at timestamptz not null default now(),
  -- 1件が大きくなりすぎないようにする
  check (pg_column_size(input) < 100000),
  check (pg_column_size(output) < 200000),
  -- 他人のアカウントに紐づけられないよう、持ち主ごと確認する
  foreign key (account_id, user_id)
    references public.managed_accounts (id, user_id) on delete set null (account_id)
);

create index generations_user_created_idx on public.generations (user_id, created_at desc);
create index generations_account_idx on public.generations (account_id);

alter table public.generations enable row level security;
revoke all on table public.generations from anon, authenticated;
-- 履歴は「見る・追加する・削除する」だけ（書き換えはできない）
grant select, insert, delete on table public.generations to authenticated;
grant all on table public.generations to service_role;

create policy "generations_owner_active"
  on public.generations for all
  to authenticated
  using (user_id = (select auth.uid()) and (select public.is_active_user()))
  with check (user_id = (select auth.uid()) and (select public.is_active_user()));
