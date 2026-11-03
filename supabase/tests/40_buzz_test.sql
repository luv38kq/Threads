-- =====================================================================
-- バズ投稿ストックのデータ分離テスト
-- =====================================================================
\set ON_ERROR_STOP on
set client_min_messages = notice;

insert into auth.users (id, email) values
  ('55555555-0000-0000-0000-000000000005', 'b1@example.com'),
  ('66666666-0000-0000-0000-000000000006', 'b2@example.com');
update public.profiles set status = 'approved'
  where id in ('55555555-0000-0000-0000-000000000005', '66666666-0000-0000-0000-000000000006');

insert into public.buzz_posts (user_id, source_ref, genre, text, likes) values
  ('66666666-0000-0000-0000-000000000006', 'SH-000001', '育児・教育', 'B2の投稿', 500);

set role authenticated;
set request.jwt.claims = '{"sub":"55555555-0000-0000-0000-000000000005","role":"authenticated"}';

select tests.assert((select count(*) = 0 from public.buzz_posts), 'B1にはB2のバズ投稿が見えない');
select tests.assert((select count(*) = 0 from public.buzz_genre_summary), 'B1のジャンル集計にB2の分は入らない');

insert into public.buzz_posts (source_ref, genre, text, likes) values
  ('SH-000001', '育児・教育', 'B1の投稿', 300),
  ('SH-000002', '育児・教育', 'B1の投稿2', 200),
  ('SH-000003', 'トイトレ', 'B1の投稿3', 150);
select tests.assert((select count(*) = 3 from public.buzz_posts), 'B1は自分のバズ投稿を取り込める（B2と同じ番号でもよい）');
select tests.assert(
  (select post_count = 2 and max_likes = 300 from public.buzz_genre_summary where genre = '育児・教育'),
  'ジャンル集計は本人の分だけを数える');

insert into public.buzz_posts (source_ref, text) values ('SH-000001', '二重') on conflict (user_id, source_ref) do nothing;
select tests.assert((select count(*) = 3 from public.buzz_posts), '同じ番号の投稿は二重に入らない');

select tests.expect_error(
  $$insert into public.buzz_posts (user_id, source_ref, text)
    values ('66666666-0000-0000-0000-000000000006', 'SH-999999', 'なりすまし')$$,
  'B1はB2の名義でバズ投稿を入れられない');
select tests.expect_error($$update public.buzz_posts set likes = 999999$$, 'バズ投稿は書き換えられない');
select tests.expect_error(
  $$insert into public.buzz_posts (source_ref, text, platform) values ('SH-000009', 'x', 'facebook')$$,
  '決まった媒体以外は入れられない');
select tests.expect_no_rows(
  $$delete from public.buzz_posts where user_id = '66666666-0000-0000-0000-000000000006'$$,
  'B1はB2のバズ投稿を削除できない');

delete from public.buzz_posts where genre = 'トイトレ';
select tests.assert((select count(*) = 2 from public.buzz_posts), 'B1は自分のバズ投稿をジャンルごとに削除できる');
reset role;

select tests.assert(
  (select count(*) = 1 from public.buzz_posts where user_id = '66666666-0000-0000-0000-000000000006'),
  'B2のバズ投稿は残っている');

-- 承認が取り消されたら、自分のストックも見えない
update public.profiles set status = 'suspended' where id = '55555555-0000-0000-0000-000000000005';
set role authenticated;
set request.jwt.claims = '{"sub":"55555555-0000-0000-0000-000000000005","role":"authenticated"}';
select tests.assert((select count(*) = 0 from public.buzz_posts), '停止中は自分のバズ投稿も見えない');
reset role;

-- 履歴の種類に「バズ量産」が使える
select tests.assert((select 'buzz'::public.generation_kind is not null), '履歴の種類に buzz がある');

\echo 'バズ投稿ストックのデータ分離テストに合格しました'
