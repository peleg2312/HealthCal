-- Behavioural tests for friends. Every block raises on failure, so the script
-- either runs to the final notice or stops at the first broken rule.
\set ON_ERROR_STOP on

insert into auth.users (id) values
  ('c1111111-1111-4111-8111-111111111111'),
  ('c2222222-2222-4222-8222-222222222222'),
  ('c3333333-3333-4333-8333-333333333333'),
  ('c4444444-4444-4444-8444-444444444444'),
  ('c5555555-5555-4555-8555-555555555555'),
  ('c6666666-6666-4666-8666-666666666666');

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
  -- The owner gets the secret that makes their workout references opaque; nobody else ever does.
  if coalesce(card ->> 'share_key', '') !~ '^[0-9a-f]{64}$' then raise exception 'no share key for the owner: %', card; end if;
  insert into codes values ('alex', card ->> 'code');
  insert into codes values ('alex-key', card ->> 'share_key');

  -- Set-up again keeps the code and changes the rest.
  card := public.social_setup('Alex R', '🦊', '{"workouts": true, "streak": true, "minutes": true}');
  if card ->> 'code' <> (select code from codes where who = 'alex') then raise exception 'code changed on update'; end if;
  if card ->> 'share_key' <> (select code from codes where who = 'alex-key') then raise exception 'share key changed on update'; end if;
  if public.friends_overview() -> 'me' ->> 'share_key' <> (select code from codes where who = 'alex-key') then raise exception 'own card lacks the share key'; end if;

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
  select count(*) into n from public.social_limits;
  if n <> 0 then raise exception 'social_limits readable directly'; end if;
  select count(*) into n from public.friend_declines;
  if n <> 0 then raise exception 'friend_declines readable directly'; end if;
  begin
    insert into public.friend_declines (decliner, asker)
      values ('c3333333-3333-4333-8333-333333333333', 'c1111111-1111-4111-8111-111111111111');
    raise exception 'a decline could be inserted directly';
  exception when insufficient_privilege then null;
  end;
  begin
    perform public.social_my_limits('c1111111-1111-4111-8111-111111111111');
    raise exception 'the limits helper is callable from the API';
  exception when insufficient_privilege then null;
  end;
  begin
    perform public.social_lock_pair('c1111111-1111-4111-8111-111111111111', 'c2222222-2222-4222-8222-222222222222');
    raise exception 'the pair lock is callable from the API';
  exception when insufficient_privilege then null;
  end;
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
  -- A workout must be referred to by an opaque 32-hex reference, never its record id
  -- (an imported workout's id is derived from its start time).
  begin
    perform public.social_publish('{"week": "2026-11-09", "workouts": [{"id": "8b552e86-b4b0-5c91-a9b5-0267052a9b4f", "name": "Running", "minutes": 48, "date": "2026-11-14"}]}');
    raise exception 'a summary with a real record id was accepted';
  exception when invalid_parameter_value then null;
  end;
  begin
    perform public.social_publish('{"workouts": [{"id": "0123456789ABCDEF0123456789ABCDEF", "name": "Running"}]}');
    raise exception 'a summary with an upper-case reference was accepted';
  exception when invalid_parameter_value then null;
  end;
  if not public.social_publish('{
    "week": "2026-11-09", "minutes": 236.4, "sessions": 4, "streak": 33,
    "kcal": 2100, "weightKg": 79, "notes": "private",
    "workouts": [
      {"id": "0123456789abcdef0123456789abcdef", "name": "Running", "emoji": "🏃", "minutes": 32, "date": "2026-11-14", "distanceKm": 5.2, "kcalNet": 310},
      {"id": "fedcba9876543210fedcba9876543210", "name": "Volleyball", "emoji": "🏐", "minutes": 75, "date": "2026-11-13"},
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
  if position((select code from codes where who = 'alex-key') in o::text) > 0 then raise exception 'a friend can see the share key'; end if;
  if s -> 'workouts' -> 0 ->> 'id' <> '0123456789abcdef0123456789abcdef' then raise exception 'workout reference: %', s -> 'workouts' -> 0; end if;
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
  if public.send_cheer('c1111111-1111-4111-8111-111111111111', '0123456789abcdef0123456789abcdef') <> 'not_friends' then raise exception 'a stranger could cheer'; end if;
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
  if public.send_cheer('c1111111-1111-4111-8111-111111111111', '0123456789abcdef0123456789abcdef') <> 'ok' then raise exception 'cheer failed'; end if;
  if public.send_cheer('c1111111-1111-4111-8111-111111111111', '0123456789abcdef0123456789abcdef') <> 'ok' then raise exception 'cheering twice should be harmless'; end if;
  if public.send_cheer('c1111111-1111-4111-8111-111111111111', 'day:2026-11-14') <> 'ok' then raise exception 'a day cheer failed'; end if;
  if public.send_cheer('c1111111-1111-4111-8111-111111111111', '   ') <> 'invalid' then raise exception 'an empty cheer was accepted'; end if;
  -- A cheer carries a reference, not a message.
  if public.send_cheer('c1111111-1111-4111-8111-111111111111', 'see you at the park at 7') <> 'invalid' then raise exception 'free text was accepted as a cheer'; end if;
  o := public.friends_overview();
  if not (o -> 'friends' -> 0 -> 'cheered') @> '["0123456789abcdef0123456789abcdef", "day:2026-11-14"]'::jsonb or jsonb_array_length(o -> 'friends' -> 0 -> 'cheered') <> 2 then raise exception 'cheered list: %', o -> 'friends' -> 0 -> 'cheered'; end if;
end $$;
select pg_temp.act_as('c1111111-1111-4111-8111-111111111111');
do $$
declare o jsonb;
begin
  o := public.friends_overview();
  if jsonb_array_length(o -> 'cheers') <> 2 or o -> 'cheers' -> 0 ->> 'display_name' <> 'Maya' or not (o -> 'cheers') @> '[{"ref": "0123456789abcdef0123456789abcdef"}]'::jsonb then raise exception 'received cheers: %', o -> 'cheers'; end if;
end $$;

-- ------------------------------------------- declining, asking again, mutual requests
-- Jonas asks Alex; Alex declines. Jonas cannot tell: his request keeps showing as
-- waiting, he can take it back (it goes, as a pending one would) and ask again, and
-- Alex never sees it again, not even after Jonas turns friends off and on.
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
  o := public.friends_overview();
  if jsonb_array_length(o -> 'outgoing') <> 1 then raise exception 'a declined request should still show as waiting: %', o; end if;
  -- Taking it back works exactly as for a pending request.
  perform public.friend_remove('c1111111-1111-4111-8111-111111111111');
  o := public.friends_overview();
  if jsonb_array_length(o -> 'outgoing') <> 0 then raise exception 'take back did nothing for a declined request: %', o; end if;
  if public.friend_request((select code from codes where who = 'alex')) ->> 'status' <> 'sent' then raise exception 'asking again after taking back'; end if;
  if jsonb_array_length(public.friends_overview() -> 'outgoing') <> 1 then raise exception 'asking again should show as waiting'; end if;
end $$;
select pg_temp.act_as('c1111111-1111-4111-8111-111111111111');
do $$
begin
  if jsonb_array_length(public.friends_overview() -> 'incoming') <> 0 then raise exception 'asking again got past the decline'; end if;
end $$;
-- Jonas turns friends off and on again (a new code) and asks once more.
select pg_temp.act_as('c3333333-3333-4333-8333-333333333333');
do $$
declare card jsonb;
begin
  perform public.social_leave();
  card := public.social_setup('Jonas', 'J', '{}');
  update codes set code = card ->> 'code' where who = 'jonas';
  if public.friend_request((select code from codes where who = 'alex')) ->> 'status' <> 'sent' then raise exception 'asking after rejoining'; end if;
  if jsonb_array_length(public.friends_overview() -> 'outgoing') <> 1 then raise exception 'the new request should show as waiting'; end if;
end $$;
select pg_temp.act_as('c1111111-1111-4111-8111-111111111111');
do $$
declare r jsonb;
begin
  if jsonb_array_length(public.friends_overview() -> 'incoming') <> 0 then raise exception 'leaving and rejoining cleared the decline'; end if;
  -- A hidden request cannot be answered blindly, and removing it would show Jonas something changed.
  if public.friend_respond('c3333333-3333-4333-8333-333333333333', true) <> 'not_found' then raise exception 'a declined request could be accepted without the code'; end if;
  perform public.friend_remove('c3333333-3333-4333-8333-333333333333');
end $$;
select pg_temp.act_as('c3333333-3333-4333-8333-333333333333');
do $$
begin
  if jsonb_array_length(public.friends_overview() -> 'outgoing') <> 1 then raise exception 'the receiver cleared a request the sender sees as waiting'; end if;
end $$;
select pg_temp.act_as('c1111111-1111-4111-8111-111111111111');
do $$
declare r jsonb;
begin
  -- Only Alex can lift the decline: he changes his mind and enters Jonas's code.
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
  -- Turning friends off and on does not reset the count.
  perform public.social_leave();
  perform public.social_setup('Guesser', 'G', '{}');
  r := public.friend_request('QQQQ3333');
  if r ->> 'status' <> 'too_many' then raise exception 'leaving and rejoining reset the guess limit: %', r; end if;
  -- And friends can be turned on only a few times a day (this is the second; five are allowed).
  for i in 3..5 loop
    perform public.social_leave();
    perform public.social_setup('Guesser', 'G', '{}');
  end loop;
  -- Changing the card is not turning friends on.
  perform public.social_setup('Guesser 2', 'G', '{}');
  perform public.social_leave();
  begin
    perform public.social_setup('Guesser', 'G', '{}');
    raise exception 'friends could be turned on a sixth time in a day';
  exception when program_limit_exceeded then null;
  end;
  if (public.friends_overview() -> 'me') <> 'null'::jsonb then raise exception 'a refused set-up left a card'; end if;
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

-- ------------------------------------------- one friendship per pair, even in a race
-- Dan and Eve enter each other's codes at the same moment. Dan's call runs in a
-- second session that holds its transaction open; Eve's starts while it is open.
-- They must end up friends once, not with two requests or two friendships.
select pg_temp.act_as('c5555555-5555-4555-8555-555555555555');
do $$ begin insert into codes values ('dan', public.social_setup('Dan', 'D', '{}') ->> 'code'); end $$;
select pg_temp.act_as('c6666666-6666-4666-8666-666666666666');
do $$ begin insert into codes values ('eve', public.social_setup('Eve', 'E', '{}') ->> 'code'); end $$;
select code as race_eve_code from codes where who = 'eve' \gset
\setenv RACE_CODE :race_eve_code
\setenv PGHOST :HOST
\setenv PGPORT :PORT
\setenv PGUSER :USER
\setenv PGDATABASE :DBNAME
\! psql -X -q -v ON_ERROR_STOP=1 -c "set role authenticated" -c "select set_config('request.jwt.claim.sub', 'c5555555-5555-4555-8555-555555555555', false)" -c "begin" -c "select public.friend_request('$RACE_CODE')" -c "select pg_sleep(2)" -c "commit" > /dev/null 2>&1 &
select pg_sleep(0.7);
do $$
declare r jsonb;
begin
  r := public.friend_request((select code from codes where who = 'dan'));
  if r ->> 'status' <> 'accepted' then raise exception 'two people asking each other at once should become friends: %', r; end if;
end $$;
-- Let Dan's session finish whatever happened, then look at the table as its owner.
select pg_sleep(2.5);
reset role;
do $$
declare n int; a int;
begin
  select count(*), count(*) filter (where status = 'accepted') into n, a from public.friendships
    where 'c5555555-5555-4555-8555-555555555555' in (requester, addressee) and 'c6666666-6666-4666-8666-666666666666' in (requester, addressee);
  if n <> 1 or a <> 1 then raise exception 'expected one accepted friendship for the pair, found % rows (% accepted)', n, a; end if;
  -- The database itself refuses a second row for the same two people, either way round.
  begin
    insert into public.friendships (requester, addressee, status) values ('c6666666-6666-4666-8666-666666666666', 'c5555555-5555-4555-8555-555555555555', 'pending');
    insert into public.friendships (requester, addressee, status) values ('c5555555-5555-4555-8555-555555555555', 'c6666666-6666-4666-8666-666666666666', 'pending');
    raise exception 'a second friendship row for the same pair was stored';
  exception when unique_violation then null;
  end;
end $$;
set role authenticated;
select pg_temp.act_as('c1111111-1111-4111-8111-111111111111');

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
  if n <> 3 then raise exception 'expected the cards of Maya, Dan and Eve to remain, found %', n; end if;
  -- Declines and the guess limit outlive leaving friends, but not the account.
  select count(*) into n from public.friend_declines where 'c1111111-1111-4111-8111-111111111111' in (decliner, asker);
  if n <> 0 then raise exception 'declines survived account deletion'; end if;
  select count(*) into n from public.social_limits where user_id = 'c4444444-4444-4444-8444-444444444444';
  if n <> 1 then raise exception 'the guesser''s limits were not kept after leaving'; end if;
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
