-- =====================================================================
-- 段階D：バズ投稿ストック（集めたバズ投稿から型を抜き出して投稿案を量産する）
--
-- 使い方：Supabase の「SQL Editor」に貼り付けて「Run」を押してください。
-- （20261104000000_extension.sql を実行したあとに実行します）
-- =====================================================================

-- 履歴の種類に「バズ量産」を追加
alter type public.generation_kind add value if not exists 'buzz';

-- ---------------------------------------------------------------------
-- 取り込んだバズ投稿（1行＝1投稿）
-- ---------------------------------------------------------------------
create table public.buzz_posts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  -- 同じ投稿を二重に取り込まないための番号（SH-xxxxxx・URL・本文から作った番号など）
  source_ref text not null check (char_length(source_ref) between 1 and 200),
  genre text not null default '' check (char_length(genre) <= 50),
  platform text not null default 'other' check (platform in ('threads', 'x', 'other')),
  author text not null default '' check (char_length(author) <= 100),
  url text not null default '' check (char_length(url) <= 500),
  text text not null check (char_length(text) between 1 and 5000),
  -- ツリー（本人の続きの投稿）の本文
  thread jsonb not null default '[]'::jsonb check (jsonb_typeof(thread) = 'array' and pg_column_size(thread) < 40000),
  likes integer not null default 0 check (likes >= 0),
  replies integer not null default 0 check (replies >= 0),
  reposts integer not null default 0 check (reposts >= 0),
  views bigint not null default 0 check (views >= 0),
  posted_at timestamptz,
  created_at timestamptz not null default now(),
  unique (user_id, source_ref)
);

create index buzz_posts_user_genre_likes_idx on public.buzz_posts (user_id, genre, likes desc);

alter table public.buzz_posts enable row level security;
revoke all on table public.buzz_posts from anon, authenticated;
-- 取り込んだ投稿は「見る・追加する・削除する」だけ（書き換えはできない）
grant select, insert, delete on table public.buzz_posts to authenticated;
grant all on table public.buzz_posts to service_role;

create policy "buzz_posts_owner_active"
  on public.buzz_posts for all
  to authenticated
  using (user_id = (select auth.uid()) and (select public.is_active_user()))
  with check (user_id = (select auth.uid()) and (select public.is_active_user()));

-- ---------------------------------------------------------------------
-- ジャンルごとの件数（見る人の権限で動くので、本人の分だけが数えられる）
-- ---------------------------------------------------------------------
create view public.buzz_genre_summary
  with (security_invoker = true)
as
select
  genre,
  count(*)::integer as post_count,
  max(likes)::integer as max_likes
from public.buzz_posts
group by genre;

revoke all on table public.buzz_genre_summary from anon, authenticated;
grant select on table public.buzz_genre_summary to authenticated;
