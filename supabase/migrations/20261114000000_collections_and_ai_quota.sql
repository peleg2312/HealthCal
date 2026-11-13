-- Three more synced collections:
--   favorites: starred foods, so they survive sign-out and appear on every device
--   days:      the targets each day had at the time, so history is not rewritten
--              when a goal changes
--   routines:  saved strength routines
alter table public.records drop constraint if exists records_collection_check;
alter table public.records add constraint records_collection_check check (
  collection in ('foodEntries', 'customFoods', 'savedMeals', 'activities', 'water', 'weights', 'sleep', 'fasting', 'favorites', 'days', 'routines')
);

-- ---------------------------------------------------------------- AI quota
-- The first version limited requests per account only. That left three gaps:
-- a careful (stronger-model) analysis cost the same as a fast one, nothing
-- capped the project's total spend, and deleting an account and signing up
-- again reset the count. Requests are now weighted by cost, counted against a
-- stable identity (a hash of the email, which survives account deletion) and
-- against a project-wide daily ceiling.

create table if not exists public.ai_quota (
  -- 'user:<sha256 of email>' for people, '*' for the whole project.
  identity text not null,
  day date not null,
  used integer not null default 0,
  primary key (identity, day)
);

alter table public.ai_quota enable row level security;
-- No policies: only the service role (the edge function) reads or writes it.

drop function if exists public.bump_ai_usage(uuid, integer);

-- Counts one analysis of weight p_cost if both the caller's and the project's
-- allowance have room. Returns units left for the caller, -1 when the caller's
-- daily limit is reached, -2 when the project's is.
create or replace function public.bump_ai_usage(
  p_user uuid,
  p_identity text,
  p_cost integer,
  p_limit integer,
  p_global_limit integer
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  d date := (now() at time zone 'utc')::date;
  mine integer;
  everyone integer;
begin
  if p_cost < 1 then
    raise exception 'cost must be positive';
  end if;

  insert into public.ai_quota (identity, day, used)
  values (p_identity, d, p_cost)
  on conflict (identity, day) do update
    set used = public.ai_quota.used + p_cost
    where public.ai_quota.used + p_cost <= p_limit
  returning used into mine;
  -- A first request that is itself over the limit must not slip through the insert path.
  if mine is null or mine > p_limit then
    if mine is not null then
      update public.ai_quota set used = used - p_cost where identity = p_identity and day = d;
    end if;
    return -1;
  end if;

  insert into public.ai_quota (identity, day, used)
  values ('*', d, p_cost)
  on conflict (identity, day) do update
    set used = public.ai_quota.used + p_cost
    where public.ai_quota.used + p_cost <= p_global_limit
  returning used into everyone;
  if everyone is null or everyone > p_global_limit then
    if everyone is not null then
      update public.ai_quota set used = used - p_cost where identity = '*' and day = d;
    end if;
    update public.ai_quota set used = used - p_cost where identity = p_identity and day = d;
    return -2;
  end if;

  -- The per-account row stays as the owner's readable record of use.
  insert into public.ai_usage (user_id, day, requests)
  values (p_user, d, 1)
  on conflict (user_id, day) do update set requests = public.ai_usage.requests + 1;

  return p_limit - mine;
end;
$$;

-- Gives an analysis back when the model was never reached (provider outage or rate limit).
create or replace function public.refund_ai_usage(p_user uuid, p_identity text, p_cost integer)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  d date := (now() at time zone 'utc')::date;
begin
  update public.ai_quota set used = greatest(0, used - p_cost) where identity in (p_identity, '*') and day = d;
  update public.ai_usage set requests = greatest(0, requests - 1) where user_id = p_user and day = d;
end;
$$;

revoke all on function public.bump_ai_usage(uuid, text, integer, integer, integer) from public, anon, authenticated;
revoke all on function public.refund_ai_usage(uuid, text, integer) from public, anon, authenticated;
grant execute on function public.bump_ai_usage(uuid, text, integer, integer, integer) to service_role;
grant execute on function public.refund_ai_usage(uuid, text, integer) to service_role;
