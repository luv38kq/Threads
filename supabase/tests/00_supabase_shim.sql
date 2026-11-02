-- テスト専用：Supabase が最初から用意している仕組み（auth スキーマとロール）を
-- 普通の PostgreSQL 上で最低限まねするためのファイル。本番では使いません。

create role anon nologin;
create role authenticated nologin;
create role service_role nologin bypassrls;

create schema auth;
grant usage on schema auth to anon, authenticated, service_role;
grant usage on schema public to anon, authenticated, service_role;

create table auth.users (
  id uuid primary key default gen_random_uuid(),
  email text,
  raw_user_meta_data jsonb not null default '{}'::jsonb
);

-- Supabase の auth.uid() と同じく、リクエストのログイン情報から利用者IDを返す
create function auth.uid() returns uuid
language sql stable
as $$
  select nullif(current_setting('request.jwt.claims', true)::json ->> 'sub', '')::uuid
$$;

grant execute on function auth.uid() to anon, authenticated, service_role;

-- Supabase と同じく、public に作ったテーブルは既定で anon / authenticated に権限が付く
alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
alter default privileges in schema public grant all on functions to anon, authenticated, service_role;
