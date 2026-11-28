-- Friends, fourth pass: doing things together.
--
-- Four things, each opt-in and each between people who already chose each other:
--   1. "Together this week": one weekly goal for a circle of 2 to 6 people who each
--      accepted. The circle's active minutes (the app's guidelineMinutes) or days with food
--      logged pour into one cup. Members see the circle's total and the names of who joined,
--      never one person's figure, never a ranking. One circle per person.
--   2. Logging buddies: up to 3 buddies, each a pair who both accepted. The pair sees, per
--      day, how many of the two logged anything (0, 1 or 2), never what was eaten, and one
--      run of days both logged that forgives one missed day a week.
--   3. Kind notes: three preset notes, no free text. One a day per friend, five a day in all.
--      The receiver can turn notes off for everyone or for one friend; the sender is never
--      told (a note sent then is kept hidden, and counts against the sender's limit as usual).
--   4. A saved meal or recipe shown to friends: a shown meal (20261201000000_friends_meals.sql)
--      may now carry a saved meal's name, foods and servings in place of a day's meal, under
--      the same rules: friends picked, 18 and over, cleaned by social_clean_meal, gone after 7
--      days. It is never in the `feed` or `my_meals` an older app reads.
--
-- What the phone sends for 1 and 2 (social_signals_publish) is only this week's and last
-- week's active minutes and the days with food logged in the last 35 days, and the server
-- keeps only what a circle or a buddy of the person needs right now: nothing at all for
-- someone in neither. Never food, calories, weight or a time of day.
--
-- As for the rest of friends: row-level security is on with no policies and the API roles
-- hold no table privileges, so every access goes through the functions below, each working
-- only for the signed-in caller and checking the friendship at the moment of the call. Safe
-- to run twice. Only adds tables, columns and functions; friends_overview keeps every key it
-- had, in the same shape, and only gains new ones, so older copies of the app keep working.

-- ------------------------------------------------------------------ tables

-- What a phone last sent for circles and buddies. One row per person, only while wanted.
create table if not exists public.social_signals (
  user_id uuid primary key references auth.users (id) on delete cascade,
  -- The day in the person's own calendar when they sent it, and its Monday.
  today date not null,
  week date not null,
  -- Active minutes of that week and of the week before. Null unless a minutes circle wants them.
  minutes integer check (minutes between 0 and 100000),
  last_minutes integer check (last_minutes between 0 and 100000),
  -- Days with food logged, the last 35 days at most. Null unless a days circle or a buddy wants them.
  logged date[],
  updated_at timestamptz not null default now()
);

-- A circle's weekly goal. It starts again every Monday; kind never changes.
create table if not exists public.together_goals (
  id uuid primary key default gen_random_uuid(),
  kind text not null check (kind in ('minutes', 'days')),
  target integer not null check (target between 1 and 6000),
  -- The Monday of the week it started, and the Monday from which `target` holds (weeks before
  -- it had `prev_target`).
  first_week date not null,
  target_week date not null,
  prev_target integer check (prev_target between 1 and 6000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Who is in a circle. 'invited' waits for an answer, 'joined' pours in, 'declined' (also
-- after leaving) is kept so the circle cannot ask again; only its owner ever sees that row.
create table if not exists public.together_members (
  goal_id uuid not null references public.together_goals (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  status text not null check (status in ('invited', 'joined', 'declined')),
  invited_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  joined_at timestamptz,
  primary key (goal_id, user_id)
);

create index if not exists together_members_user_idx on public.together_members (user_id);
-- One circle per person at a time.
create unique index if not exists together_members_one_idx on public.together_members (user_id) where status = 'joined';

-- Logging buddies: one row per pair, whoever asked. 'declined' hides the ask from the one
-- who declined for good and is never told to the asker (as friend requests).
create table if not exists public.log_buddies (
  requester uuid not null references auth.users (id) on delete cascade,
  addressee uuid not null references auth.users (id) on delete cascade,
  status text not null check (status in ('pending', 'accepted', 'declined')),
  created_at timestamptz not null default now(),
  accepted_at timestamptz,
  -- The first day the pair counts (the day it was accepted).
  start_day date,
  -- The run of days both logged up to and including run_base_day, settled once a day is
  -- more than three weeks old, so the run can outlast the 35 days of logged days kept.
  run_base integer not null default 0 check (run_base >= 0),
  run_base_day date,
  check (requester <> addressee)
);

create unique index if not exists log_buddies_pair_idx
  on public.log_buddies (least(requester, addressee), greatest(requester, addressee));
create index if not exists log_buddies_addressee_idx on public.log_buddies (addressee);

-- Kind notes. Kept 14 days. `hidden` when the receiver had notes off for the sender then.
create table if not exists public.friend_notes (
  id bigint generated always as identity primary key,
  from_user uuid not null references auth.users (id) on delete cascade,
  to_user uuid not null references auth.users (id) on delete cascade,
  kind text not null check (kind in ('thinking_of_you', 'walk_later', 'nice_week')),
  -- The server's day it was sent: one note a day per friend.
  sent_on date not null default current_date,
  hidden boolean not null default false,
  created_at timestamptz not null default now(),
  check (from_user <> to_user),
  unique (from_user, to_user, sent_on)
);

create index if not exists friend_notes_to_idx on public.friend_notes (to_user, created_at desc);

-- "Notes from friends" for everyone, and per friend (friend_prefs, no row = on).
alter table public.social_profiles add column if not exists notes_on boolean not null default true;
alter table public.friend_prefs add column if not exists notes boolean not null default true;

-- Limits against abuse, kept when friends are turned off and on, like the other limits.
alter table public.social_limits add column if not exists together_starts integer not null default 0;
alter table public.social_limits add column if not exists together_starts_window timestamptz;
alter table public.social_limits add column if not exists together_writes integer not null default 0;
alter table public.social_limits add column if not exists together_writes_window timestamptz;
alter table public.social_limits add column if not exists buddy_writes integer not null default 0;
alter table public.social_limits add column if not exists buddy_writes_window timestamptz;
alter table public.social_limits add column if not exists notes_sent integer not null default 0;
alter table public.social_limits add column if not exists notes_sent_window timestamptz;
alter table public.social_limits add column if not exists signal_writes integer not null default 0;
alter table public.social_limits add column if not exists signal_writes_window timestamptz;

-- A shown meal is a day's meal ('diary', as before) or a saved meal or recipe ('saved':
-- a name and servings in place of the meal; its day is the day it was first shown and is
-- never told to friends).
alter table public.shared_meals add column if not exists kind text not null default 'diary';
alter table public.shared_meals add column if not exists name text;
alter table public.shared_meals add column if not exists servings numeric;
alter table public.shared_meals alter column meal drop not null;
alter table public.shared_meals drop constraint if exists shared_meals_kind_check;
alter table public.shared_meals add constraint shared_meals_kind_check check (
  (kind = 'diary' and meal is not null and name is null and servings is null)
  or (kind = 'saved' and meal is null and name is not null and (servings is null or servings between 1 and 100))
);

alter table public.social_signals enable row level security;
alter table public.together_goals enable row level security;
alter table public.together_members enable row level security;
alter table public.log_buddies enable row level security;
alter table public.friend_notes enable row level security;
revoke all on table public.social_signals, public.together_goals, public.together_members, public.log_buddies, public.friend_notes from anon, authenticated;

-- ------------------------------------------------------------------ helpers

-- The Monday of a day's week.
create or replace function public.social_week_of(p date)
returns date
language sql
immutable
as $$
  select p - (extract(isodow from p)::integer - 1)
$$;

-- The caller's day: the one their phone last sent, when it is a day either side of the
-- server's (UTC) date, else the server's.
create or replace function public.social_today(p_user uuid)
returns date
language sql
stable
set search_path = public
as $$
  select coalesce((
    select s.today from public.social_signals s
    where s.user_id = p_user and s.today between current_date - 1 and current_date + 1
  ), current_date)
$$;

-- One daily counter of social_limits: true and counted, or false when p_max is reached.
create or replace function public.social_take(p_user uuid, p_what text, p_max integer)
returns boolean
language plpgsql
volatile
set search_path = public
as $$
declare
  v_count integer;
  v_window timestamptz;
begin
  if p_what not in ('together_starts', 'together_writes', 'buddy_writes', 'notes_sent', 'signal_writes') then
    raise exception 'unknown limit %', p_what;
  end if;
  perform public.social_my_limits(p_user);
  execute format('select %I, %I from public.social_limits where user_id = $1', p_what, p_what || '_window')
    into v_count, v_window using p_user;
  if v_window is null or v_window < now() - interval '1 day' then
    v_count := 0;
    v_window := now();
  end if;
  if v_count >= p_max then
    return false;
  end if;
  execute format('update public.social_limits set %I = $2, %I = $3 where user_id = $1', p_what, p_what || '_window')
    using p_user, v_count + 1, v_window;
  return true;
end;
$$;

-- What the server wants from this person's phone now: minutes for a minutes circle, the
-- days logged for a days circle or a buddy.
create or replace function public.social_signals_wanted(p_user uuid)
returns jsonb
language sql
stable
set search_path = public
as $$
  select jsonb_build_object(
    'minutes', exists (
      select 1 from public.together_members m join public.together_goals g on g.id = m.goal_id
      where m.user_id = p_user and m.status = 'joined' and g.kind = 'minutes'
    ),
    'logged', exists (
      select 1 from public.together_members m join public.together_goals g on g.id = m.goal_id
      where m.user_id = p_user and m.status = 'joined' and g.kind = 'days'
    ) or exists (
      select 1 from public.log_buddies b
      where (b.requester = p_user or b.addressee = p_user) and b.status = 'accepted'
    )
  )
$$;

-- Keep only what is still wanted of these people's signals; drop a row nothing wants.
create or replace function public.social_trim_signals(p_users uuid[])
returns void
language plpgsql
volatile
set search_path = public
as $$
declare
  u uuid;
  w jsonb;
begin
  foreach u in array coalesce(p_users, '{}'::uuid[]) loop
    w := public.social_signals_wanted(u);
    if not (w ->> 'minutes')::boolean and not (w ->> 'logged')::boolean then
      delete from public.social_signals where user_id = u;
    else
      update public.social_signals
        set minutes = case when (w ->> 'minutes')::boolean then minutes end,
            last_minutes = case when (w ->> 'minutes')::boolean then last_minutes end,
            logged = case when (w ->> 'logged')::boolean then logged end
        where user_id = u;
    end if;
  end loop;
end;
$$;

-- A circle's target for one week.
create or replace function public.social_together_target(p_goal public.together_goals, p_week date)
returns integer
language sql
immutable
as $$
  select case when p_week >= p_goal.target_week then p_goal.target else coalesce(p_goal.prev_target, p_goal.target) end
$$;

-- A circle's total for one week: the joined members' minutes (or days logged) summed.
-- A member who sent nothing for that week adds nothing. Never told per person.
create or replace function public.social_together_total(p_goal uuid, p_week date)
returns integer
language sql
stable
set search_path = public
as $$
  select coalesce(sum(
    case g.kind
      when 'minutes' then
        case when s.week = p_week then coalesce(s.minutes, 0)
             when s.week = p_week + 7 then coalesce(s.last_minutes, 0)
             else 0 end
      else (select count(*) from unnest(coalesce(s.logged, '{}'::date[])) d where d between p_week and p_week + 6)
    end
  ), 0)::integer
  from public.together_members m
  join public.together_goals g on g.id = m.goal_id
  join public.social_profiles p on p.user_id = m.user_id
  left join public.social_signals s on s.user_id = m.user_id
  where m.goal_id = p_goal and m.status = 'joined'
$$;

-- A circle with nobody joined is no circle: remove it, with its invitations.
create or replace function public.social_drop_empty_circles()
returns void
language sql
volatile
set search_path = public
as $$
  delete from public.together_goals g
  where not exists (select 1 from public.together_members m where m.goal_id = g.id and m.status = 'joined')
$$;

-- One person's circle and buddy writes run one at a time, so the limits and caps hold.
create or replace function public.social_lock_together(p_user uuid)
returns void
language sql
volatile
as $$
  select pg_advisory_xact_lock(hashtextextended('together:' || p_user::text, 0))
$$;

-- The run of days a buddy pair both logged, from p_from to p_to: a day both logged adds one;
-- the first day in a week (Monday to Sunday) that is not is kept (the run goes on); a second
-- one ends the run, and a new one starts the next day. With p_open, p_to is today, which is
-- not over yet and never counts as missed. Returns {"run": n, "kept": bool}, kept saying
-- whether a day of p_to's week was kept.
create or replace function public.social_buddy_run(p_a date[], p_b date[], p_from date, p_to date, p_base integer, p_open boolean)
returns jsonb
language plpgsql
immutable
as $$
declare
  d date := p_from;
  v_run integer := coalesce(p_base, 0);
  v_missed integer := 0;
begin
  while d is not null and d <= p_to loop
    if extract(isodow from d) = 1 then
      v_missed := 0;
    end if;
    if d = any (coalesce(p_a, '{}'::date[])) and d = any (coalesce(p_b, '{}'::date[])) then
      v_run := v_run + 1;
    elsif not (p_open and d = p_to) then
      v_missed := v_missed + 1;
      if v_missed > 1 then
        v_run := 0;
        v_missed := 0;
      end if;
    end if;
    d := d + 1;
  end loop;
  return jsonb_build_object('run', v_run, 'kept', v_missed = 1 and v_run > 0);
end;
$$;

-- Settle a pair's run up to the Sunday three weeks back, so it never needs days older than
-- the 35 kept. Safe to call from any read; two at once settle the same way.
create or replace function public.social_settle_buddy(p_a uuid, p_b uuid, p_today date)
returns void
language plpgsql
volatile
set search_path = public
as $$
declare
  v public.log_buddies;
  v_to date := (p_today - 21) - (extract(isodow from p_today - 21)::integer % 7);
  v_from date;
  v_run jsonb;
begin
  select * into v from public.log_buddies
    where least(requester, addressee) = least(p_a, p_b) and greatest(requester, addressee) = greatest(p_a, p_b)
      and status = 'accepted'
    for update skip locked;
  if not found then
    return;
  end if;
  v_from := coalesce(v.run_base_day + 1, v.start_day);
  if v_from is null or v_to < v_from then
    return;
  end if;
  v_run := public.social_buddy_run(
    (select logged from public.social_signals where user_id = v.requester),
    (select logged from public.social_signals where user_id = v.addressee),
    v_from, v_to, v.run_base, false);
  update public.log_buddies set run_base = (v_run ->> 'run')::integer, run_base_day = v_to
    where requester = v.requester and addressee = v.addressee;
end;
$$;

-- Notes and old marks leave the server; a circle nobody is in goes. Run on every read of
-- the Friends screen; also safe to run daily from pg_cron as the service role.
create or replace function public.social_purge_together()
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  delete from public.friend_notes where created_at < now() - interval '14 days';
  perform public.social_drop_empty_circles();
end;
$$;

-- The opaque reference of a saved meal shown to friends: never its record id.
create or replace function public.social_saved_ref(p_share_key text, p_saved_id text)
returns text
language sql
immutable
as $$
  select left(encode(sha256(convert_to(p_share_key || ':saved:' || p_saved_id, 'UTF8')), 'hex'), 32)
$$;

-- ------------------------------------------------------------------ signals

-- The phone's figures for circles and buddies:
--   {"today": "YYYY-MM-DD", "minutes": n, "last_minutes": n, "logged": ["YYYY-MM-DD", ...]}
-- (buildFriendSignals in src/features/friends/signals.ts). Only what social_signals_wanted
-- asks for is kept: minutes for a minutes circle, days logged (the 35 days up to today) for a
-- days circle or a buddy; anything else is dropped. Returns ok, not_needed (nothing kept,
-- any earlier row removed), no_card, invalid or limit.
create or replace function public.social_signals_publish(p_signals jsonb)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  me uuid := auth.uid();
  w jsonb;
  v_today date;
  v_minutes integer;
  v_last integer;
  v_logged date[];
begin
  if me is null then
    raise exception 'not authenticated';
  end if;
  perform 1 from public.social_profiles where user_id = me for share;
  if not found then
    delete from public.social_signals where user_id = me;
    return 'no_card';
  end if;
  if p_signals is null or jsonb_typeof(p_signals) <> 'object' or pg_column_size(p_signals) > 4096
     or not public.social_is_date(p_signals ->> 'today') then
    return 'invalid';
  end if;
  v_today := (p_signals ->> 'today')::date;
  if v_today < current_date - 1 or v_today > current_date + 1 then
    return 'invalid';
  end if;
  perform public.social_lock_together(me);
  w := public.social_signals_wanted(me);
  if not (w ->> 'minutes')::boolean and not (w ->> 'logged')::boolean then
    delete from public.social_signals where user_id = me;
    return 'not_needed';
  end if;
  if not public.social_take(me, 'signal_writes', 500) then
    return 'limit';
  end if;
  if (w ->> 'minutes')::boolean then
    v_minutes := case when jsonb_typeof(p_signals -> 'minutes') = 'number'
                      then least(greatest(round((p_signals ->> 'minutes')::numeric), 0), 100000)::integer else 0 end;
    v_last := case when jsonb_typeof(p_signals -> 'last_minutes') = 'number'
                   then least(greatest(round((p_signals ->> 'last_minutes')::numeric), 0), 100000)::integer else 0 end;
  end if;
  if (w ->> 'logged')::boolean then
    select coalesce(array_agg(distinct x::date order by x::date), '{}'::date[]) into v_logged
      from (
        select e #>> '{}' as x
        from jsonb_array_elements(case when jsonb_typeof(p_signals -> 'logged') = 'array' then p_signals -> 'logged' else '[]'::jsonb end) e
        where jsonb_typeof(e) = 'string'
        limit 100
      ) t
      where public.social_is_date(x) and x::date between v_today - 34 and v_today;
  end if;
  insert into public.social_signals (user_id, today, week, minutes, last_minutes, logged, updated_at)
    values (me, v_today, public.social_week_of(v_today), v_minutes, v_last, v_logged, now())
    on conflict (user_id) do update
      set today = excluded.today, week = excluded.week, minutes = excluded.minutes,
          last_minutes = excluded.last_minutes, logged = excluded.logged, updated_at = now();
  return 'ok';
end;
$$;

-- ------------------------------------------------------------------ together

-- Start a circle and invite friends to it. p_kind 'minutes' (active minutes; target 30 to
-- 6000) or 'days' (days with food logged; target 2 to 42, 18 and over only). The caller
-- joins it. Returns {"status": ...}: ok (with id), no_card, invalid, under_18, in_circle
-- (the caller is in one already), not_friends (someone invited is not an accepted friend;
-- nothing is stored), too_many (more than 5 invited), limit.
create or replace function public.together_start(p_kind text, p_target integer, p_invite uuid[])
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  me uuid := auth.uid();
  v_kind text := lower(btrim(coalesce(p_kind, '')));
  v_invite uuid[];
  v_id uuid;
begin
  if me is null then
    raise exception 'not authenticated';
  end if;
  perform 1 from public.social_profiles where user_id = me for share;
  if not found then
    return jsonb_build_object('status', 'no_card');
  end if;
  if v_kind not in ('minutes', 'days') or p_target is null
     or (v_kind = 'minutes' and p_target not between 30 and 6000)
     or (v_kind = 'days' and p_target not between 2 and 42) then
    return jsonb_build_object('status', 'invalid');
  end if;
  if v_kind = 'days' and not public.social_is_adult(me) then
    return jsonb_build_object('status', 'under_18');
  end if;
  select coalesce(array_agg(distinct x), '{}'::uuid[]) into v_invite
    from unnest(coalesce(p_invite[1:50], '{}'::uuid[])) x where x is not null and x <> me;
  if cardinality(v_invite) > 5 then
    return jsonb_build_object('status', 'too_many');
  end if;
  if exists (select 1 from unnest(v_invite) x where not public.social_are_friends(me, x)) then
    return jsonb_build_object('status', 'not_friends');
  end if;
  perform public.social_lock_together(me);
  if exists (select 1 from public.together_members where user_id = me and status = 'joined') then
    return jsonb_build_object('status', 'in_circle');
  end if;
  if not public.social_take(me, 'together_starts', 5) then
    return jsonb_build_object('status', 'limit');
  end if;
  insert into public.together_goals (kind, target, first_week, target_week)
    values (v_kind, p_target, public.social_week_of(public.social_today(me)), public.social_week_of(public.social_today(me)))
    returning id into v_id;
  insert into public.together_members (goal_id, user_id, status, invited_by, joined_at)
    values (v_id, me, 'joined', me, now());
  insert into public.together_members (goal_id, user_id, status, invited_by)
    select v_id, x, 'invited', me from unnest(v_invite) x;
  return jsonb_build_object('status', 'ok', 'id', v_id);
end;
$$;

-- A member invites more friends to their circle. Someone already invited, in it, or who
-- declined or left it is passed over without a word. Returns ok, not_member, not_friends
-- (nothing is stored), too_many (the circle would hold more than 6 joined and invited), limit.
create or replace function public.together_invite(p_goal uuid, p_users uuid[])
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  me uuid := auth.uid();
  v_users uuid[];
begin
  if me is null then
    raise exception 'not authenticated';
  end if;
  if not exists (select 1 from public.together_members where goal_id = p_goal and user_id = me and status = 'joined')
     or not exists (select 1 from public.social_profiles where user_id = me) then
    return 'not_member';
  end if;
  select coalesce(array_agg(distinct x), '{}'::uuid[]) into v_users
    from unnest(coalesce(p_users[1:50], '{}'::uuid[])) x where x is not null and x <> me;
  if exists (select 1 from unnest(v_users) x where not public.social_are_friends(me, x)) then
    return 'not_friends';
  end if;
  perform pg_advisory_xact_lock(hashtextextended('circle:' || p_goal::text, 0));
  v_users := array(
    select x from unnest(v_users) x
    where not exists (select 1 from public.together_members m where m.goal_id = p_goal and m.user_id = x)
  );
  if cardinality(v_users) = 0 then
    return 'ok';
  end if;
  if (select count(*) from public.together_members where goal_id = p_goal and status in ('invited', 'joined')) + cardinality(v_users) > 6 then
    return 'too_many';
  end if;
  if not public.social_take(me, 'together_writes', 60) then
    return 'limit';
  end if;
  insert into public.together_members (goal_id, user_id, status, invited_by)
    select p_goal, x, 'invited', me from unnest(v_users) x
    on conflict do nothing;
  return 'ok';
end;
$$;

-- Answer an invitation. Declining is silent and final for that circle. Returns joined,
-- declined, not_found (no such invitation for the caller; also a days circle for someone
-- under 18, who never sees one), in_circle (the caller is in another; leave it first).
create or replace function public.together_respond(p_goal uuid, p_accept boolean)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  me uuid := auth.uid();
  v_kind text;
begin
  if me is null then
    raise exception 'not authenticated';
  end if;
  perform 1 from public.social_profiles where user_id = me for share;
  if not found then
    return 'not_found';
  end if;
  perform public.social_lock_together(me);
  select g.kind into v_kind
    from public.together_members m join public.together_goals g on g.id = m.goal_id
    where m.goal_id = p_goal and m.user_id = me and m.status = 'invited';
  if not found or (v_kind = 'days' and not public.social_is_adult(me)) then
    return 'not_found';
  end if;
  if not coalesce(p_accept, false) then
    update public.together_members set status = 'declined' where goal_id = p_goal and user_id = me;
    return 'declined';
  end if;
  if exists (select 1 from public.together_members where user_id = me and status = 'joined') then
    return 'in_circle';
  end if;
  update public.together_members set status = 'joined', joined_at = now() where goal_id = p_goal and user_id = me;
  return 'joined';
end;
$$;

-- Leave a circle, silently; the circle cannot ask again. A circle left empty is removed.
-- Returns left or not_found.
create or replace function public.together_leave(p_goal uuid)
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
  perform public.social_lock_together(me);
  update public.together_members set status = 'declined' where goal_id = p_goal and user_id = me and status = 'joined';
  if not found then
    return 'not_found';
  end if;
  -- Invitations the leaver sent and nobody answered go with them.
  delete from public.together_members where goal_id = p_goal and invited_by = me and status = 'invited';
  perform public.social_drop_empty_circles();
  perform public.social_trim_signals(array[me]);
  return 'left';
end;
$$;

-- "Change the goal": any member sets the target, from this week on. Returns ok,
-- not_member, invalid or limit.
create or replace function public.together_set_target(p_goal uuid, p_target integer)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  me uuid := auth.uid();
  v public.together_goals;
  v_week date;
begin
  if me is null then
    raise exception 'not authenticated';
  end if;
  if not exists (select 1 from public.together_members where goal_id = p_goal and user_id = me and status = 'joined') then
    return 'not_member';
  end if;
  select * into v from public.together_goals where id = p_goal for update;
  if not found then
    return 'not_member';
  end if;
  if p_target is null or (v.kind = 'minutes' and p_target not between 30 and 6000) or (v.kind = 'days' and p_target not between 2 and 42) then
    return 'invalid';
  end if;
  if not public.social_take(me, 'together_writes', 60) then
    return 'limit';
  end if;
  v_week := public.social_week_of(public.social_today(me));
  update public.together_goals
    set prev_target = case when v_week > target_week then target else prev_target end,
        target_week = greatest(target_week, v_week),
        target = p_target,
        updated_at = now()
    where id = p_goal;
  return 'ok';
end;
$$;

-- ------------------------------------------------------------------ buddies

-- Ask a friend to log together. Returns sent, accepted (they had asked the caller),
-- already (asked or together already), not_friends, too_many (3 buddies, counting asks
-- the caller sent), no_card, limit. Someone who declined the caller is told nothing:
-- the caller is told 'sent' all the same.
create or replace function public.buddy_invite(p_user uuid)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  me uuid := auth.uid();
  v public.log_buddies;
begin
  if me is null then
    raise exception 'not authenticated';
  end if;
  perform 1 from public.social_profiles where user_id = me for share;
  if not found then
    return 'no_card';
  end if;
  if p_user is null or p_user = me or not public.social_are_friends(me, p_user) then
    return 'not_friends';
  end if;
  perform public.social_lock_pair(me, p_user);
  select * into v from public.log_buddies
    where least(requester, addressee) = least(me, p_user) and greatest(requester, addressee) = greatest(me, p_user);
  if found then
    if v.status = 'accepted' or v.requester = me then
      return case when v.status = 'declined' then 'sent' else 'already' end;
    end if;
    -- They had asked the caller (whether or not the caller declined it): the caller's ask is a yes.
    if (select count(*) from public.log_buddies where (requester = me or addressee = me) and status = 'accepted') >= 3 then
      return 'too_many';
    end if;
    update public.log_buddies set status = 'accepted', accepted_at = now(), start_day = public.social_today(me)
      where requester = v.requester and addressee = v.addressee;
    return 'accepted';
  end if;
  if (select count(*) from public.log_buddies
      where ((requester = me or addressee = me) and status = 'accepted') or (requester = me and status in ('pending', 'declined'))) >= 3 then
    return 'too_many';
  end if;
  if not public.social_take(me, 'buddy_writes', 20) then
    return 'limit';
  end if;
  insert into public.log_buddies (requester, addressee, status) values (me, p_user, 'pending');
  return 'sent';
end;
$$;

-- Answer a friend's ask. Declining is silent. Returns together, declined, not_found or too_many.
create or replace function public.buddy_respond(p_user uuid, p_accept boolean)
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
  if p_user is null or not public.social_are_friends(me, p_user) then
    return 'not_found';
  end if;
  perform public.social_lock_pair(me, p_user);
  if not exists (select 1 from public.log_buddies where requester = p_user and addressee = me and status = 'pending') then
    return 'not_found';
  end if;
  if not coalesce(p_accept, false) then
    update public.log_buddies set status = 'declined' where requester = p_user and addressee = me;
    return 'declined';
  end if;
  if (select count(*) from public.log_buddies where (requester = me or addressee = me) and status = 'accepted') >= 3 then
    return 'too_many';
  end if;
  update public.log_buddies set status = 'accepted', accepted_at = now(), start_day = public.social_today(me)
    where requester = p_user and addressee = me;
  return 'together';
end;
$$;

-- Stop logging together, or take back an ask the caller sent. Silent for the other. An ask
-- the caller declined stays declined. Returns stopped or not_found.
create or replace function public.buddy_stop(p_user uuid)
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
  delete from public.log_buddies
    where (requester = me and addressee = p_user)
       or (requester = p_user and addressee = me and status = 'accepted');
  if not found then
    return 'not_found';
  end if;
  perform public.social_trim_signals(array[me, p_user]);
  return 'stopped';
end;
$$;

-- ------------------------------------------------------------------ notes

-- Send a friend a kind note: 'thinking_of_you', 'walk_later' or 'nice_week'. Returns ok
-- (also when the friend turned notes off: they never see it and the caller is not told),
-- invalid, not_friends, already_today (one a day to each friend), limit (five a day in all),
-- no_card.
create or replace function public.send_note(p_to uuid, p_kind text)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  me uuid := auth.uid();
  v_kind text := btrim(coalesce(p_kind, ''));
  v_hidden boolean;
begin
  if me is null then
    raise exception 'not authenticated';
  end if;
  perform 1 from public.social_profiles where user_id = me for share;
  if not found then
    return 'no_card';
  end if;
  if v_kind not in ('thinking_of_you', 'walk_later', 'nice_week') then
    return 'invalid';
  end if;
  if p_to is null or not public.social_are_friends(me, p_to) then
    return 'not_friends';
  end if;
  perform public.social_lock_together(me);
  if exists (select 1 from public.friend_notes where from_user = me and to_user = p_to and sent_on = current_date) then
    return 'already_today';
  end if;
  if not public.social_take(me, 'notes_sent', 5) then
    return 'limit';
  end if;
  v_hidden := not coalesce((select notes_on from public.social_profiles where user_id = p_to), true)
    or exists (select 1 from public.friend_prefs fp where fp.owner = p_to and fp.friend = me and not fp.notes);
  insert into public.friend_notes (from_user, to_user, kind, hidden) values (me, p_to, v_kind, v_hidden);
  return 'ok';
end;
$$;

-- "Notes from friends" on or off for everyone. Returns the setting, or null when friends are off.
create or replace function public.note_settings_set(p_on boolean)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  me uuid := auth.uid();
  v boolean;
begin
  if me is null then
    raise exception 'not authenticated';
  end if;
  update public.social_profiles set notes_on = coalesce(p_on, true) where user_id = me returning notes_on into v;
  return v;
end;
$$;

-- Notes from one friend on or off; the friend is never told. Returns ok or not_friends.
create or replace function public.friend_notes_set(p_friend uuid, p_on boolean)
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
  insert into public.friend_prefs (owner, friend, notes) values (me, p_friend, coalesce(p_on, true))
    on conflict (owner, friend) do update set notes = coalesce(p_on, true), updated_at = now();
  return 'ok';
end;
$$;

-- ------------------------------------------------------------------ saved meals shown

-- Show a saved meal or recipe to the friends picked. p_saved_id is the saved meal's record
-- id: only a reference made from it with the share key is kept (social_saved_ref), never
-- the id. p_name is cut to 60 characters, p_servings is 1 to 100 or null, the foods are
-- cleaned as any shown meal's. Showing the same saved meal again changes its name, foods,
-- servings, calories switch and viewers and keeps when it leaves (7 days from the first
-- showing). Returns {"status": ...}: ok (with ref and expires_at), no_card, under_18,
-- invalid, empty, no_viewers, not_friends, limit, as meal_show.
create or replace function public.meal_show_saved(p_saved_id text, p_name text, p_items jsonb, p_servings numeric, p_show_kcal boolean, p_viewers uuid[])
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  me uuid := auth.uid();
  v_key text;
  v_id text := btrim(coalesce(p_saved_id, ''));
  v_name text := public.social_clean_text(to_jsonb(p_name), 60);
  v_kcal boolean := coalesce(p_show_kcal, false);
  v_servings numeric;
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
  if v_id !~ '^[A-Za-z0-9_-]{1,80}$' or v_name is null
     or p_items is null or jsonb_typeof(p_items) <> 'array' or pg_column_size(p_items) > 16384
     or (p_servings is not null and (p_servings < 1 or p_servings > 100)) then
    return jsonb_build_object('status', 'invalid');
  end if;
  v_servings := case when p_servings is null or round(p_servings, 2) = 1 then null else trim_scale(round(p_servings, 2)) end;
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
  v_ref := public.social_saved_ref(v_key, v_id);
  select * into v_row from public.shared_meals where owner = me and ref = v_ref;
  v_fresh := not found or v_row.expires_at <= now();
  if v_fresh and (select count(*) from public.shared_meals where owner = me and expires_at > now()) >= 40 then
    return jsonb_build_object('status', 'limit');
  end if;
  if not public.social_count_meal_write(me, v_fresh) then
    return jsonb_build_object('status', 'limit');
  end if;

  if v_fresh then
    delete from public.cheers where to_user = me and ref = 'meal:' || v_ref;
    delete from public.shared_meals where owner = me and ref = v_ref;
    insert into public.shared_meals (owner, ref, day, meal, items, show_kcal, kind, name, servings)
      values (me, v_ref, current_date, null, v_items, v_kcal, 'saved', v_name, v_servings)
      returning * into v_row;
    delete from public.shared_meal_stops where owner = me and ref = v_ref;
  else
    update public.shared_meals set items = v_items, show_kcal = v_kcal, name = v_name, servings = v_servings, updated_at = now()
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

-- ------------------------------------------------------------------ cleanup on remove and leave

-- Stop being friends with someone, or take back a request the caller sent. As before
-- (20261201000000_friends_meals.sql); in addition, from this moment: the two are no longer
-- buddies, their notes both ways go, invitations either sent the other to a circle go, and
-- the caller leaves a circle both are in.
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
  -- Together: buddies, notes and circles.
  delete from public.log_buddies
    where (requester = me and addressee = p_user) or (requester = p_user and addressee = me);
  delete from public.friend_notes
    where (from_user = me and to_user = p_user) or (from_user = p_user and to_user = me);
  delete from public.together_members
    where status = 'invited' and ((user_id = me and invited_by = p_user) or (user_id = p_user and invited_by = me));
  update public.together_members m set status = 'declined'
    where m.user_id = me and m.status = 'joined'
      and exists (select 1 from public.together_members o where o.goal_id = m.goal_id and o.user_id = p_user and o.status = 'joined');
  delete from public.together_members where status = 'invited' and invited_by = me
    and goal_id in (select goal_id from public.together_members where user_id = me and status = 'declined');
  perform public.social_drop_empty_circles();
  perform public.social_trim_signals(array[me, p_user]);
end;
$$;

-- Turn friends off: as before, and now also the caller's circles (left), invitations to and
-- from them, buddies, notes both ways and signals. Declines and the limits are kept.
create or replace function public.social_leave()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  me uuid := auth.uid();
  v_owners uuid[];
  v_buddies uuid[];
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
  -- Together.
  with gone as (
    delete from public.log_buddies where requester = me or addressee = me
      returning case when requester = me then addressee else requester end as other
  )
  select coalesce(array_agg(distinct other), '{}'::uuid[]) into v_buddies from gone;
  delete from public.friend_notes where from_user = me or to_user = me;
  delete from public.together_members where (invited_by = me and status = 'invited') or (user_id = me and status <> 'declined');
  delete from public.social_signals where user_id = me;
  perform public.social_drop_empty_circles();
  perform public.social_trim_signals(v_buddies);
end;
$$;

-- ------------------------------------------------------------------ overview

-- Everything the Friends screen shows, in one call. Every key of 20261201000000_friends_meals.sql
-- keeps its shape (feed and my_meals hold day meals only, as before), and in addition:
--   friends[].notes: the caller's switch for notes from that friend;
--   signals, notes_on, together, together_invites, buddies, buddy_invites, notes, notes_sent,
--   shared_saved_meals and my_saved_meals (each described where it is built below).
create or replace function public.friends_overview()
returns jsonb
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  me uuid := auth.uid();
  v jsonb;
  v_today date;
  v_week date;
  r record;
begin
  if me is null then
    raise exception 'not authenticated';
  end if;
  perform public.social_purge_meals();
  perform public.social_drop_unseen_meals(array[me]);
  v := jsonb_build_object(
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
        'see_meals', coalesce((select fp.see_meals from public.friend_prefs fp where fp.owner = me and fp.friend = p.user_id), true),
        'notes', coalesce((select fp.notes from public.friend_prefs fp where fp.owner = me and fp.friend = p.user_id), true)
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
        and c.ref not like 'meal:%'
    ), '[]'::jsonb),
    'meal_cheers', coalesce((
      select jsonb_agg(jsonb_build_object('from_user', c.from_user, 'display_name', p.display_name, 'avatar', p.avatar, 'ref', c.ref, 'created_at', c.created_at) order by c.created_at desc)
      from public.cheers c
      join public.social_profiles p on p.user_id = c.from_user
      where c.to_user = me and c.created_at > now() - interval '14 days' and public.social_are_friends(me, c.from_user)
        and c.ref like 'meal:%'
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
          where m.kind = 'diary'
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
      where m.owner = me and m.expires_at > now() and m.kind = 'diary'
    ), '[]'::jsonb)
  );

  -- Together (20261202000000_friends_together.sql). Only new keys; everything above keeps its shape.
  perform public.social_purge_together();
  perform public.social_trim_signals(array[me]);
  v_today := public.social_today(me);
  v_week := public.social_week_of(v_today);
  for r in
    select case when b.requester = me then b.addressee else b.requester end as other
    from public.log_buddies b where (b.requester = me or b.addressee = me) and b.status = 'accepted'
  loop
    perform public.social_settle_buddy(me, r.other, v_today);
  end loop;

  return v || jsonb_build_object(
    -- What this phone should send with social_signals_publish, and the day the figures below are for.
    'signals', public.social_signals_wanted(me) || jsonb_build_object('today', to_char(v_today, 'YYYY-MM-DD')),
    'notes_on', coalesce((select p.notes_on from public.social_profiles p where p.user_id = me), true),
    -- The caller's circle (one at most): the circle's total and target for this week and the
    -- last, and the names of who joined. Never one person's figure.
    'together', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', g.id,
        'kind', g.kind,
        'week', to_char(v_week, 'YYYY-MM-DD'),
        'target', public.social_together_target(g, v_week),
        'total', public.social_together_total(g.id, v_week),
        -- Null in the circle's first week.
        'last_week', case when v_week - 7 >= g.first_week then jsonb_build_object(
          'week', to_char(v_week - 7, 'YYYY-MM-DD'),
          'target', public.social_together_target(g, v_week - 7),
          'total', public.social_together_total(g.id, v_week - 7)
        ) end,
        'members', coalesce((
          select jsonb_agg(jsonb_build_object('user_id', p.user_id, 'display_name', p.display_name, 'avatar', p.avatar, 'me', p.user_id = me)
                           order by lower(p.display_name), p.user_id)
          from public.together_members mm
          join public.social_profiles p on p.user_id = mm.user_id
          where mm.goal_id = g.id and mm.status = 'joined'
        ), '[]'::jsonb),
        -- Friends the caller invited who have not joined: waiting, whether or not they declined
        -- (the caller cannot tell, as with friend requests).
        'asked', coalesce((
          select jsonb_agg(mm.user_id order by mm.user_id)
          from public.together_members mm
          where mm.goal_id = g.id and mm.invited_by = me and mm.user_id <> me
            and (mm.status = 'invited' or (mm.status = 'declined' and mm.joined_at is null))
            and public.social_are_friends(me, mm.user_id)
        ), '[]'::jsonb)
      ))
      from public.together_members m
      join public.together_goals g on g.id = m.goal_id
      where m.user_id = me and m.status = 'joined'
    ), '[]'::jsonb),
    -- Invitations to a circle, newest first. A days circle is never shown to someone under 18.
    'together_invites', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', g.id,
        'kind', g.kind,
        'target', public.social_together_target(g, v_week),
        'from', jsonb_build_object('user_id', ip.user_id, 'display_name', ip.display_name, 'avatar', ip.avatar),
        'members', coalesce((
          select jsonb_agg(jsonb_build_object('user_id', p.user_id, 'display_name', p.display_name, 'avatar', p.avatar)
                           order by lower(p.display_name), p.user_id)
          from public.together_members mm
          join public.social_profiles p on p.user_id = mm.user_id
          where mm.goal_id = g.id and mm.status = 'joined'
        ), '[]'::jsonb),
        'created_at', m.created_at
      ) order by m.created_at desc, g.id)
      from public.together_members m
      join public.together_goals g on g.id = m.goal_id
      join public.social_profiles ip on ip.user_id = m.invited_by
      where m.user_id = me and m.status = 'invited'
        and public.social_are_friends(me, m.invited_by)
        and (g.kind = 'minutes' or public.social_is_adult(me))
    ), '[]'::jsonb),
    -- Buddies: together (with the week as 0, 1 or 2 of the two logged each day, the run and
    -- whether a missed day of this week was kept), or asked by the caller (whether or not declined).
    'buddies', coalesce((
      select jsonb_agg(x.item order by x.name_key, x.uid)
      from (
        select
          p.user_id as uid, lower(p.display_name) as name_key,
          case when b.status = 'accepted' then jsonb_build_object(
            'user_id', p.user_id, 'display_name', p.display_name, 'avatar', p.avatar,
            'status', 'together',
            'since', to_char(b.start_day, 'YYYY-MM-DD'),
            'week', (
              select jsonb_agg(jsonb_build_object(
                'day', to_char(d, 'YYYY-MM-DD'),
                'count', case when d < b.start_day or d > v_today then null
                              else (d = any (coalesce(s.la, '{}'::date[])))::integer + (d = any (coalesce(s.lb, '{}'::date[])))::integer end
              ) order by d)
              from (select (v_week + k) as d from generate_series(0, 6) k) days
            ),
            'run', (rr.r ->> 'run')::integer,
            'kept', (rr.r ->> 'kept')::boolean
          ) else jsonb_build_object(
            'user_id', p.user_id, 'display_name', p.display_name, 'avatar', p.avatar, 'status', 'asked'
          ) end as item
        from public.log_buddies b
        join public.social_profiles p on p.user_id = case when b.requester = me then b.addressee else b.requester end
        cross join lateral (
          select (select logged from public.social_signals where user_id = me) as la,
                 (select logged from public.social_signals where user_id = p.user_id) as lb
        ) s
        cross join lateral (
          select case when b.status = 'accepted'
            then public.social_buddy_run(s.la, s.lb, coalesce(b.run_base_day + 1, b.start_day), v_today, b.run_base, true) end as r
        ) rr
        where (b.requester = me or b.addressee = me)
          and (b.status = 'accepted' or b.requester = me)
          and public.social_are_friends(me, p.user_id)
      ) x
    ), '[]'::jsonb),
    -- Friends asking the caller to log together, newest first (a declined ask never shows).
    'buddy_invites', coalesce((
      select jsonb_agg(jsonb_build_object('user_id', p.user_id, 'display_name', p.display_name, 'avatar', p.avatar, 'created_at', b.created_at)
                       order by b.created_at desc, p.user_id)
      from public.log_buddies b
      join public.social_profiles p on p.user_id = b.requester
      where b.addressee = me and b.status = 'pending' and public.social_are_friends(me, b.requester)
    ), '[]'::jsonb),
    -- Notes received in the last 14 days, newest first, from friends whose notes are on now.
    'notes', coalesce((
      select jsonb_agg(jsonb_build_object('id', n.id::text, 'from_user', n.from_user, 'display_name', p.display_name, 'avatar', p.avatar,
                                          'kind', n.kind, 'created_at', n.created_at) order by n.created_at desc, n.id desc)
      from public.friend_notes n
      join public.social_profiles p on p.user_id = n.from_user
      join public.social_profiles mep on mep.user_id = me
      where n.to_user = me and not n.hidden and n.created_at > now() - interval '14 days'
        and mep.notes_on
        and public.social_are_friends(me, n.from_user)
        and not exists (select 1 from public.friend_prefs fp where fp.owner = me and fp.friend = n.from_user and not fp.notes)
    ), '[]'::jsonb),
    -- The notes the caller sent today (one a day to each friend).
    'notes_sent', coalesce((
      select jsonb_agg(jsonb_build_object('to_user', n.to_user, 'kind', n.kind, 'created_at', n.created_at) order by n.created_at desc, n.id desc)
      from public.friend_notes n
      where n.from_user = me and n.sent_on = current_date and public.social_are_friends(me, n.to_user)
    ), '[]'::jsonb),
    -- Saved meals and recipes friends show the caller (never in `feed`), newest first, at most 50.
    'shared_saved_meals', coalesce((
      select jsonb_agg(f.item order by f.shown_at desc, f.ref)
      from (
        select m.shown_at, m.ref, jsonb_strip_nulls(jsonb_build_object(
          'kind', 'saved_meal', 'ref', m.ref, 'user_id', m.owner, 'display_name', p.display_name, 'avatar', p.avatar,
          'name', m.name, 'items', m.items, 'show_kcal', m.show_kcal, 'servings', m.servings,
          'cheered', exists (select 1 from public.cheers c where c.from_user = me and c.to_user = m.owner and c.ref = 'meal:' || m.ref)
        )) as item
        from public.social_visible_meals(me) m
        join public.social_profiles p on p.user_id = m.owner
        where m.kind = 'saved'
        order by m.shown_at desc, m.ref
        limit 50
      ) f
    ), '[]'::jsonb),
    -- The caller's saved meals showing now, as my_meals.
    'my_saved_meals', coalesce((
      select jsonb_agg(jsonb_strip_nulls(jsonb_build_object(
        'ref', m.ref, 'name', m.name, 'items', m.items, 'show_kcal', m.show_kcal, 'servings', m.servings,
        'shown_at', m.shown_at, 'expires_at', m.expires_at,
        'viewers', coalesce((
          select jsonb_agg(jsonb_build_object('user_id', p.user_id, 'display_name', p.display_name, 'avatar', p.avatar) order by lower(p.display_name), p.user_id)
          from public.shared_meal_viewers sv
          join public.social_profiles p on p.user_id = sv.viewer
          where sv.owner = me and sv.ref = m.ref and public.social_are_friends(me, sv.viewer)
        ), '[]'::jsonb),
        'cheers', (
          select count(*) from public.cheers c
          where c.to_user = me and c.ref = 'meal:' || m.ref and public.social_are_friends(me, c.from_user)
        )
      )) order by m.shown_at desc, m.ref)
      from public.shared_meals m
      where m.owner = me and m.expires_at > now() and m.kind = 'saved'
    ), '[]'::jsonb)
  );
end;
$$;

-- ------------------------------------------------------------------ privileges

revoke all on function public.social_week_of(date) from public, anon, authenticated;
revoke all on function public.social_today(uuid) from public, anon, authenticated;
revoke all on function public.social_take(uuid, text, integer) from public, anon, authenticated;
revoke all on function public.social_signals_wanted(uuid) from public, anon, authenticated;
revoke all on function public.social_trim_signals(uuid[]) from public, anon, authenticated;
revoke all on function public.social_together_target(public.together_goals, date) from public, anon, authenticated;
revoke all on function public.social_together_total(uuid, date) from public, anon, authenticated;
revoke all on function public.social_drop_empty_circles() from public, anon, authenticated;
revoke all on function public.social_lock_together(uuid) from public, anon, authenticated;
revoke all on function public.social_buddy_run(date[], date[], date, date, integer, boolean) from public, anon, authenticated;
revoke all on function public.social_settle_buddy(uuid, uuid, date) from public, anon, authenticated;
revoke all on function public.social_purge_together() from public, anon, authenticated;
revoke all on function public.social_saved_ref(text, text) from public, anon, authenticated;
revoke all on function public.social_signals_publish(jsonb) from public, anon;
revoke all on function public.together_start(text, integer, uuid[]) from public, anon;
revoke all on function public.together_invite(uuid, uuid[]) from public, anon;
revoke all on function public.together_respond(uuid, boolean) from public, anon;
revoke all on function public.together_leave(uuid) from public, anon;
revoke all on function public.together_set_target(uuid, integer) from public, anon;
revoke all on function public.buddy_invite(uuid) from public, anon;
revoke all on function public.buddy_respond(uuid, boolean) from public, anon;
revoke all on function public.buddy_stop(uuid) from public, anon;
revoke all on function public.send_note(uuid, text) from public, anon;
revoke all on function public.note_settings_set(boolean) from public, anon;
revoke all on function public.friend_notes_set(uuid, boolean) from public, anon;
revoke all on function public.meal_show_saved(text, text, jsonb, numeric, boolean, uuid[]) from public, anon;
revoke all on function public.friend_remove(uuid) from public, anon;
revoke all on function public.social_leave() from public, anon;
revoke all on function public.friends_overview() from public, anon;

grant execute on function public.social_purge_together() to service_role;
grant execute on function public.social_signals_publish(jsonb) to authenticated;
grant execute on function public.together_start(text, integer, uuid[]) to authenticated;
grant execute on function public.together_invite(uuid, uuid[]) to authenticated;
grant execute on function public.together_respond(uuid, boolean) to authenticated;
grant execute on function public.together_leave(uuid) to authenticated;
grant execute on function public.together_set_target(uuid, integer) to authenticated;
grant execute on function public.buddy_invite(uuid) to authenticated;
grant execute on function public.buddy_respond(uuid, boolean) to authenticated;
grant execute on function public.buddy_stop(uuid) to authenticated;
grant execute on function public.send_note(uuid, text) to authenticated;
grant execute on function public.note_settings_set(boolean) to authenticated;
grant execute on function public.friend_notes_set(uuid, boolean) to authenticated;
grant execute on function public.meal_show_saved(text, text, jsonb, numeric, boolean, uuid[]) to authenticated;
grant execute on function public.friend_remove(uuid) to authenticated;
grant execute on function public.social_leave() to authenticated;
grant execute on function public.friends_overview() to authenticated;
