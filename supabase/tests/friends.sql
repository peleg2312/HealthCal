-- Behavioural tests for friends. Every block raises on failure, so the script
-- either runs to the final notice or stops at the first broken rule.
\set ON_ERROR_STOP on

insert into auth.users (id) values
  ('c1111111-1111-4111-8111-111111111111'),
  ('c2222222-2222-4222-8222-222222222222'),
  ('c3333333-3333-4333-8333-333333333333'),
  ('c4444444-4444-4444-8444-444444444444');

create or replace function pg_temp.act_as(p_user text) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claim.sub', coalesce(p_user, ''), false);
end $$;

-- Codes read back by the test itself (as the table owner), never through the API.
create or replace function pg_temp.code_of(p_user uuid) returns text language sql as $$
  select code from public.social_profiles where user_id = p_user
$$;

create temp table codes (who text primary key, code text);
grant all on codes to authenticated;

-- ---------------------------------------------------------------- set up
set role authenticated;

select pg_temp.act_as('c1111111-1111-4111-8111-111111111111');
do $$
declare card jsonb;
begin
  -- Nothing exists before set-up, and a request needs it.
  if (public.friends_overview() -> 'me') <> 'null'::jsonb then raise exception 'a card exists before set-up'; end if;
  if public.friend_request('ABCDEFGH') ->> 'status' <> 'setup_needed' then raise exception 'request allowed without a card'; end if;

  card := public.social_setup('  Alex  ', '🦊', '{"workouts": true, "streak": true, "minutes": true, "calories": true}');
  if card ->> 'display_name' <> 'Alex' then raise exception 'name not trimmed: %', card; end if;
  if card ->> 'code' !~ '^[A-HJKMNP-Z2-9]{8}$' then raise exception 'unexpected code format: %', card ->> 'code'; end if;
  if card -> 'sharing' ? 'calories' then raise exception 'sharing accepted an unknown switch'; end if;
  insert into codes values ('alex', card ->> 'code');

  -- Set-up again keeps the code and changes the rest.
  card := public.social_setup('Alex R', '🦊', '{"workouts": true, "streak": true, "minutes": true}');
  if card ->> 'code' <> (select code from codes where who = 'alex') then raise exception 'code changed on update'; end if;

  begin
    perform public.social_setup('   ', '', '{}');
    raise exception 'an empty name was accepted';
  exception when invalid_parameter_value then null;
  end;
end $$;

select pg_temp.act_as('c2222222-2222-4222-8222-222222222222');
do $$
declare card jsonb;
begin
  card := public.social_setup('Maya', 'M', '{}');
  insert into codes values ('maya', card ->> 'code');
end $$;

select pg_temp.act_as('c3333333-3333-4333-8333-333333333333');
do $$
declare card jsonb;
begin
  card := public.social_setup('Jonas', 'J', '{}');
  insert into codes values ('jonas', card ->> 'code');
end $$;

-- ------------------------------------------- the tables are closed to the API
do $$
declare n int;
begin
  select count(*) into n from public.social_profiles;
  if n <> 0 then raise exception 'social_profiles readable directly (% rows)', n; end if;
  select count(*) into n from public.friendships;
  if n <> 0 then raise exception 'friendships readable directly'; end if;
  select count(*) into n from public.cheers;
  if n <> 0 then raise exception 'cheers readable directly'; end if;
  begin
    insert into public.friendships (requester, addressee, status)
      values ('c3333333-3333-4333-8333-333333333333', 'c1111111-1111-4111-8111-111111111111', 'accepted');
    raise exception 'a friendship could be inserted directly';
  exception when insufficient_privilege then null;
  end;
  update public.social_profiles set display_name = 'hacked';
  get diagnostics n = row_count;
  if n <> 0 then raise exception 'social_profiles writable directly'; end if;
  begin
    perform public.social_are_friends('c1111111-1111-4111-8111-111111111111', 'c2222222-2222-4222-8222-222222222222');
    raise exception 'the friendship check is callable from the API';
  exception when insufficient_privilege then null;
  end;
end $$;

-- ------------------------------------------------------ request and accept
-- Maya asks Alex.
select pg_temp.act_as('c2222222-2222-4222-8222-222222222222');
do $$
declare r jsonb; o jsonb;
begin
  r := public.friend_request(lower((select code from codes where who = 'alex')));
  if r ->> 'status' <> 'sent' or r -> 'friend' ->> 'display_name' <> 'Alex R' then raise exception 'request: %', r; end if;
  if public.friend_request((select code from codes where who = 'alex')) ->> 'status' <> 'sent' then raise exception 'asking twice changed the answer'; end if;
  if public.friend_request((select code from codes where who = 'maya')) ->> 'status' <> 'self' then raise exception 'own code not recognised'; end if;
  if public.friend_request('ZZZZ2222') ->> 'status' <> 'not_found' then raise exception 'unknown code not reported'; end if;
  o := public.friends_overview();
  if jsonb_array_length(o -> 'outgoing') <> 1 or jsonb_array_length(o -> 'friends') <> 0 then raise exception 'sender overview: %', o; end if;
  -- A pending request shows nothing of the other person's week.
  if (o -> 'outgoing' -> 0) ? 'summary' then raise exception 'a pending request exposes a summary'; end if;
end $$;

-- Alex publishes a week, sees the request and accepts it.
select pg_temp.act_as('c1111111-1111-4111-8111-111111111111');
do $$
declare o jsonb;
begin
  if not public.social_publish('{
    "week": "2026-11-09", "minutes": 236.4, "sessions": 4, "streak": 33,
    "kcal": 2100, "weightKg": 79, "notes": "private",
    "workouts": [
      {"id": "w1", "name": "Running", "emoji": "🏃", "minutes": 32, "date": "2026-11-14", "distanceKm": 5.2, "kcalNet": 310},
      {"id": "w2", "name": "Volleyball", "emoji": "🏐", "minutes": 75, "date": "2026-11-13"},
      "not an object"
    ]
  }') then raise exception 'publish reported no card'; end if;

  o := public.friends_overview();
  if jsonb_array_length(o -> 'incoming') <> 1 or o -> 'incoming' -> 0 ->> 'display_name' <> 'Maya' then raise exception 'receiver overview: %', o; end if;
  if public.friend_respond('c2222222-2222-4222-8222-222222222222', true) <> 'accepted' then raise exception 'accept failed'; end if;
  if public.friend_respond('c2222222-2222-4222-8222-222222222222', true) <> 'not_found' then raise exception 'a request could be answered twice'; end if;
end $$;

-- Maya now sees Alex's week: only the allowed fields, nothing private.
select pg_temp.act_as('c2222222-2222-4222-8222-222222222222');
do $$
declare o jsonb; s jsonb;
begin
  o := public.friends_overview();
  if jsonb_array_length(o -> 'friends') <> 1 or jsonb_array_length(o -> 'outgoing') <> 0 then raise exception 'after accept: %', o; end if;
  s := o -> 'friends' -> 0 -> 'summary';
  if (s ->> 'minutes')::int <> 236 or (s ->> 'sessions')::int <> 4 or (s ->> 'streak')::int <> 33 then raise exception 'summary numbers: %', s; end if;
  if s ? 'kcal' or s ? 'weightKg' or s ? 'notes' then raise exception 'private fields reached a friend: %', s; end if;
  if jsonb_array_length(s -> 'workouts') <> 2 then raise exception 'workouts: %', s -> 'workouts'; end if;
  if (s -> 'workouts' -> 0) ? 'kcalNet' then raise exception 'workout calories reached a friend'; end if;
  if s -> 'workouts' -> 0 ->> 'name' <> 'Running' or (s -> 'workouts' -> 0 ->> 'distanceKm')::numeric <> 5.2 then raise exception 'workout fields: %', s -> 'workouts' -> 0; end if;
  if public.friend_request((select code from codes where who = 'alex')) ->> 'status' <> 'already_friends' then raise exception 'friends could ask again'; end if;
end $$;

-- Jonas is nobody's friend: he sees neither of them and cannot cheer.
select pg_temp.act_as('c3333333-3333-4333-8333-333333333333');
do $$
declare o jsonb;
begin
  o := public.friends_overview();
  if jsonb_array_length(o -> 'friends') <> 0 or jsonb_array_length(o -> 'incoming') <> 0 or jsonb_array_length(o -> 'cheers') <> 0 then raise exception 'stranger overview: %', o; end if;
  if public.send_cheer('c1111111-1111-4111-8111-111111111111', 'w1') <> 'not_friends' then raise exception 'a stranger could cheer'; end if;
  if public.friend_respond('c2222222-2222-4222-8222-222222222222', true) <> 'not_found' then raise exception 'a stranger could answer a request'; end if;
end $$;

-- ---------------------------------------------- switching a share off is immediate
select pg_temp.act_as('c1111111-1111-4111-8111-111111111111');
select public.social_setup('Alex R', '🦊', '{"workouts": false, "streak": true, "minutes": false}');
select pg_temp.act_as('c2222222-2222-4222-8222-222222222222');
do $$
declare s jsonb;
begin
  s := public.friends_overview() -> 'friends' -> 0 -> 'summary';
  if s ? 'workouts' or s ? 'minutes' or s ? 'sessions' then raise exception 'switched-off fields still visible: %', s; end if;
  if (s ->> 'streak')::int <> 33 then raise exception 'streak should still show: %', s; end if;
end $$;
select pg_temp.act_as('c1111111-1111-4111-8111-111111111111');
select public.social_setup('Alex R', '🦊', '{"workouts": true, "streak": true, "minutes": true}');

-- ------------------------------------------------------------------ cheers
select pg_temp.act_as('c2222222-2222-4222-8222-222222222222');
do $$
declare o jsonb;
begin
  if public.send_cheer('c1111111-1111-4111-8111-111111111111', 'w1') <> 'ok' then raise exception 'cheer failed'; end if;
  if public.send_cheer('c1111111-1111-4111-8111-111111111111', 'w1') <> 'ok' then raise exception 'cheering twice should be harmless'; end if;
  if public.send_cheer('c1111111-1111-4111-8111-111111111111', '   ') <> 'not_friends' then raise exception 'an empty cheer was accepted'; end if;
  o := public.friends_overview();
  if o -> 'friends' -> 0 -> 'cheered' <> '["w1"]'::jsonb then raise exception 'cheered list: %', o -> 'friends' -> 0 -> 'cheered'; end if;
end $$;
select pg_temp.act_as('c1111111-1111-4111-8111-111111111111');
do $$
declare o jsonb;
begin
  o := public.friends_overview();
  if jsonb_array_length(o -> 'cheers') <> 1 or o -> 'cheers' -> 0 ->> 'display_name' <> 'Maya' or o -> 'cheers' -> 0 ->> 'ref' <> 'w1' then raise exception 'received cheers: %', o -> 'cheers'; end if;
end $$;

-- ------------------------------------------- declining, asking again, mutual requests
-- Jonas asks Alex; Alex declines; Jonas cannot tell and cannot ask again or clear it.
select pg_temp.act_as('c3333333-3333-4333-8333-333333333333');
select public.friend_request((select code from codes where who = 'alex'));
select pg_temp.act_as('c1111111-1111-4111-8111-111111111111');
do $$
begin
  if public.friend_respond('c3333333-3333-4333-8333-333333333333', false) <> 'declined' then raise exception 'decline failed'; end if;
  if jsonb_array_length(public.friends_overview() -> 'incoming') <> 0 then raise exception 'a declined request is still listed'; end if;
end $$;
select pg_temp.act_as('c3333333-3333-4333-8333-333333333333');
do $$
declare o jsonb;
begin
  if public.friend_request((select code from codes where who = 'alex')) ->> 'status' <> 'sent' then raise exception 'the decline was revealed'; end if;
  perform public.friend_remove('c1111111-1111-4111-8111-111111111111');
  o := public.friends_overview();
  if jsonb_array_length(o -> 'outgoing') <> 1 then raise exception 'a declined request could be cleared by its sender: %', o; end if;
end $$;
select pg_temp.act_as('c1111111-1111-4111-8111-111111111111');
do $$
declare r jsonb;
begin
  if jsonb_array_length(public.friends_overview() -> 'incoming') <> 0 then raise exception 'the declined request came back'; end if;
  -- Alex changes his mind and enters Jonas's code: that accepts the old request.
  r := public.friend_request((select code from codes where who = 'jonas'));
  if r ->> 'status' <> 'accepted' then raise exception 'entering the code of someone who asked: %', r; end if;
  if jsonb_array_length(public.friends_overview() -> 'friends') <> 2 then raise exception 'Alex should have two friends'; end if;
end $$;

-- ------------------------------------------------------ guessing codes is limited
select pg_temp.act_as('c4444444-4444-4444-8444-444444444444');
do $$
declare i int; r jsonb;
begin
  perform public.social_setup('Guesser', 'G', '{}');
  for i in 1..20 loop
    r := public.friend_request('QQQQ' || lpad(i::text, 4, '2'));
    if r ->> 'status' <> 'not_found' then raise exception 'guess %: %', i, r; end if;
  end loop;
  r := public.friend_request((select code from codes where who = 'alex'));
  if r ->> 'status' <> 'too_many' then raise exception 'guessing was not stopped: %', r; end if;
end $$;

-- ---------------------------------------------------------- remove and leave
select pg_temp.act_as('c2222222-2222-4222-8222-222222222222');
select public.friend_remove('c1111111-1111-4111-8111-111111111111');
do $$
begin
  if jsonb_array_length(public.friends_overview() -> 'friends') <> 0 then raise exception 'removed friend still listed'; end if;
end $$;
select pg_temp.act_as('c1111111-1111-4111-8111-111111111111');
do $$
declare o jsonb;
begin
  o := public.friends_overview();
  if jsonb_array_length(o -> 'friends') <> 1 or o -> 'friends' -> 0 ->> 'display_name' <> 'Jonas' then raise exception 'after Maya left: %', o -> 'friends'; end if;
  if jsonb_array_length(o -> 'cheers') <> 0 then raise exception 'cheers from a removed friend remain'; end if;
end $$;

-- Jonas turns friends off altogether.
select pg_temp.act_as('c3333333-3333-4333-8333-333333333333');
select public.social_leave();
do $$
begin
  if (public.friends_overview() -> 'me') <> 'null'::jsonb then raise exception 'card survived leaving'; end if;
end $$;
select pg_temp.act_as('c1111111-1111-4111-8111-111111111111');
do $$
begin
  if jsonb_array_length(public.friends_overview() -> 'friends') <> 0 then raise exception 'a friend who left is still listed'; end if;
end $$;

-- ------------------------------------------- deleting the account removes the card
select public.delete_my_account();
reset role;
do $$
declare n int;
begin
  select (select count(*) from public.social_profiles where user_id = 'c1111111-1111-4111-8111-111111111111')
       + (select count(*) from public.friendships where 'c1111111-1111-4111-8111-111111111111' in (requester, addressee))
       + (select count(*) from public.cheers where 'c1111111-1111-4111-8111-111111111111' in (from_user, to_user)) into n;
  if n <> 0 then raise exception '% friend rows survived account deletion', n; end if;
  select count(*) into n from public.social_profiles;
  if n <> 2 then raise exception 'expected the cards of Maya and the guesser to remain, found %', n; end if;
end $$;

-- ------------------------------------------------ signed-out callers get nothing
set role anon;
do $$
begin
  begin
    perform public.friends_overview();
    raise exception 'anon could call friends_overview';
  exception when insufficient_privilege then null;
  end;
  begin
    perform public.friend_request('ABCDEFGH');
    raise exception 'anon could call friend_request';
  exception when insufficient_privilege then null;
  end;
end $$;
reset role;

do $$ begin raise notice 'ALL FRIENDS TESTS PASSED'; end $$;
