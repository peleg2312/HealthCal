-- Plans and reports: who may touch billing_entitlements, billing_events, billing_calls and
-- ai_reports; one row per source (R3); the call counts (R10); the report cap's lock (R13); and
-- delete_my_account refusing while a paid plan is open (R5).
-- Run from policies_and_sync.sql (\ir), after its own tests, in the same session (pg_temp.act_as).
-- Every block raises on failure.
\set ON_ERROR_STOP on

reset role;
insert into auth.users (id) values
  ('cccccccc-cccc-4ccc-8ccc-cccccccccccc'),
  ('dddddddd-dddd-4ddd-8ddd-dddddddddddd');

-- ------------------------------------------------ the service role writes
set role service_role;
do $$
declare ok boolean;
begin
  ok := public.billing_put_entitlement('cccccccc-cccc-4ccc-8ccc-cccccccccccc', '{
    "source":"test","provider_customer_id":"cus_c","provider_subscription_id":"sub_c","product_id":"test-plus-month",
    "period":"month","state":"active","period_end":"2026-12-23T12:00:00Z","grace_until":null,
    "cancel_at_period_end":false,"environment":"sandbox","provider_updated_at":"2026-11-23T11:00:00Z"}'::jsonb);
  if not ok then raise exception 'the service role could not write an entitlement'; end if;
  -- A newer state overwrites.
  ok := public.billing_put_entitlement('cccccccc-cccc-4ccc-8ccc-cccccccccccc', '{
    "source":"test","provider_customer_id":"cus_c","state":"canceling","period_end":"2026-12-23T12:00:00Z",
    "cancel_at_period_end":true,"environment":"sandbox","provider_updated_at":"2026-11-23T11:30:00Z"}'::jsonb);
  if not ok then raise exception 'a newer state was not written'; end if;
  -- An older one arriving late is ignored.
  ok := public.billing_put_entitlement('cccccccc-cccc-4ccc-8ccc-cccccccccccc', '{
    "source":"test","provider_customer_id":"cus_c","state":"active","period_end":"2026-12-23T12:00:00Z",
    "environment":"sandbox","provider_updated_at":"2026-11-23T11:10:00Z"}'::jsonb);
  if ok then raise exception 'an older state overwrote a newer one'; end if;
  if (select state from public.billing_entitlements where user_id = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc') <> 'canceling' then
    raise exception 'the stored state is not the newest';
  end if;
  if (select count(*) from public.billing_entitlements) <> 1 then raise exception 'one person, one plus row per source'; end if;
  if (select started_at from public.billing_entitlements where user_id = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc') is not null then
    raise exception 'started_at was invented';
  end if;
end $$;

-- R3: the same person may hold a row from a second source; neither overwrites the other, and the
-- row keeps when its subscription started.
do $$
declare ok boolean;
begin
  ok := public.billing_put_entitlement('cccccccc-cccc-4ccc-8ccc-cccccccccccc', '{
    "source":"promotional","state":"active","period_end":"2027-01-01T00:00:00Z","environment":"live",
    "started_at":"2026-11-01T00:00:00Z","provider_updated_at":"2026-11-01T00:00:00Z"}'::jsonb);
  if not ok then raise exception 'a second source was not written'; end if;
  if (select count(*) from public.billing_entitlements where user_id = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc') <> 2 then
    raise exception 'two sources should be two rows';
  end if;
  if (select state from public.billing_entitlements where user_id = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc' and source = 'test') <> 'canceling' then
    raise exception 'the second source overwrote the first';
  end if;
  if (select started_at from public.billing_entitlements where user_id = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc' and source = 'promotional') <> '2026-11-01T00:00:00Z'::timestamptz then
    raise exception 'started_at was not kept';
  end if;
  -- The promotional row's newer time does not shield the test row from its own updates.
  ok := public.billing_put_entitlement('cccccccc-cccc-4ccc-8ccc-cccccccccccc', '{
    "source":"test","provider_customer_id":"cus_c","state":"canceling","period_end":"2026-12-23T12:00:00Z",
    "cancel_at_period_end":true,"environment":"sandbox","provider_updated_at":"2026-11-23T11:30:00Z"}'::jsonb);
  if not ok then raise exception 'an equal provider time should still write'; end if;
end $$;

-- An unknown state or source is refused by the table.
do $$
begin
  perform public.billing_put_entitlement('dddddddd-dddd-4ddd-8ddd-dddddddddddd', '{"source":"test","state":"gold","provider_updated_at":"2026-11-23T11:00:00Z"}'::jsonb);
  raise exception 'an unknown state was accepted';
exception when check_violation then null;
end $$;
do $$
begin
  perform public.billing_put_entitlement('dddddddd-dddd-4ddd-8ddd-dddddddddddd', '{"source":"card","state":"active","provider_updated_at":"2026-11-23T11:00:00Z"}'::jsonb);
  raise exception 'an unknown source was accepted';
exception when check_violation then null;
end $$;

-- An event id is recorded once.
do $$
begin
  if not public.billing_record_event('test', 'evt_1', 'subscription.updated', 'cccccccc-cccc-4ccc-8ccc-cccccccccccc') then
    raise exception 'a new event was not recorded';
  end if;
  if public.billing_record_event('test', 'evt_1', 'subscription.updated', 'cccccccc-cccc-4ccc-8ccc-cccccccccccc') then
    raise exception 'a repeated event was recorded twice';
  end if;
  if not public.billing_record_event('polar', 'evt_1', 'subscription.updated', null) then
    raise exception 'the same id from another provider is another event';
  end if;
end $$;
reset role;

-- ----------------------------------- nobody else reads or writes the billing tables
-- Signed in as the owner of the row, then as someone else, then not signed in: every read and
-- every write is refused outright (no privilege), not merely filtered.
create or replace function pg_temp.refused(p_sql text) returns boolean language plpgsql as $$
begin
  execute p_sql;
  return false;
exception when insufficient_privilege then
  return true;
end $$;

do $$
declare
  who text;
  probe text;
  probes text[] := array[
    'select count(*) from public.billing_entitlements',
    'select count(*) from public.billing_events',
    $q$insert into public.billing_entitlements (user_id, source, state, provider_updated_at) values ('cccccccc-cccc-4ccc-8ccc-cccccccccccc', 'test', 'active', now())$q$,
    $q$insert into public.billing_events (provider, event_id, type) values ('test', 'evt_forged', 'x')$q$,
    $q$update public.billing_entitlements set state = 'active', period_end = '2099-01-01' where user_id = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc'$q$,
    $q$delete from public.billing_entitlements$q$,
    $q$delete from public.billing_events$q$,
    $q$select public.billing_put_entitlement('cccccccc-cccc-4ccc-8ccc-cccccccccccc', '{"source":"test","state":"active","period_end":"2099-01-01","provider_updated_at":"2099-01-01"}'::jsonb)$q$,
    $q$select public.billing_record_event('test', 'evt_2', 'x', null)$q$,
    $q$select public.billing_record_release('test', 'released', 'cus_x', 'sub_x', null)$q$,
    $q$select public.billing_take_call('cccccccc-cccc-4ccc-8ccc-cccccccccccc', 'refresh', 0, 1000)$q$,
    'select count(*) from public.billing_calls',
    $q$insert into public.billing_calls (user_id, kind) values ('cccccccc-cccc-4ccc-8ccc-cccccccccccc', 'refresh')$q$,
    $q$delete from public.billing_calls$q$
  ];
begin
  foreach who in array array['cccccccc-cccc-4ccc-8ccc-cccccccccccc', 'dddddddd-dddd-4ddd-8ddd-dddddddddddd', ''] loop
    perform pg_temp.act_as(who);
    foreach probe in array probes loop
      execute format('set local role %I', case when who = '' then 'anon' else 'authenticated' end);
      if not pg_temp.refused(probe) then
        raise exception 'billing tables: % was allowed for %', probe, coalesce(nullif(who, ''), 'anon');
      end if;
      reset role;
    end loop;
  end loop;
end $$;

do $$
begin
  if (select state from public.billing_entitlements where user_id = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc' and source = 'test') <> 'canceling'
     or (select count(*) from public.billing_events) <> 2
     or (select count(*) from public.billing_calls) <> 0 then
    raise exception 'a refused probe changed the billing tables';
  end if;
end $$;

-- ----------------------------------------------------- R10: the call counts
-- refresh: at most once every 2 s and 60 an hour; checkout: 10 an hour. Counted in the database.
set role service_role;
do $$
declare
  d uuid := 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';
  ok boolean;
begin
  if not public.billing_take_call(d, 'refresh', 2000, 60) then raise exception 'a first refresh was refused'; end if;
  if public.billing_take_call(d, 'refresh', 2000, 60) then raise exception 'a refresh within 2 s was counted'; end if;
  -- Make the first one 3 s old: the gap has passed.
  update public.billing_calls set at = at - interval '3 seconds' where user_id = d and kind = 'refresh';
  if not public.billing_take_call(d, 'refresh', 2000, 60) then raise exception 'a refresh after 2 s was refused'; end if;
  -- 60 in the last hour (all older than the gap): the 61st is refused.
  delete from public.billing_calls where user_id = d;
  insert into public.billing_calls (user_id, kind, at) select d, 'refresh', clock_timestamp() - make_interval(mins => i) from generate_series(1, 59) i;
  if not public.billing_take_call(d, 'refresh', 2000, 60) then raise exception 'the 60th refresh in an hour was refused'; end if;
  update public.billing_calls set at = at - interval '3 seconds' where user_id = d and at > clock_timestamp() - interval '10 seconds';
  if public.billing_take_call(d, 'refresh', 2000, 60) then raise exception 'a 61st refresh in an hour was counted'; end if;
  -- An hour later the old ones no longer count (and are cleared).
  update public.billing_calls set at = at - interval '2 hours' where user_id = d;
  if not public.billing_take_call(d, 'refresh', 2000, 60) then raise exception 'refreshes older than an hour still counted'; end if;
  if (select count(*) from public.billing_calls where user_id = d and kind = 'refresh') <> 1 then raise exception 'old calls were not cleared'; end if;
  -- checkout: 10 an hour, no gap, counted apart from refresh.
  for i in 1..10 loop
    if not public.billing_take_call(d, 'checkout', 0, 10) then raise exception 'checkout % of 10 was refused', i; end if;
  end loop;
  if public.billing_take_call(d, 'checkout', 0, 10) then raise exception 'an 11th checkout in an hour was counted'; end if;
  -- Another person is counted apart.
  if not public.billing_take_call('cccccccc-cccc-4ccc-8ccc-cccccccccccc', 'checkout', 0, 10) then raise exception 'one person''s checkouts limited another'; end if;
  -- The lock is there (two calls at the same instant count one after the other).
  if pg_get_functiondef('public.billing_take_call(uuid, text, integer, integer)'::regprocedure) not like '%pg_advisory_xact_lock%' then
    raise exception 'billing_take_call counts without a lock';
  end if;
  -- An unknown kind is refused by the table.
  begin
    perform public.billing_take_call(d, 'portal', 0, 10);
    raise exception 'an unknown call kind was accepted';
  exception when check_violation then null;
  end;
  delete from public.billing_calls;
end $$;

-- A tombstone keeps the source and the provider ids.
do $$
begin
  perform public.billing_record_release('test', 'released', 'cus_t', 'sub_t', 'dddddddd-dddd-4ddd-8ddd-dddddddddddd');
  if not exists (select 1 from public.billing_events where type = 'released' and customer_id = 'cus_t' and subscription_id = 'sub_t' and event_id like 'released:%') then
    raise exception 'the tombstone was not kept';
  end if;
  -- The two kinds an unmatched event and a customer record left at the provider write.
  perform public.billing_record_release('polar', 'unmatched', 'cus_u', 'sub_u', null);
  perform public.billing_record_release('polar', 'customer_kept', 'external:dddddddd-dddd-4ddd-8ddd-dddddddddddd', null, 'dddddddd-dddd-4ddd-8ddd-dddddddddddd');
  if (select count(*) from public.billing_events where (type = 'unmatched' and customer_id = 'cus_u' and subscription_id = 'sub_u' and event_id like 'unmatched:%')
      or (type = 'customer_kept' and customer_id like 'external:%' and subscription_id is null and event_id like 'customer_kept:%')) <> 2 then
    raise exception 'an unmatched or customer_kept tombstone was not kept';
  end if;
  begin
    perform public.billing_record_release('test', 'whatever', null, null, null);
    raise exception 'an unknown release kind was accepted';
  exception when raise_exception then
    if sqlerrm <> 'unknown release kind' then raise; end if;
  end;
end $$;
reset role;

-- --------------------------------------------------------------- ai_reports
set role authenticated;
select pg_temp.act_as('cccccccc-cccc-4ccc-8ccc-cccccccccccc');

-- One's own report, with and without the question, and with user_id left to its default.
insert into public.ai_reports (user_id, kind, reason, answer, question)
values ('cccccccc-cccc-4ccc-8ccc-cccccccccccc', 'coach_answer', 'wrong', 'Rest two days a week.', 'How many rest days?');
insert into public.ai_reports (kind, reason, answer) values ('food_estimate', 'other', 'Pasta, 650 kcal');

-- Not for someone else.
do $$
begin
  insert into public.ai_reports (user_id, kind, reason, answer) values ('dddddddd-dddd-4ddd-8ddd-dddddddddddd', 'coach_answer', 'unsafe', 'x');
  raise exception 'a report was filed in someone else''s name';
exception when insufficient_privilege then null;
end $$;

-- Never read, changed or removed, one's own included.
do $$
begin
  if not pg_temp.refused('select count(*) from public.ai_reports') then raise exception 'a signed-in person can read reports'; end if;
  if not pg_temp.refused($q$update public.ai_reports set reason = 'other'$q$) then raise exception 'a signed-in person can change reports'; end if;
  if not pg_temp.refused('delete from public.ai_reports') then raise exception 'a signed-in person can delete reports'; end if;
  if not pg_temp.refused($q$insert into public.ai_reports (kind, reason, answer, created_at) values ('coach_answer', 'other', 'x', '2020-01-01')$q$) then
    raise exception 'a report may set its own time';
  end if;
end $$;

-- The fixed lists and the caps.
do $$
declare bad text;
begin
  foreach bad in array array[
    $q$insert into public.ai_reports (kind, reason, answer) values ('coach_answer', 'boring', 'x')$q$,
    $q$insert into public.ai_reports (kind, reason, answer) values ('chat', 'other', 'x')$q$,
    $q$insert into public.ai_reports (kind, reason, answer) values ('coach_answer', 'other', '')$q$,
    $q$insert into public.ai_reports (kind, reason, answer) values ('coach_answer', 'other', repeat('x', 2001))$q$,
    $q$insert into public.ai_reports (kind, reason, answer, question) values ('coach_answer', 'other', 'x', repeat('q', 501))$q$,
    $q$insert into public.ai_reports (kind, reason, answer, question) values ('coach_answer', 'other', 'x', '')$q$
  ] loop
    begin
      execute bad;
      raise exception 'accepted: %', bad;
    exception when check_violation then null;
    end;
  end loop;
  -- At the caps exactly: accepted.
  insert into public.ai_reports (kind, reason, answer, question) values ('coach_answer', 'offensive', repeat('x', 2000), repeat('q', 500));
end $$;

-- Not signed in: nothing at all.
reset role;
set role anon;
select pg_temp.act_as('');
do $$
begin
  if not pg_temp.refused($q$insert into public.ai_reports (user_id, kind, reason, answer) values ('cccccccc-cccc-4ccc-8ccc-cccccccccccc', 'coach_answer', 'other', 'x')$q$) then
    raise exception 'anon can file a report';
  end if;
  if not pg_temp.refused('select count(*) from public.ai_reports') then raise exception 'anon can read reports'; end if;
end $$;
reset role;

-- At most 20 in a day per person (3 so far).
set role authenticated;
select pg_temp.act_as('cccccccc-cccc-4ccc-8ccc-cccccccccccc');
do $$
begin
  for i in 1..17 loop
    insert into public.ai_reports (kind, reason, answer) values ('coach_answer', 'other', 'x');
  end loop;
  begin
    insert into public.ai_reports (kind, reason, answer) values ('coach_answer', 'other', 'x');
    raise exception 'a 21st report in a day was accepted';
  exception when raise_exception then
    if sqlerrm <> 'report_limit' then raise; end if;
  end;
end $$;
reset role;

-- R13: the per-day cap takes an advisory lock before it counts.
do $$
begin
  if pg_get_functiondef('public.ai_reports_limit()'::regprocedure) not like '%pg_advisory_xact_lock%' then
    raise exception 'the report cap counts without a lock';
  end if;
end $$;

-- The service role reads them.
set role service_role;
do $$
declare n int;
begin
  select count(*) into n from public.ai_reports where user_id = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
  if n <> 20 then raise exception 'the service role should read 20 reports, read %', n; end if;
  if exists (select 1 from public.ai_reports where user_id <> 'cccccccc-cccc-4ccc-8ccc-cccccccccccc') then
    raise exception 'a report belongs to someone who did not file it';
  end if;
end $$;
reset role;

-- ------------------------------------------------------- deleting the account
-- R5: delete_my_account refuses while a paid row is open (an older app calls it directly), whatever
-- the row's dates say; a promotional grant never blocks. Once the billing function has closed the row
-- (cancel-now), the delete goes ahead: the rows go with the account, and the event log keeps the ids
-- and tombstones without the person.
create or replace function pg_temp.delete_refused() returns boolean language plpgsql as $$
begin
  perform public.delete_my_account();
  return false;
exception when raise_exception then
  if sqlerrm <> 'plan_active' then raise; end if;
  return true;
end $$;

do $$
begin
  set local role authenticated;
  perform pg_temp.act_as('cccccccc-cccc-4ccc-8ccc-cccccccccccc');
  -- c holds a canceling test row (and a promotional one): refused.
  if not pg_temp.delete_refused() then raise exception 'an account with an open paid plan was deleted'; end if;
  reset role;
  if not exists (select 1 from auth.users where id = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc') then raise exception 'the refused delete removed the account'; end if;
  -- An open row long past its dates still refuses (only expired or revoked lets it go).
  update public.billing_entitlements set period_end = '2020-01-01', state = 'past_due' where user_id = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc' and source = 'test';
  set local role authenticated;
  perform pg_temp.act_as('cccccccc-cccc-4ccc-8ccc-cccccccccccc');
  if not pg_temp.delete_refused() then raise exception 'an open row with past dates did not refuse the delete'; end if;
  reset role;
end $$;

-- cancel-now closes the paid row (the service role writes it expired); the promotional one stays.
set role service_role;
do $$
begin
  perform public.billing_put_entitlement('cccccccc-cccc-4ccc-8ccc-cccccccccccc', '{
    "source":"test","provider_customer_id":"cus_c","state":"expired","period_end":"2026-11-23T12:00:00Z",
    "environment":"sandbox","provider_updated_at":"2026-11-23T11:30:00Z"}'::jsonb);
  perform public.billing_record_release('test', 'released', 'cus_c', 'sub_c', 'cccccccc-cccc-4ccc-8ccc-cccccccccccc');
end $$;
reset role;

set role authenticated;
select pg_temp.act_as('cccccccc-cccc-4ccc-8ccc-cccccccccccc');
select public.delete_my_account();
reset role;
do $$
begin
  if exists (select 1 from public.billing_entitlements where user_id = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc') then
    raise exception 'the entitlement survived account deletion';
  end if;
  if exists (select 1 from public.ai_reports where user_id = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc') then
    raise exception 'reports survived account deletion';
  end if;
  if (select count(*) from public.billing_events where event_id = 'evt_1') <> 2
     or not exists (select 1 from public.billing_events where type = 'released' and customer_id = 'cus_c' and subscription_id = 'sub_c')
     or exists (select 1 from public.billing_events where user_id = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc') then
    raise exception 'the event log should keep the ids and the tombstone without the person';
  end if;
end $$;

-- A revoked row lets the delete go too (d: revoked, then deleted).
set role service_role;
select public.billing_put_entitlement('dddddddd-dddd-4ddd-8ddd-dddddddddddd', '{
  "source":"test","state":"revoked","period_end":"2099-01-01T00:00:00Z","environment":"live","provider_updated_at":"2026-11-23T11:00:00Z"}'::jsonb);
reset role;
set role authenticated;
select pg_temp.act_as('dddddddd-dddd-4ddd-8ddd-dddddddddddd');
select public.delete_my_account();
reset role;
do $$
begin
  if exists (select 1 from auth.users where id = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd') then raise exception 'a revoked plan blocked the delete'; end if;
end $$;

do $$ begin raise notice 'BILLING AND REPORT TESTS PASSED'; end $$;
