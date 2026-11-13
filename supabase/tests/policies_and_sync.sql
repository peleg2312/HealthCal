-- Behavioural tests for the migration. Every block raises on failure, so the
-- script either runs to the final notice or stops at the first broken rule.
\set ON_ERROR_STOP on

insert into auth.users (id) values
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'),
  ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb');

create or replace function pg_temp.act_as(p_user text) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claim.sub', coalesce(p_user, ''), false);
end $$;

-- ------------------------------------------------------------ push + RLS
set role authenticated;
select pg_temp.act_as('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa');

select public.push_records('[
  {"collection":"water","id":"11111111-1111-4111-8111-111111111111","date":"2026-01-05","data":{"ml":250},"deleted":false,"updated_at":"2026-01-05T08:00:00Z"},
  {"collection":"weights","id":"22222222-2222-4222-8222-222222222222","date":"2026-01-05","data":{"kg":80},"deleted":false,"updated_at":"2026-01-05T08:00:00Z"}
]'::jsonb);

do $$
declare n int;
begin
  select count(*) into n from public.records;
  if n <> 2 then raise exception 'user A should see their 2 rows, saw %', n; end if;
end $$;

-- Newer edit wins.
select public.push_records('[{"collection":"water","id":"11111111-1111-4111-8111-111111111111","date":"2026-01-05","data":{"ml":400},"deleted":false,"updated_at":"2026-01-05T09:00:00Z"}]'::jsonb);
-- Older edit arriving late must not overwrite it.
select public.push_records('[{"collection":"water","id":"11111111-1111-4111-8111-111111111111","date":"2026-01-05","data":{"ml":100},"deleted":false,"updated_at":"2026-01-05T07:00:00Z"}]'::jsonb);
do $$
declare v int;
begin
  select (data->>'ml')::int into v from public.records where id = '11111111-1111-4111-8111-111111111111';
  if v <> 400 then raise exception 'last write wins broken: expected 400, got %', v; end if;
end $$;

-- A soft delete is just a newer version of the row.
select public.push_records('[{"collection":"water","id":"11111111-1111-4111-8111-111111111111","date":"2026-01-05","data":{"ml":400},"deleted":true,"updated_at":"2026-01-05T10:00:00Z"}]'::jsonb);
do $$
begin
  if not (select deleted from public.records where id = '11111111-1111-4111-8111-111111111111') then
    raise exception 'soft delete did not propagate';
  end if;
end $$;

-- An unknown collection is rejected by the check constraint.
do $$
begin
  perform public.push_records('[{"collection":"secrets","id":"33333333-3333-4333-8333-333333333333","date":null,"data":{},"deleted":false,"updated_at":"2026-01-05T08:00:00Z"}]'::jsonb);
  raise exception 'unknown collection was accepted';
exception when check_violation then null;
end $$;

-- User B sees nothing of A's, cannot update or delete A's rows, and cannot insert rows as A.
select pg_temp.act_as('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb');
do $$
declare n int;
begin
  select count(*) into n from public.records;
  if n <> 0 then raise exception 'user B can read % of user A''s rows', n; end if;
  update public.records set data = '{"ml":1}'::jsonb;
  get diagnostics n = row_count;
  if n <> 0 then raise exception 'user B updated % of user A''s rows', n; end if;
  delete from public.records;
  get diagnostics n = row_count;
  if n <> 0 then raise exception 'user B deleted % of user A''s rows', n; end if;
  begin
    insert into public.records (user_id, collection, id, data, updated_at)
    values ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'water', '44444444-4444-4444-8444-444444444444', '{}'::jsonb, now());
    raise exception 'user B inserted a row owned by user A';
  exception when insufficient_privilege then null;
  end;
end $$;

-- The same id pushed by B is B's own row and leaves A's untouched.
select public.push_records('[{"collection":"water","id":"11111111-1111-4111-8111-111111111111","date":"2026-01-05","data":{"ml":999},"deleted":false,"updated_at":"2030-01-01T00:00:00Z"}]'::jsonb);
select pg_temp.act_as('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa');
do $$
declare v int;
begin
  select (data->>'ml')::int into v from public.records where id = '11111111-1111-4111-8111-111111111111';
  if v <> 400 then raise exception 'user B overwrote user A''s row (now %)', v; end if;
end $$;

-- The pull cursor: a changed row gets a newer server timestamp.
do $$
declare before timestamptz; after timestamptz;
begin
  select server_updated_at into before from public.records where id = '22222222-2222-4222-8222-222222222222';
  perform pg_sleep(0.01);
  perform public.push_records('[{"collection":"weights","id":"22222222-2222-4222-8222-222222222222","date":"2026-01-05","data":{"kg":79.5},"deleted":false,"updated_at":"2026-01-06T08:00:00Z"}]'::jsonb);
  select server_updated_at into after from public.records where id = '22222222-2222-4222-8222-222222222222';
  if after <= before then raise exception 'server_updated_at did not advance on update'; end if;
end $$;

-- -------------------------------------------------------------- profiles
select public.push_profile('{"name":"Alex"}'::jsonb, '2026-01-05T08:00:00Z', '{"theme":"dark"}'::jsonb, '2026-01-05T08:00:00Z');
-- Settings only: the profile part must be left alone.
select public.push_profile(null, null, '{"theme":"light"}'::jsonb, '2026-01-06T08:00:00Z');
-- A stale profile must lose.
select public.push_profile('{"name":"Old"}'::jsonb, '2026-01-01T00:00:00Z', null, null);
do $$
declare p record;
begin
  select * into p from public.profiles where user_id = auth.uid();
  if p.data->>'name' <> 'Alex' then raise exception 'profile last-write-wins broken: %', p.data; end if;
  if p.settings->>'theme' <> 'light' then raise exception 'settings update lost: %', p.settings; end if;
end $$;
select pg_temp.act_as('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb');
do $$
declare n int;
begin
  select count(*) into n from public.profiles;
  if n <> 0 then raise exception 'user B can read another profile'; end if;
end $$;

-- -------------------------------------------------- signed-out and anon
select pg_temp.act_as(null);
do $$
begin
  perform public.push_records('[]'::jsonb);
  raise exception 'push_records ran without a signed-in user';
exception when others then
  if sqlerrm not like '%not authenticated%' then raise; end if;
end $$;
reset role;
set role anon;
do $$
begin
  perform public.push_records('[]'::jsonb);
  raise exception 'anon role may execute push_records';
exception when insufficient_privilege then null;
end $$;
do $$
declare n int;
begin
  select count(*) into n from public.records;
  if n <> 0 then raise exception 'anon can read % records', n; end if;
end $$;
reset role;

-- --------------------------------------------------------------- AI quota
set role authenticated;
select pg_temp.act_as('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa');
do $$
begin
  perform public.bump_ai_usage('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'user:a', 1, 3, 100);
  raise exception 'a signed-in user may raise their own AI usage counter';
exception when insufficient_privilege then null;
end $$;
do $$
begin
  perform public.refund_ai_usage('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'user:a', 1);
  raise exception 'a signed-in user may refund their own AI usage';
exception when insufficient_privilege then null;
end $$;
do $$
begin
  insert into public.ai_usage (user_id, day, requests) values (auth.uid(), current_date, 0);
  raise exception 'a signed-in user may write ai_usage directly';
exception when insufficient_privilege then null;
end $$;
do $$
declare n int;
begin
  begin
    select count(*) into n from public.ai_quota;
  exception when insufficient_privilege then n := 0;
  end;
  if n <> 0 then raise exception 'a signed-in user can read the quota table'; end if;
end $$;
reset role;

set role service_role;
do $$
declare a int; b int; c int; d int; u uuid := 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
begin
  -- Per-identity limit of 3 units: three fast calls fit, the fourth does not.
  a := public.bump_ai_usage(u, 'user:a', 1, 3, 100);
  b := public.bump_ai_usage(u, 'user:a', 1, 3, 100);
  c := public.bump_ai_usage(u, 'user:a', 1, 3, 100);
  d := public.bump_ai_usage(u, 'user:a', 1, 3, 100);
  if (a, b, c, d) is distinct from (2, 1, 0, -1) then raise exception 'quota sequence wrong: % % % %', a, b, c, d; end if;
  perform public.add_ai_tokens(u, 900, 300);
  perform public.add_ai_tokens(u, 100, 50);
end $$;

do $$
declare r int; used_now int; u uuid := 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
begin
  -- A careful analysis weighs 5: with a limit of 8, one fits, a second does not, three fast ones still do.
  r := public.bump_ai_usage(u, 'user:b', 5, 8, 100);
  if r <> 3 then raise exception 'weighted call should leave 3, left %', r; end if;
  r := public.bump_ai_usage(u, 'user:b', 5, 8, 100);
  if r <> -1 then raise exception 'second weighted call should be refused, got %', r; end if;
  select used into used_now from public.ai_quota where identity = 'user:b';
  if used_now <> 5 then raise exception 'a refused call changed the count: %', used_now; end if;
  r := public.bump_ai_usage(u, 'user:b', 1, 8, 100);
  if r <> 2 then raise exception 'fast call after a careful one should leave 2, left %', r; end if;

  -- A first call that is itself larger than the limit is refused and leaves no trace.
  r := public.bump_ai_usage(u, 'user:big', 5, 3, 100);
  select coalesce(sum(used), 0) into used_now from public.ai_quota where identity = 'user:big';
  if r <> -1 or used_now <> 0 then raise exception 'oversized first call: result %, used %', r, used_now; end if;
end $$;

do $$
declare r int; mine int; everyone int; u uuid := 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
begin
  -- Project-wide ceiling: so far 3 (a) + 6 (b) = 9 units are used. With a ceiling of 10, a 5-unit call is refused...
  select used into everyone from public.ai_quota where identity = '*';
  if everyone <> 9 then raise exception 'project counter should be 9, is %', everyone; end if;
  r := public.bump_ai_usage(u, 'user:c', 5, 40, 10);
  if r <> -2 then raise exception 'project ceiling not enforced, got %', r; end if;
  -- ...and neither counter moved.
  select coalesce(sum(used), 0) into mine from public.ai_quota where identity = 'user:c';
  select used into everyone from public.ai_quota where identity = '*';
  if mine <> 0 or everyone <> 9 then raise exception 'refused call leaked into counters: mine %, project %', mine, everyone; end if;

  -- A refund gives the units back to both counters and never goes below zero.
  r := public.bump_ai_usage(u, 'user:c', 1, 40, 10);
  perform public.refund_ai_usage(u, 'user:c', 1);
  perform public.refund_ai_usage(u, 'user:c', 1);
  select used into mine from public.ai_quota where identity = 'user:c';
  select used into everyone from public.ai_quota where identity = '*';
  if mine <> 0 or everyone <> 8 then raise exception 'refund wrong: mine %, project %', mine, everyone; end if;
end $$;
reset role;
set role authenticated;
do $$
declare r record;
begin
  select * into r from public.ai_usage where user_id = auth.uid();
  if r.requests <> 3 or r.input_tokens <> 1000 or r.output_tokens <> 350 then
    raise exception 'usage row wrong: %', r;
  end if;
end $$;

-- -------------------------------------------------------- delete account
select public.delete_my_account();
reset role;
do $$
declare n int;
begin
  select count(*) into n from auth.users where id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
  if n <> 0 then raise exception 'account row still exists'; end if;
  select (select count(*) from public.records where user_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa')
       + (select count(*) from public.profiles where user_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa')
       + (select count(*) from public.ai_usage where user_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa') into n;
  if n <> 0 then raise exception '% rows survived account deletion', n; end if;
  select count(*) into n from public.records where user_id = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
  if n <> 1 then raise exception 'deleting A removed B''s data (B has % rows)', n; end if;
  -- The allowance is counted against the identity, so deleting the account does not reset it.
  select used into n from public.ai_quota where identity = 'user:a';
  if n <> 3 then raise exception 'quota was reset by deleting the account (used = %)', n; end if;
end $$;

do $$ begin raise notice 'ALL DATABASE TESTS PASSED'; end $$;
