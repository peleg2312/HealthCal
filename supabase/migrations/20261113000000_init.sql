-- HealthCal schema.
-- The app is local-first: the device holds the working copy and syncs
-- whole records. Each record is stored as JSON with a few typed columns for
-- indexing, which keeps the server schema stable while the app evolves.

create table if not exists public.profiles (
  user_id uuid primary key references auth.users (id) on delete cascade,
  data jsonb,
  profile_updated_at timestamptz,
  settings jsonb,
  settings_updated_at timestamptz,
  server_updated_at timestamptz not null default now()
);

create table if not exists public.records (
  user_id uuid not null references auth.users (id) on delete cascade,
  collection text not null check (
    collection in ('foodEntries', 'customFoods', 'savedMeals', 'activities', 'water', 'weights', 'sleep', 'fasting')
  ),
  id uuid not null,
  -- Local calendar day the record belongs to, when it has one.
  date text,
  data jsonb not null,
  deleted boolean not null default false,
  -- Client clock at the time of the edit: decides which version wins.
  updated_at timestamptz not null,
  -- Server clock: the pull cursor, immune to device clock skew.
  server_updated_at timestamptz not null default now(),
  primary key (user_id, collection, id)
);

create index if not exists records_pull_idx on public.records (user_id, server_updated_at);
create index if not exists records_day_idx on public.records (user_id, collection, date);

-- One row per user per day of AI usage, written only by the edge function.
create table if not exists public.ai_usage (
  user_id uuid not null references auth.users (id) on delete cascade,
  day date not null,
  requests integer not null default 0,
  input_tokens bigint not null default 0,
  output_tokens bigint not null default 0,
  primary key (user_id, day)
);

alter table public.profiles enable row level security;
alter table public.records enable row level security;
alter table public.ai_usage enable row level security;

-- Every policy is "your own rows only".
drop policy if exists profiles_own on public.profiles;
create policy profiles_own on public.profiles
  for all to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

drop policy if exists records_own on public.records;
create policy records_own on public.records
  for all to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

-- Usage is readable by its owner; there is deliberately no write policy,
-- so only the service role (the edge function) can change it.
drop policy if exists ai_usage_read_own on public.ai_usage;
create policy ai_usage_read_own on public.ai_usage
  for select to authenticated
  using ((select auth.uid()) = user_id);

-- Batched upsert with last-write-wins. Runs as the caller, so RLS applies.
create or replace function public.push_records(p_records jsonb)
returns integer
language plpgsql
security invoker
set search_path = public
as $$
declare
  affected integer;
begin
  if auth.uid() is null then
    raise exception 'not authenticated';
  end if;

  insert into public.records (user_id, collection, id, date, data, deleted, updated_at, server_updated_at)
  select
    auth.uid(),
    r ->> 'collection',
    (r ->> 'id')::uuid,
    r ->> 'date',
    r -> 'data',
    coalesce((r ->> 'deleted')::boolean, false),
    (r ->> 'updated_at')::timestamptz,
    now()
  from jsonb_array_elements(p_records) as r
  on conflict (user_id, collection, id) do update
    set date = excluded.date,
        data = excluded.data,
        deleted = excluded.deleted,
        updated_at = excluded.updated_at,
        server_updated_at = now()
    where public.records.updated_at <= excluded.updated_at;

  get diagnostics affected = row_count;
  return affected;
end;
$$;

-- Profile and settings are pushed independently; each keeps its own timestamp.
create or replace function public.push_profile(
  p_profile jsonb,
  p_profile_updated_at timestamptz,
  p_settings jsonb,
  p_settings_updated_at timestamptz
)
returns void
language plpgsql
security invoker
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'not authenticated';
  end if;

  insert into public.profiles (user_id, data, profile_updated_at, settings, settings_updated_at)
  values (auth.uid(), p_profile, p_profile_updated_at, p_settings, p_settings_updated_at)
  on conflict (user_id) do update
    set data = case
          when excluded.data is not null
           and (public.profiles.profile_updated_at is null or public.profiles.profile_updated_at <= excluded.profile_updated_at)
          then excluded.data else public.profiles.data end,
        profile_updated_at = case
          when excluded.data is not null
           and (public.profiles.profile_updated_at is null or public.profiles.profile_updated_at <= excluded.profile_updated_at)
          then excluded.profile_updated_at else public.profiles.profile_updated_at end,
        settings = case
          when excluded.settings is not null
           and (public.profiles.settings_updated_at is null or public.profiles.settings_updated_at <= excluded.settings_updated_at)
          then excluded.settings else public.profiles.settings end,
        settings_updated_at = case
          when excluded.settings is not null
           and (public.profiles.settings_updated_at is null or public.profiles.settings_updated_at <= excluded.settings_updated_at)
          then excluded.settings_updated_at else public.profiles.settings_updated_at end,
        server_updated_at = now();
end;
$$;

-- Lets a signed-in user erase their account; cascades remove all their rows.
create or replace function public.delete_my_account()
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'not authenticated';
  end if;
  delete from auth.users where id = auth.uid();
end;
$$;

-- Atomic "count this request if under the limit". Returns the new count,
-- or -1 when the daily limit is already reached. Service role only.
create or replace function public.bump_ai_usage(p_user uuid, p_limit integer)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  new_count integer;
begin
  insert into public.ai_usage (user_id, day, requests)
  values (p_user, (now() at time zone 'utc')::date, 1)
  on conflict (user_id, day) do update
    set requests = public.ai_usage.requests + 1
    where public.ai_usage.requests < p_limit
  returning requests into new_count;
  return coalesce(new_count, -1);
end;
$$;

create or replace function public.add_ai_tokens(p_user uuid, p_input bigint, p_output bigint)
returns void
language sql
security definer
set search_path = public
as $$
  update public.ai_usage
     set input_tokens = input_tokens + p_input,
         output_tokens = output_tokens + p_output
   where user_id = p_user and day = (now() at time zone 'utc')::date;
$$;

revoke all on function public.push_records(jsonb) from public, anon;
revoke all on function public.push_profile(jsonb, timestamptz, jsonb, timestamptz) from public, anon;
revoke all on function public.delete_my_account() from public, anon;
revoke all on function public.bump_ai_usage(uuid, integer) from public, anon, authenticated;
revoke all on function public.add_ai_tokens(uuid, bigint, bigint) from public, anon, authenticated;

grant execute on function public.push_records(jsonb) to authenticated;
grant execute on function public.push_profile(jsonb, timestamptz, jsonb, timestamptz) to authenticated;
grant execute on function public.delete_my_account() to authenticated;
grant execute on function public.bump_ai_usage(uuid, integer) to service_role;
grant execute on function public.add_ai_tokens(uuid, bigint, bigint) to service_role;
