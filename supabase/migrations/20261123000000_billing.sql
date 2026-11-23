-- Free and paid plans: what the server keeps about a paid plan, and nothing more.
--
-- billing_entitlements: one row per person, entitlement ('plus') and source (a person may hold rows
--   from two sources, e.g. a web purchase and later a store one), written only by the billing edge
--   function (supabase/functions/billing) with the service role, from the payment provider's current
--   state. Whether a plan is active is decided in one place, plans.ts `activePlan`: state in active,
--   trialing, in_grace, canceling, past_due, the row's environment equal to BILLING_ENVIRONMENT, and
--   coalesce(grace_until, period_end) > now (period_end + 7 days for a past_due row with no grace).
-- billing_events: the provider event ids already handled, so a repeated webhook is applied once, and
--   the tombstones of plans released for an account deletion or ended because their person was gone
--   (source, customer id, subscription id), kept after the account goes.
-- billing_calls: the recent refresh and checkout calls per person, so neither can hammer the
--   provider (billing_take_call; the rules are CALL_RULES in billing.ts).
--
-- Row-level security is on and there is NO policy, and every privilege is taken from the API roles:
-- the app never reads these tables (it asks the billing function), so a signed-in person can neither
-- read nor write a plan, their own included. No card, address or price paid is ever stored here.
-- The plan is never in profiles, settings or a synced collection: those are the person's own to write.

create table if not exists public.billing_entitlements (
  user_id uuid not null references auth.users (id) on delete cascade,
  entitlement text not null default 'plus' check (entitlement in ('plus')),
  source text not null check (source in ('paddle', 'polar', 'stripe', 'app_store', 'play_store', 'promotional', 'test')),
  provider_customer_id text check (char_length(provider_customer_id) <= 200),
  provider_subscription_id text check (char_length(provider_subscription_id) <= 200),
  product_id text check (char_length(product_id) <= 200),
  period text check (period in ('month', 'year')),
  state text not null check (state in ('active', 'trialing', 'in_grace', 'past_due', 'canceling', 'expired', 'revoked')),
  -- Paid through.
  period_end timestamptz,
  -- A failed renewal's grace (period end + 7 days, or the provider's own).
  grace_until timestamptz,
  cancel_at_period_end boolean not null default false,
  environment text not null default 'live' check (environment in ('sandbox', 'live')),
  -- When the current subscription began (the 14-day withdrawal window counts from it).
  started_at timestamptz,
  -- The provider's own time for this state: an older state never overwrites a newer one.
  provider_updated_at timestamptz not null,
  updated_at timestamptz not null default now(),
  primary key (user_id, entitlement, source)
);

create index if not exists billing_entitlements_customer_idx on public.billing_entitlements (source, provider_customer_id);

create table if not exists public.billing_events (
  provider text not null check (char_length(provider) <= 40),
  event_id text not null check (char_length(event_id) <= 200),
  type text not null check (char_length(type) <= 100),
  -- Kept when the account goes, without saying whose it was.
  user_id uuid references auth.users (id) on delete set null,
  -- A tombstone's provider ids (type 'released', 'orphan_ended', 'unmatched' or 'customer_kept'), so the owner can still cancel
  -- and refund at the payment company and later events can be matched. Null for ordinary events.
  customer_id text check (char_length(customer_id) <= 200),
  subscription_id text check (char_length(subscription_id) <= 200),
  received_at timestamptz not null default now(),
  primary key (provider, event_id)
);

create table if not exists public.billing_calls (
  user_id uuid not null references auth.users (id) on delete cascade,
  kind text not null check (kind in ('refresh', 'checkout')),
  at timestamptz not null default clock_timestamp()
);

create index if not exists billing_calls_user_kind_idx on public.billing_calls (user_id, kind, at);

alter table public.billing_entitlements enable row level security;
alter table public.billing_events enable row level security;
alter table public.billing_calls enable row level security;
-- No policies. And no privileges for the API roles either, so even a policy added by mistake later
-- would not open them.
revoke all on table public.billing_entitlements from public, anon, authenticated;
revoke all on table public.billing_events from public, anon, authenticated;
revoke all on table public.billing_calls from public, anon, authenticated;
grant all on table public.billing_entitlements to service_role;
grant all on table public.billing_events to service_role;
grant all on table public.billing_calls to service_role;

-- Writes one row from the provider's current state (p_row: the columns as JSON), keyed by person,
-- entitlement and source. A row whose provider_updated_at is older than the stored one is ignored, so
-- two webhooks racing cannot put an older state back. Returns whether the row was written. Service
-- role only.
create or replace function public.billing_put_entitlement(p_user uuid, p_row jsonb)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  n integer;
begin
  insert into public.billing_entitlements as e (
    user_id, entitlement, source, provider_customer_id, provider_subscription_id, product_id, period,
    state, period_end, grace_until, cancel_at_period_end, environment, started_at, provider_updated_at, updated_at
  ) values (
    p_user,
    coalesce(p_row->>'entitlement', 'plus'),
    p_row->>'source',
    p_row->>'provider_customer_id',
    p_row->>'provider_subscription_id',
    p_row->>'product_id',
    p_row->>'period',
    p_row->>'state',
    (p_row->>'period_end')::timestamptz,
    (p_row->>'grace_until')::timestamptz,
    coalesce((p_row->>'cancel_at_period_end')::boolean, false),
    coalesce(p_row->>'environment', 'live'),
    (p_row->>'started_at')::timestamptz,
    (p_row->>'provider_updated_at')::timestamptz,
    now()
  )
  on conflict (user_id, entitlement, source) do update set
    provider_customer_id = excluded.provider_customer_id,
    provider_subscription_id = excluded.provider_subscription_id,
    product_id = excluded.product_id,
    period = excluded.period,
    state = excluded.state,
    period_end = excluded.period_end,
    grace_until = excluded.grace_until,
    cancel_at_period_end = excluded.cancel_at_period_end,
    environment = excluded.environment,
    started_at = excluded.started_at,
    provider_updated_at = excluded.provider_updated_at,
    updated_at = now()
  where e.provider_updated_at <= excluded.provider_updated_at;
  get diagnostics n = row_count;
  return n > 0;
end;
$$;

-- Records a webhook event id; false when it was already recorded (the event is then skipped).
create or replace function public.billing_record_event(p_provider text, p_event_id text, p_type text, p_user uuid)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  n integer;
begin
  insert into public.billing_events (provider, event_id, type, user_id)
  values (p_provider, p_event_id, p_type, p_user)
  on conflict (provider, event_id) do nothing;
  get diagnostics n = row_count;
  return n > 0;
end;
$$;

-- A tombstone: a plan released so its account could be deleted ('released'), a subscription
-- ended at the provider because its person no longer exists ('orphan_ended'), a live subscription
-- whose person could not be matched and that was left alone ('unmatched': no external id, one that
-- is not ours, or the auth service could not say), or a customer record the provider could not
-- remove when its account was deleted ('customer_kept'). Kept without the person once the account
-- goes (user_id is set null), with the source and the provider's ids.
create or replace function public.billing_record_release(p_provider text, p_kind text, p_customer text, p_subscription text, p_user uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_kind not in ('released', 'orphan_ended', 'unmatched', 'customer_kept') then
    raise exception 'unknown release kind';
  end if;
  insert into public.billing_events (provider, event_id, type, user_id, customer_id, subscription_id)
  values (p_provider, p_kind || ':' || gen_random_uuid()::text, p_kind, p_user, p_customer, p_subscription);
end;
$$;

-- Counts one refresh or checkout call for a person when the rule allows it: none in the last
-- p_gap_ms milliseconds and fewer than p_per_hour in the last hour. Returns whether it was counted.
-- The count is in the database, so it holds across every running copy of the function; one advisory
-- lock per person and kind makes two calls at the same instant count one after the other.
create or replace function public.billing_take_call(p_user uuid, p_kind text, p_gap_ms integer, p_per_hour integer)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  t timestamptz := clock_timestamp();
  latest timestamptz;
  n integer;
begin
  perform pg_advisory_xact_lock(hashtext('billing_calls:' || p_user::text || ':' || p_kind));
  delete from public.billing_calls where user_id = p_user and kind = p_kind and at <= t - interval '1 hour';
  select max(at), count(*) into latest, n from public.billing_calls where user_id = p_user and kind = p_kind;
  if n >= p_per_hour then
    return false;
  end if;
  if latest is not null and latest > t - make_interval(secs => p_gap_ms / 1000.0) then
    return false;
  end if;
  insert into public.billing_calls (user_id, kind, at) values (p_user, p_kind, t);
  return true;
end;
$$;

revoke all on function public.billing_put_entitlement(uuid, jsonb) from public, anon, authenticated;
revoke all on function public.billing_record_event(text, text, text, uuid) from public, anon, authenticated;
revoke all on function public.billing_record_release(text, text, text, text, uuid) from public, anon, authenticated;
revoke all on function public.billing_take_call(uuid, text, integer, integer) from public, anon, authenticated;
grant execute on function public.billing_put_entitlement(uuid, jsonb) to service_role;
grant execute on function public.billing_record_event(text, text, text, uuid) to service_role;
grant execute on function public.billing_record_release(text, text, text, text, uuid) to service_role;
grant execute on function public.billing_take_call(uuid, text, integer, integer) to service_role;
