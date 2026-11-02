-- =====================================================================
-- AIの結果の履歴（generations）のデータ分離テスト
-- =====================================================================
\set ON_ERROR_STOP on
set client_min_messages = notice;

insert into auth.users (id, email) values
  ('11111111-0000-0000-0000-000000000001', 'g1@example.com'),
  ('22222222-0000-0000-0000-000000000002', 'g2@example.com');
update public.profiles set status = 'approved'
  where id in ('11111111-0000-0000-0000-000000000001', '22222222-0000-0000-0000-000000000002');

insert into public.managed_accounts (id, user_id, name) values
  ('a1000000-0000-0000-0000-000000000001', '11111111-0000-0000-0000-000000000001', 'G1の垢'),
  ('a2000000-0000-0000-0000-000000000002', '22222222-0000-0000-0000-000000000002', 'G2の垢');

insert into public.generations (user_id, account_id, kind, provider, model, input, output) values
  ('22222222-0000-0000-0000-000000000002', 'a2000000-0000-0000-0000-000000000002',
   'generate', 'anthropic', 'm', '{"theme":"G2の秘密"}', '{}');

set role authenticated;
set request.jwt.claims = '{"sub":"11111111-0000-0000-0000-000000000001","role":"authenticated"}';

select tests.assert((select count(*) = 0 from public.generations), 'G1にはG2の履歴が見えない');

insert into public.generations (account_id, kind, provider, model, input, output)
  values ('a1000000-0000-0000-0000-000000000001', 'generate', 'openai', 'm', '{}', '{}');
select tests.assert((select count(*) = 1 from public.generations), 'G1は自分のアカウント向けの履歴を保存できる');

select tests.expect_error(
  $$insert into public.generations (account_id, kind, provider, model, input, output)
    values ('a2000000-0000-0000-0000-000000000002', 'generate', 'openai', 'm', '{}', '{}')$$,
  'G1はG2のアカウントに紐づけた履歴を作れない');
select tests.expect_error(
  $$insert into public.generations (user_id, kind, provider, model, input, output)
    values ('22222222-0000-0000-0000-000000000002', 'generate', 'openai', 'm', '{}', '{}')$$,
  'G1はG2の名義で履歴を作れない');
select tests.expect_error(
  $$update public.generations set model = 'x'$$,
  '履歴は書き換えられない');
select tests.expect_no_rows(
  $$delete from public.generations where user_id = '22222222-0000-0000-0000-000000000002'$$,
  'G1はG2の履歴を削除できない');

-- テーブルを丸ごと空にする命令（安全ルールが効かない）は、どのテーブルでも使えない
select tests.expect_error($$truncate public.generations$$, 'ログイン利用者は履歴を一括削除できない');
select tests.expect_error($$truncate public.managed_accounts$$, 'ログイン利用者はアカウントを一括削除できない');
select tests.expect_error($$truncate public.knowledge_items$$, 'ログイン利用者はナレッジを一括削除できない');
select tests.expect_error($$truncate public.ai_credentials$$, 'ログイン利用者はAPIキーを一括削除できない');
select tests.expect_error($$truncate public.profiles$$, 'ログイン利用者は会員情報を一括削除できない');
reset role;

-- アカウントを削除しても履歴は残り、アカウントとの紐づけだけが外れる
delete from public.managed_accounts where id = 'a1000000-0000-0000-0000-000000000001';
select tests.assert(
  (select count(*) = 1 from public.generations
     where user_id = '11111111-0000-0000-0000-000000000001' and account_id is null),
  'アカウントを削除しても履歴は残る');

\echo '履歴のデータ分離テストに合格しました'
