-- =====================================================================
-- データ分離のテスト
-- 「他人のデータが見えない・変えられない」「未承認の人は使えない」ことを
-- 実際のデータベースで確認します。1つでも失敗するとエラーで止まります。
-- =====================================================================
\set ON_ERROR_STOP on
set client_min_messages = notice;

-- ---------- テスト用の道具 ----------
create schema tests;
grant usage on schema tests to anon, authenticated;

create function tests.assert(ok boolean, label text) returns void
language plpgsql as $$
begin
  if ok is not true then
    raise exception 'テスト失敗: %', label;
  end if;
  raise notice 'OK: %', label;
end;
$$;

-- 指定したSQLがエラーになることを確認する
create function tests.expect_error(stmt text, label text) returns void
language plpgsql as $$
begin
  begin
    execute stmt;
  exception when others then
    raise notice 'OK: % (%)', label, sqlerrm;
    return;
  end;
  raise exception 'テスト失敗（エラーになるはずが成功した）: %', label;
end;
$$;

-- 指定したSQLが「0行しか変更しない」ことを確認する
create function tests.expect_no_rows(stmt text, label text) returns void
language plpgsql as $$
declare n integer;
begin
  execute stmt;
  get diagnostics n = row_count;
  if n <> 0 then
    raise exception 'テスト失敗（% 行が変更された）: %', n, label;
  end if;
  raise notice 'OK: %', label;
end;
$$;

grant execute on all functions in schema tests to anon, authenticated;

-- ---------- テスト用の利用者 ----------
-- A, B: 承認済み / C: 承認待ち / D: 期限切れ / E: 停止中
insert into auth.users (id, email, raw_user_meta_data) values
  ('aaaaaaaa-0000-0000-0000-000000000001', 'a@example.com', '{"display_name":"Aさん","brain_name":"brain_a"}'),
  ('bbbbbbbb-0000-0000-0000-000000000002', 'b@example.com', '{}'),
  ('cccccccc-0000-0000-0000-000000000003', 'c@example.com', '{}'),
  ('dddddddd-0000-0000-0000-000000000004', 'd@example.com', '{}'),
  ('eeeeeeee-0000-0000-0000-000000000005', 'e@example.com', '{}');

select tests.assert(
  (select display_name = 'Aさん' and brain_name = 'brain_a' and status = 'pending'
     from public.profiles where id = 'aaaaaaaa-0000-0000-0000-000000000001'),
  '会員登録すると承認待ちの会員情報が自動でできる');

update public.profiles set status = 'approved'
  where id in ('aaaaaaaa-0000-0000-0000-000000000001', 'bbbbbbbb-0000-0000-0000-000000000002');
update public.profiles set status = 'approved', access_expires_at = now() - interval '1 day'
  where id = 'dddddddd-0000-0000-0000-000000000004';
update public.profiles set status = 'suspended'
  where id = 'eeeeeeee-0000-0000-0000-000000000005';
update public.profiles set admin_note = '管理者だけのメモ';

insert into public.managed_accounts (id, user_id, name) values
  ('a0000000-0000-0000-0000-00000000000a', 'aaaaaaaa-0000-0000-0000-000000000001', 'Aの運用垢'),
  ('b0000000-0000-0000-0000-00000000000b', 'bbbbbbbb-0000-0000-0000-000000000002', 'Bの運用垢'),
  ('d0000000-0000-0000-0000-00000000000d', 'dddddddd-0000-0000-0000-000000000004', 'Dの運用垢');

insert into public.knowledge_items (user_id, account_id, title, content) values
  ('bbbbbbbb-0000-0000-0000-000000000002', 'b0000000-0000-0000-0000-00000000000b', 'Bの秘密', 'Bだけの情報');

insert into public.ai_credentials (user_id, provider, encrypted_key, key_hint) values
  ('bbbbbbbb-0000-0000-0000-000000000002', 'anthropic', 'v1:xxx', '1234');

-- =====================================================================
-- 利用者A（承認済み）としてログインした状態
-- =====================================================================
set role authenticated;
set request.jwt.claims = '{"sub":"aaaaaaaa-0000-0000-0000-000000000001","role":"authenticated"}';

select tests.assert((select count(*) = 1 from public.managed_accounts), 'Aには自分のアカウント1件だけが見える');
select tests.assert((select bool_and(user_id = auth.uid()) from public.managed_accounts), 'Aに見えるのはA自身のアカウントだけ');
select tests.assert((select count(*) = 0 from public.knowledge_items), 'AにはBのナレッジが見えない');
select tests.assert((select count(*) = 0 from public.ai_credentials), 'AにはBのAPIキーが見えない');
select tests.assert((select count(*) = 1 from public.profiles), 'Aには自分の会員情報だけが見える');

select tests.expect_error(
  $$insert into public.managed_accounts (user_id, name) values ('bbbbbbbb-0000-0000-0000-000000000002', 'なりすまし')$$,
  'AはBの名義でアカウントを作れない');
select tests.expect_no_rows(
  $$update public.managed_accounts set name = '書き換え' where id = 'b0000000-0000-0000-0000-00000000000b'$$,
  'AはBのアカウントを書き換えられない');
select tests.expect_no_rows(
  $$delete from public.managed_accounts where id = 'b0000000-0000-0000-0000-00000000000b'$$,
  'AはBのアカウントを削除できない');
select tests.expect_error(
  $$update public.managed_accounts set user_id = 'bbbbbbbb-0000-0000-0000-000000000002' where id = 'a0000000-0000-0000-0000-00000000000a'$$,
  'Aは自分のアカウントの持ち主をBに変えられない');
select tests.expect_error(
  $$insert into public.knowledge_items (account_id, title, content) values ('b0000000-0000-0000-0000-00000000000b', 'x', 'y')$$,
  'AはBのアカウントにナレッジを追加できない');
select tests.expect_error(
  $$insert into public.ai_credentials (user_id, provider, encrypted_key, key_hint) values ('bbbbbbbb-0000-0000-0000-000000000002', 'openai', 'v1:x', '1')$$,
  'AはBの名義でAPIキーを登録できない');

-- 自分のデータは普通に使える
insert into public.knowledge_items (account_id, title, content)
  values ('a0000000-0000-0000-0000-00000000000a', '商品情報', 'Aの商品の説明');
select tests.assert((select count(*) = 1 from public.knowledge_items), 'Aは自分のアカウントにナレッジを追加できる');
insert into public.ai_credentials (provider, encrypted_key, key_hint) values ('openai', 'v1:a', 'abcd');
select tests.assert((select count(*) = 1 from public.ai_credentials), 'Aは自分のAPIキーを登録できる');
update public.profiles set display_name = '新しい名前' where id = auth.uid();
select tests.assert((select display_name = '新しい名前' from public.profiles), 'Aは自分の表示名を変えられる');

-- 承認状態・管理者権限・管理者メモには手が出せない
select tests.expect_error(
  $$update public.profiles set status = 'approved' where id = auth.uid()$$,
  'Aは自分の承認状態を変えられない');
select tests.expect_error(
  $$update public.profiles set is_admin = true where id = auth.uid()$$,
  'Aは自分を管理者にできない');
select tests.expect_error(
  $$update public.profiles set access_expires_at = null where id = auth.uid()$$,
  'Aは自分の利用期限を延ばせない');
select tests.expect_error(
  $$select admin_note from public.profiles$$,
  'Aは管理者メモを読めない');
select tests.expect_error(
  $$select * from public.app_settings$$,
  'Aは合言葉の設定を読めない');
select tests.expect_error(
  $$delete from public.profiles where id = auth.uid()$$,
  'Aは会員情報を勝手に削除できない');

reset role;

-- =====================================================================
-- 承認待ち・期限切れ・停止中の利用者は何も使えない
-- =====================================================================
set role authenticated;
set request.jwt.claims = '{"sub":"cccccccc-0000-0000-0000-000000000003","role":"authenticated"}';
select tests.assert((select count(*) = 1 from public.profiles), '承認待ちのCも自分の状態は確認できる');
select tests.expect_error(
  $$insert into public.managed_accounts (name) values ('承認前のアカウント')$$,
  '承認待ちのCはアカウントを作れない');
select tests.expect_error(
  $$insert into public.ai_credentials (provider, encrypted_key, key_hint) values ('openai', 'v1:c', 'c')$$,
  '承認待ちのCはAPIキーを登録できない');
reset role;

set role authenticated;
set request.jwt.claims = '{"sub":"dddddddd-0000-0000-0000-000000000004","role":"authenticated"}';
select tests.assert((select count(*) = 0 from public.managed_accounts), '期限切れのDには自分のアカウントも見えなくなる');
select tests.expect_error(
  $$insert into public.managed_accounts (name) values ('期限切れ後のアカウント')$$,
  '期限切れのDはアカウントを作れない');
reset role;

set role authenticated;
set request.jwt.claims = '{"sub":"eeeeeeee-0000-0000-0000-000000000005","role":"authenticated"}';
select tests.expect_error(
  $$insert into public.managed_accounts (name) values ('停止後のアカウント')$$,
  '停止中のEはアカウントを作れない');
reset role;

-- =====================================================================
-- ログインしていない人（anon）は何も見られない
-- =====================================================================
set role anon;
set request.jwt.claims = '';
select tests.expect_error($$select * from public.profiles$$, '未ログインでは会員情報を読めない');
select tests.expect_error($$select * from public.managed_accounts$$, '未ログインではアカウントを読めない');
select tests.expect_error($$select * from public.ai_credentials$$, '未ログインではAPIキーを読めない');
select tests.expect_error($$select * from public.app_settings$$, '未ログインでは設定を読めない');
reset role;

-- 退会（auth.users の削除）でデータがすべて消える
delete from auth.users where id = 'bbbbbbbb-0000-0000-0000-000000000002';
select tests.assert(
  (select count(*) = 0 from public.managed_accounts where user_id = 'bbbbbbbb-0000-0000-0000-000000000002')
  and (select count(*) = 0 from public.knowledge_items where user_id = 'bbbbbbbb-0000-0000-0000-000000000002')
  and (select count(*) = 0 from public.ai_credentials where user_id = 'bbbbbbbb-0000-0000-0000-000000000002'),
  '退会した利用者のデータはすべて削除される');

\echo 'すべてのデータ分離テストに合格しました'
