-- Friends.
--
-- A person can add friends by a code and let them see a small summary of their
-- week: active minutes, sessions, streak and recent workouts. Each of those can
-- be switched off. Calories, weight and food are never part of it: the summary
-- is rebuilt here from a fixed list of fields, whatever a device sends.
--
-- None of these tables can be read or written directly. Row-level security is
-- on with no policies, so every access goes through the functions below, and
-- each function works only for the signed-in caller.

create table if not exists public.social_profiles (
  user_id uuid primary key references auth.users (id) on delete cascade,
  -- What someone types to add this person. Random, so it cannot be walked.
  code text not null unique,
  display_name text not null,
  avatar text not null default '',
  -- What friends may see: {"workouts": bool, "streak": bool, "minutes": bool}.
  sharing jsonb not null default '{"workouts": true, "streak": true, "minutes": true}'::jsonb,
  -- The week in numbers, written by the owner's device and cleaned on the way in.
  summary jsonb not null default '{}'::jsonb,
  summary_updated_at timestamptz,
  -- A secret only the owner is given. Their device publishes each workout as the
  -- first 32 hex characters of sha256(share_key || ':' || record id), so friends
  -- can cheer a workout without learning its record id (an imported workout's id
  -- is derived from its start time). A new card gets a new key.
  share_key text not null default (replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', '')),
  created_at timestamptz not null default now()
);

-- Limits that must outlive turning friends off and on again, so neither can be
-- used to reset them. Removed only with the account.
create table if not exists public.social_limits (
  user_id uuid primary key references auth.users (id) on delete cascade,
  -- Wrong codes tried in the current hour (see friend_request).
  lookup_misses integer not null default 0,
  lookup_window timestamptz,
  -- Cards created (friends turned on) in the current day (see social_setup).
  setups integer not null default 0,
  setups_window timestamptz
);

create table if not exists public.friendships (
  requester uuid not null references auth.users (id) on delete cascade,
  addressee uuid not null references auth.users (id) on delete cascade,
  -- A declined request stays 'pending' for its sender (who sees it as waiting) and is
  -- hidden from the person who declined it by a row in friend_declines.
  status text not null check (status in ('pending', 'accepted')),
  created_at timestamptz not null default now(),
  responded_at timestamptz,
  primary key (requester, addressee),
  check (requester <> addressee)
);

create index if not exists friendships_addressee_idx on public.friendships (addressee);
-- One row per pair of people, whichever of them asked.
create unique index if not exists friendships_pair_idx
  on public.friendships (least(requester, addressee), greatest(requester, addressee));

-- "decliner turned down asker". Keyed on the two accounts, not on cards, so that
-- turning friends off and on again does not clear it. While it exists, requests
-- from asker are kept but never shown to decliner. Only decliner can lift it, by
-- entering asker's code (friend_request). Removed only with either account.
create table if not exists public.friend_declines (
  decliner uuid not null references auth.users (id) on delete cascade,
  asker uuid not null references auth.users (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (decliner, asker),
  check (decliner <> asker)
);

create table if not exists public.cheers (
  from_user uuid not null references auth.users (id) on delete cascade,
  to_user uuid not null references auth.users (id) on delete cascade,
  -- What is cheered: a workout's opaque reference (32 hex), or a day as 'day:2026-11-14'.
  -- A reference, never free text.
  ref text not null check (ref ~ '^([0-9a-f]{32}|day:[0-9]{4}-[0-9]{2}-[0-9]{2})$'),
  created_at timestamptz not null default now(),
  primary key (from_user, to_user, ref)
);

create index if not exists cheers_to_idx on public.cheers (to_user, created_at desc);

alter table public.social_profiles enable row level security;
alter table public.social_limits enable row level security;
alter table public.friendships enable row level security;
alter table public.friend_declines enable row level security;
alter table public.cheers enable row level security;

-- ------------------------------------------------------------------ helpers

-- Eight characters from an alphabet without look-alikes (no I, L, O, 0, 1).
create or replace function public.social_new_code()
returns text
language plpgsql
volatile
set search_path = public
as $$
declare
  alphabet constant text := 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
  -- Bytes of a random UUID; positions 6 and 8 carry fixed bits and are skipped.
  bytes bytea := decode(replace(gen_random_uuid()::text, '-', ''), 'hex');
  positions constant integer[] := array[0, 1, 2, 3, 4, 5, 10, 11];
  result text := '';
  i integer;
begin
  foreach i in array positions loop
    result := result || substr(alphabet, 1 + get_byte(bytes, i) % length(alphabet), 1);
  end loop;
  return result;
end;
$$;

create or replace function public.social_clean_sharing(p jsonb)
returns jsonb
language sql
immutable
as $$
  select jsonb_build_object(
    'workouts', case when jsonb_typeof(p -> 'workouts') = 'boolean' then (p ->> 'workouts')::boolean else true end,
    'streak', case when jsonb_typeof(p -> 'streak') = 'boolean' then (p ->> 'streak')::boolean else true end,
    'minutes', case when jsonb_typeof(p -> 'minutes') = 'boolean' then (p ->> 'minutes')::boolean else true end
  )
$$;

-- Keep only the fields a summary is allowed to have, each within sane bounds.
-- Anything else a device sends (calories, weight, notes) is dropped here.
create or replace function public.social_clean_summary(p jsonb)
returns jsonb
language sql
immutable
as $$
  select jsonb_strip_nulls(jsonb_build_object(
    'week', case when p ->> 'week' ~ '^\d{4}-\d{2}-\d{2}$' then p ->> 'week' end,
    'minutes', case when jsonb_typeof(p -> 'minutes') = 'number' then least(greatest(round((p ->> 'minutes')::numeric), 0), 100000) end,
    'sessions', case when jsonb_typeof(p -> 'sessions') = 'number' then least(greatest(round((p ->> 'sessions')::numeric), 0), 1000) end,
    'streak', case when jsonb_typeof(p -> 'streak') = 'number' then least(greatest(round((p ->> 'streak')::numeric), 0), 100000) end,
    'workouts', (
      select jsonb_agg(w order by n)
      from (
        select
          n,
          jsonb_strip_nulls(jsonb_build_object(
            'id', e ->> 'id',
            'name', left(e ->> 'name', 60),
            'emoji', left(e ->> 'emoji', 16),
            'minutes', case when jsonb_typeof(e -> 'minutes') = 'number' then least(greatest(round((e ->> 'minutes')::numeric), 0), 1440) end,
            'date', case when e ->> 'date' ~ '^\d{4}-\d{2}-\d{2}$' then e ->> 'date' end,
            'distanceKm', case when jsonb_typeof(e -> 'distanceKm') = 'number' then least(greatest((e ->> 'distanceKm')::numeric, 0), 1000) end
          )) as w
        from jsonb_array_elements(case when jsonb_typeof(p -> 'workouts') = 'array' then p -> 'workouts' else '[]'::jsonb end) with ordinality as t (e, n)
        where jsonb_typeof(e) = 'object' and e ->> 'id' ~ '^[0-9a-f]{32}$'
        order by n
        limit 12
      ) picked
    )
  ))
$$;

-- What a friend is shown: the summary minus whatever its owner switched off.
-- Applied when reading, so switching something off takes effect at once.
create or replace function public.social_visible_summary(p_summary jsonb, p_sharing jsonb)
returns jsonb
language sql
immutable
as $$
  select coalesce(p_summary, '{}'::jsonb)
    - case when coalesce((p_sharing ->> 'workouts')::boolean, false) then array[]::text[] else array['workouts'] end
    - case when coalesce((p_sharing ->> 'streak')::boolean, false) then array[]::text[] else array['streak'] end
    - case when coalesce((p_sharing ->> 'minutes')::boolean, false) then array[]::text[] else array['minutes', 'sessions'] end
$$;

create or replace function public.social_are_friends(p_a uuid, p_b uuid)
returns boolean
language sql
stable
set search_path = public
as $$
  select exists (
    select 1 from public.friendships f
    where f.status = 'accepted'
      and ((f.requester = p_a and f.addressee = p_b) or (f.requester = p_b and f.addressee = p_a))
  )
$$;

-- A workout as friends may know it: an opaque 32-hex reference, never a record id.
create or replace function public.social_is_workout_ref(p text)
returns boolean
language sql
immutable
as $$
  select coalesce(p ~ '^[0-9a-f]{32}$', false)
$$;

-- Requests and answers between two people run one at a time for that pair, so two
-- people entering each other's codes at once become friends once (the second call
-- sees the first one's request and accepts it).
create or replace function public.social_lock_pair(p_a uuid, p_b uuid)
returns void
language sql
volatile
as $$
  select pg_advisory_xact_lock(hashtextextended('friendship:' || least(p_a, p_b)::text || ':' || greatest(p_a, p_b)::text, 0))
$$;

-- The caller's limits row, locked, created on first use.
create or replace function public.social_my_limits(p_user uuid)
returns public.social_limits
language plpgsql
volatile
set search_path = public
as $$
declare
  v public.social_limits;
begin
  insert into public.social_limits (user_id) values (p_user) on conflict (user_id) do nothing;
  select * into v from public.social_limits where user_id = p_user for update;
  return v;
end;
$$;

-- ------------------------------------------------------------------ actions

-- Turn friends on (or change name, avatar and what is shared). Returns the caller's card.
create or replace function public.social_setup(p_display_name text, p_avatar text, p_sharing jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  me uuid := auth.uid();
  v_name text := left(btrim(coalesce(p_display_name, '')), 40);
  v_avatar text := left(btrim(coalesce(p_avatar, '')), 16);
  v_sharing jsonb := public.social_clean_sharing(coalesce(p_sharing, '{}'::jsonb));
  v_row public.social_profiles;
  v_lim public.social_limits;
begin
  if me is null then
    raise exception 'not authenticated';
  end if;
  if v_name = '' then
    raise exception 'a name is needed' using errcode = '22023';
  end if;
  -- Turning friends on (a new card, a new code) is limited per day, so codes and
  -- cards cannot be cycled to get round anything else. Changing a card is not limited.
  v_lim := public.social_my_limits(me);
  if not exists (select 1 from public.social_profiles where user_id = me) then
    if v_lim.setups_window is null or v_lim.setups_window < now() - interval '1 day' then
      v_lim.setups := 0;
      v_lim.setups_window := now();
    end if;
    if v_lim.setups >= 5 then
      raise exception 'Friends were turned on too many times today. Try again tomorrow.' using errcode = '54000';
    end if;
    update public.social_limits set setups = v_lim.setups + 1, setups_window = v_lim.setups_window where user_id = me;
  end if;
  loop
    begin
      insert into public.social_profiles (user_id, code, display_name, avatar, sharing)
      values (me, public.social_new_code(), v_name, v_avatar, v_sharing)
      on conflict (user_id) do update
        set display_name = excluded.display_name, avatar = excluded.avatar, sharing = excluded.sharing
      returning * into v_row;
      exit;
    exception when unique_violation then
      -- The new code is already someone's: draw another.
      null;
    end;
  end loop;
  return jsonb_build_object('code', v_row.code, 'display_name', v_row.display_name, 'avatar', v_row.avatar, 'sharing', v_row.sharing, 'share_key', v_row.share_key);
end;
$$;

-- Store the caller's week. Does nothing for someone who has not turned friends on.
create or replace function public.social_publish(p_summary jsonb)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  me uuid := auth.uid();
begin
  if me is null then
    raise exception 'not authenticated';
  end if;
  if p_summary is null or jsonb_typeof(p_summary) <> 'object' or pg_column_size(p_summary) > 8192 then
    raise exception 'summary is not valid' using errcode = '22023';
  end if;
  -- Every workout must carry an opaque reference. A summary with anything else (a
  -- record id from an older app) is refused whole rather than published.
  if jsonb_typeof(p_summary -> 'workouts') = 'array' and exists (
    select 1 from jsonb_array_elements(p_summary -> 'workouts') e
    where jsonb_typeof(e) = 'object' and not public.social_is_workout_ref(case when jsonb_typeof(e -> 'id') = 'string' then e ->> 'id' end)
  ) then
    raise exception 'summary is not valid: workouts need opaque references' using errcode = '22023';
  end if;
  update public.social_profiles
    set summary = public.social_clean_summary(p_summary), summary_updated_at = now()
    where user_id = me;
  return found;
end;
$$;

-- Ask the owner of a code to be friends.
-- Returns {"status": ...} with one of: setup_needed, too_many, not_found, self,
-- already_friends, accepted (they had asked first), sent, limit.
-- Someone who declined the caller never sees the request, and the caller is told
-- 'sent' all the same: a decline cannot be detected.
create or replace function public.friend_request(p_code text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  me uuid := auth.uid();
  v_code text := upper(regexp_replace(coalesce(p_code, ''), '[^A-Za-z0-9]', '', 'g'));
  v_lim public.social_limits;
  v_other public.social_profiles;
  v_mine public.friendships;
  v_theirs public.friendships;
  v_friend jsonb;
begin
  if me is null then
    raise exception 'not authenticated';
  end if;
  if not exists (select 1 from public.social_profiles where user_id = me) then
    return jsonb_build_object('status', 'setup_needed');
  end if;

  -- Codes cannot be found by trying them: wrong ones are counted per hour, per
  -- account, in a table that turning friends off and on does not clear.
  v_lim := public.social_my_limits(me);
  if v_lim.lookup_window is null or v_lim.lookup_window < now() - interval '1 hour' then
    update public.social_limits set lookup_window = now(), lookup_misses = 0 where user_id = me;
    v_lim.lookup_misses := 0;
  end if;
  if v_lim.lookup_misses >= 20 then
    return jsonb_build_object('status', 'too_many');
  end if;

  select * into v_other from public.social_profiles where code = v_code;
  if not found then
    update public.social_limits set lookup_misses = lookup_misses + 1 where user_id = me;
    return jsonb_build_object('status', 'not_found');
  end if;
  if v_other.user_id = me then
    return jsonb_build_object('status', 'self');
  end if;

  perform public.social_lock_pair(me, v_other.user_id);
  v_friend := jsonb_build_object('user_id', v_other.user_id, 'display_name', v_other.display_name, 'avatar', v_other.avatar);
  select * into v_mine from public.friendships where requester = me and addressee = v_other.user_id;
  select * into v_theirs from public.friendships where requester = v_other.user_id and addressee = me;

  if v_mine.status = 'accepted' or v_theirs.status = 'accepted' then
    return jsonb_build_object('status', 'already_friends', 'friend', v_friend);
  end if;
  if v_theirs.status = 'pending' then
    -- They asked first (even if the caller turned it down then): entering their code is the answer.
    update public.friendships set status = 'accepted', responded_at = now()
      where requester = v_other.user_id and addressee = me;
    delete from public.friend_declines
      where (decliner = me and asker = v_other.user_id) or (decliner = v_other.user_id and asker = me);
    return jsonb_build_object('status', 'accepted', 'friend', v_friend);
  end if;
  -- Entering the code of someone the caller once declined lifts that decline.
  delete from public.friend_declines where decliner = me and asker = v_other.user_id;
  if v_mine.status is not null then
    -- Already asked. A request that was turned down looks the same to its sender.
    return jsonb_build_object('status', 'sent', 'friend', v_friend);
  end if;

  if (select count(*) from public.friendships where requester = me and status = 'pending') >= 30
     or (select count(*) from public.friendships where status = 'accepted' and (requester = me or addressee = me)) >= 200 then
    return jsonb_build_object('status', 'limit');
  end if;

  -- Stored even when the other person declined the caller before: it then shows as
  -- waiting to the caller and never reaches them.
  insert into public.friendships (requester, addressee, status) values (me, v_other.user_id, 'pending');
  return jsonb_build_object('status', 'sent', 'friend', v_friend);
end;
$$;

-- Answer a request sent to the caller. Returns accepted, declined or not_found.
-- Declining is silent: the request stays waiting for its sender and is hidden from
-- the caller for good (see friend_declines).
create or replace function public.friend_respond(p_user uuid, p_accept boolean)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  me uuid := auth.uid();
begin
  if me is null then
    raise exception 'not authenticated';
  end if;
  if p_user is null or p_user = me then
    return 'not_found';
  end if;
  perform public.social_lock_pair(me, p_user);
  -- Only a request the caller can see: one they declined is answered by entering the code.
  if not exists (
    select 1 from public.friendships
    where requester = p_user and addressee = me and status = 'pending'
      and not exists (select 1 from public.friend_declines d where d.decliner = me and d.asker = p_user)
  ) then
    return 'not_found';
  end if;
  if p_accept then
    update public.friendships set status = 'accepted', responded_at = now()
      where requester = p_user and addressee = me;
    return 'accepted';
  end if;
  insert into public.friend_declines (decliner, asker) values (me, p_user) on conflict do nothing;
  return 'declined';
end;
$$;

-- Stop being friends with someone, or take back a request the caller sent
-- (whether or not it was declined: the sender sees the same either way).
-- A request sent to the caller is answered with friend_respond, not removed here,
-- so its sender never sees it disappear.
create or replace function public.friend_remove(p_user uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  me uuid := auth.uid();
begin
  if me is null then
    raise exception 'not authenticated';
  end if;
  if p_user is null or p_user = me then
    return;
  end if;
  perform public.social_lock_pair(me, p_user);
  delete from public.friendships
    where (requester = me and addressee = p_user)
       or (requester = p_user and addressee = me and status = 'accepted');
  delete from public.cheers
    where (from_user = me and to_user = p_user) or (from_user = p_user and to_user = me);
end;
$$;

-- Cheer a friend's workout (its opaque reference) or day ('day:YYYY-MM-DD').
-- Returns ok, invalid, not_friends or limit.
create or replace function public.send_cheer(p_to uuid, p_ref text)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  me uuid := auth.uid();
  v_ref text := btrim(coalesce(p_ref, ''));
begin
  if me is null then
    raise exception 'not authenticated';
  end if;
  -- A reference, never a message.
  if not (public.social_is_workout_ref(v_ref) or v_ref ~ '^day:[0-9]{4}-[0-9]{2}-[0-9]{2}$') then
    return 'invalid';
  end if;
  if not public.social_are_friends(me, p_to) then
    return 'not_friends';
  end if;
  if (select count(*) from public.cheers where from_user = me and created_at > now() - interval '1 day') >= 100 then
    return 'limit';
  end if;
  insert into public.cheers (from_user, to_user, ref) values (me, p_to, v_ref)
    on conflict (from_user, to_user, ref) do nothing;
  return 'ok';
end;
$$;

-- Everything the Friends screen shows, in one call.
create or replace function public.friends_overview()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  me uuid := auth.uid();
begin
  if me is null then
    raise exception 'not authenticated';
  end if;
  return jsonb_build_object(
    'me', (
      -- share_key is in the caller's own card only, never in anyone else's.
      select jsonb_build_object('code', p.code, 'display_name', p.display_name, 'avatar', p.avatar, 'sharing', p.sharing, 'share_key', p.share_key)
      from public.social_profiles p where p.user_id = me
    ),
    'friends', coalesce((
      select jsonb_agg(jsonb_build_object(
        'user_id', p.user_id,
        'display_name', p.display_name,
        'avatar', p.avatar,
        'since', f.responded_at,
        'summary', public.social_visible_summary(p.summary, p.sharing),
        'summary_updated_at', p.summary_updated_at,
        'cheered', coalesce((
          select jsonb_agg(c.ref) from public.cheers c
          where c.from_user = me and c.to_user = p.user_id and c.created_at > now() - interval '14 days'
        ), '[]'::jsonb)
      ) order by lower(p.display_name), p.user_id)
      from public.friendships f
      join public.social_profiles p on p.user_id = case when f.requester = me then f.addressee else f.requester end
      where f.status = 'accepted' and (f.requester = me or f.addressee = me)
    ), '[]'::jsonb),
    'incoming', coalesce((
      select jsonb_agg(jsonb_build_object('user_id', p.user_id, 'display_name', p.display_name, 'avatar', p.avatar, 'created_at', f.created_at) order by f.created_at desc)
      from public.friendships f
      join public.social_profiles p on p.user_id = f.requester
      where f.addressee = me and f.status = 'pending'
        and not exists (select 1 from public.friend_declines d where d.decliner = me and d.asker = f.requester)
    ), '[]'::jsonb),
    'outgoing', coalesce((
      select jsonb_agg(jsonb_build_object('user_id', p.user_id, 'display_name', p.display_name, 'avatar', p.avatar, 'created_at', f.created_at) order by f.created_at desc)
      from public.friendships f
      join public.social_profiles p on p.user_id = f.addressee
      -- Pending, whether or not it was declined: the sender cannot tell.
      where f.requester = me and f.status = 'pending'
    ), '[]'::jsonb),
    'cheers', coalesce((
      select jsonb_agg(jsonb_build_object('from_user', c.from_user, 'display_name', p.display_name, 'avatar', p.avatar, 'ref', c.ref, 'created_at', c.created_at) order by c.created_at desc)
      from public.cheers c
      join public.social_profiles p on p.user_id = c.from_user
      where c.to_user = me and c.created_at > now() - interval '14 days' and public.social_are_friends(me, c.from_user)
    ), '[]'::jsonb)
  );
end;
$$;

-- Turn friends off: the caller's card, friendships and cheers are removed.
-- Declines (both ways) and the limits are kept: leaving and rejoining must not clear them.
create or replace function public.social_leave()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  me uuid := auth.uid();
begin
  if me is null then
    raise exception 'not authenticated';
  end if;
  delete from public.cheers where from_user = me or to_user = me;
  delete from public.friendships where requester = me or addressee = me;
  delete from public.social_profiles where user_id = me;
end;
$$;

revoke all on function public.social_new_code() from public, anon, authenticated;
revoke all on function public.social_clean_sharing(jsonb) from public, anon;
revoke all on function public.social_clean_summary(jsonb) from public, anon;
revoke all on function public.social_visible_summary(jsonb, jsonb) from public, anon;
revoke all on function public.social_are_friends(uuid, uuid) from public, anon, authenticated;
revoke all on function public.social_is_workout_ref(text) from public, anon;
revoke all on function public.social_lock_pair(uuid, uuid) from public, anon, authenticated;
revoke all on function public.social_my_limits(uuid) from public, anon, authenticated;
revoke all on function public.social_setup(text, text, jsonb) from public, anon;
revoke all on function public.social_publish(jsonb) from public, anon;
revoke all on function public.friend_request(text) from public, anon;
revoke all on function public.friend_respond(uuid, boolean) from public, anon;
revoke all on function public.friend_remove(uuid) from public, anon;
revoke all on function public.send_cheer(uuid, text) from public, anon;
revoke all on function public.friends_overview() from public, anon;
revoke all on function public.social_leave() from public, anon;

grant execute on function public.social_setup(text, text, jsonb) to authenticated;
grant execute on function public.social_publish(jsonb) to authenticated;
grant execute on function public.friend_request(text) to authenticated;
grant execute on function public.friend_respond(uuid, boolean) to authenticated;
grant execute on function public.friend_remove(uuid) to authenticated;
grant execute on function public.send_cheer(uuid, text) to authenticated;
grant execute on function public.friends_overview() to authenticated;
grant execute on function public.social_leave() to authenticated;
