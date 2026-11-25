-- Behavioural tests for meals shown to friends (20261201000000_friends_meals.sql).
-- Runs after friends.sql in the same database, with people of its own. Every block
-- raises on failure, so the script either runs to the final notice or stops at the
-- first broken rule.
\set ON_ERROR_STOP on

-- Ana shows meals; Ben, Cal and Eli are her friends; Dee is nobody's friend; Eli is 17;
-- Fay has no birth date; Gus tests the limits; Hal never turns friends on.
insert into auth.users (id) values
  ('e1111111-1111-4111-8111-111111111111'),
  ('e2222222-2222-4222-8222-222222222222'),
  ('e3333333-3333-4333-8333-333333333333'),
  ('e4444444-4444-4444-8444-444444444444'),
  ('e5555555-5555-4555-8555-555555555555'),
  ('e6666666-6666-4666-8666-666666666666'),
  ('e7777777-7777-4777-8777-777777777777'),
  ('e8888888-8888-4888-8888-888888888888');

insert into public.profiles (user_id, data) values
  ('e1111111-1111-4111-8111-111111111111', '{"name": "Ana", "birthDate": "1990-04-02"}'),
  ('e2222222-2222-4222-8222-222222222222', jsonb_build_object('name', 'Ben', 'birthDate', to_char(current_date - interval '18 years', 'YYYY-MM-DD'))),
  ('e3333333-3333-4333-8333-333333333333', '{"name": "Cal", "birthDate": "1985-12-30"}'),
  ('e4444444-4444-4444-8444-444444444444', '{"name": "Dee", "birthDate": "1979-07-07"}'),
  ('e5555555-5555-4555-8555-555555555555', jsonb_build_object('name', 'Eli', 'birthDate', to_char(current_date - interval '18 years' + interval '1 day', 'YYYY-MM-DD'))),
  ('e6666666-6666-4666-8666-666666666666', '{"name": "Fay"}'),
  ('e7777777-7777-4777-8777-777777777777', '{"name": "Gus", "birthDate": "1992-01-15"}');

create or replace function pg_temp.act_as(p_user text) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claim.sub', coalesce(p_user, ''), false);
end $$;

create temp table keep (k text primary key, v text);
grant all on keep to authenticated;
create or replace function pg_temp.kept(p text) returns text language sql as $$ select v from keep where k = p $$;
create or replace function pg_temp.keys_of(p jsonb) returns text[] language sql as $$
  select coalesce(array_agg(k order by k), '{}') from jsonb_object_keys(p) k
$$;
-- A line that must hold, outside a block.
create or replace function pg_temp.ensure(p_ok boolean, p_what text) returns void language plpgsql as $$
begin
  if p_ok is not true then raise exception 'failed: %', p_what; end if;
end $$;
create or replace function pg_temp.feed_meals(p jsonb) returns jsonb language sql as $$
  select coalesce(jsonb_agg(x), '[]'::jsonb) from jsonb_array_elements(p -> 'feed') x where x ->> 'kind' = 'meal'
$$;

-- ---------------------------------------------------------------- set up
set role authenticated;
do $$
declare
  who text[] := array['ana', 'ben', 'cal', 'dee', 'eli', 'fay', 'gus'];
  ids text[] := array['e1111111-1111-4111-8111-111111111111', 'e2222222-2222-4222-8222-222222222222', 'e3333333-3333-4333-8333-333333333333',
                      'e4444444-4444-4444-8444-444444444444', 'e5555555-5555-4555-8555-555555555555', 'e6666666-6666-4666-8666-666666666666',
                      'e7777777-7777-4777-8777-777777777777'];
  card jsonb;
begin
  for i in 1..7 loop
    perform pg_temp.act_as(ids[i]);
    card := public.social_setup(initcap(who[i]), '', '{}');
    insert into keep values (who[i] || '-code', card ->> 'code'), (who[i] || '-key', card ->> 'share_key'), (who[i], ids[i]);
    if card -> 'meal_settings' is not null then raise exception 'social_setup should not return or take meal settings: %', card; end if;
  end loop;
  -- Ben, Cal, Eli and Fay ask Ana; Gus asks Ben. All accepted.
  foreach card in array array['"ben"', '"cal"', '"eli"', '"fay"']::jsonb[] loop
    perform pg_temp.act_as(pg_temp.kept(card #>> '{}'));
    perform public.friend_request(pg_temp.kept('ana-code'));
  end loop;
  perform pg_temp.act_as(pg_temp.kept('gus'));
  perform public.friend_request(pg_temp.kept('ben-code'));
  perform pg_temp.act_as(pg_temp.kept('ana'));
  foreach card in array array['"ben"', '"cal"', '"eli"', '"fay"']::jsonb[] loop
    if public.friend_respond(pg_temp.kept(card #>> '{}')::uuid, true) <> 'accepted' then raise exception 'accept %', card; end if;
  end loop;
  perform pg_temp.act_as(pg_temp.kept('ben'));
  perform public.friend_respond(pg_temp.kept('gus')::uuid, true);
end $$;

-- ------------------------------------------- the tables are closed to the API
select pg_temp.act_as(pg_temp.kept('ana'));
do $$
declare t text; f text;
begin
  foreach t in array array['shared_meals', 'shared_meal_viewers', 'meal_audience', 'friend_prefs', 'shared_meal_stops'] loop
    begin
      execute format('select count(*) from public.%I', t);
      raise exception '% is readable directly', t;
    exception when insufficient_privilege then null;
    end;
  end loop;
  begin
    insert into public.shared_meals (owner, ref, day, meal, items)
      values (pg_temp.kept('ana')::uuid, repeat('a', 32), current_date, 'lunch', '[]');
    raise exception 'a meal could be inserted directly';
  exception when insufficient_privilege then null;
  end;
  begin
    insert into public.shared_meal_viewers (owner, ref, viewer) values (pg_temp.kept('ana')::uuid, repeat('a', 32), pg_temp.kept('dee')::uuid);
    raise exception 'a viewer could be added directly';
  exception when insufficient_privilege then null;
  end;
  -- Helpers that would tell someone else's feed or age, or skip the checks, are not callable.
  foreach f in array array[
    'select public.social_visible_meals(%L::uuid)', 'select public.social_is_adult(%L::uuid)', 'select public.social_purge_meals() is null or %L is null',
    'select public.social_drop_unseen_meals(array[%L::uuid])', 'select public.social_shares_meals_with(%L::uuid, %L::uuid)',
    'select public.social_insert_meal(%L::uuid, repeat(''a'', 32), current_date, ''lunch'', ''[]'', false)',
    'select public.social_count_meal_write(%L::uuid, true)', 'select public.social_clean_meal(''[]'', %L is null)',
    'select public.social_meal_ref(%L, current_date, ''lunch'')'
  ] loop
    begin
      execute format(f, pg_temp.kept('ben'), pg_temp.kept('ana'));
      raise exception 'callable from the API: %', f;
    exception when insufficient_privilege then null;
    end;
  end loop;
end $$;

-- ------------------------------------------------------------- refused shows
select pg_temp.act_as('e8888888-8888-4888-8888-888888888888');
do $$
begin
  if public.meal_show(to_char(current_date, 'YYYY-MM-DD'), 'lunch', '[{"name": "Rice", "portion": "1 cup", "source": "builtin"}]', false, array[pg_temp.kept('ana')::uuid]) ->> 'status' <> 'no_card' then
    raise exception 'a meal was shown without friends on';
  end if;
  if public.meal_update(repeat('a', 32), '[]') <> 'no_card' then raise exception 'an update without friends on'; end if;
  if public.meal_settings_set('{"kcal": true}') is not null then raise exception 'settings stored without a card'; end if;
end $$;

select pg_temp.act_as(pg_temp.kept('ana'));
do $$
declare
  rice constant jsonb := '[{"name": "Rice", "portion": "1 cup", "source": "builtin"}]';
  ben uuid := pg_temp.kept('ben')::uuid;
  today text := to_char(current_date, 'YYYY-MM-DD');
  r jsonb; bad record;
begin
  for bad in
    select * from (values
      ('2026-02-30', 'lunch', rice, 'a day that does not exist'),
      ('25/11/2026', 'lunch', rice, 'a day in another format'),
      (to_char(current_date - 8, 'YYYY-MM-DD'), 'lunch', rice, 'more than a week ago'),
      (to_char(current_date + 3, 'YYYY-MM-DD'), 'lunch', rice, 'days ahead'),
      (today, 'brunch', rice, 'a meal type the app does not have'),
      (today, 'lunch''; delete from public.shared_meals; --', rice, 'a meal with SQL in it'),
      (today || ''' or ''1''=''1', 'lunch', rice, 'a day with SQL in it'),
      (today, 'lunch', '{"name": "Rice"}'::jsonb, 'items that are not a list'),
      (today, 'lunch', jsonb_build_array(jsonb_build_object('name', 'Rice', 'source', 'builtin', 'portion', repeat('x', 20000))), 'a list too large')
    ) as t (day, meal, items, why)
  loop
    r := public.meal_show(bad.day, bad.meal, bad.items, false, array[ben]);
    if r ->> 'status' <> 'invalid' then raise exception '% was not refused: %', bad.why, r; end if;
  end loop;
  r := public.meal_show(today, 'lunch', '[{"name": "", "source": "builtin"}, {"name": "Mystery", "source": "secret"}, {"source": "builtin"}, "rice", {"name": {"x": 1}, "source": "ai"}]', false, array[ben]);
  if r ->> 'status' <> 'empty' then raise exception 'a meal of nothing showable: %', r; end if;
  if public.meal_show(today, 'lunch', rice, false, array[]::uuid[]) ->> 'status' <> 'no_viewers' then raise exception 'nobody picked'; end if;
  if public.meal_show(today, 'lunch', rice, false, null) ->> 'status' <> 'no_viewers' then raise exception 'null viewers'; end if;
  if public.meal_show(today, 'lunch', rice, false, array[pg_temp.kept('ana')::uuid, null]) ->> 'status' <> 'no_viewers' then raise exception 'only herself picked'; end if;
  -- Someone who is not a friend, alone or among friends: refused whole, nothing stored.
  if public.meal_show(today, 'lunch', rice, false, array[pg_temp.kept('dee')::uuid]) ->> 'status' <> 'not_friends' then raise exception 'a stranger picked'; end if;
  if public.meal_show(today, 'lunch', rice, false, array[ben, pg_temp.kept('dee')::uuid]) ->> 'status' <> 'not_friends' then raise exception 'a stranger among friends'; end if;
  if public.meal_show(today, 'lunch', rice, false, array[ben, gen_random_uuid()]) ->> 'status' <> 'not_friends' then raise exception 'an unknown account'; end if;
  if jsonb_array_length(public.friends_overview() -> 'my_meals') <> 0 then raise exception 'a refused show stored a meal'; end if;
end $$;

-- People under 18, or with no birth date, can neither show nor see meals.
select pg_temp.act_as(pg_temp.kept('eli'));
do $$
declare o jsonb;
begin
  if public.meal_show(to_char(current_date, 'YYYY-MM-DD'), 'lunch', '[{"name": "Rice", "portion": "1 cup", "source": "builtin"}]', false, array[pg_temp.kept('ana')::uuid]) ->> 'status' <> 'under_18' then
    raise exception 'someone who turns 18 tomorrow showed a meal';
  end if;
  o := public.friends_overview();
  if (o -> 'me' ->> 'meals_allowed')::boolean then raise exception 'meals allowed under 18: %', o -> 'me'; end if;
end $$;
select pg_temp.act_as(pg_temp.kept('fay'));
do $$
begin
  if public.meal_show(to_char(current_date, 'YYYY-MM-DD'), 'lunch', '[{"name": "Rice", "portion": "1 cup", "source": "builtin"}]', false, array[pg_temp.kept('ana')::uuid]) ->> 'status' <> 'under_18' then
    raise exception 'a profile with no birth date showed a meal';
  end if;
end $$;
select pg_temp.act_as(pg_temp.kept('ben'));
do $$
begin
  -- Ben turned 18 today.
  if not (public.friends_overview() -> 'me' ->> 'meals_allowed')::boolean then raise exception 'someone 18 today is refused'; end if;
end $$;

-- ------------------------------------------------------------- Ana shows lunch to Ben
select pg_temp.act_as(pg_temp.kept('ana'));
do $$
declare r jsonb; o jsonb; m jsonb; item jsonb; expected text;
begin
  -- A summary with a workout this week and one too old for the feed.
  perform public.social_publish(jsonb_build_object('week', to_char(current_date, 'YYYY-MM-DD'), 'workouts', jsonb_build_array(
    jsonb_build_object('id', repeat('1', 32), 'name', 'Running', 'emoji', '🏃', 'minutes', 30, 'date', to_char(current_date - 1, 'YYYY-MM-DD'), 'distanceKm', 5.2),
    jsonb_build_object('id', repeat('2', 32), 'name', 'Yoga', 'minutes', 45, 'date', to_char(current_date - 10, 'YYYY-MM-DD'))
  )), pg_temp.kept('ana-key'));

  r := public.meal_show(to_char(current_date, 'YYYY-MM-DD'), ' Lunch ', jsonb_build_array(
    jsonb_build_object('name', E'Chicken breast,\nroasted', 'emoji', '🍗', 'portion', '1 breast · 172 g', 'source', 'builtin', 'foodId', 'b_chicken_breast',
      'serving', '1 breast', 'quantity', 1, 'grams', 172.04, 'kcal', 284, 'protein', 53, 'notes', 'after the gym', 'loggedAt', '2026-11-25T12:31:00Z',
      'id', '8b552e86-b4b0-5c91-a9b5-0267052a9b4f', 'date', '2026-11-25', 'weightKg', 81, 'budget', 2100),
    jsonb_build_object('name', 'Robert''); drop table public.shared_meals; --', 'portion', '1 bowl', 'source', 'custom',
      'foodId', '8b552e86-b4b0-5c91-a9b5-0267052a9b4f', 'barcode', '12ab', 'quantity', -2),
    jsonb_build_object('name', repeat('Granola ', 20), 'portion', '1 bar · 40 g', 'source', 'openfoodfacts', 'barcode', '7290000066318', 'kcalLow', 150, 'kcalHigh', 190)
  ), false, array[pg_temp.kept('ben')::uuid, pg_temp.kept('ben')::uuid]);
  if r ->> 'status' <> 'ok' then raise exception 'showing lunch: %', r; end if;
  -- The reference is made on the server from the share key, the day and the meal.
  expected := left(encode(sha256(convert_to(pg_temp.kept('ana-key') || ':meal:' || to_char(current_date, 'YYYY-MM-DD') || ':lunch', 'UTF8')), 'hex'), 32);
  if r ->> 'ref' <> expected then raise exception 'ref % is not %', r ->> 'ref', expected; end if;
  if abs(extract(epoch from ((r ->> 'expires_at')::timestamptz - (now() + interval '7 days')))) > 5 then raise exception 'not 7 days: %', r; end if;
  insert into keep values ('lunch', r ->> 'ref'), ('lunch-expires', r ->> 'expires_at');

  o := public.friends_overview();
  m := o -> 'my_meals' -> 0;
  if jsonb_array_length(o -> 'my_meals') <> 1 or m ->> 'meal' <> 'lunch' or (m ->> 'cheers')::int <> 0 or m ->> 'day' <> to_char(current_date, 'YYYY-MM-DD') then raise exception 'my meals: %', o -> 'my_meals'; end if;
  if jsonb_array_length(m -> 'viewers') <> 1 or m -> 'viewers' -> 0 ->> 'display_name' <> 'Ben' then raise exception 'viewers: %', m -> 'viewers'; end if;
  if o -> 'me' -> 'audience' <> jsonb_build_array(pg_temp.kept('ben')) then raise exception 'the audience is remembered: %', o -> 'me' -> 'audience'; end if;
  if o -> 'me' -> 'meal_settings' <> '{"auto": [], "kcal": false, "see": true}'::jsonb then raise exception 'default settings: %', o -> 'me'; end if;

  -- Only the allowed keys, cleaned; no calories, since they are off.
  if jsonb_array_length(m -> 'items') <> 3 then raise exception 'items: %', m -> 'items'; end if;
  for item in select * from jsonb_array_elements(m -> 'items') loop
    if not pg_temp.keys_of(item) <@ array['name', 'emoji', 'portion', 'source', 'foodId', 'barcode', 'serving', 'quantity', 'grams', 'kcal', 'kcalLow', 'kcalHigh'] then
      raise exception 'a key that is not allowed: %', item;
    end if;
    if item ? 'kcal' or item ? 'kcalLow' or item ? 'kcalHigh' then raise exception 'calories shown while off: %', item; end if;
  end loop;
  item := m -> 'items' -> 0;
  if item ->> 'name' <> 'Chicken breast, roasted' or item ->> 'foodId' <> 'b_chicken_breast' or (item ->> 'grams')::numeric <> 172.0 or item ->> 'serving' <> '1 breast' then raise exception 'first food: %', item; end if;
  item := m -> 'items' -> 1;
  -- Text is kept as text, never run; a record id is never a food id; a bad barcode or amount goes.
  if item ->> 'name' <> 'Robert''); drop table public.shared_meals; --' or item ? 'foodId' or item ? 'barcode' or item ? 'quantity' or item ->> 'emoji' <> '' then raise exception 'second food: %', item; end if;
  item := m -> 'items' -> 2;
  if length(item ->> 'name') > 60 or item ->> 'barcode' <> '7290000066318' then raise exception 'third food: %', item; end if;
end $$;

-- Ben sees it, in what a friend may see and nothing more.
select pg_temp.act_as(pg_temp.kept('ben'));
do $$
declare o jsonb; f jsonb; m jsonb; w jsonb;
begin
  o := public.friends_overview();
  f := o -> 'feed';
  m := pg_temp.feed_meals(o);
  if jsonb_array_length(m) <> 1 then raise exception 'Ben should see one meal: %', f; end if;
  m := m -> 0;
  if not (pg_temp.keys_of(m) <@ array['avatar', 'cheered', 'day', 'display_name', 'items', 'kind', 'meal', 'ref', 'show_kcal', 'user_id']
          and pg_temp.keys_of(m) @> array['avatar', 'cheered', 'day', 'display_name', 'items', 'kind', 'meal', 'ref', 'show_kcal', 'user_id']) then
    raise exception 'a feed meal carries more than it may (when it was shown, who else sees it): %', pg_temp.keys_of(m);
  end if;
  if m ->> 'display_name' <> 'Ana' or m ->> 'meal' <> 'lunch' or m ->> 'ref' <> pg_temp.kept('lunch') or (m ->> 'cheered')::boolean then raise exception 'feed meal: %', m; end if;
  if position(pg_temp.kept('ana-key') in o::text) > 0 or position(pg_temp.kept('cal') in f::text) > 0 or f::text ~ '(budget|weightKg|protein|notes|loggedAt|shown_at|expires_at|viewers)' then raise exception 'the feed leaks: %', f; end if;
  -- Workouts of the last 7 days are in the feed too; an older one is not.
  w := (select jsonb_agg(x) from jsonb_array_elements(f) x where x ->> 'kind' = 'workout');
  if jsonb_array_length(w) <> 1 or w -> 0 ->> 'name' <> 'Running' or (w -> 0 ->> 'distance_km')::numeric <> 5.2 or w -> 0 ->> 'user_id' <> pg_temp.kept('ana') then raise exception 'feed workouts: %', w; end if;
  -- Newest first: today's meal before yesterday's run.
  if f -> 0 ->> 'kind' <> 'meal' then raise exception 'feed order: %', f; end if;
  if (o -> 'friends' -> 0 ->> 'share_meals')::boolean is not true or (o -> 'friends' -> 0 ->> 'see_meals')::boolean is not true then raise exception 'default switches: %', o -> 'friends' -> 0; end if;
end $$;

-- Cal is Ana's friend but was not picked; Dee is nobody's friend; Eli is under 18.
do $$
declare who text;
begin
  foreach who in array array['cal', 'dee', 'eli'] loop
    perform pg_temp.act_as(pg_temp.kept(who));
    if jsonb_array_length(pg_temp.feed_meals(public.friends_overview())) <> 0 then raise exception '% sees a meal not shown to them', who; end if;
    if public.send_cheer(pg_temp.kept('ana')::uuid, 'meal:' || pg_temp.kept('lunch')) not in ('invalid', 'not_friends') then raise exception '% could cheer a meal they cannot see', who; end if;
  end loop;
end $$;

-- ------------------------------------------------------------------ cheers
select pg_temp.act_as(pg_temp.kept('ben'));
do $$
declare bad text;
begin
  if public.send_cheer(pg_temp.kept('ana')::uuid, 'meal:' || pg_temp.kept('lunch')) <> 'ok' then raise exception 'cheering a meal'; end if;
  if public.send_cheer(pg_temp.kept('ana')::uuid, '  meal:' || pg_temp.kept('lunch') || ' ') <> 'ok' then raise exception 'cheering twice is harmless'; end if;
  -- A day cheer beside it, so the overview below holds both kinds.
  if public.send_cheer(pg_temp.kept('ana')::uuid, 'day:' || to_char(current_date, 'YYYY-MM-DD')) <> 'ok' then raise exception 'cheering a day'; end if;
  foreach bad in array array['meal:' || repeat('b', 32), 'meal:ABC', 'meal:' || upper(pg_temp.kept('lunch')), 'meal:'' or 1=1 --', 'meal:' || pg_temp.kept('lunch') || 'x'] loop
    if public.send_cheer(pg_temp.kept('ana')::uuid, bad) <> 'invalid' then raise exception 'cheer for % accepted', bad; end if;
  end loop;
  if not (pg_temp.feed_meals(public.friends_overview()) -> 0 ->> 'cheered')::boolean then raise exception 'the cheer is not marked in the feed'; end if;
end $$;
select pg_temp.act_as(pg_temp.kept('ana'));
do $$
declare o jsonb;
begin
  o := public.friends_overview();
  if (o -> 'my_meals' -> 0 ->> 'cheers')::int <> 1 then raise exception 'cheer count: %', o -> 'my_meals'; end if;
  -- A meal's cheer comes under meal_cheers, never under cheers; a day's (or a workout's) under cheers only.
  if ((o -> 'meal_cheers') @> jsonb_build_array(jsonb_build_object('display_name', 'Ben', 'ref', 'meal:' || pg_temp.kept('lunch')))) is not true then raise exception 'meal cheers received: %', o -> 'meal_cheers'; end if;
  if ((o -> 'cheers') @> jsonb_build_array(jsonb_build_object('display_name', 'Ben', 'ref', 'day:' || to_char(current_date, 'YYYY-MM-DD')))) is not true then raise exception 'cheers received: %', o -> 'cheers'; end if;
  if exists (select 1 from jsonb_array_elements(o -> 'cheers') x where x ->> 'ref' like 'meal:%') then raise exception 'a meal cheer under cheers: %', o -> 'cheers'; end if;
  if exists (select 1 from jsonb_array_elements(o -> 'meal_cheers') x where x ->> 'ref' not like 'meal:%') then raise exception 'another cheer under meal_cheers: %', o -> 'meal_cheers'; end if;
  if pg_temp.keys_of(o -> 'meal_cheers' -> 0) is distinct from pg_temp.keys_of(o -> 'cheers' -> 0) then raise exception 'meal cheers in another shape: %', o -> 'meal_cheers'; end if;
end $$;

-- An app from before meals reads the same overview (phones keep an older app for a while): every key its
-- toOverview reads is there with the type it reads, and the meal parts are keys it leaves alone. A meal's
-- cheer is under meal_cheers, a key it leaves alone, so it never names one "a workout of yours" (its name for
-- a ref it does not know): every ref under cheers is a workout's or a day's.
do $$
declare o jsonb; x jsonb;
begin
  o := public.friends_overview();
  if not pg_temp.keys_of(o) @> array['cheers', 'friends', 'incoming', 'me', 'outgoing'] then raise exception 'older app: overview keys %', pg_temp.keys_of(o); end if;
  if not pg_temp.keys_of(o -> 'me') @> array['avatar', 'code', 'display_name', 'share_key', 'sharing']
     or jsonb_typeof(o -> 'me' -> 'code') <> 'string' or jsonb_typeof(o -> 'me' -> 'share_key') <> 'string' or jsonb_typeof(o -> 'me' -> 'sharing') <> 'object' then
    raise exception 'older app: own card %', pg_temp.keys_of(o -> 'me');
  end if;
  if jsonb_typeof(o -> 'incoming') <> 'array' or jsonb_typeof(o -> 'outgoing') <> 'array' or jsonb_array_length(o -> 'friends') = 0 or jsonb_array_length(o -> 'cheers') = 0 then
    raise exception 'older app: lists %', o;
  end if;
  for x in select value from jsonb_array_elements(o -> 'friends') loop
    if not pg_temp.keys_of(x) @> array['avatar', 'cheered', 'display_name', 'since', 'summary', 'summary_updated_at', 'user_id']
       or jsonb_typeof(x -> 'user_id') <> 'string' or jsonb_typeof(x -> 'summary') <> 'object' or jsonb_typeof(x -> 'cheered') <> 'array' then
      raise exception 'older app: friend %', pg_temp.keys_of(x);
    end if;
  end loop;
  for x in select value from jsonb_array_elements(o -> 'cheers') loop
    if not pg_temp.keys_of(x) @> array['avatar', 'created_at', 'display_name', 'from_user', 'ref'] or jsonb_typeof(x -> 'ref') <> 'string' then
      raise exception 'older app: cheer %', pg_temp.keys_of(x);
    end if;
    if not (x ->> 'ref' ~ '^([0-9a-f]{32}|day:[0-9]{4}-[0-9]{2}-[0-9]{2})$') then raise exception 'older app: a cheer it cannot name: %', x ->> 'ref'; end if;
  end loop;
  if coalesce(jsonb_array_length(o -> 'meal_cheers'), 0) = 0 then raise exception 'older app: the meal cheer should wait under meal_cheers'; end if;
end $$;

-- ------------------------------------------- showing again, calories, more friends
select pg_temp.act_as(pg_temp.kept('ana'));
do $$
declare r jsonb; o jsonb; items jsonb;
begin
  -- Showing the same lunch to Ben and Cal: the same meal, the same expiry.
  r := public.meal_show(to_char(current_date, 'YYYY-MM-DD'), 'lunch', '[{"name": "Rice", "portion": "1 cup", "source": "builtin", "foodId": "b_rice_white"}]', false,
    array[pg_temp.kept('ben')::uuid, pg_temp.kept('cal')::uuid, pg_temp.kept('eli')::uuid]);
  if r ->> 'status' <> 'ok' or r ->> 'ref' <> pg_temp.kept('lunch') then raise exception 'showing again: %', r; end if;
  if (r ->> 'expires_at')::timestamptz <> pg_temp.kept('lunch-expires')::timestamptz then raise exception 'showing again moved the expiry'; end if;
  -- Dinner with calories on: each food keeps its own, and an estimate its range.
  r := public.meal_show(to_char(current_date - 1, 'YYYY-MM-DD'), 'dinner', '[
      {"name": "Pasta", "portion": "1 plate", "source": "ai", "kcal": 612.6, "kcalLow": 480, "kcalHigh": 760},
      {"name": "Salad", "portion": "1 bowl", "source": "typical", "kcal": 90, "kcalLow": 120, "kcalHigh": 80},
      {"name": "Water", "portion": "1 glass", "source": "quick", "kcal": -5}
    ]', true, array[pg_temp.kept('cal')::uuid]);
  if r ->> 'status' <> 'ok' then raise exception 'dinner: %', r; end if;
  insert into keep values ('dinner', r ->> 'ref');
  o := public.friends_overview();
  items := (select x -> 'items' from jsonb_array_elements(o -> 'my_meals') x where x ->> 'meal' = 'dinner');
  if (items -> 0 ->> 'kcal')::int <> 613 or (items -> 0 ->> 'kcalLow')::int <> 480 or (items -> 0 ->> 'kcalHigh')::int <> 760 then raise exception 'dinner calories: %', items; end if;
  if items -> 1 ? 'kcalLow' or (items -> 1 ->> 'kcal')::int <> 90 or (items -> 2 ->> 'kcal')::int <> 0 then raise exception 'a range that is not a range, or a negative: %', items; end if;
  if o -> 'me' -> 'audience' <> jsonb_build_array(pg_temp.kept('cal')) then raise exception 'the audience is the last pick: %', o -> 'me' -> 'audience'; end if;
  -- Newest first.
  if o -> 'my_meals' -> 0 ->> 'meal' <> 'dinner' then raise exception 'my meals order: %', o -> 'my_meals'; end if;
end $$;
select pg_temp.act_as(pg_temp.kept('cal'));
do $$
declare m jsonb;
begin
  m := pg_temp.feed_meals(public.friends_overview());
  if jsonb_array_length(m) <> 2 or m -> 0 ->> 'meal' <> 'lunch' or m -> 1 ->> 'meal' <> 'dinner' then raise exception 'Cal sees lunch, then yesterday''s dinner: %', m; end if;
  if (m -> 0 ->> 'cheered')::boolean then raise exception 'Cal sees Ben''s cheer as his own'; end if;
  if position(pg_temp.kept('ben') in m::text) > 0 then raise exception 'Cal can tell Ben sees the lunch too: %', m; end if;
end $$;
-- Eli was picked, but is under 18: nothing shows, and Ana is not told.
select pg_temp.act_as(pg_temp.kept('eli'));
do $$
begin
  if jsonb_array_length(pg_temp.feed_meals(public.friends_overview())) <> 0 then raise exception 'a meal reached someone under 18'; end if;
  if jsonb_array_length(public.friends_overview() -> 'feed') = 0 then raise exception 'Eli should still see Ana''s run'; end if;
end $$;

-- ------------------------------------------------------------------ the switches
-- Ben turns friends' meals off for his feed: no meals, the run stays, no meal cheer.
select pg_temp.act_as(pg_temp.kept('ben'));
do $$
declare s jsonb; o jsonb;
begin
  s := public.meal_settings_set('{"see": false, "auto": ["dinner", "brunch", "dinner", 7], "extra": "x"}');
  if s <> '{"auto": ["dinner"], "kcal": false, "see": false}'::jsonb then raise exception 'settings cleaned: %', s; end if;
  o := public.friends_overview();
  if jsonb_array_length(pg_temp.feed_meals(o)) <> 0 or jsonb_array_length(o -> 'feed') <> 1 then raise exception 'see off: %', o -> 'feed'; end if;
  if public.send_cheer(pg_temp.kept('ana')::uuid, 'meal:' || pg_temp.kept('lunch')) <> 'invalid' then raise exception 'cheer while meals are off'; end if;
  s := public.meal_settings_set('{"see": true}');
  if s <> '{"auto": ["dinner"], "kcal": false, "see": true}'::jsonb then raise exception 'a partial change kept the rest: %', s; end if;
  perform public.meal_settings_set('{"auto": []}');
  -- His switch for Ana alone.
  if public.friend_prefs_set(pg_temp.kept('ana')::uuid, null, false) <> 'ok' then raise exception 'prefs'; end if;
  o := public.friends_overview();
  if jsonb_array_length(pg_temp.feed_meals(o)) <> 0 then raise exception 'see_meals off for Ana still shows her meals'; end if;
  if (o -> 'friends' -> 0 ->> 'see_meals')::boolean or not (o -> 'friends' -> 0 ->> 'share_meals')::boolean then raise exception 'switches: %', o -> 'friends' -> 0; end if;
  perform public.friend_prefs_set(pg_temp.kept('ana')::uuid, null, true);
  if jsonb_array_length(pg_temp.feed_meals(public.friends_overview())) <> 1 then raise exception 'see_meals back on'; end if;
  if public.friend_prefs_set(pg_temp.kept('dee')::uuid, false, false) <> 'not_friends' then raise exception 'prefs for a stranger'; end if;
end $$;

-- Ana leaves Ben out of every meal: at once, and not back when she turns it on again.
select pg_temp.act_as(pg_temp.kept('ana'));
do $$
declare o jsonb;
begin
  perform public.meal_audience_set(array[pg_temp.kept('ben')::uuid, pg_temp.kept('cal')::uuid, pg_temp.kept('dee')::uuid]);
  if public.friends_overview() -> 'me' -> 'audience' <> jsonb_build_array(pg_temp.kept('ben'), pg_temp.kept('cal')) then raise exception 'audience set keeps friends only'; end if;
  if public.friend_prefs_set(pg_temp.kept('ben')::uuid, false, null) <> 'ok' then raise exception 'share_meals off'; end if;
  o := public.friends_overview();
  if o -> 'me' -> 'audience' <> jsonb_build_array(pg_temp.kept('cal')) then raise exception 'Ben left in the audience: %', o -> 'me' -> 'audience'; end if;
  if position(pg_temp.kept('ben') in (o -> 'my_meals')::text) > 0 then raise exception 'Ben still a viewer: %', o -> 'my_meals'; end if;
  if (select (x ->> 'share_meals')::boolean from jsonb_array_elements(o -> 'friends') x where x ->> 'display_name' = 'Ben') then raise exception 'Ana''s switch for Ben'; end if;
  if public.meal_show(to_char(current_date, 'YYYY-MM-DD'), 'snack', '[{"name": "Apple", "portion": "1 medium", "source": "builtin"}]', false, array[pg_temp.kept('ben')::uuid]) ->> 'status' <> 'not_friends' then
    raise exception 'a meal shown to a friend with meals switched off';
  end if;
  if public.meal_audience_set(array[pg_temp.kept('ben')::uuid]) <> '[]'::jsonb then raise exception 'Ben put back in the audience while switched off'; end if;
end $$;
select pg_temp.act_as(pg_temp.kept('ben'));
do $$
declare o jsonb;
begin
  o := public.friends_overview();
  if jsonb_array_length(pg_temp.feed_meals(o)) <> 0 then raise exception 'Ben still sees a meal'; end if;
  -- Ben is never told about Ana's switch: his own switches for Ana read as before.
  if not (o -> 'friends' -> 0 ->> 'share_meals')::boolean or not (o -> 'friends' -> 0 ->> 'see_meals')::boolean then raise exception 'Ben learns Ana''s switch: %', o -> 'friends' -> 0; end if;
  if public.send_cheer(pg_temp.kept('ana')::uuid, 'meal:' || pg_temp.kept('lunch')) <> 'invalid' then raise exception 'cheer after being left out'; end if;
end $$;
select pg_temp.act_as(pg_temp.kept('ana'));
select public.friend_prefs_set(pg_temp.kept('ben')::uuid, true, null);
select pg_temp.act_as(pg_temp.kept('ben'));
do $$
begin
  if jsonb_array_length(pg_temp.feed_meals(public.friends_overview())) <> 0 then raise exception 'turning the switch on again showed old meals'; end if;
end $$;

-- ------------------------------------------------------------------ edits
select pg_temp.act_as(pg_temp.kept('ana'));
do $$
declare r text; o jsonb; lunch jsonb;
begin
  r := public.meal_update(pg_temp.kept('lunch'), '[{"name": "Rice", "portion": "2 cups", "source": "builtin", "kcal": 400}, {"name": "Beans", "portion": "1/2 cup", "source": "builtin"}]');
  if r <> 'ok' then raise exception 'edit: %', r; end if;
  o := public.friends_overview();
  lunch := (select x from jsonb_array_elements(o -> 'my_meals') x where x ->> 'ref' = pg_temp.kept('lunch'));
  if jsonb_array_length(lunch -> 'items') <> 2 or lunch -> 'items' -> 0 ? 'kcal' then raise exception 'edit cleaned with calories off: %', lunch; end if;
  if (lunch ->> 'expires_at')::timestamptz <> pg_temp.kept('lunch-expires')::timestamptz then raise exception 'an edit moved the expiry'; end if;
  if (select jsonb_agg(x ->> 'display_name') from jsonb_array_elements(lunch -> 'viewers') x) <> '["Cal", "Eli"]'::jsonb then raise exception 'an edit changed who sees it: %', lunch -> 'viewers'; end if;
  if public.meal_update(repeat('c', 32), '[{"name": "Rice", "portion": "1 cup", "source": "builtin"}]') <> 'gone' then raise exception 'an update made a meal'; end if;
  if public.meal_update('not a ref', '[]') <> 'invalid' then raise exception 'a bad ref'; end if;
  if public.meal_update(pg_temp.kept('lunch'), '{"items": []}') <> 'invalid' then raise exception 'items not a list'; end if;
end $$;
select pg_temp.act_as(pg_temp.kept('cal'));
do $$
declare m jsonb;
begin
  m := (select x from jsonb_array_elements(pg_temp.feed_meals(public.friends_overview())) x where x ->> 'meal' = 'lunch');
  if m -> 'items' -> 1 ->> 'name' <> 'Beans' then raise exception 'Cal sees the edit: %', m; end if;
  if public.send_cheer(pg_temp.kept('ana')::uuid, 'meal:' || pg_temp.kept('dinner')) <> 'ok' then raise exception 'Cal cheers dinner'; end if;
end $$;
-- All foods deleted: it stops showing, and its cheers go with it.
select pg_temp.act_as(pg_temp.kept('ana'));
do $$
declare o jsonb;
begin
  if public.meal_update(pg_temp.kept('dinner'), '[{"name": ""}]') <> 'stopped' then raise exception 'an emptied meal should stop'; end if;
  o := public.friends_overview();
  if exists (select 1 from jsonb_array_elements(o -> 'my_meals') x where x ->> 'meal' = 'dinner') then raise exception 'emptied dinner still shown'; end if;
  if exists (select 1 from jsonb_array_elements((o -> 'cheers') || (o -> 'meal_cheers')) x where x ->> 'ref' = 'meal:' || pg_temp.kept('dinner')) then raise exception 'cheers of a stopped meal remain'; end if;
  if public.meal_update(pg_temp.kept('dinner'), '[{"name": "Pasta", "portion": "1 plate", "source": "ai"}]') <> 'gone' then raise exception 'an edit brought a stopped meal back'; end if;
end $$;

-- ------------------------------------------------------------------ stopping
select pg_temp.act_as(pg_temp.kept('ana'));
do $$
declare r jsonb;
begin
  if public.meal_stop(pg_temp.kept('lunch')) <> 'stopped' then raise exception 'stop'; end if;
  if public.meal_stop(pg_temp.kept('lunch')) <> 'not_found' then raise exception 'stop twice'; end if;
  if public.meal_stop(''' or ''1''=''1') <> 'not_found' then raise exception 'stop with SQL in it'; end if;
  if jsonb_array_length(public.friends_overview() -> 'my_meals') <> 0 then raise exception 'stopped meal still listed'; end if;
  -- Two meals, then "Stop showing all meals".
  r := public.meal_show(to_char(current_date, 'YYYY-MM-DD'), 'breakfast', '[{"name": "Oats", "portion": "1 cup", "source": "builtin"}]', false, array[pg_temp.kept('cal')::uuid]);
  r := public.meal_show(to_char(current_date, 'YYYY-MM-DD'), 'snack', '[{"name": "Apple", "portion": "1 medium", "source": "builtin"}]', false, array[pg_temp.kept('cal')::uuid]);
  if public.meal_stop_all() <> 2 then raise exception 'stop all'; end if;
  if jsonb_array_length(public.friends_overview() -> 'my_meals') <> 0 then raise exception 'stop all left meals'; end if;
  if public.meal_stop_all() <> 0 then raise exception 'stop all twice'; end if;
end $$;
select pg_temp.act_as(pg_temp.kept('cal'));
do $$
begin
  if jsonb_array_length(pg_temp.feed_meals(public.friends_overview())) <> 0 then raise exception 'Cal still sees a stopped meal'; end if;
  if public.send_cheer(pg_temp.kept('ana')::uuid, 'meal:' || pg_temp.kept('lunch')) <> 'invalid' then raise exception 'cheer for a stopped meal'; end if;
end $$;

-- ------------------------------------------------------------------ always show a meal type
select pg_temp.act_as(pg_temp.kept('ana'));
do $$
declare r jsonb; s jsonb; today text := to_char(current_date, 'YYYY-MM-DD'); food constant jsonb := '[{"name": "Soup", "portion": "1 bowl", "source": "builtin", "kcal": 180}]';
begin
  s := public.meal_settings_set('{"auto": ["dinner"], "kcal": true}');
  if s <> '{"auto": ["dinner"], "kcal": true, "see": true}'::jsonb then raise exception 'auto settings: %', s; end if;
  perform public.meal_audience_set(array[pg_temp.kept('cal')::uuid]);
  if public.meal_show_auto(today, 'lunch', food) ->> 'status' <> 'not_auto' then raise exception 'a type not chosen was shown'; end if;
  if public.meal_show_auto(to_char(current_date - 3, 'YYYY-MM-DD'), 'dinner', food) ->> 'status' <> 'invalid' then raise exception 'a past dinner was shown by itself'; end if;
  r := public.meal_show_auto(today, 'dinner', food);
  if r ->> 'status' <> 'ok' then raise exception 'auto show: %', r; end if;
  if public.meal_show_auto(today, 'dinner', food) ->> 'status' <> 'exists' then raise exception 'auto show twice'; end if;
  if (public.friends_overview() -> 'my_meals' -> 0 -> 'items' -> 0 ->> 'kcal')::int <> 180 then raise exception 'auto uses the calories default'; end if;
  -- Stopped by the person: never shown by itself again; shown on purpose, it is.
  perform public.meal_stop(r ->> 'ref');
  if public.meal_show_auto(today, 'dinner', food) ->> 'status' <> 'stopped' then raise exception 'auto brought back a stopped meal'; end if;
  if public.meal_show(today, 'dinner', food, false, array[pg_temp.kept('cal')::uuid]) ->> 'status' <> 'ok' then raise exception 'showing on purpose after a stop'; end if;
  perform public.meal_stop_all();
  if public.meal_show_auto(today, 'dinner', food) ->> 'status' <> 'stopped' then raise exception 'stop all marks the stop'; end if;
  perform public.meal_audience_set(array[]::uuid[]);
  if public.meal_show_auto(today, 'breakfast', food) ->> 'status' <> 'not_auto' then raise exception 'breakfast'; end if;
  perform public.meal_settings_set('{"auto": ["breakfast"]}');
  if public.meal_show_auto(to_char(current_date + 1, 'YYYY-MM-DD'), 'breakfast', food) ->> 'status' <> 'no_viewers' then raise exception 'auto with nobody picked'; end if;
  perform public.meal_settings_set('{"auto": [], "kcal": false}');
end $$;

-- ------------------------------------------------------------------ expiry
select pg_temp.act_as(pg_temp.kept('ana'));
do $$
declare r jsonb;
begin
  r := public.meal_show(to_char(current_date - 6, 'YYYY-MM-DD'), 'lunch', '[{"name": "Bread", "portion": "1 slice", "source": "builtin"}]', false, array[pg_temp.kept('cal')::uuid]);
  if r ->> 'status' <> 'ok' then raise exception 'a meal from 6 days ago: %', r; end if;
  insert into keep values ('old', r ->> 'ref');
end $$;
select pg_temp.act_as(pg_temp.kept('cal'));
select pg_temp.ensure(public.send_cheer(pg_temp.kept('ana')::uuid, 'meal:' || pg_temp.kept('old')) = 'ok', 'Cal cheers the old lunch');
reset role;
update public.shared_meals set expires_at = now() - interval '1 second', shown_at = now() - interval '7 days'
  where owner = 'e1111111-1111-4111-8111-111111111111' and ref = (select v from keep where k = 'old');
set role authenticated;
do $$
begin
  -- Before any read removes it, an expired meal is already out of reach.
  if public.send_cheer(pg_temp.kept('ana')::uuid, 'meal:' || pg_temp.kept('old')) <> 'invalid' then raise exception 'cheer for an expired meal'; end if;
  if jsonb_array_length(pg_temp.feed_meals(public.friends_overview())) <> 0 then raise exception 'an expired meal is still shown'; end if;
end $$;
reset role;
do $$
begin
  -- The read let it leave the server, cheers and all.
  if exists (select 1 from public.shared_meals where ref = (select v from keep where k = 'old')) then raise exception 'an expired meal stayed on the server'; end if;
  if exists (select 1 from public.shared_meal_viewers where ref = (select v from keep where k = 'old')) then raise exception 'viewers of an expired meal stayed'; end if;
  if exists (select 1 from public.cheers where ref = 'meal:' || (select v from keep where k = 'old')) then raise exception 'cheers of an expired meal stayed'; end if;
end $$;
set role authenticated;
select pg_temp.act_as(pg_temp.kept('ana'));
do $$
begin
  if public.meal_update(pg_temp.kept('old'), '[{"name": "Bread", "portion": "2 slices", "source": "builtin"}]') <> 'gone' then raise exception 'an edit brought back an expired meal'; end if;
  if jsonb_array_length(public.friends_overview() -> 'my_meals') <> 0 then raise exception 'expired meal in my meals'; end if;
end $$;
-- An expired copy that no read has removed yet is replaced by a new showing, with a new expiry.
select pg_temp.ensure(public.meal_show(to_char(current_date, 'YYYY-MM-DD'), 'snack', '[{"name": "Nuts", "portion": "1 oz", "source": "builtin"}]', false, array['e3333333-3333-4333-8333-333333333333'::uuid]) ->> 'status' = 'ok', 'snack shown');
select pg_temp.act_as(pg_temp.kept('cal'));
select pg_temp.ensure(public.send_cheer(pg_temp.kept('ana')::uuid, 'meal:' || (select x ->> 'ref' from jsonb_array_elements(pg_temp.feed_meals(public.friends_overview())) x where x ->> 'meal' = 'snack')) = 'ok', 'snack cheered');
reset role;
update public.shared_meals set expires_at = now() - interval '1 second' where owner = 'e1111111-1111-4111-8111-111111111111' and meal = 'snack';
set role authenticated;
select pg_temp.act_as(pg_temp.kept('ana'));
do $$
declare r jsonb;
begin
  r := public.meal_show(to_char(current_date, 'YYYY-MM-DD'), 'snack', '[{"name": "Nuts", "portion": "1 oz", "source": "builtin"}]', false, array[pg_temp.kept('cal')::uuid]);
  if r ->> 'status' <> 'ok' or (r ->> 'expires_at')::timestamptz < now() + interval '6 days' then raise exception 'a new showing after expiry: %', r; end if;
  if (public.friends_overview() -> 'my_meals' -> 0 ->> 'cheers')::int <> 0 then raise exception 'cheers of the expired copy carried over'; end if;
  perform public.meal_stop_all();
end $$;

-- ------------------------------------------------------------------ unfriending
select pg_temp.act_as(pg_temp.kept('ana'));
do $$
begin
  perform public.meal_show(to_char(current_date, 'YYYY-MM-DD'), 'lunch', '[{"name": "Rice", "portion": "1 cup", "source": "builtin"}]', false, array[pg_temp.kept('ben')::uuid]);
  perform public.meal_show(to_char(current_date, 'YYYY-MM-DD'), 'dinner', '[{"name": "Fish", "portion": "1 fillet", "source": "builtin"}]', false, array[pg_temp.kept('ben')::uuid, pg_temp.kept('cal')::uuid]);
  perform public.friend_prefs_set(pg_temp.kept('ben')::uuid, null, false);
end $$;
select pg_temp.act_as(pg_temp.kept('ben'));
do $$
declare r jsonb;
begin
  perform public.friend_prefs_set(pg_temp.kept('ana')::uuid, true, true);
  perform public.meal_audience_set(array[pg_temp.kept('ana')::uuid]);
  r := public.meal_show(to_char(current_date, 'YYYY-MM-DD'), 'lunch', '[{"name": "Toast", "portion": "1 slice", "source": "builtin"}]', false, array[pg_temp.kept('ana')::uuid]);
  if r ->> 'status' <> 'ok' then raise exception 'Ben shows lunch: %', r; end if;
  if jsonb_array_length(pg_temp.feed_meals(public.friends_overview())) <> 2 then raise exception 'Ben sees both of Ana''s meals'; end if;
  -- Ben removes Ana: from this moment neither sees the other's meals.
  perform public.friend_remove(pg_temp.kept('ana')::uuid);
  if jsonb_array_length(pg_temp.feed_meals(public.friends_overview())) <> 0 then raise exception 'meals after unfriending'; end if;
  if jsonb_array_length(public.friends_overview() -> 'my_meals') <> 0 then raise exception 'Ben''s lunch, shown to Ana only, should have stopped'; end if;
  if public.send_cheer(pg_temp.kept('ana')::uuid, 'meal:' || repeat('a', 32)) <> 'not_friends' then raise exception 'cheer after unfriending'; end if;
end $$;
select pg_temp.act_as(pg_temp.kept('ana'));
do $$
declare o jsonb;
begin
  o := public.friends_overview();
  if jsonb_array_length(o -> 'my_meals') <> 1 or o -> 'my_meals' -> 0 ->> 'meal' <> 'dinner' then raise exception 'lunch (Ben only) stops, dinner (Ben and Cal) stays: %', o -> 'my_meals'; end if;
  if jsonb_array_length(o -> 'my_meals' -> 0 -> 'viewers') <> 1 then raise exception 'Ben still listed: %', o -> 'my_meals' -> 0 -> 'viewers'; end if;
  if jsonb_array_length(pg_temp.feed_meals(o)) <> 0 then raise exception 'Ana still sees Ben''s meal'; end if;
end $$;
reset role;
do $$
begin
  if exists (select 1 from public.friend_prefs where 'e2222222-2222-4222-8222-222222222222' in (owner, friend) and 'e1111111-1111-4111-8111-111111111111' in (owner, friend)) then raise exception 'switches between the two remain'; end if;
  if exists (select 1 from public.meal_audience where 'e2222222-2222-4222-8222-222222222222' in (owner, viewer) and 'e1111111-1111-4111-8111-111111111111' in (owner, viewer)) then raise exception 'audience between the two remains'; end if;
  if exists (select 1 from public.shared_meal_viewers where 'e2222222-2222-4222-8222-222222222222' in (owner, viewer) and 'e1111111-1111-4111-8111-111111111111' in (owner, viewer)) then raise exception 'viewer rows between the two remain'; end if;
end $$;
set role authenticated;
-- A viewer row left behind (a meal shown in the same moment the friendship ended) shows
-- nothing: the friendship is checked at every read.
reset role;
insert into public.shared_meal_viewers (owner, ref, viewer)
  select owner, ref, 'e2222222-2222-4222-8222-222222222222' from public.shared_meals
  where owner = 'e1111111-1111-4111-8111-111111111111' and meal = 'dinner';
set role authenticated;
select pg_temp.act_as(pg_temp.kept('ben'));
do $$
begin
  if public.send_cheer(pg_temp.kept('ana')::uuid, 'meal:' || repeat('a', 32)) <> 'not_friends' then raise exception 'a stale viewer row allowed a cheer'; end if;
  if jsonb_array_length(pg_temp.feed_meals(public.friends_overview())) <> 0 then raise exception 'a stale viewer row showed a meal to a non-friend'; end if;
end $$;
select pg_temp.act_as(pg_temp.kept('ana'));
do $$
begin
  if position(pg_temp.kept('ben') in (public.friends_overview() -> 'my_meals')::text) > 0 then raise exception 'a non-friend listed among the viewers'; end if;
end $$;
reset role;
delete from public.shared_meal_viewers where viewer = 'e2222222-2222-4222-8222-222222222222' and owner = 'e1111111-1111-4111-8111-111111111111';
set role authenticated;
-- Friends again: nothing comes back by itself.
select pg_temp.act_as(pg_temp.kept('ben'));
select pg_temp.ensure(public.friend_request(pg_temp.kept('ana-code')) ->> 'status' = 'sent', 'Ben asks again');
select pg_temp.act_as(pg_temp.kept('ana'));
select pg_temp.ensure(public.friend_respond(pg_temp.kept('ben')::uuid, true) = 'accepted', 'friends again');
select pg_temp.act_as(pg_temp.kept('ben'));
do $$
begin
  if jsonb_array_length(pg_temp.feed_meals(public.friends_overview())) <> 0 then raise exception 'meals came back after making friends again'; end if;
end $$;

-- ------------------------------------------------------------------ turning friends off
-- Cal shows a meal to Ana only; Ana turns friends off. Every meal she shows stops, she
-- leaves every meal she was shown, and Cal's meal, left with nobody, stops too.
select pg_temp.act_as(pg_temp.kept('cal'));
select pg_temp.ensure(public.meal_show(to_char(current_date, 'YYYY-MM-DD'), 'lunch', '[{"name": "Wrap", "portion": "1 wrap", "source": "builtin"}]', false, array['e1111111-1111-4111-8111-111111111111'::uuid]) ->> 'status' = 'ok', 'Cal shows lunch');
select pg_temp.act_as(pg_temp.kept('ana'));
do $$
declare card jsonb;
begin
  perform public.meal_settings_set('{"auto": ["lunch"], "kcal": true}');
  perform public.friend_prefs_set(pg_temp.kept('cal')::uuid, null, false);
  perform public.social_leave();
  card := public.social_setup('Ana', '', '{}');
  update keep set v = card ->> 'share_key' where k = 'ana-key';
  update keep set v = card ->> 'code' where k = 'ana-code';
  if public.friends_overview() -> 'me' -> 'meal_settings' <> '{"auto": [], "kcal": false, "see": true}'::jsonb then raise exception 'meal settings survived turning friends off'; end if;
end $$;
reset role;
do $$
declare n int;
begin
  select (select count(*) from public.shared_meals where owner = 'e1111111-1111-4111-8111-111111111111')
       + (select count(*) from public.shared_meal_viewers where viewer = 'e1111111-1111-4111-8111-111111111111')
       + (select count(*) from public.meal_audience where 'e1111111-1111-4111-8111-111111111111' in (owner, viewer))
       + (select count(*) from public.friend_prefs where 'e1111111-1111-4111-8111-111111111111' in (owner, friend))
       + (select count(*) from public.shared_meal_stops where owner = 'e1111111-1111-4111-8111-111111111111') into n;
  if n <> 0 then raise exception '% meal rows of Ana survived turning friends off', n; end if;
  if exists (select 1 from public.shared_meals where owner = 'e3333333-3333-4333-8333-333333333333') then raise exception 'Cal''s meal, shown to Ana only, should have stopped'; end if;
end $$;
set role authenticated;

-- ------------------------------------------------------------------ limits
-- Gus (friends with Ben) shows a meal of each of the last days: 20 new showings a day.
select pg_temp.act_as(pg_temp.kept('gus'));
do $$
declare d int; m text; r jsonb; n int := 0;
begin
  <<outer>>
  for d in -7..2 loop
    foreach m in array array['breakfast', 'lunch', 'dinner', 'snack'] loop
      exit outer when n = 20;
      r := public.meal_show(to_char(current_date + d, 'YYYY-MM-DD'), m, '[{"name": "Egg", "portion": "1 large", "source": "builtin"}]', false, array[pg_temp.kept('ben')::uuid]);
      if r ->> 'status' <> 'ok' then raise exception 'show % % (%): %', d, m, n, r; end if;
      n := n + 1;
    end loop;
  end loop;
  r := public.meal_show(to_char(current_date + 2, 'YYYY-MM-DD'), 'snack', '[{"name": "Egg", "portion": "1 large", "source": "builtin"}]', false, array[pg_temp.kept('ben')::uuid]);
  if r ->> 'status' <> 'limit' then raise exception 'a 21st showing in a day: %', r; end if;
  -- Showing one again (a change of foods or people) is not a new showing.
  r := public.meal_show(to_char(current_date - 7, 'YYYY-MM-DD'), 'breakfast', '[{"name": "Eggs", "portion": "2 large", "source": "builtin"}]', false, array[pg_temp.kept('ben')::uuid]);
  if r ->> 'status' <> 'ok' then raise exception 'showing again within the limit: %', r; end if;
  -- Stopping, or turning friends off and on, does not reset it.
  perform public.meal_stop_all();
  perform public.social_leave();
  perform public.social_setup('Gus', '', '{}');
  perform public.friend_request(pg_temp.kept('ben-code'));
end $$;
select pg_temp.act_as(pg_temp.kept('ben'));
select pg_temp.ensure(public.friend_respond('e7777777-7777-4777-8777-777777777777'::uuid, true) = 'accepted', 'Gus and Ben again');
select pg_temp.act_as(pg_temp.kept('gus'));
do $$
begin
  if public.meal_show(to_char(current_date, 'YYYY-MM-DD'), 'lunch', '[{"name": "Egg", "portion": "1 large", "source": "builtin"}]', false, array[pg_temp.kept('ben')::uuid]) ->> 'status' <> 'limit' then
    raise exception 'leaving and rejoining reset the showing limit';
  end if;
end $$;
-- A new day of showings: still at most 40 meals showing at once.
reset role;
update public.social_limits set meal_shows = 0, meal_shows_window = now() - interval '25 hours' where user_id = 'e7777777-7777-4777-8777-777777777777';
insert into public.shared_meals (owner, ref, day, meal, items)
  select 'e7777777-7777-4777-8777-777777777777', substr(md5(i::text), 1, 32), current_date - 30 - i, 'lunch', '[{"name": "Egg", "portion": "1", "source": "builtin"}]'
  from generate_series(1, 40) i;
insert into public.shared_meal_viewers (owner, ref, viewer)
  select 'e7777777-7777-4777-8777-777777777777', substr(md5(i::text), 1, 32), 'e2222222-2222-4222-8222-222222222222' from generate_series(1, 40) i;
set role authenticated;
do $$
begin
  if public.meal_show(to_char(current_date, 'YYYY-MM-DD'), 'lunch', '[{"name": "Egg", "portion": "1 large", "source": "builtin"}]', false, array[pg_temp.kept('ben')::uuid]) ->> 'status' <> 'limit' then
    raise exception 'a 41st meal showing at once';
  end if;
  perform public.meal_stop_all();
  if public.meal_show(to_char(current_date, 'YYYY-MM-DD'), 'lunch', '[{"name": "Egg", "portion": "1 large", "source": "builtin"}]', false, array[pg_temp.kept('ben')::uuid]) ->> 'status' <> 'ok' then
    raise exception 'after stopping, a new day allows showing again';
  end if;
end $$;
-- Edits: 300 writes a day.
reset role;
update public.social_limits set meal_writes = 300, meal_writes_window = now() where user_id = 'e7777777-7777-4777-8777-777777777777';
set role authenticated;
do $$
declare ref text := public.friends_overview() -> 'my_meals' -> 0 ->> 'ref';
begin
  if public.meal_update(ref, '[{"name": "Two eggs", "portion": "2 large", "source": "builtin"}]') <> 'limit' then raise exception 'the write limit'; end if;
  if public.meal_update(ref, '[]') <> 'stopped' then raise exception 'stopping is never limited'; end if;
end $$;

-- ------------------------------------------------ deleting an account removes all of it
select pg_temp.act_as(pg_temp.kept('cal'));
do $$
begin
  perform public.friend_request(pg_temp.kept('ana-code'));
end $$;
select pg_temp.act_as(pg_temp.kept('ana'));
select pg_temp.ensure(public.friend_respond('e3333333-3333-4333-8333-333333333333'::uuid, true) = 'accepted', 'Cal and Ana');
select pg_temp.ensure(public.meal_show(to_char(current_date, 'YYYY-MM-DD'), 'lunch', '[{"name": "Rice", "portion": "1 cup", "source": "builtin"}]', false, array['e3333333-3333-4333-8333-333333333333'::uuid]) ->> 'status' = 'ok', 'shown to Cal');
select pg_temp.ensure(public.friend_prefs_set('e3333333-3333-4333-8333-333333333333'::uuid, null, false) = 'ok', 'a switch for Cal');
select pg_temp.act_as(pg_temp.kept('cal'));
select public.delete_my_account();
select pg_temp.act_as(pg_temp.kept('ana'));
do $$
begin
  -- Her lunch had only Cal: it stops on her next read.
  if jsonb_array_length(public.friends_overview() -> 'my_meals') <> 0 then raise exception 'a meal shown only to a deleted account'; end if;
end $$;
reset role;
do $$
declare n int;
begin
  select (select count(*) from public.shared_meals where owner = 'e3333333-3333-4333-8333-333333333333')
       + (select count(*) from public.shared_meal_viewers where viewer = 'e3333333-3333-4333-8333-333333333333')
       + (select count(*) from public.meal_audience where 'e3333333-3333-4333-8333-333333333333' in (owner, viewer))
       + (select count(*) from public.friend_prefs where 'e3333333-3333-4333-8333-333333333333' in (owner, friend)) into n;
  if n <> 0 then raise exception '% meal rows survived account deletion', n; end if;
  -- The service role's purge, for a daily job.
  if public.social_purge_meals() < 0 then raise exception 'purge'; end if;
end $$;

-- ------------------------------------------------ the reference, as the app computes it
-- src/services/friendsWire.test.ts holds the same vector: first 32 hex of
-- sha256('k:meal:2026-11-25:lunch').
do $$
begin
  if public.social_meal_ref('k', '2026-11-25', 'lunch') <> '4ef5572e2d6b8d4103d52a3e8b6bf473' then raise exception 'meal ref vector: %', public.social_meal_ref('k', '2026-11-25', 'lunch'); end if;
end $$;

-- ------------------------------------------------ signed-out callers get nothing
set role anon;
do $$
begin
  begin
    perform public.meal_show('2026-11-25', 'lunch', '[]', false, array[]::uuid[]);
    raise exception 'anon could call meal_show';
  exception when insufficient_privilege then null;
  end;
  begin
    perform public.meal_stop_all();
    raise exception 'anon could call meal_stop_all';
  exception when insufficient_privilege then null;
  end;
end $$;
reset role;

do $$ begin raise notice 'ALL FRIENDS MEALS TESTS PASSED'; end $$;
