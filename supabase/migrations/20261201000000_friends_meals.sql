-- Friends, third pass: a meal the person chooses to show.
--
-- A person can show one meal of their diary to the friends they pick. It is off until
-- they do it, one meal at a time (or, by their own setting, each meal of a type they
-- chose). A friend sees the person's display name, the meal (lunch), its day, and each
-- food's name, portion and the kind of source its numbers come from; calories only when
-- the person switched them on for that meal. Never the day's total, the budget, macros,
-- weight, body data, notes, the time of day, a photo, a record id, or who else sees it.
-- Each meal is rebuilt here from that short list (social_clean_meal), whatever a device
-- sends. It leaves by itself 7 days after it was first shown. Showing and seeing meals
-- is for people 18 and over, by the birth date in their profile.
--
-- As for the rest of friends: row-level security is on with no policies and the API
-- roles hold no table privileges, so every access goes through the functions below,
-- each working only for the signed-in caller and checking the friendship at the moment
-- of the call. Safe to run twice. Only adds tables, a column and functions, and widens
-- the cheers check, so older copies of the app keep working.

-- ------------------------------------------------------------------ tables

create table if not exists public.shared_meals (
  owner uuid not null references auth.users (id) on delete cascade,
  -- First 32 hex of sha256(share_key || ':meal:' || day || ':' || meal), made here
  -- (social_meal_ref): never a record id, and nothing a friend can work back from.
  ref text not null check (ref ~ '^[0-9a-f]{32}$'),
  -- The day in the owner's own calendar, and which meal of it.
  day date not null,
  meal text not null check (meal in ('breakfast', 'lunch', 'dinner', 'snack')),
  -- Cleaned by social_clean_meal: at most 15 foods with only the allowed keys.
  items jsonb not null check (jsonb_typeof(items) = 'array'),
  show_kcal boolean not null default false,
  shown_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  expires_at timestamptz not null default now() + interval '7 days',
  primary key (owner, ref),
  unique (owner, day, meal)
);

create index if not exists shared_meals_expires_idx on public.shared_meals (expires_at);

-- Who may see a shown meal: friends the owner picked.
create table if not exists public.shared_meal_viewers (
  owner uuid not null,
  ref text not null,
  viewer uuid not null references auth.users (id) on delete cascade,
  primary key (owner, ref, viewer),
  foreign key (owner, ref) references public.shared_meals (owner, ref) on delete cascade,
  check (owner <> viewer)
);

create index if not exists shared_meal_viewers_viewer_idx on public.shared_meal_viewers (viewer);

-- "Who sees your meals": the friends picked last time, offered again on the next showing
-- and used by "Always show these meals".
create table if not exists public.meal_audience (
  owner uuid not null references auth.users (id) on delete cascade,
  viewer uuid not null references auth.users (id) on delete cascade,
  primary key (owner, viewer),
  check (owner <> viewer)
);

-- The two switches a person has for each friend:
--   share_meals: the friend sees meals I show (off leaves them out of every meal at once);
--   see_meals:   the friend's meals are in my feed (off: their workouts and cheers only).
-- No row means both on. A friend's switches about the caller are never told to the caller.
create table if not exists public.friend_prefs (
  owner uuid not null references auth.users (id) on delete cascade,
  friend uuid not null references auth.users (id) on delete cascade,
  share_meals boolean not null default true,
  see_meals boolean not null default true,
  updated_at timestamptz not null default now(),
  primary key (owner, friend),
  check (owner <> friend)
);

-- A meal the person stopped showing, so "Always show these meals" never shows it again.
-- Kept 10 days (longer than a meal could still be shown), then purged.
create table if not exists public.shared_meal_stops (
  owner uuid not null references auth.users (id) on delete cascade,
  ref text not null check (ref ~ '^[0-9a-f]{32}$'),
  stopped_at timestamptz not null default now(),
  primary key (owner, ref)
);

-- The person's meal settings, a column of its own (not a key in `sharing`), so an older
-- app that saves Friends settings through social_setup cannot change it:
--   auto: meal types shown by themselves as they are logged; kcal: calories shown by
--   default; see: friends' meals in my feed.
alter table public.social_profiles
  add column if not exists meal_settings jsonb not null default '{"auto": [], "kcal": false, "see": true}'::jsonb;

-- Limits against abuse, kept when friends are turned off and on, like the other limits.
alter table public.social_limits add column if not exists meal_shows integer not null default 0;
alter table public.social_limits add column if not exists meal_shows_window timestamptz;
alter table public.social_limits add column if not exists meal_writes integer not null default 0;
alter table public.social_limits add column if not exists meal_writes_window timestamptz;

-- A cheer may also be for a shown meal: 'meal:<ref>'.
alter table public.cheers drop constraint if exists cheers_ref_check;
alter table public.cheers add constraint cheers_ref_check
  check (ref ~ '^([0-9a-f]{32}|day:[0-9]{4}-[0-9]{2}-[0-9]{2}|meal:[0-9a-f]{32})$');

alter table public.shared_meals enable row level security;
alter table public.shared_meal_viewers enable row level security;
alter table public.meal_audience enable row level security;
alter table public.friend_prefs enable row level security;
alter table public.shared_meal_stops enable row level security;
-- Not even an empty read for the API roles: only the functions below touch these tables.
revoke all on table public.shared_meals, public.shared_meal_viewers, public.meal_audience, public.friend_prefs, public.shared_meal_stops from anon, authenticated;

-- ------------------------------------------------------------------ helpers

-- 18 or over today, by the birth date in the person's synced profile. No profile, no birth
-- date, or one that is not a real past date counts as under 18 (fails closed). Someone born
-- on 29 February turns 18 on 1 March in a year without one, as the coach's rule.
create or replace function public.social_is_adult(p_user uuid)
returns boolean
language plpgsql
stable
set search_path = public
as $$
declare
  v_text text;
  v_birth date;
  v_today date := current_date;
  v_age integer;
begin
  select case when jsonb_typeof(data -> 'birthDate') = 'string' then data ->> 'birthDate' end
    into v_text
    from public.profiles where user_id = p_user;
  if not public.social_is_date(v_text) then
    return false;
  end if;
  v_birth := v_text::date;
  if v_birth >= v_today then
    return false;
  end if;
  v_age := extract(year from v_today)::integer - extract(year from v_birth)::integer;
  if (extract(month from v_today), extract(day from v_today)) < (extract(month from v_birth), extract(day from v_birth)) then
    v_age := v_age - 1;
  end if;
  return v_age >= 18;
end;
$$;

-- The opaque reference of a shown meal.
create or replace function public.social_meal_ref(p_share_key text, p_day date, p_meal text)
returns text
language sql
immutable
as $$
  select left(encode(sha256(convert_to(p_share_key || ':meal:' || to_char(p_day, 'YYYY-MM-DD') || ':' || p_meal, 'UTF8')), 'hex'), 32)
$$;

-- Text a person or a product wrote, made safe to keep: no control characters, trimmed, cut.
create or replace function public.social_clean_text(p jsonb, p_max integer)
returns text
language sql
immutable
as $$
  select case when jsonb_typeof(p) = 'string'
    then nullif(btrim(left(regexp_replace(p #>> '{}', '[[:cntrl:]]+', ' ', 'g'), p_max)), '')
  end
$$;

-- Keep only the fields a shown food may have, each within sane bounds. Anything else a
-- device sends (macros, notes, a record id, the time) is dropped here, and calories are
-- dropped unless the meal shows them. A food needs a name and a known kind of source.
create or replace function public.social_clean_meal(p jsonb, p_show_kcal boolean)
returns jsonb
language sql
immutable
as $$
  select coalesce(jsonb_agg(item order by n), '[]'::jsonb)
  from (
    select
      n,
      jsonb_strip_nulls(jsonb_build_object(
        'name', public.social_clean_text(e -> 'name', 60),
        'emoji', coalesce(public.social_clean_text(e -> 'emoji', 8), ''),
        'portion', coalesce(public.social_clean_text(e -> 'portion', 40), ''),
        'source', e ->> 'source',
        'foodId', case when e ->> 'source' in ('builtin', 'typical', 'usda') and jsonb_typeof(e -> 'foodId') = 'string'
                        and e ->> 'foodId' ~ '^b_[a-z0-9_]{1,40}$' then e ->> 'foodId' end,
        'barcode', case when jsonb_typeof(e -> 'barcode') = 'string' and e ->> 'barcode' ~ '^[0-9]{6,14}$' then e ->> 'barcode' end,
        'serving', public.social_clean_text(e -> 'serving', 40),
        'quantity', case when jsonb_typeof(e -> 'quantity') = 'number' and (e ->> 'quantity')::numeric > 0
                         then least(round((e ->> 'quantity')::numeric, 2), 1000) end,
        'grams', case when jsonb_typeof(e -> 'grams') = 'number' and (e ->> 'grams')::numeric > 0
                      then least(round((e ->> 'grams')::numeric, 1), 10000) end,
        'kcal', case when p_show_kcal and jsonb_typeof(e -> 'kcal') = 'number'
                     then least(greatest(round((e ->> 'kcal')::numeric), 0), 20000) end,
        'kcalLow', case when p_show_kcal and jsonb_typeof(e -> 'kcalLow') = 'number' and jsonb_typeof(e -> 'kcalHigh') = 'number'
                         and (e ->> 'kcalLow')::numeric <= (e ->> 'kcalHigh')::numeric
                        then least(greatest(round((e ->> 'kcalLow')::numeric), 0), 20000) end,
        'kcalHigh', case when p_show_kcal and jsonb_typeof(e -> 'kcalLow') = 'number' and jsonb_typeof(e -> 'kcalHigh') = 'number'
                          and (e ->> 'kcalLow')::numeric <= (e ->> 'kcalHigh')::numeric
                         then least(greatest(round((e ->> 'kcalHigh')::numeric), 0), 20000) end
      )) as item
    from jsonb_array_elements(case when jsonb_typeof(p) = 'array' then p else '[]'::jsonb end) with ordinality as t (e, n)
    where jsonb_typeof(e) = 'object'
      and public.social_clean_text(e -> 'name', 60) is not null
      and jsonb_typeof(e -> 'source') = 'string'
      and e ->> 'source' in ('builtin', 'usda', 'openfoodfacts', 'custom', 'ai', 'quick', 'typical')
    order by n
    limit 15
  ) picked
$$;

-- Meal settings made whole: keys given in p win, the rest come from p_base, then the defaults.
create or replace function public.social_clean_meal_settings(p jsonb, p_base jsonb)
returns jsonb
language sql
immutable
as $$
  select jsonb_build_object(
    'auto', coalesce((
      select jsonb_agg(m order by array_position(array['breakfast', 'lunch', 'dinner', 'snack'], m))
      from (
        select distinct x #>> '{}' as m
        from jsonb_array_elements(
          case when jsonb_typeof(p -> 'auto') = 'array' then p -> 'auto'
               when jsonb_typeof(p_base -> 'auto') = 'array' then p_base -> 'auto'
               else '[]'::jsonb end
        ) x
        where jsonb_typeof(x) = 'string' and x #>> '{}' in ('breakfast', 'lunch', 'dinner', 'snack')
      ) picked
    ), '[]'::jsonb),
    'kcal', case when jsonb_typeof(p -> 'kcal') = 'boolean' then (p ->> 'kcal')::boolean
                 when jsonb_typeof(p_base -> 'kcal') = 'boolean' then (p_base ->> 'kcal')::boolean
                 else false end,
    'see', case when jsonb_typeof(p -> 'see') = 'boolean' then (p ->> 'see')::boolean
                when jsonb_typeof(p_base -> 'see') = 'boolean' then (p_base ->> 'see')::boolean
                else true end
  )
$$;

-- One person's meal writes run one at a time, so their limits and counts hold.
create or replace function public.social_lock_meals(p_user uuid)
returns void
language sql
volatile
as $$
  select pg_advisory_xact_lock(hashtextextended('meals:' || p_user::text, 0))
$$;

-- Whether the owner lets this friend see the meals they show (their per-friend switch).
create or replace function public.social_shares_meals_with(p_owner uuid, p_viewer uuid)
returns boolean
language sql
stable
set search_path = public
as $$
  select not exists (
    select 1 from public.friend_prefs fp where fp.owner = p_owner and fp.friend = p_viewer and not fp.share_meals
  )
$$;

-- The one rule for what a viewer may see: the shown meals they are a viewer of, while
-- they are friends with the owner, the meal has not expired, the owner still has a card,
-- both are 18 or over, the viewer's "Friends' meals in my feed" and their switch for this
-- friend are on, and the owner's switch for this viewer is on.
create or replace function public.social_visible_meals(p_viewer uuid)
returns setof public.shared_meals
language sql
stable
set search_path = public
as $$
  select m.*
  from public.shared_meals m
  join public.shared_meal_viewers v on v.owner = m.owner and v.ref = m.ref and v.viewer = p_viewer
  join public.social_profiles po on po.user_id = m.owner
  join public.social_profiles pv on pv.user_id = p_viewer
  where m.expires_at > now()
    and public.social_are_friends(p_viewer, m.owner)
    and coalesce(case when jsonb_typeof(pv.meal_settings -> 'see') = 'boolean' then (pv.meal_settings ->> 'see')::boolean end, true)
    and not exists (select 1 from public.friend_prefs fp where fp.owner = p_viewer and fp.friend = m.owner and not fp.see_meals)
    and public.social_shares_meals_with(m.owner, p_viewer)
    and public.social_is_adult(p_viewer)
    and public.social_is_adult(m.owner)
$$;

-- A shown meal nobody may see any more is no shown meal: remove it, with its cheers.
create or replace function public.social_drop_unseen_meals(p_owners uuid[])
returns void
language sql
volatile
set search_path = public
as $$
  with gone as (
    delete from public.shared_meals m
    where m.owner = any (p_owners)
      and not exists (select 1 from public.shared_meal_viewers v where v.owner = m.owner and v.ref = m.ref)
    returning m.owner, m.ref
  )
  delete from public.cheers c using gone g where c.to_user = g.owner and c.ref = 'meal:' || g.ref
$$;

-- Expired meals (and their cheers) leave the server, and old stop marks go. Run on every
-- read of the Friends screen; also safe to run daily from pg_cron as the service role.
create or replace function public.social_purge_meals()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_count integer;
begin
  -- Rows another call is already removing are skipped, so two reads never wait on each other.
  with gone as (
    delete from public.shared_meals m
    using (select owner, ref from public.shared_meals where expires_at <= now() for update skip locked) x
    where m.owner = x.owner and m.ref = x.ref
    returning m.owner, m.ref
  ),
  cheers_gone as (
    delete from public.cheers c using gone g where c.to_user = g.owner and c.ref = 'meal:' || g.ref returning 1
  )
  select count(*) into v_count from gone;
  delete from public.shared_meal_stops where stopped_at < now() - interval '10 days';
  return v_count;
end;
$$;

-- Counts a meal write (and, when p_new, a new showing) against the caller's daily limits.
-- Returns false, counting nothing, when a limit is reached.
create or replace function public.social_count_meal_write(p_user uuid, p_new boolean)
returns boolean
language plpgsql
volatile
set search_path = public
as $$
declare
  v public.social_limits;
begin
  v := public.social_my_limits(p_user);
  if v.meal_writes_window is null or v.meal_writes_window < now() - interval '1 day' then
    v.meal_writes := 0;
    v.meal_writes_window := now();
  end if;
  if v.meal_shows_window is null or v.meal_shows_window < now() - interval '1 day' then
    v.meal_shows := 0;
    v.meal_shows_window := now();
  end if;
  if v.meal_writes >= 300 or (p_new and v.meal_shows >= 20) then
    return false;
  end if;
  update public.social_limits
    set meal_writes = v.meal_writes + 1, meal_writes_window = v.meal_writes_window,
        meal_shows = v.meal_shows + case when p_new then 1 else 0 end, meal_shows_window = v.meal_shows_window
    where user_id = p_user;
  return true;
end;
$$;

-- Stores a new showing of a meal (or replaces an expired copy) and returns it. The caller
-- has checked everything and holds the meal lock.
create or replace function public.social_insert_meal(p_owner uuid, p_ref text, p_day date, p_meal text, p_items jsonb, p_show_kcal boolean)
returns public.shared_meals
language plpgsql
volatile
set search_path = public
as $$
declare
  v_row public.shared_meals;
begin
  delete from public.cheers where to_user = p_owner and ref = 'meal:' || p_ref;
  delete from public.shared_meals where owner = p_owner and ref = p_ref;
  insert into public.shared_meals (owner, ref, day, meal, items, show_kcal)
    values (p_owner, p_ref, p_day, p_meal, p_items, p_show_kcal)
    returning * into v_row;
  delete from public.shared_meal_stops where owner = p_owner and ref = p_ref;
  return v_row;
end;
$$;

-- ------------------------------------------------------------------ actions

-- Show one meal to the friends picked. Returns {"status": ...}:
--   ok (with ref and expires_at), no_card, under_18, invalid, empty (no food left after
--   cleaning), no_viewers, not_friends (a viewer is not an accepted friend, or the caller
--   switched meals off for them; nothing is stored), limit.
-- The same day and meal is the same shown meal: showing it again changes its foods, its
-- calories switch and its viewers, and keeps when it leaves (7 days from the first showing).
-- The viewers become the remembered audience.
create or replace function public.meal_show(p_day text, p_meal text, p_items jsonb, p_show_kcal boolean, p_viewers uuid[])
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  me uuid := auth.uid();
  v_key text;
  v_meal text := lower(btrim(coalesce(p_meal, '')));
  v_kcal boolean := coalesce(p_show_kcal, false);
  v_day date;
  v_items jsonb;
  v_viewers uuid[];
  v_ref text;
  v_row public.shared_meals;
  v_fresh boolean;
begin
  if me is null then
    raise exception 'not authenticated';
  end if;
  select share_key into v_key from public.social_profiles where user_id = me for share;
  if not found then
    return jsonb_build_object('status', 'no_card');
  end if;
  if not public.social_is_adult(me) then
    return jsonb_build_object('status', 'under_18');
  end if;
  if not public.social_is_date(p_day) or v_meal not in ('breakfast', 'lunch', 'dinner', 'snack')
     or p_items is null or jsonb_typeof(p_items) <> 'array' or pg_column_size(p_items) > 16384 then
    return jsonb_build_object('status', 'invalid');
  end if;
  v_day := p_day::date;
  -- From 6 days ago to tomorrow in the person's calendar; the server's date is UTC, so a
  -- day more either side covers every time zone.
  if v_day < current_date - 7 or v_day > current_date + 2 then
    return jsonb_build_object('status', 'invalid');
  end if;
  v_items := public.social_clean_meal(p_items, v_kcal);
  if jsonb_array_length(v_items) = 0 then
    return jsonb_build_object('status', 'empty');
  end if;
  select coalesce(array_agg(distinct x order by x), '{}'::uuid[]) into v_viewers
    from unnest(coalesce(p_viewers, '{}'::uuid[])) x where x is not null and x <> me;
  if cardinality(v_viewers) = 0 then
    return jsonb_build_object('status', 'no_viewers');
  end if;
  if cardinality(v_viewers) > 200 then
    return jsonb_build_object('status', 'invalid');
  end if;
  if exists (
    select 1 from unnest(v_viewers) x
    where not public.social_are_friends(me, x) or not public.social_shares_meals_with(me, x)
  ) then
    return jsonb_build_object('status', 'not_friends');
  end if;

  perform public.social_lock_meals(me);
  perform public.social_purge_meals();
  v_ref := public.social_meal_ref(v_key, v_day, v_meal);
  select * into v_row from public.shared_meals where owner = me and ref = v_ref;
  v_fresh := not found or v_row.expires_at <= now();
  if v_fresh and (select count(*) from public.shared_meals where owner = me and expires_at > now()) >= 40 then
    return jsonb_build_object('status', 'limit');
  end if;
  if not public.social_count_meal_write(me, v_fresh) then
    return jsonb_build_object('status', 'limit');
  end if;

  if v_fresh then
    v_row := public.social_insert_meal(me, v_ref, v_day, v_meal, v_items, v_kcal);
  else
    update public.shared_meals set items = v_items, show_kcal = v_kcal, updated_at = now()
      where owner = me and ref = v_ref
      returning * into v_row;
    delete from public.shared_meal_viewers where owner = me and ref = v_ref and viewer <> all (v_viewers);
  end if;
  insert into public.shared_meal_viewers (owner, ref, viewer)
    select me, v_ref, x from unnest(v_viewers) x
    on conflict do nothing;

  delete from public.meal_audience where owner = me;
  insert into public.meal_audience (owner, viewer) select me, x from unnest(v_viewers) x;

  return jsonb_build_object('status', 'ok', 'ref', v_ref, 'expires_at', v_row.expires_at);
end;
$$;

-- "Always show these meals": show a meal of a type the person chose, as it is logged, to
-- the remembered audience, with their default for calories. Returns {"status": ...}:
--   ok (with ref and expires_at), no_card, under_18, invalid, not_auto (not one of the
--   chosen types), exists (showing already: edits go through meal_update), stopped (the
--   person stopped this meal), empty, no_viewers, limit.
-- Only today (a day either side of the server's UTC date), never a past day.
create or replace function public.meal_show_auto(p_day text, p_meal text, p_items jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  me uuid := auth.uid();
  v_card public.social_profiles;
  v_meal text := lower(btrim(coalesce(p_meal, '')));
  v_day date;
  v_kcal boolean;
  v_items jsonb;
  v_viewers uuid[];
  v_ref text;
  v_row public.shared_meals;
begin
  if me is null then
    raise exception 'not authenticated';
  end if;
  select * into v_card from public.social_profiles where user_id = me for share;
  if not found then
    return jsonb_build_object('status', 'no_card');
  end if;
  if not public.social_is_adult(me) then
    return jsonb_build_object('status', 'under_18');
  end if;
  if not public.social_is_date(p_day) or v_meal not in ('breakfast', 'lunch', 'dinner', 'snack')
     or p_items is null or jsonb_typeof(p_items) <> 'array' or pg_column_size(p_items) > 16384 then
    return jsonb_build_object('status', 'invalid');
  end if;
  v_day := p_day::date;
  if v_day < current_date - 1 or v_day > current_date + 1 then
    return jsonb_build_object('status', 'invalid');
  end if;
  if not coalesce((v_card.meal_settings -> 'auto') ? v_meal, false) then
    return jsonb_build_object('status', 'not_auto');
  end if;
  v_kcal := coalesce(case when jsonb_typeof(v_card.meal_settings -> 'kcal') = 'boolean' then (v_card.meal_settings ->> 'kcal')::boolean end, false);

  perform public.social_lock_meals(me);
  perform public.social_purge_meals();
  v_ref := public.social_meal_ref(v_card.share_key, v_day, v_meal);
  if exists (select 1 from public.shared_meal_stops where owner = me and ref = v_ref) then
    return jsonb_build_object('status', 'stopped');
  end if;
  if exists (select 1 from public.shared_meals where owner = me and ref = v_ref and expires_at > now()) then
    return jsonb_build_object('status', 'exists', 'ref', v_ref);
  end if;
  v_items := public.social_clean_meal(p_items, v_kcal);
  if jsonb_array_length(v_items) = 0 then
    return jsonb_build_object('status', 'empty');
  end if;
  select coalesce(array_agg(a.viewer order by a.viewer), '{}'::uuid[]) into v_viewers
    from public.meal_audience a
    where a.owner = me and public.social_are_friends(me, a.viewer) and public.social_shares_meals_with(me, a.viewer);
  if cardinality(v_viewers) = 0 then
    return jsonb_build_object('status', 'no_viewers');
  end if;
  if (select count(*) from public.shared_meals where owner = me and expires_at > now()) >= 40
     or not public.social_count_meal_write(me, true) then
    return jsonb_build_object('status', 'limit');
  end if;
  v_row := public.social_insert_meal(me, v_ref, v_day, v_meal, v_items, v_kcal);
  insert into public.shared_meal_viewers (owner, ref, viewer)
    select me, v_ref, x from unnest(v_viewers) x;
  return jsonb_build_object('status', 'ok', 'ref', v_ref, 'expires_at', v_row.expires_at);
end;
$$;

-- The person edited a meal that is showing: friends see the edit. Changes only its foods,
-- never its viewers, never brings back a stopped or expired meal. Returns ok, stopped (no
-- food left: the meal stops showing), gone (not showing now), no_card, under_18, invalid, limit.
create or replace function public.meal_update(p_ref text, p_items jsonb)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  me uuid := auth.uid();
  v_ref text := btrim(coalesce(p_ref, ''));
  v_row public.shared_meals;
  v_items jsonb;
begin
  if me is null then
    raise exception 'not authenticated';
  end if;
  perform 1 from public.social_profiles where user_id = me for share;
  if not found then
    return 'no_card';
  end if;
  if not public.social_is_adult(me) then
    return 'under_18';
  end if;
  if v_ref !~ '^[0-9a-f]{32}$' or p_items is null or jsonb_typeof(p_items) <> 'array' or pg_column_size(p_items) > 16384 then
    return 'invalid';
  end if;
  perform public.social_lock_meals(me);
  select * into v_row from public.shared_meals where owner = me and ref = v_ref and expires_at > now();
  if not found then
    return 'gone';
  end if;
  v_items := public.social_clean_meal(p_items, v_row.show_kcal);
  if jsonb_array_length(v_items) = 0 then
    delete from public.cheers where to_user = me and ref = 'meal:' || v_ref;
    delete from public.shared_meals where owner = me and ref = v_ref;
    return 'stopped';
  end if;
  if v_items = v_row.items then
    return 'ok';
  end if;
  if not public.social_count_meal_write(me, false) then
    return 'limit';
  end if;
  update public.shared_meals set items = v_items, updated_at = now() where owner = me and ref = v_ref;
  return 'ok';
end;
$$;

-- Stop showing one meal, at once for everyone. Returns stopped or not_found.
create or replace function public.meal_stop(p_ref text)
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
  if v_ref !~ '^[0-9a-f]{32}$' then
    return 'not_found';
  end if;
  perform public.social_lock_meals(me);
  delete from public.shared_meals where owner = me and ref = v_ref and expires_at > now();
  if not found then
    delete from public.shared_meals where owner = me and ref = v_ref;
    return 'not_found';
  end if;
  delete from public.cheers where to_user = me and ref = 'meal:' || v_ref;
  insert into public.shared_meal_stops (owner, ref) values (me, v_ref)
    on conflict (owner, ref) do update set stopped_at = now();
  return 'stopped';
end;
$$;

-- Stop showing every meal. Returns how many were showing.
create or replace function public.meal_stop_all()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  me uuid := auth.uid();
  v_count integer;
begin
  if me is null then
    raise exception 'not authenticated';
  end if;
  perform public.social_lock_meals(me);
  with gone as (
    delete from public.shared_meals where owner = me returning ref, expires_at
  ),
  stops as (
    insert into public.shared_meal_stops (owner, ref)
      select me, ref from gone where expires_at > now()
      on conflict (owner, ref) do update set stopped_at = now()
      returning 1
  ),
  cheers_gone as (
    delete from public.cheers c using gone g where c.to_user = me and c.ref = 'meal:' || g.ref returning 1
  )
  select count(*) into v_count from gone where expires_at > now();
  return v_count;
end;
$$;

-- Change the caller's meal settings ({"auto": [...], "kcal": bool, "see": bool}; keys left
-- out stay as they are). Returns the settings, or null when friends are off.
create or replace function public.meal_settings_set(p_settings jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  me uuid := auth.uid();
  v_settings jsonb;
begin
  if me is null then
    raise exception 'not authenticated';
  end if;
  update public.social_profiles
    set meal_settings = public.social_clean_meal_settings(
      case when jsonb_typeof(p_settings) = 'object' then p_settings else '{}'::jsonb end, meal_settings)
    where user_id = me
    returning meal_settings into v_settings;
  return v_settings;
end;
$$;

-- Set "Who sees your meals". Only accepted friends the caller lets see meals are kept.
-- Returns the kept user ids, or null when friends are off.
create or replace function public.meal_audience_set(p_viewers uuid[])
returns jsonb
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
  perform 1 from public.social_profiles where user_id = me for share;
  if not found then
    return null;
  end if;
  perform public.social_lock_meals(me);
  delete from public.meal_audience where owner = me;
  -- A person has at most 200 friends, so more than 400 names is not a real list.
  insert into public.meal_audience (owner, viewer)
    select distinct me, x from unnest(coalesce(p_viewers[1:400], '{}'::uuid[])) x
    where x is not null and x <> me and public.social_are_friends(me, x) and public.social_shares_meals_with(me, x);
  return coalesce((select jsonb_agg(viewer order by viewer) from public.meal_audience where owner = me), '[]'::jsonb);
end;
$$;

-- The caller's two switches for one friend; null leaves a switch as it is. Turning
-- "sees meals I show" off takes that friend out of every meal shown now and of the
-- remembered audience, at once. Returns ok or not_friends.
create or replace function public.friend_prefs_set(p_friend uuid, p_share_meals boolean, p_see_meals boolean)
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
  if p_friend is null or p_friend = me or not public.social_are_friends(me, p_friend) then
    return 'not_friends';
  end if;
  perform public.social_lock_meals(me);
  insert into public.friend_prefs (owner, friend, share_meals, see_meals)
    values (me, p_friend, coalesce(p_share_meals, true), coalesce(p_see_meals, true))
    on conflict (owner, friend) do update
      set share_meals = coalesce(p_share_meals, public.friend_prefs.share_meals),
          see_meals = coalesce(p_see_meals, public.friend_prefs.see_meals),
          updated_at = now();
  if p_share_meals is false then
    delete from public.shared_meal_viewers where owner = me and viewer = p_friend;
    delete from public.meal_audience where owner = me and viewer = p_friend;
    perform public.social_drop_unseen_meals(array[me]);
  end if;
  return 'ok';
end;
$$;

-- Cheer a friend's workout (a reference they publish right now), a real day of the last
-- two weeks ('day:YYYY-MM-DD') or a meal they show the caller now ('meal:<ref>').
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
  v_day date;
begin
  if me is null then
    raise exception 'not authenticated';
  end if;
  if not (public.social_is_workout_ref(v_ref) or v_ref ~ '^day:[0-9]{4}-[0-9]{2}-[0-9]{2}$' or v_ref ~ '^meal:[0-9a-f]{32}$') then
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
  elsif v_ref like 'meal:%' then
    if not exists (select 1 from public.social_visible_meals(me) m where m.owner = p_to and m.ref = substr(v_ref, 6)) then
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

-- Stop being friends with someone, or take back a request the caller sent. As before;
-- in addition neither sees the other's meals from this moment: the pair's viewer rows,
-- remembered audience and switches go, and a meal left with nobody to see it stops.
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
  delete from public.shared_meal_viewers
    where (owner = me and viewer = p_user) or (owner = p_user and viewer = me);
  delete from public.meal_audience
    where (owner = me and viewer = p_user) or (owner = p_user and viewer = me);
  delete from public.friend_prefs
    where (owner = me and friend = p_user) or (owner = p_user and friend = me);
  perform public.social_drop_unseen_meals(array[me, p_user]);
end;
$$;

-- Turn friends off: the caller's card, friendships and cheers are removed, and now also
-- every meal they show, their place among the viewers of friends' meals, their meal
-- settings, remembered audience and switches. Declines (both ways) and the limits are kept.
create or replace function public.social_leave()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  me uuid := auth.uid();
  v_owners uuid[];
begin
  if me is null then
    raise exception 'not authenticated';
  end if;
  delete from public.social_profiles where user_id = me;
  delete from public.friendships where requester = me or addressee = me;
  delete from public.cheers where from_user = me or to_user = me;
  delete from public.shared_meals where owner = me;
  with gone as (
    delete from public.shared_meal_viewers where viewer = me returning owner
  )
  select coalesce(array_agg(distinct owner), '{}'::uuid[]) into v_owners from gone;
  delete from public.meal_audience where owner = me or viewer = me;
  delete from public.friend_prefs where owner = me or friend = me;
  delete from public.shared_meal_stops where owner = me;
  perform public.social_drop_unseen_meals(v_owners);
end;
$$;

-- Everything the Friends screen shows, in one call. As before, and in addition:
--   me.meal_settings, me.meals_allowed (18 or over), me.audience (friends picked last time);
--   friends[].share_meals and friends[].see_meals (the caller's switches for that friend);
--   feed: what friends chose to show the caller, newest first, at most 100: the meals they
--     may see now (social_visible_meals) and friends' shared workouts dated in the last
--     7 days. Never who else sees a meal, who else cheered it, or when it was shown;
--   my_meals: the caller's meals showing now, with viewers and a cheer count.
-- Volatile, because a read also lets expired meals leave the server.
create or replace function public.friends_overview()
returns jsonb
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  me uuid := auth.uid();
begin
  if me is null then
    raise exception 'not authenticated';
  end if;
  perform public.social_purge_meals();
  perform public.social_drop_unseen_meals(array[me]);
  return jsonb_build_object(
    'me', (
      -- share_key is in the caller's own card only, never in anyone else's.
      select jsonb_build_object(
        'code', p.code, 'display_name', p.display_name, 'avatar', p.avatar, 'sharing', p.sharing, 'share_key', p.share_key,
        'meal_settings', public.social_clean_meal_settings(p.meal_settings, '{}'::jsonb),
        'meals_allowed', public.social_is_adult(me),
        'audience', coalesce((
          select jsonb_agg(a.viewer order by a.viewer) from public.meal_audience a
          where a.owner = me and public.social_are_friends(me, a.viewer) and public.social_shares_meals_with(me, a.viewer)
        ), '[]'::jsonb)
      )
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
        ), '[]'::jsonb),
        'share_meals', public.social_shares_meals_with(me, p.user_id),
        'see_meals', coalesce((select fp.see_meals from public.friend_prefs fp where fp.owner = me and fp.friend = p.user_id), true)
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
    ), '[]'::jsonb),
    'feed', coalesce((
      select jsonb_agg(f.item order by f.day desc, f.kind_rank, f.shown_at desc nulls last, f.seq, f.name_key, f.ref)
      from (
        select * from (
          select
            m.day, 0 as kind_rank, m.shown_at, 0::bigint as seq, lower(p.display_name) as name_key, m.ref,
            jsonb_build_object(
              'kind', 'meal', 'ref', m.ref, 'user_id', m.owner, 'display_name', p.display_name, 'avatar', p.avatar,
              'day', to_char(m.day, 'YYYY-MM-DD'), 'meal', m.meal, 'items', m.items, 'show_kcal', m.show_kcal,
              'cheered', exists (select 1 from public.cheers c where c.from_user = me and c.to_user = m.owner and c.ref = 'meal:' || m.ref)
            ) as item
          from public.social_visible_meals(me) m
          join public.social_profiles p on p.user_id = m.owner
          union all
          select
            (w.e ->> 'date')::date, 1, null::timestamptz, w.n, lower(p.display_name), w.e ->> 'id',
            jsonb_strip_nulls(jsonb_build_object(
              'kind', 'workout', 'ref', w.e ->> 'id', 'user_id', p.user_id, 'display_name', p.display_name, 'avatar', p.avatar,
              'day', w.e ->> 'date', 'name', coalesce(w.e ->> 'name', 'Workout'), 'emoji', coalesce(w.e ->> 'emoji', ''),
              'minutes', w.e -> 'minutes', 'distance_km', w.e -> 'distanceKm',
              'cheered', exists (select 1 from public.cheers c where c.from_user = me and c.to_user = p.user_id and c.ref = w.e ->> 'id')
            ))
          from public.friendships fr
          join public.social_profiles p on p.user_id = case when fr.requester = me then fr.addressee else fr.requester end
          cross join lateral jsonb_array_elements(
            case when jsonb_typeof(public.social_visible_summary(p.summary, p.sharing) -> 'workouts') = 'array'
                 then public.social_visible_summary(p.summary, p.sharing) -> 'workouts' else '[]'::jsonb end
          ) with ordinality as w (e, n)
          where fr.status = 'accepted' and (fr.requester = me or fr.addressee = me)
            and jsonb_typeof(w.e) = 'object'
            and public.social_is_workout_ref(w.e ->> 'id')
            and jsonb_typeof(w.e -> 'minutes') = 'number'
            and case when public.social_is_date(w.e ->> 'date') then (w.e ->> 'date')::date >= current_date - 7 else false end
        ) u
        order by day desc, kind_rank, shown_at desc nulls last, seq, name_key, ref
        limit 100
      ) f
    ), '[]'::jsonb),
    'my_meals', coalesce((
      select jsonb_agg(jsonb_build_object(
        'ref', m.ref, 'day', to_char(m.day, 'YYYY-MM-DD'), 'meal', m.meal, 'items', m.items, 'show_kcal', m.show_kcal,
        'shown_at', m.shown_at, 'expires_at', m.expires_at,
        'viewers', coalesce((
          select jsonb_agg(jsonb_build_object('user_id', p.user_id, 'display_name', p.display_name, 'avatar', p.avatar) order by lower(p.display_name), p.user_id)
          from public.shared_meal_viewers v
          join public.social_profiles p on p.user_id = v.viewer
          where v.owner = me and v.ref = m.ref and public.social_are_friends(me, v.viewer)
        ), '[]'::jsonb),
        'cheers', (
          select count(*) from public.cheers c
          where c.to_user = me and c.ref = 'meal:' || m.ref and public.social_are_friends(me, c.from_user)
        )
      ) order by m.shown_at desc, m.ref)
      from public.shared_meals m
      where m.owner = me and m.expires_at > now()
    ), '[]'::jsonb)
  );
end;
$$;

-- ------------------------------------------------------------------ privileges

revoke all on function public.social_is_adult(uuid) from public, anon, authenticated;
revoke all on function public.social_meal_ref(text, date, text) from public, anon, authenticated;
revoke all on function public.social_clean_text(jsonb, integer) from public, anon, authenticated;
revoke all on function public.social_clean_meal(jsonb, boolean) from public, anon, authenticated;
revoke all on function public.social_clean_meal_settings(jsonb, jsonb) from public, anon, authenticated;
revoke all on function public.social_lock_meals(uuid) from public, anon, authenticated;
revoke all on function public.social_shares_meals_with(uuid, uuid) from public, anon, authenticated;
revoke all on function public.social_visible_meals(uuid) from public, anon, authenticated;
revoke all on function public.social_drop_unseen_meals(uuid[]) from public, anon, authenticated;
revoke all on function public.social_purge_meals() from public, anon, authenticated;
revoke all on function public.social_count_meal_write(uuid, boolean) from public, anon, authenticated;
revoke all on function public.social_insert_meal(uuid, text, date, text, jsonb, boolean) from public, anon, authenticated;
revoke all on function public.meal_show(text, text, jsonb, boolean, uuid[]) from public, anon;
revoke all on function public.meal_show_auto(text, text, jsonb) from public, anon;
revoke all on function public.meal_update(text, jsonb) from public, anon;
revoke all on function public.meal_stop(text) from public, anon;
revoke all on function public.meal_stop_all() from public, anon;
revoke all on function public.meal_settings_set(jsonb) from public, anon;
revoke all on function public.meal_audience_set(uuid[]) from public, anon;
revoke all on function public.friend_prefs_set(uuid, boolean, boolean) from public, anon;
revoke all on function public.send_cheer(uuid, text) from public, anon;
revoke all on function public.friend_remove(uuid) from public, anon;
revoke all on function public.social_leave() from public, anon;
revoke all on function public.friends_overview() from public, anon;

grant execute on function public.social_purge_meals() to service_role;
grant execute on function public.meal_show(text, text, jsonb, boolean, uuid[]) to authenticated;
grant execute on function public.meal_show_auto(text, text, jsonb) to authenticated;
grant execute on function public.meal_update(text, jsonb) to authenticated;
grant execute on function public.meal_stop(text) to authenticated;
grant execute on function public.meal_stop_all() to authenticated;
grant execute on function public.meal_settings_set(jsonb) to authenticated;
grant execute on function public.meal_audience_set(uuid[]) to authenticated;
grant execute on function public.friend_prefs_set(uuid, boolean, boolean) to authenticated;
grant execute on function public.send_cheer(uuid, text) to authenticated;
grant execute on function public.friend_remove(uuid) to authenticated;
grant execute on function public.social_leave() to authenticated;
grant execute on function public.friends_overview() to authenticated;
