-- Behavioural tests for doing things together (20261202000000_friends_together.sql): circles
-- ("Together this week"), logging buddies, kind notes and saved meals shown to friends.
-- Runs after friends_meals.sql in the same database, with people of its own. Every block
-- raises on failure, so the script either runs to the final notice or stops at the first
-- broken rule.
\set ON_ERROR_STOP on

-- Ann is friends with Bob, Cid, Dot, Fin, Gil and Hob; Bob also with Cid and Eve. Dot is 17.
-- Eve is not Ann's friend. Ivy never turns friends on.
insert into auth.users (id) values
  ('f1111111-1111-4111-8111-111111111111'),
  ('f2222222-2222-4222-8222-222222222222'),
  ('f3333333-3333-4333-8333-333333333333'),
  ('f4444444-4444-4444-8444-444444444444'),
  ('f5555555-5555-4555-8555-555555555555'),
  ('f6666666-6666-4666-8666-666666666666'),
  ('f7777777-7777-4777-8777-777777777777'),
  ('f8888888-8888-4888-8888-888888888888'),
  ('f9999999-9999-4999-8999-999999999999');

insert into public.profiles (user_id, data) values
  ('f1111111-1111-4111-8111-111111111111', '{"name": "Ann", "birthDate": "1990-04-02"}'),
  ('f2222222-2222-4222-8222-222222222222', '{"name": "Bob", "birthDate": "1988-02-11"}'),
  ('f3333333-3333-4333-8333-333333333333', '{"name": "Cid", "birthDate": "1985-12-30"}'),
  ('f4444444-4444-4444-8444-444444444444', jsonb_build_object('name', 'Dot', 'birthDate', to_char(current_date - interval '17 years', 'YYYY-MM-DD'))),
  ('f5555555-5555-4555-8555-555555555555', '{"name": "Eve", "birthDate": "1979-07-07"}'),
  ('f6666666-6666-4666-8666-666666666666', '{"name": "Fin", "birthDate": "1991-03-03"}'),
  ('f7777777-7777-4777-8777-777777777777', '{"name": "Gil", "birthDate": "1992-01-15"}'),
  ('f8888888-8888-4888-8888-888888888888', '{"name": "Hob", "birthDate": "1993-05-05"}');

create or replace function pg_temp.act_as(p_user text) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claim.sub', coalesce(p_user, ''), false);
end $$;

create temp table keep (k text primary key, v text);
grant all on keep to authenticated;
create or replace function pg_temp.kept(p text) returns text language sql as $$ select v from keep where k = p $$;
create or replace function pg_temp.id(p text) returns uuid language sql as $$ select v::uuid from keep where k = p $$;
create or replace function pg_temp.keys_of(p jsonb) returns text[] language sql as $$
  select coalesce(array_agg(k order by k), '{}') from jsonb_object_keys(p) k
$$;
-- A day as the phone writes it, n days from the server's today.
create or replace function pg_temp.day(n integer) returns text language sql as $$ select to_char(current_date + n, 'YYYY-MM-DD') $$;
create or replace function pg_temp.week() returns date language sql as $$ select current_date - (extract(isodow from current_date)::integer - 1) $$;
create or replace function pg_temp.signals(p_minutes integer, p_last integer, p_logged integer[]) returns jsonb language sql as $$
  select jsonb_build_object('today', pg_temp.day(0), 'minutes', p_minutes, 'last_minutes', p_last,
    'logged', coalesce((select jsonb_agg(pg_temp.day(-x)) from unnest(p_logged) x), '[]'::jsonb))
$$;

-- ---------------------------------------------------------------- set up
set role authenticated;
do $$
declare
  who text[] := array['ann', 'bob', 'cid', 'dot', 'eve', 'fin', 'gil', 'hob', 'ivy'];
  ids text[] := array['f1111111-1111-4111-8111-111111111111', 'f2222222-2222-4222-8222-222222222222', 'f3333333-3333-4333-8333-333333333333',
                      'f4444444-4444-4444-8444-444444444444', 'f5555555-5555-4555-8555-555555555555', 'f6666666-6666-4666-8666-666666666666',
                      'f7777777-7777-4777-8777-777777777777', 'f8888888-8888-4888-8888-888888888888', 'f9999999-9999-4999-8999-999999999999'];
  card jsonb;
  x text;
begin
  for i in 1..9 loop
    insert into keep values (who[i], ids[i]);
    if who[i] = 'ivy' then continue; end if;
    perform pg_temp.act_as(ids[i]);
    card := public.social_setup(initcap(who[i]), '', '{}');
    insert into keep values (who[i] || '-code', card ->> 'code'), (who[i] || '-key', card ->> 'share_key');
  end loop;
  foreach x in array array['bob', 'cid', 'dot', 'fin', 'gil', 'hob'] loop
    perform pg_temp.act_as(pg_temp.kept(x));
    perform public.friend_request(pg_temp.kept('ann-code'));
  end loop;
  perform pg_temp.act_as(pg_temp.kept('cid'));
  perform public.friend_request(pg_temp.kept('bob-code'));
  perform pg_temp.act_as(pg_temp.kept('eve'));
  perform public.friend_request(pg_temp.kept('bob-code'));
  perform pg_temp.act_as(pg_temp.kept('ann'));
  foreach x in array array['bob', 'cid', 'dot', 'fin', 'gil', 'hob'] loop
    if public.friend_respond(pg_temp.id(x), true) <> 'accepted' then raise exception 'accept %', x; end if;
  end loop;
  perform pg_temp.act_as(pg_temp.kept('bob'));
  perform public.friend_respond(pg_temp.id('cid'), true);
  perform public.friend_respond(pg_temp.id('eve'), true);
end $$;

-- ------------------------------------------- the tables are closed to the API
do $$
declare
  t text;
begin
  perform pg_temp.act_as(pg_temp.kept('ann'));
  foreach t in array array['social_signals', 'together_goals', 'together_members', 'log_buddies', 'friend_notes'] loop
    begin
      execute format('select count(*) from public.%I', t);
      raise exception 'authenticated could read %', t;
    exception when insufficient_privilege then null;
    end;
  end loop;
  begin
    perform public.social_buddy_run('{}', '{}', current_date, current_date, 0, true);
    raise exception 'authenticated could call a helper';
  exception when insufficient_privilege then null;
  end;
end $$;

-- ------------------------------------------- the run of a buddy pair (pure)
reset role;
do $$
declare
  wk date[] := array(select d::date from generate_series('2026-11-23'::date, '2026-11-28'::date, interval '1 day') d);
  r jsonb;
begin
  r := public.social_buddy_run(wk, wk, '2026-11-23', '2026-11-28', 0, true);
  if r <> '{"run": 6, "kept": false}' then raise exception 'six days both: %', r; end if;
  r := public.social_buddy_run('{2026-11-23,2026-11-24,2026-11-26,2026-11-27}', '{2026-11-23,2026-11-24,2026-11-26,2026-11-27}', '2026-11-23', '2026-11-27', 0, false);
  if r <> '{"run": 4, "kept": true}' then raise exception 'one missed day is kept: %', r; end if;
  -- One of the two logging is not both.
  r := public.social_buddy_run('{2026-11-23,2026-11-24,2026-11-25,2026-11-26,2026-11-27}', '{2026-11-23,2026-11-24,2026-11-26,2026-11-27}', '2026-11-23', '2026-11-27', 0, false);
  if r <> '{"run": 4, "kept": true}' then raise exception 'a day only one logged is missed: %', r; end if;
  r := public.social_buddy_run('{2026-11-23,2026-11-24,2026-11-27}', '{2026-11-23,2026-11-24,2026-11-27}', '2026-11-23', '2026-11-27', 0, false);
  if r <> '{"run": 1, "kept": false}' then raise exception 'a second missed day ends the run: %', r; end if;
  -- One missed day in each of two weeks: both kept.
  r := public.social_buddy_run(
    array(select d::date from generate_series('2026-11-16'::date, '2026-11-29'::date, interval '1 day') d where d::date not in ('2026-11-18', '2026-11-25')),
    array(select d::date from generate_series('2026-11-16'::date, '2026-11-29'::date, interval '1 day') d),
    '2026-11-16', '2026-11-29', 0, false);
  if r <> '{"run": 12, "kept": true}' then raise exception 'a missed day a week: %', r; end if;
  -- Today is not over: not logged yet is not missed.
  r := public.social_buddy_run(wk[1:5], wk[1:5], '2026-11-23', '2026-11-28', 0, true);
  if r <> '{"run": 5, "kept": false}' then raise exception 'today is open: %', r; end if;
  r := public.social_buddy_run('{2026-11-23}', '{2026-11-23}', '2026-11-23', '2026-11-23', 10, true);
  if r <> '{"run": 11, "kept": false}' then raise exception 'the settled run carries on: %', r; end if;
  if (public.social_buddy_run('{}', '{}', null, '2026-11-23', 0, true) ->> 'run')::integer <> 0 then raise exception 'no start, no run'; end if;
  if public.social_week_of('2026-11-29') <> '2026-11-23' or public.social_week_of('2026-11-23') <> '2026-11-23' then raise exception 'week_of'; end if;
end $$;
set role authenticated;

-- ------------------------------------------------ signals: kept only while wanted
do $$
declare
  o jsonb;
begin
  perform pg_temp.act_as(pg_temp.kept('ivy'));
  if public.social_signals_publish(pg_temp.signals(30, 0, '{0}')) <> 'no_card' then raise exception 'no card'; end if;
  perform pg_temp.act_as(pg_temp.kept('ann'));
  if public.social_signals_publish(pg_temp.signals(30, 0, '{0}')) <> 'not_needed' then raise exception 'nothing wants them yet'; end if;
  if public.social_signals_publish('{"today": "2031-02-30"}') <> 'invalid' then raise exception 'a date that is not one'; end if;
  if public.social_signals_publish(jsonb_build_object('today', pg_temp.day(-3))) <> 'invalid' then raise exception 'a day far from today'; end if;
  if public.social_signals_publish('"x"') <> 'invalid' then raise exception 'not an object'; end if;
  o := public.friends_overview();
  if o -> 'signals' <> jsonb_build_object('minutes', false, 'logged', false, 'today', pg_temp.day(0)) then raise exception 'signals wanted: %', o -> 'signals'; end if;
  reset role;
  if exists (select 1 from public.social_signals where user_id = pg_temp.id('ann')) then raise exception 'a signal row with nothing wanting it'; end if;
  set role authenticated;
end $$;

-- ------------------------------------------------ circles: starting and inviting
do $$
declare
  r jsonb;
  t text;
begin
  perform pg_temp.act_as(pg_temp.kept('ann'));
  if public.together_start('steps', 100, '{}') ->> 'status' <> 'invalid' then raise exception 'an unknown kind'; end if;
  if public.together_start('minutes', 10, '{}') ->> 'status' <> 'invalid' then raise exception 'a minutes target under 30'; end if;
  if public.together_start('days', 43, '{}') ->> 'status' <> 'invalid' then raise exception 'a days target over 42'; end if;
  if public.together_start('minutes', 600, array[pg_temp.id('eve')]) ->> 'status' <> 'not_friends' then raise exception 'inviting a stranger'; end if;
  if public.together_start('minutes', 600, array[pg_temp.id('bob'), pg_temp.id('cid'), pg_temp.id('dot'), pg_temp.id('fin'), pg_temp.id('gil'), pg_temp.id('hob')]) ->> 'status' <> 'too_many' then
    raise exception 'six invited';
  end if;
  perform pg_temp.act_as(pg_temp.kept('dot'));
  if public.together_start('days', 10, '{}') ->> 'status' <> 'under_18' then raise exception 'a days circle under 18'; end if;
  perform pg_temp.act_as(pg_temp.kept('ivy'));
  if public.together_start('minutes', 600, '{}') ->> 'status' <> 'no_card' then raise exception 'no card'; end if;

  perform pg_temp.act_as(pg_temp.kept('ann'));
  r := public.together_start('minutes', 600, array[pg_temp.id('bob'), pg_temp.id('dot'), pg_temp.id('ann')]);
  if r ->> 'status' <> 'ok' then raise exception 'start: %', r; end if;
  insert into keep values ('circle', r ->> 'id');
  if public.together_start('days', 10, '{}') ->> 'status' <> 'in_circle' then raise exception 'a second circle'; end if;

  -- Bob sees the invitation, with who is in and who asked.
  perform pg_temp.act_as(pg_temp.kept('bob'));
  r := public.friends_overview() -> 'together_invites';
  if jsonb_array_length(r) <> 1 or r -> 0 ->> 'id' <> pg_temp.kept('circle') or r -> 0 -> 'from' ->> 'display_name' <> 'Ann'
     or r -> 0 ->> 'kind' <> 'minutes' or (r -> 0 ->> 'target')::integer <> 600 or r -> 0 -> 'members' -> 0 ->> 'display_name' <> 'Ann' then
    raise exception 'invitation: %', r;
  end if;
  if pg_temp.keys_of(r -> 0) <> array['created_at', 'from', 'id', 'kind', 'members', 'target'] then raise exception 'invitation keys %', pg_temp.keys_of(r -> 0); end if;
  if public.together_respond(gen_random_uuid(), true) <> 'not_found' then raise exception 'no such circle'; end if;
  if public.together_respond(pg_temp.id('circle'), true) <> 'joined' then raise exception 'Bob joins'; end if;
  if public.together_respond(pg_temp.id('circle'), true) <> 'not_found' then raise exception 'joined twice'; end if;
  -- Bob invites Cid (his friend, also Ann's) and Eve (his friend, not Ann's).
  if public.together_invite(pg_temp.id('circle'), array[pg_temp.id('hob')]) <> 'not_friends' then raise exception 'Bob invites a stranger'; end if;
  if public.together_invite(pg_temp.id('circle'), array[pg_temp.id('cid'), pg_temp.id('eve')]) <> 'ok' then raise exception 'Bob invites'; end if;
  perform pg_temp.act_as(pg_temp.kept('fin'));
  if public.together_invite(pg_temp.id('circle'), array[pg_temp.id('ann')]) <> 'not_member' then raise exception 'outsider invites'; end if;

  -- Six at most, joined and invited together: Ann, Bob, Dot, Cid, Eve and one more.
  perform pg_temp.act_as(pg_temp.kept('ann'));
  if public.together_invite(pg_temp.id('circle'), array[pg_temp.id('fin'), pg_temp.id('gil')]) <> 'too_many' then raise exception 'seven'; end if;
  if public.together_invite(pg_temp.id('circle'), array[pg_temp.id('fin')]) <> 'ok' then raise exception 'six'; end if;
  -- Inviting someone already there is passed over without a word.
  if public.together_invite(pg_temp.id('circle'), array[pg_temp.id('bob')]) <> 'ok' then raise exception 'again'; end if;

  -- Fin declines silently; Ann still sees Fin as asked.
  perform pg_temp.act_as(pg_temp.kept('fin'));
  if public.together_respond(pg_temp.id('circle'), false) <> 'declined' then raise exception 'Fin declines'; end if;
  if jsonb_array_length(public.friends_overview() -> 'together_invites') <> 0 then raise exception 'a declined invitation shows'; end if;
  perform pg_temp.act_as(pg_temp.kept('ann'));
  r := public.friends_overview() -> 'together' -> 0;
  if not (r -> 'asked') @> jsonb_build_array(pg_temp.kept('fin'), pg_temp.kept('dot')) then raise exception 'asked: %', r -> 'asked'; end if;
  if public.together_invite(pg_temp.id('circle'), array[pg_temp.id('fin')]) <> 'ok' then raise exception 'reinvite'; end if;
  reset role;
  if (select status from public.together_members where goal_id = pg_temp.id('circle') and user_id = pg_temp.id('fin')) <> 'declined' then
    raise exception 'a decline is final for the circle';
  end if;
  set role authenticated;

  -- Dot (17) may join a minutes circle.
  perform pg_temp.act_as(pg_temp.kept('dot'));
  if public.together_respond(pg_temp.id('circle'), true) <> 'joined' then raise exception 'Dot joins minutes'; end if;
end $$;

-- ------------------------------------------------ circles: one cup, no per-person figure
do $$
declare
  o jsonb;
  c jsonb;
begin
  -- Ann 100 this week (40 last), Bob 90 (10 last); Dot sends nothing. Cid and Eve are invited, not in.
  perform pg_temp.act_as(pg_temp.kept('ann'));
  if public.social_signals_publish(pg_temp.signals(100, 40, '{0,1,2}')) <> 'ok' then raise exception 'Ann publishes'; end if;
  perform pg_temp.act_as(pg_temp.kept('bob'));
  if public.social_signals_publish(pg_temp.signals(90, 10, '{0}')) <> 'ok' then raise exception 'Bob publishes'; end if;
  perform pg_temp.act_as(pg_temp.kept('cid'));
  if public.social_signals_publish(pg_temp.signals(500, 0, '{}')) <> 'not_needed' then raise exception 'Cid is only invited'; end if;
  reset role;
  if exists (select 1 from public.social_signals where logged is not null) then raise exception 'days logged kept for a minutes circle'; end if;
  set role authenticated;

  perform pg_temp.act_as(pg_temp.kept('ann'));
  o := public.friends_overview();
  if o -> 'signals' ->> 'minutes' <> 'true' or o -> 'signals' ->> 'logged' <> 'false' then raise exception 'wanted: %', o -> 'signals'; end if;
  c := o -> 'together' -> 0;
  if pg_temp.keys_of(c) <> array['asked', 'id', 'kind', 'last_week', 'members', 'target', 'total', 'week'] then raise exception 'circle keys %', pg_temp.keys_of(c); end if;
  if (c ->> 'total')::integer <> 190 or (c ->> 'target')::integer <> 600 or c ->> 'week' <> to_char(pg_temp.week(), 'YYYY-MM-DD') then
    raise exception 'this week: %', c;
  end if;
  if c -> 'last_week' <> 'null' then raise exception 'a last week before the circle: %', c -> 'last_week'; end if;
  -- As if the circle had started last week.
  reset role;
  update public.together_goals set first_week = first_week - 7, target_week = target_week - 7 where id = pg_temp.id('circle');
  set role authenticated;
  c := public.friends_overview() -> 'together' -> 0;
  if (c -> 'last_week' ->> 'total')::integer <> 50 or (c -> 'last_week' ->> 'target')::integer <> 600 then raise exception 'last week: %', c -> 'last_week'; end if;
  if jsonb_array_length(c -> 'members') <> 3 or c -> 'members' -> 0 ->> 'display_name' <> 'Ann' or c -> 'members' -> 2 ->> 'display_name' <> 'Dot'
     or (c -> 'members' -> 0 ->> 'me')::boolean is not true then
    raise exception 'members by name: %', c -> 'members';
  end if;
  if pg_temp.keys_of(c -> 'members' -> 0) <> array['avatar', 'display_name', 'me', 'user_id'] then raise exception 'a member carries a figure: %', c -> 'members' -> 0; end if;
  if exists (select 1 from jsonb_array_elements(c -> 'members') x where x ? 'minutes' or x ? 'total' or x ? 'days') then raise exception 'a per-person figure: %', c; end if;

  -- Change the goal: from this week on; last week keeps its target.
  if public.together_set_target(pg_temp.id('circle'), 20) <> 'invalid' then raise exception 'a minutes target of 20'; end if;
  if public.together_set_target(pg_temp.id('circle'), 450) <> 'ok' then raise exception 'set target'; end if;
  c := public.friends_overview() -> 'together' -> 0;
  if (c ->> 'target')::integer <> 450 or (c -> 'last_week' ->> 'target')::integer <> 600 then raise exception 'targets after change: %', c; end if;
  perform pg_temp.act_as(pg_temp.kept('cid'));
  if public.together_set_target(pg_temp.id('circle'), 300) <> 'not_member' then raise exception 'an invitee changes the goal'; end if;
end $$;

-- ------------------------------------------------ days circles and minors
do $$
declare
  r jsonb;
begin
  perform pg_temp.act_as(pg_temp.kept('gil'));
  r := public.together_start('days', 10, array[pg_temp.id('ann')]);
  if r ->> 'status' <> 'ok' then raise exception 'Gil starts days: %', r; end if;
  insert into keep values ('days', r ->> 'id');
  if public.together_invite(pg_temp.id('days'), array[pg_temp.id('ann')]) <> 'ok' then raise exception 'reinvite Ann'; end if;
  -- Ann is in a circle already.
  perform pg_temp.act_as(pg_temp.kept('ann'));
  if public.together_respond(pg_temp.id('days'), true) <> 'in_circle' then raise exception 'second circle'; end if;
  -- Gil's own friend Hob? Not friends. Dot is not Gil's friend either; Ann invites nobody here.
  perform pg_temp.act_as(pg_temp.kept('hob'));
  if public.together_start('days', 10, array[pg_temp.id('ann')]) ->> 'status' <> 'ok' then raise exception 'Hob starts'; end if;
  insert into keep values ('hob-days', (select (public.friends_overview() -> 'together' -> 0 ->> 'id')));
  -- A days circle is never shown to someone under 18, and they cannot join it.
  reset role;
  insert into public.together_members (goal_id, user_id, status, invited_by) values (pg_temp.id('hob-days'), pg_temp.id('dot'), 'invited', pg_temp.id('hob'));
  set role authenticated;
  perform pg_temp.act_as(pg_temp.kept('dot'));
  if jsonb_array_length(public.friends_overview() -> 'together_invites') <> 0 then raise exception 'a days circle shown to a minor'; end if;
  if public.together_respond(pg_temp.id('hob-days'), true) <> 'not_found' then raise exception 'a minor joins days'; end if;
  -- Days logged pour in: Gil logged today and yesterday this week.
  perform pg_temp.act_as(pg_temp.kept('gil'));
  if public.social_signals_publish(pg_temp.signals(999, 999, '{0,1,40}')) <> 'ok' then raise exception 'Gil publishes'; end if;
  reset role;
  if (select minutes from public.social_signals where user_id = pg_temp.id('gil')) is not null then raise exception 'minutes kept for a days circle'; end if;
  if (select logged from public.social_signals where user_id = pg_temp.id('gil')) @> array[current_date - 40] then raise exception 'a day older than 35 kept'; end if;
  set role authenticated;
  r := public.friends_overview() -> 'together' -> 0;
  if (r ->> 'total')::integer <> (select count(*) from unnest(array[current_date, current_date - 1]) d where d >= pg_temp.week()) then
    raise exception 'days total: %', r;
  end if;
  -- Gil leaves: the circle is empty and goes, with Ann's invitation; Gil's signals go.
  if public.together_leave(pg_temp.id('days')) <> 'left' then raise exception 'Gil leaves'; end if;
  if public.together_leave(pg_temp.id('days')) <> 'not_found' then raise exception 'leaves twice'; end if;
  reset role;
  if exists (select 1 from public.together_goals where id = pg_temp.id('days')) then raise exception 'an empty circle stays'; end if;
  if exists (select 1 from public.social_signals where user_id = pg_temp.id('gil')) then raise exception 'signals stay after leaving'; end if;
  set role authenticated;
end $$;

-- ------------------------------------------------ buddies
do $$
declare
  o jsonb;
  b jsonb;
begin
  perform pg_temp.act_as(pg_temp.kept('ann'));
  if public.buddy_invite(pg_temp.id('eve')) <> 'not_friends' then raise exception 'buddy a stranger'; end if;
  if public.buddy_invite(pg_temp.id('ann')) <> 'not_friends' then raise exception 'buddy oneself'; end if;
  if public.buddy_invite(pg_temp.id('bob')) <> 'sent' then raise exception 'ask Bob'; end if;
  if public.buddy_invite(pg_temp.id('bob')) <> 'already' then raise exception 'ask Bob twice'; end if;
  if public.buddy_invite(pg_temp.id('cid')) <> 'sent' then raise exception 'ask Cid'; end if;
  if public.buddy_invite(pg_temp.id('fin')) <> 'sent' then raise exception 'ask Fin'; end if;
  if public.buddy_invite(pg_temp.id('gil')) <> 'too_many' then raise exception 'a fourth'; end if;
  -- Cid declines silently: Ann still sees "asked", and asking again says sent.
  perform pg_temp.act_as(pg_temp.kept('cid'));
  if jsonb_array_length(public.friends_overview() -> 'buddy_invites') <> 1 then raise exception 'Cid sees the ask'; end if;
  if public.buddy_respond(pg_temp.id('ann'), false) <> 'declined' then raise exception 'Cid declines'; end if;
  if jsonb_array_length(public.friends_overview() -> 'buddy_invites') <> 0 then raise exception 'a declined ask shows'; end if;
  perform pg_temp.act_as(pg_temp.kept('ann'));
  if public.buddy_invite(pg_temp.id('cid')) <> 'sent' then raise exception 'a decline is not told'; end if;
  o := public.friends_overview();
  if (select count(*) from jsonb_array_elements(o -> 'buddies') x where x ->> 'status' = 'asked') <> 3 then raise exception 'asked: %', o -> 'buddies'; end if;
  -- Ann takes back the ask to Fin.
  if public.buddy_stop(pg_temp.id('fin')) <> 'stopped' then raise exception 'take back'; end if;
  -- Bob accepts.
  perform pg_temp.act_as(pg_temp.kept('bob'));
  if public.buddy_respond(pg_temp.id('ann'), true) <> 'together' then raise exception 'Bob accepts'; end if;
  if public.buddy_respond(pg_temp.id('ann'), true) <> 'not_found' then raise exception 'twice'; end if;
  -- Both logged today, only Bob yesterday... wait for the week: Ann logged 0 and 1 days ago, Bob 0 and 2.
  if public.social_signals_publish(pg_temp.signals(90, 10, '{0,2}')) <> 'ok' then raise exception 'Bob publishes'; end if;
  perform pg_temp.act_as(pg_temp.kept('ann'));
  if public.social_signals_publish(pg_temp.signals(100, 40, '{0,1}')) <> 'ok' then raise exception 'Ann publishes'; end if;
  reset role;
  if (select logged from public.social_signals where user_id = pg_temp.id('ann')) is null then raise exception 'a buddy wants days logged'; end if;
  -- The pair started three days ago.
  update public.log_buddies set start_day = current_date - 3 where requester = pg_temp.id('ann') and addressee = pg_temp.id('bob');
  set role authenticated;
  o := public.friends_overview();
  if o -> 'signals' ->> 'logged' <> 'true' then raise exception 'logged wanted'; end if;
  b := (select x from jsonb_array_elements(o -> 'buddies') x where x ->> 'user_id' = pg_temp.kept('bob'));
  if pg_temp.keys_of(b) <> array['avatar', 'display_name', 'kept', 'run', 'since', 'status', 'user_id', 'week'] then raise exception 'buddy keys %', pg_temp.keys_of(b); end if;
  if b ->> 'status' <> 'together' or jsonb_array_length(b -> 'week') <> 7 then raise exception 'buddy: %', b; end if;
  if (select (x ->> 'count')::integer from jsonb_array_elements(b -> 'week') x where x ->> 'day' = pg_temp.day(0)) <> 2 then raise exception 'today both: %', b -> 'week'; end if;
  if exists (select 1 from jsonb_array_elements(b -> 'week') x where x ->> 'day' = pg_temp.day(-1) and x ->> 'count' <> '1') then raise exception 'yesterday one: %', b -> 'week'; end if;
  if exists (select 1 from jsonb_array_elements(b -> 'week') x where x ->> 'day' > pg_temp.day(0) and x -> 'count' <> 'null') then raise exception 'days to come: %', b -> 'week'; end if;
  if exists (select 1 from jsonb_array_elements(b -> 'week') x where x ->> 'day' < pg_temp.day(-3) and x -> 'count' <> 'null') then raise exception 'days before the pair: %', b -> 'week'; end if;
  -- Days -3, -2, -1 each had at most one: two missed in a row (when in one week) end the run; today counts 1.
  if (b ->> 'run')::integer not in (1, 2) then raise exception 'run: %', b; end if;
  if b::text ~ 'kcal|food|items' then raise exception 'a buddy carries food: %', b; end if;
  -- Bob stops: silent, and the signals nobody wants go.
  perform pg_temp.act_as(pg_temp.kept('bob'));
  if public.buddy_stop(pg_temp.id('ann')) <> 'stopped' then raise exception 'Bob stops'; end if;
  reset role;
  if (select logged from public.social_signals where user_id = pg_temp.id('bob')) is not null then raise exception 'Bob still sends days logged'; end if;
  set role authenticated;
  -- Hob asks Ann; Ann asking back is a yes.
  perform pg_temp.act_as(pg_temp.kept('hob'));
  if public.buddy_invite(pg_temp.id('ann')) <> 'sent' then raise exception 'Hob asks'; end if;
  perform pg_temp.act_as(pg_temp.kept('ann'));
  if public.buddy_invite(pg_temp.id('hob')) <> 'accepted' then raise exception 'asking back'; end if;
  -- The limit: 20 asks a day.
  reset role;
  update public.social_limits set buddy_writes = 20, buddy_writes_window = now() where user_id = pg_temp.id('dot');
  set role authenticated;
  perform pg_temp.act_as(pg_temp.kept('dot'));
  if public.buddy_invite(pg_temp.id('ann')) <> 'limit' then raise exception 'buddy limit'; end if;
end $$;

-- ------------------------------------------------ the settled run outlasts the 35 days kept
reset role;
do $$
begin
  update public.log_buddies set start_day = current_date - 60, run_base = 0, run_base_day = null
    where requester = pg_temp.id('hob') and addressee = pg_temp.id('ann');
  update public.social_signals set logged = array(select current_date - k from generate_series(0, 34) k) where user_id = pg_temp.id('ann');
  insert into public.social_signals (user_id, today, week, logged) values
    (pg_temp.id('hob'), current_date, pg_temp.week(), array(select current_date - k from generate_series(0, 34) k))
    on conflict (user_id) do update set logged = excluded.logged;
end $$;
set role authenticated;
do $$
declare
  b jsonb;
  first_run integer;
begin
  perform pg_temp.act_as(pg_temp.kept('ann'));
  b := (select x from jsonb_array_elements(public.friends_overview() -> 'buddies') x where x ->> 'user_id' = pg_temp.kept('hob'));
  first_run := (b ->> 'run')::integer;
  reset role;
  if (select run_base_day from public.log_buddies where requester = pg_temp.id('hob')) is null then raise exception 'not settled'; end if;
  set role authenticated;
  -- Reading again gives the same run.
  b := (select x from jsonb_array_elements(public.friends_overview() -> 'buddies') x where x ->> 'user_id' = pg_temp.kept('hob'));
  if (b ->> 'run')::integer <> first_run or first_run < 30 then raise exception 'settled run % then %', first_run, b ->> 'run'; end if;
end $$;

-- ------------------------------------------------ notes
do $$
declare
  o jsonb;
begin
  perform pg_temp.act_as(pg_temp.kept('ann'));
  if public.send_note(pg_temp.id('bob'), 'you failed') <> 'invalid' then raise exception 'free text'; end if;
  if public.send_note(pg_temp.id('eve'), 'nice_week') <> 'not_friends' then raise exception 'a stranger'; end if;
  if public.send_note(pg_temp.id('bob'), 'nice_week') <> 'ok' then raise exception 'note to Bob'; end if;
  if public.send_note(pg_temp.id('bob'), 'walk_later') <> 'already_today' then raise exception 'two a day to Bob'; end if;
  o := public.friends_overview();
  if jsonb_array_length(o -> 'notes_sent') <> 1 or o -> 'notes_sent' -> 0 ->> 'to_user' <> pg_temp.kept('bob') then raise exception 'sent: %', o -> 'notes_sent'; end if;
  -- Bob sees it.
  perform pg_temp.act_as(pg_temp.kept('bob'));
  o := public.friends_overview();
  if jsonb_array_length(o -> 'notes') <> 1 or o -> 'notes' -> 0 ->> 'kind' <> 'nice_week' or o -> 'notes' -> 0 ->> 'display_name' <> 'Ann' then raise exception 'received: %', o -> 'notes'; end if;
  if pg_temp.keys_of(o -> 'notes' -> 0) <> array['avatar', 'created_at', 'display_name', 'from_user', 'id', 'kind'] then raise exception 'note keys'; end if;
  if (o -> 'notes_on')::boolean is not true then raise exception 'notes on by default'; end if;
  -- Cid turns notes from Ann off; Ann is not told, and the note never shows, even after turning them on again.
  perform pg_temp.act_as(pg_temp.kept('cid'));
  if public.friend_notes_set(pg_temp.id('ann'), false) <> 'ok' then raise exception 'mute Ann'; end if;
  if public.friend_notes_set(pg_temp.id('eve'), false) <> 'not_friends' then raise exception 'mute a stranger'; end if;
  perform pg_temp.act_as(pg_temp.kept('ann'));
  if public.send_note(pg_temp.id('cid'), 'thinking_of_you') <> 'ok' then raise exception 'a muted note says ok'; end if;
  if jsonb_array_length(public.friends_overview() -> 'notes_sent') <> 2 then raise exception 'sent to a muted friend shows as sent'; end if;
  perform pg_temp.act_as(pg_temp.kept('cid'));
  if (select (x ->> 'notes')::boolean from jsonb_array_elements(public.friends_overview() -> 'friends') x where x ->> 'user_id' = pg_temp.kept('ann')) then raise exception 'switch shows'; end if;
  perform public.friend_notes_set(pg_temp.id('ann'), true);
  if jsonb_array_length(public.friends_overview() -> 'notes') <> 0 then raise exception 'a note sent while muted shows'; end if;
  -- Everyone off: Bob turns notes off, Ann's earlier note leaves his list.
  perform pg_temp.act_as(pg_temp.kept('bob'));
  if public.note_settings_set(false) is not false then raise exception 'notes off'; end if;
  if jsonb_array_length(public.friends_overview() -> 'notes') <> 0 then raise exception 'notes off still shows'; end if;
  perform public.note_settings_set(true);
  perform pg_temp.act_as(pg_temp.kept('ivy'));
  if public.note_settings_set(false) is not null then raise exception 'no card'; end if;
  -- Five a day in all.
  perform pg_temp.act_as(pg_temp.kept('ann'));
  perform public.send_note(pg_temp.id('dot'), 'walk_later');
  perform public.send_note(pg_temp.id('fin'), 'walk_later');
  perform public.send_note(pg_temp.id('gil'), 'walk_later');
  if public.send_note(pg_temp.id('hob'), 'walk_later') <> 'limit' then raise exception 'a sixth note'; end if;
end $$;

-- ------------------------------------------------ saved meals shown to friends
do $$
declare
  r jsonb;
  o jsonb;
  m jsonb;
  items jsonb := '[{"name": "Oats", "emoji": "🥣", "portion": "1 cup", "source": "builtin", "foodId": "b_oats", "kcal": 300, "protein": 10, "note": "x"}]';
begin
  perform pg_temp.act_as(pg_temp.kept('ann'));
  if public.meal_show_saved('meal-1', 'Overnight oats', items, 2, true, array[pg_temp.id('eve')]) ->> 'status' <> 'not_friends' then raise exception 'a stranger'; end if;
  if public.meal_show_saved('bad id!', 'Overnight oats', items, 2, true, array[pg_temp.id('bob')]) ->> 'status' <> 'invalid' then raise exception 'bad id'; end if;
  if public.meal_show_saved('meal-1', '  ', items, 2, true, array[pg_temp.id('bob')]) ->> 'status' <> 'invalid' then raise exception 'no name'; end if;
  if public.meal_show_saved('meal-1', 'Oats', items, 0.5, true, array[pg_temp.id('bob')]) ->> 'status' <> 'invalid' then raise exception 'half a serving'; end if;
  if public.meal_show_saved('meal-1', 'Oats', '[]', 1, true, array[pg_temp.id('bob')]) ->> 'status' <> 'empty' then raise exception 'empty'; end if;
  r := public.meal_show_saved('meal-1', 'Overnight oats', items, 2, true, array[pg_temp.id('bob'), pg_temp.id('dot')]);
  if r ->> 'status' <> 'ok' or r ->> 'ref' <> left(encode(sha256(convert_to(pg_temp.kept('ann-key') || ':saved:meal-1', 'UTF8')), 'hex'), 32) then raise exception 'show saved: %', r; end if;
  insert into keep values ('saved-ref', r ->> 'ref');
  -- Showing again keeps the reference.
  if public.meal_show_saved('meal-1', 'Overnight oats with honey', items, 2, false, array[pg_temp.id('bob'), pg_temp.id('dot')]) ->> 'ref' <> pg_temp.kept('saved-ref') then raise exception 'same ref'; end if;
  o := public.friends_overview();
  if exists (select 1 from jsonb_array_elements(o -> 'my_meals') x where x ->> 'ref' = pg_temp.kept('saved-ref')) then raise exception 'a saved meal in my_meals'; end if;
  m := o -> 'my_saved_meals' -> 0;
  if m ->> 'name' <> 'Overnight oats with honey' or (m ->> 'servings')::numeric <> 2 or jsonb_array_length(m -> 'viewers') <> 2 then raise exception 'my saved: %', m; end if;
  -- Bob sees it under shared_saved_meals, never in the feed; Dot (17) does not see it.
  perform pg_temp.act_as(pg_temp.kept('bob'));
  o := public.friends_overview();
  if exists (select 1 from jsonb_array_elements(o -> 'feed') x where x ->> 'ref' = pg_temp.kept('saved-ref')) then raise exception 'a saved meal in the feed'; end if;
  m := o -> 'shared_saved_meals' -> 0;
  if pg_temp.keys_of(m) <> array['avatar', 'cheered', 'display_name', 'items', 'kind', 'name', 'ref', 'servings', 'show_kcal', 'user_id'] then raise exception 'saved keys %', pg_temp.keys_of(m); end if;
  if m -> 'items' -> 0 ? 'kcal' or m -> 'items' -> 0 ? 'protein' or m -> 'items' -> 0 ? 'note' then raise exception 'a saved meal carries more: %', m -> 'items'; end if;
  if public.send_cheer(pg_temp.id('ann'), 'meal:' || pg_temp.kept('saved-ref')) <> 'ok' then raise exception 'cheer a saved meal'; end if;
  perform pg_temp.act_as(pg_temp.kept('dot'));
  if jsonb_array_length(public.friends_overview() -> 'shared_saved_meals') <> 0 then raise exception 'a minor sees a saved meal'; end if;
  -- Edits and stops work on it as on any shown meal.
  perform pg_temp.act_as(pg_temp.kept('ann'));
  if public.meal_update(pg_temp.kept('saved-ref'), '[{"name": "Oats", "portion": "2 cups", "source": "builtin"}]') <> 'ok' then raise exception 'update saved'; end if;
  if public.meal_stop(pg_temp.kept('saved-ref')) <> 'stopped' then raise exception 'stop saved'; end if;
  if jsonb_array_length(public.friends_overview() -> 'my_saved_meals') <> 0 then raise exception 'stopped still shows'; end if;
  perform public.meal_show_saved('meal-2', 'Lentil soup', '[{"name": "Lentils", "portion": "1 bowl", "source": "custom"}]', null, false, array[pg_temp.id('bob')]);
end $$;

-- ------------------------------------------------ the keys an older app reads keep their shape
do $$
declare
  o jsonb;
begin
  perform pg_temp.act_as(pg_temp.kept('bob'));
  o := public.friends_overview();
  if not pg_temp.keys_of(o) @> array['cheers', 'feed', 'friends', 'incoming', 'me', 'meal_cheers', 'my_meals', 'outgoing'] then raise exception 'old keys: %', pg_temp.keys_of(o); end if;
  if not pg_temp.keys_of(o) @> array['buddies', 'buddy_invites', 'my_saved_meals', 'notes', 'notes_on', 'notes_sent', 'shared_saved_meals', 'signals', 'together', 'together_invites'] then
    raise exception 'new keys: %', pg_temp.keys_of(o);
  end if;
  if exists (select 1 from jsonb_array_elements(o -> 'feed') x where x ->> 'kind' not in ('meal', 'workout')) then raise exception 'a new kind in the feed'; end if;
  if exists (select 1 from jsonb_array_elements(o -> 'cheers') x where x ->> 'ref' like 'meal:%') then raise exception 'a meal cheer in cheers'; end if;
end $$;

-- ------------------------------------------------ removing a friend undoes it all between the two
do $$
begin
  -- Ann and Bob: in one circle, notes both ways, Ann shows Bob a saved meal.
  perform pg_temp.act_as(pg_temp.kept('bob'));
  perform public.buddy_invite(pg_temp.id('ann'));
  perform pg_temp.act_as(pg_temp.kept('ann'));
  perform public.friend_remove(pg_temp.id('bob'));
  reset role;
  if exists (select 1 from public.log_buddies where pg_temp.id('bob') in (requester, addressee) and pg_temp.id('ann') in (requester, addressee)) then raise exception 'buddies stay'; end if;
  if exists (select 1 from public.friend_notes where pg_temp.id('bob') in (from_user, to_user) and pg_temp.id('ann') in (from_user, to_user)) then raise exception 'notes stay'; end if;
  if exists (select 1 from public.together_members where user_id = pg_temp.id('ann') and goal_id = pg_temp.id('circle') and status = 'joined') then raise exception 'Ann still in a circle with Bob'; end if;
  if exists (select 1 from public.shared_meals where owner = pg_temp.id('ann') and kind = 'saved') then raise exception 'a saved meal nobody can see stays'; end if;
  if not exists (select 1 from public.together_members where user_id = pg_temp.id('bob') and goal_id = pg_temp.id('circle') and status = 'joined') then raise exception 'Bob left the circle too'; end if;
end $$;
set role authenticated;

-- ------------------------------------------------ turning friends off clears it all
do $$
begin
  perform pg_temp.act_as(pg_temp.kept('bob'));
  perform public.social_signals_publish(pg_temp.signals(10, 0, '{0}'));
  perform public.social_leave();
  reset role;
  if exists (select 1 from public.together_members where user_id = pg_temp.id('bob') and status <> 'declined') then raise exception 'Bob still in a circle'; end if;
  if exists (select 1 from public.social_signals where user_id = pg_temp.id('bob')) then raise exception 'Bob signals stay'; end if;
  if exists (select 1 from public.friend_notes where pg_temp.id('bob') in (from_user, to_user)) then raise exception 'Bob notes stay'; end if;
  if exists (select 1 from public.log_buddies where pg_temp.id('bob') in (requester, addressee)) then raise exception 'Bob buddies stay'; end if;
  -- Dot alone was left in the circle (Ann left on removing Bob): it still stands with Dot.
  if not exists (select 1 from public.together_goals where id = pg_temp.id('circle')) then raise exception 'the circle went with Dot in it'; end if;
end $$;
set role authenticated;

-- ------------------------------------------------ signed-out callers get nothing
set role anon;
do $$
begin
  begin
    perform public.together_start('minutes', 100, '{}');
    raise exception 'anon could call together_start';
  exception when insufficient_privilege then null;
  end;
  begin
    perform public.send_note(gen_random_uuid(), 'nice_week');
    raise exception 'anon could call send_note';
  exception when insufficient_privilege then null;
  end;
  begin
    perform public.social_signals_publish('{}');
    raise exception 'anon could call social_signals_publish';
  exception when insufficient_privilege then null;
  end;
end $$;
reset role;

do $$ begin raise notice 'ALL FRIENDS TOGETHER TESTS PASSED'; end $$;
