-- Friends, second pass. 20261115000000_friends.sql is already applied to a real
-- project, so changes since then live here. Safe to run twice, and safe on a
-- database that still has the first version of the friends migration.
--
-- 1. Bring an older friends schema up to date (share_key, declines and limits in
--    their own tables, one row per pair, references only in cheers), also when the
--    first version of 20261115000000 is recorded as applied and is not run again:
--    the functions that changed in it are repeated here, and two rows for one pair
--    are merged before the pair index is made.
-- 2. A request that overlaps "turn friends off" can no longer survive it.
-- 3. A friend's summary is completed on the way in: a workout without a length or
--    a real date is dropped, one without a name is "Workout".
-- 4. Publishing names the share key it used, so a device holding an old key (friends
--    were turned off and on on another device) is told to reload instead of
--    publishing references nobody can match.
-- 5. A cheer is for a workout the friend can see now, or a real, recent day.
-- 6. A decline can be undone by the person who declined, for a short while.
-- 7. The "turned on too many times" refusal says when it can be tried again.

-- ------------------------------------------------- 1. older schemas brought up to date

alter table public.social_profiles
  add column if not exists share_key text not null
  default (replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', ''));

create table if not exists public.social_limits (
  user_id uuid primary key references auth.users (id) on delete cascade,
  lookup_misses integer not null default 0,
  lookup_window timestamptz,
  setups integer not null default 0,
  setups_window timestamptz
);

create table if not exists public.friend_declines (
  decliner uuid not null references auth.users (id) on delete cascade,
  asker uuid not null references auth.users (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (decliner, asker),
  check (decliner <> asker)
);

alter table public.social_limits enable row level security;
alter table public.friend_declines enable row level security;

do $$
begin
  -- The first version stored a decline as status 'declined' on the request. Now the
  -- request stays pending (the sender sees no change) and the decline has its own row.
  if exists (select 1 from pg_constraint where conrelid = 'public.friendships'::regclass and conname = 'friendships_status_check'
             and pg_get_constraintdef(oid) like '%declined%') then
    insert into public.friend_declines (decliner, asker)
      select addressee, requester from public.friendships where status = 'declined'
      on conflict do nothing;
    update public.friendships set status = 'pending' where status = 'declined';
    alter table public.friendships drop constraint friendships_status_check;
    alter table public.friendships add constraint friendships_status_check check (status in ('pending', 'accepted'));
  end if;

  -- The first version let a cheer carry any short text (a record id among them).
  if not exists (select 1 from pg_constraint where conrelid = 'public.cheers'::regclass and conname = 'cheers_ref_check'
                 and pg_get_constraintdef(oid) like '%[0-9a-f]{32}%') then
    delete from public.cheers where ref !~ '^([0-9a-f]{32}|day:[0-9]{4}-[0-9]{2}-[0-9]{2})$';
    alter table public.cheers drop constraint if exists cheers_ref_check;
    alter table public.cheers add constraint cheers_ref_check check (ref ~ '^([0-9a-f]{32}|day:[0-9]{4}-[0-9]{2}-[0-9]{2})$');
  end if;
end $$;

-- The first version could store two rows for one pair (two people entering each
-- other's codes at once). Keep one: an accepted row if there is one; two requests
-- that cross become a friendship, as friend_request now makes them, unless either
-- person had declined the other, in which case the older request stays.
with pairs as (
  select least(requester, addressee) as a, greatest(requester, addressee) as b
  from public.friendships group by 1, 2 having count(*) > 1
),
ranked as (
  select f.requester, f.addressee, f.status,
         row_number() over (partition by p.a, p.b order by (f.status = 'accepted') desc, f.created_at, f.requester) as n,
         exists (select 1 from public.friend_declines d where (d.decliner = p.a and d.asker = p.b) or (d.decliner = p.b and d.asker = p.a)) as declined
  from pairs p
  join public.friendships f on least(f.requester, f.addressee) = p.a and greatest(f.requester, f.addressee) = p.b
),
kept as (
  update public.friendships f set status = 'accepted', responded_at = coalesce(f.responded_at, now())
  from ranked r
  where r.n = 1 and r.status = 'pending' and not r.declined and f.requester = r.requester and f.addressee = r.addressee
  returning f.requester
)
delete from public.friendships f
using ranked r
where r.n > 1 and f.requester = r.requester and f.addressee = r.addressee;

create unique index if not exists friendships_pair_idx
  on public.friendships (least(requester, addressee), greatest(requester, addressee));

-- ------------------------------------------------------------------ helpers

-- These came with the second version of 20261115000000_friends.sql. A project that
-- recorded the first version as applied does not run that file again, so they are
-- repeated here (identical, create or replace).

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


-- A real calendar date written as YYYY-MM-DD ('2031-02-30' and '9999-99-99' are not).
create or replace function public.social_is_date(p text)
returns boolean
language plpgsql
immutable
as $$
begin
  if p is null or p !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' then
    return false;
  end if;
  return to_char(p::date, 'YYYY-MM-DD') = p;
exception when others then
  return false;
end;
$$;

-- Keep only the fields a summary is allowed to have, each within sane bounds.
-- Anything else a device sends (calories, weight, notes) is dropped here. A workout
-- needs a length and a real date to be shown; without a name it is "Workout".
create or replace function public.social_clean_summary(p jsonb)
returns jsonb
language sql
immutable
as $$
  select jsonb_strip_nulls(jsonb_build_object(
    'week', case when public.social_is_date(p ->> 'week') then p ->> 'week' end,
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
            'name', coalesce(nullif(btrim(left(case when jsonb_typeof(e -> 'name') = 'string' then e ->> 'name' end, 60)), ''), 'Workout'),
            'emoji', coalesce(left(case when jsonb_typeof(e -> 'emoji') = 'string' then e ->> 'emoji' end, 16), ''),
            'minutes', least(greatest(round((e ->> 'minutes')::numeric), 0), 1440),
            'date', e ->> 'date',
            'distanceKm', case when jsonb_typeof(e -> 'distanceKm') = 'number' then least(greatest((e ->> 'distanceKm')::numeric, 0), 1000) end
          )) as w
        from jsonb_array_elements(case when jsonb_typeof(p -> 'workouts') = 'array' then p -> 'workouts' else '[]'::jsonb end) with ordinality as t (e, n)
        where jsonb_typeof(e) = 'object'
          and e ->> 'id' ~ '^[0-9a-f]{32}$'
          and jsonb_typeof(e -> 'minutes') = 'number'
          and public.social_is_date(e ->> 'date')
        order by n
        limit 12
      ) picked
    )
  ))
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
  v_hours integer;
begin
  if me is null then
    raise exception 'not authenticated';
  end if;
  if v_name = '' then
    raise exception 'a name is needed' using errcode = '22023';
  end if;
  -- Turning friends on (a new card, a new code) is limited to five times in 24 hours,
  -- so codes and cards cannot be cycled to get round anything else. Changing a card is not limited.
  v_lim := public.social_my_limits(me);
  if not exists (select 1 from public.social_profiles where user_id = me) then
    if v_lim.setups_window is null or v_lim.setups_window < now() - interval '1 day' then
      v_lim.setups := 0;
      v_lim.setups_window := now();
    end if;
    if v_lim.setups >= 5 then
      v_hours := greatest(1, ceil(extract(epoch from (v_lim.setups_window + interval '1 day' - now())) / 3600)::integer);
      raise exception '%', format('Friends were turned on 5 times in the last 24 hours. You can turn them on again in about %s.',
        case when v_hours = 1 then 'an hour' else v_hours || ' hours' end) using errcode = '54000';
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
      null;
    end;
  end loop;
  return jsonb_build_object('code', v_row.code, 'display_name', v_row.display_name, 'avatar', v_row.avatar, 'sharing', v_row.sharing, 'share_key', v_row.share_key);
end;
$$;

-- Store the caller's week, built with the share key the device holds. Returns
-- ok, no_card (friends are off) or stale_key (friends were turned off and on
-- elsewhere: reload the card and build the week again). Nothing is stored unless ok.
create or replace function public.social_publish(p_summary jsonb, p_share_key text)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  me uuid := auth.uid();
  v_key text;
begin
  if me is null then
    raise exception 'not authenticated';
  end if;
  select share_key into v_key from public.social_profiles where user_id = me;
  if not found then
    return 'no_card';
  end if;
  if p_share_key is distinct from v_key then
    return 'stale_key';
  end if;
  if public.social_publish(p_summary) then
    return 'ok';
  end if;
  return 'no_card';
end;
$$;

-- Ask the owner of a code to be friends. As before; in addition both cards are
-- held while the request is written, so turning friends off at the same moment
-- either waits for it (and then removes it) or makes the code unknown.
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
  perform 1 from public.social_profiles where user_id = me for share;
  if not found then
    return jsonb_build_object('status', 'setup_needed');
  end if;

  v_lim := public.social_my_limits(me);
  if v_lim.lookup_window is null or v_lim.lookup_window < now() - interval '1 hour' then
    update public.social_limits set lookup_window = now(), lookup_misses = 0 where user_id = me;
    v_lim.lookup_misses := 0;
  end if;
  if v_lim.lookup_misses >= 20 then
    return jsonb_build_object('status', 'too_many');
  end if;

  select * into v_other from public.social_profiles where code = v_code for share;
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
    update public.friendships set status = 'accepted', responded_at = now()
      where requester = v_other.user_id and addressee = me and status = 'pending';
    if found then
      delete from public.friend_declines
        where (decliner = me and asker = v_other.user_id) or (decliner = v_other.user_id and asker = me);
      return jsonb_build_object('status', 'accepted', 'friend', v_friend);
    end if;
  end if;
  delete from public.friend_declines where decliner = me and asker = v_other.user_id;
  if v_mine.status is not null then
    return jsonb_build_object('status', 'sent', 'friend', v_friend);
  end if;

  if (select count(*) from public.friendships where requester = me and status = 'pending') >= 30
     or (select count(*) from public.friendships where status = 'accepted' and (requester = me or addressee = me)) >= 200 then
    return jsonb_build_object('status', 'limit');
  end if;

  insert into public.friendships (requester, addressee, status) values (me, v_other.user_id, 'pending');
  return jsonb_build_object('status', 'sent', 'friend', v_friend);
end;
$$;

-- Answer a request sent to the caller. Returns accepted, declined or not_found
-- (taken back, declined on another device, or the sender turned friends off).
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
  -- Both cards must still exist, and stay while this runs.
  perform 1 from public.social_profiles where user_id in (me, p_user) order by user_id for share;
  if (select count(*) from public.social_profiles where user_id in (me, p_user)) <> 2 then
    return 'not_found';
  end if;
  perform public.social_lock_pair(me, p_user);
  if not exists (
    select 1 from public.friendships
    where requester = p_user and addressee = me and status = 'pending'
      and not exists (select 1 from public.friend_declines d where d.decliner = me and d.asker = p_user)
  ) then
    return 'not_found';
  end if;
  if p_accept then
    update public.friendships set status = 'accepted', responded_at = now()
      where requester = p_user and addressee = me and status = 'pending';
    return case when found then 'accepted' else 'not_found' end;
  end if;
  insert into public.friend_declines (decliner, asker) values (me, p_user) on conflict do nothing;
  return 'declined';
end;
$$;

-- Undo a decline the caller made in the last 15 minutes: the request shows again.
-- Only the person who declined can do this; the sender sees no change either way.
-- Returns restored or not_found.
create or replace function public.friend_undecline(p_user uuid)
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
  delete from public.friend_declines d
    where d.decliner = me and d.asker = p_user and d.created_at > now() - interval '15 minutes'
      and exists (select 1 from public.friendships f where f.requester = p_user and f.addressee = me and f.status = 'pending');
  return case when found then 'restored' else 'not_found' end;
end;
$$;

-- Cheer a friend's workout (a reference they publish right now) or a real day of
-- the last two weeks ('day:YYYY-MM-DD'). Returns ok, invalid, not_friends or limit.
create or replace function public.send_cheer(p_to uuid, p_ref text)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  me uuid := auth.uid();
  v_ref text := btrim(coalesce(p_ref, ''));
  v_day date;
begin
  if me is null then
    raise exception 'not authenticated';
  end if;
  if not (public.social_is_workout_ref(v_ref) or v_ref ~ '^day:[0-9]{4}-[0-9]{2}-[0-9]{2}$') then
    return 'invalid';
  end if;
  if not public.social_are_friends(me, p_to) then
    return 'not_friends';
  end if;
  if v_ref like 'day:%' then
    if not public.social_is_date(substr(v_ref, 5)) then
      return 'invalid';
    end if;
    v_day := substr(v_ref, 5)::date;
    -- current_date is the server's (UTC); a day either side covers every time zone.
    if v_day < current_date - 15 or v_day > current_date + 1 then
      return 'invalid';
    end if;
  elsif not exists (
    select 1
    from public.social_profiles p,
         jsonb_array_elements(coalesce(public.social_visible_summary(p.summary, p.sharing) -> 'workouts', '[]'::jsonb)) w
    where p.user_id = p_to and w ->> 'id' = v_ref
  ) then
    return 'invalid';
  end if;
  if (select count(*) from public.cheers where from_user = me and created_at > now() - interval '1 day') >= 100 then
    return 'limit';
  end if;
  insert into public.cheers (from_user, to_user, ref) values (me, p_to, v_ref)
    on conflict (from_user, to_user, ref) do nothing;
  return 'ok';
end;
$$;

-- Turn friends off: the caller's card, friendships and cheers are removed.
-- The card goes first: that waits for any request to the caller that is being
-- written right now (friend_request holds the card), so it is removed too.
-- Declines (both ways) and the limits are kept.
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
  delete from public.social_profiles where user_id = me;
  delete from public.friendships where requester = me or addressee = me;
  delete from public.cheers where from_user = me or to_user = me;
end;
$$;

-- Also from the second version of the first friends migration, repeated for the same
-- reason: refusing record ids, take-back that the receiver cannot undo, and the
-- caller's share key and declines in the overview.

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


revoke all on function public.social_is_workout_ref(text) from public, anon;
revoke all on function public.social_lock_pair(uuid, uuid) from public, anon, authenticated;
revoke all on function public.social_my_limits(uuid) from public, anon, authenticated;
revoke all on function public.social_publish(jsonb) from public, anon;
revoke all on function public.friend_remove(uuid) from public, anon;
revoke all on function public.friends_overview() from public, anon;
grant execute on function public.social_publish(jsonb) to authenticated;
grant execute on function public.friend_remove(uuid) to authenticated;
grant execute on function public.friends_overview() to authenticated;

revoke all on function public.social_is_date(text) from public, anon;
revoke all on function public.social_clean_summary(jsonb) from public, anon;
revoke all on function public.social_setup(text, text, jsonb) from public, anon;
revoke all on function public.social_publish(jsonb, text) from public, anon;
revoke all on function public.friend_request(text) from public, anon;
revoke all on function public.friend_respond(uuid, boolean) from public, anon;
revoke all on function public.friend_undecline(uuid) from public, anon;
revoke all on function public.send_cheer(uuid, text) from public, anon;
revoke all on function public.social_leave() from public, anon;

grant execute on function public.social_setup(text, text, jsonb) to authenticated;
grant execute on function public.social_publish(jsonb, text) to authenticated;
grant execute on function public.friend_request(text) to authenticated;
grant execute on function public.friend_respond(uuid, boolean) to authenticated;
grant execute on function public.friend_undecline(uuid) to authenticated;
grant execute on function public.send_cheer(uuid, text) to authenticated;
grant execute on function public.social_leave() to authenticated;
