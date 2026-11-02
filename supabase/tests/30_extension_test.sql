-- =====================================================================
-- 拡張機能の連携コードとリサーチデータのデータ分離テスト
-- =====================================================================
\set ON_ERROR_STOP on
set client_min_messages = notice;

insert into auth.users (id, email) values
  ('33333333-0000-0000-0000-000000000003', 'e1@example.com'),
  ('44444444-0000-0000-0000-000000000004', 'e2@example.com');
update public.profiles set status = 'approved'
  where id in ('33333333-0000-0000-0000-000000000003', '44444444-0000-0000-0000-000000000004');

insert into public.extension_tokens (user_id, name, token_hash, token_hint) values
  ('44444444-0000-0000-0000-000000000004', 'E2のPC', repeat('b', 64), 'bbbb');
insert into public.research_sets (user_id, source_username, posts, post_count) values
  ('44444444-0000-0000-0000-000000000004', 'rival', '[]', 0);

set role authenticated;
set request.jwt.claims = '{"sub":"33333333-0000-0000-0000-000000000003","role":"authenticated"}';

select tests.assert((select count(*) = 0 from public.extension_tokens), 'E1にはE2の連携コードが見えない');
select tests.assert((select count(*) = 0 from public.research_sets), 'E1にはE2のリサーチが見えない');

insert into public.extension_tokens (name, token_hash, token_hint) values ('自分のPC', repeat('a', 64), 'aaaa');
select tests.assert((select count(*) = 1 from public.extension_tokens), 'E1は自分の連携コードを発行できる');
select tests.expect_error($$select token_hash from public.extension_tokens$$, '連携コードのハッシュは本人にも読めない');
select tests.expect_error(
  $$update public.extension_tokens set last_used_at = now()$$,
  '連携コードは書き換えられない');
select tests.expect_error(
  $$insert into public.extension_tokens (user_id, name, token_hash, token_hint)
    values ('44444444-0000-0000-0000-000000000004', 'x', repeat('c', 64), 'cccc')$$,
  'E1はE2の名義で連携コードを作れない');

insert into public.research_sets (source_username, posts, post_count) values ('rival', '[]', 0);
select tests.assert((select count(*) = 1 from public.research_sets), 'E1は自分のリサーチを保存できる');
select tests.expect_error(
  $$update public.research_sets set source_username = 'x'$$,
  'リサーチは書き換えられない');
select tests.expect_no_rows(
  $$delete from public.research_sets where user_id = '44444444-0000-0000-0000-000000000004'$$,
  'E1はE2のリサーチを削除できない');
reset role;

-- 承認が取り消されたら、連携コードも使えなくなる（一覧も見えない）
update public.profiles set status = 'suspended' where id = '33333333-0000-0000-0000-000000000003';
set role authenticated;
set request.jwt.claims = '{"sub":"33333333-0000-0000-0000-000000000003","role":"authenticated"}';
select tests.assert((select count(*) = 0 from public.extension_tokens), '停止中は自分の連携コードも見えない');
reset role;

\echo '拡張機能連携のデータ分離テストに合格しました'
