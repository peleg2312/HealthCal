-- "Report this answer": a person flags an AI answer (the coach's, or an AI food estimate's).
--
-- Insert-only for the person, about themselves: a signed-in person may add a row whose user_id is
-- their own, and nothing else. Nobody but the service role (the owner, from the dashboard) reads it;
-- there is no select, update or delete for the API roles, so the app sends with `Prefer:
-- return=minimal` (supabase-js `insert()` without `.select()`).
--
-- What a row holds: the answer as it was shown (at most 2,000 characters), the question only when the
-- person ticked "Include my question" (at most 500), a kind and one reason from a short fixed list.
-- Nothing else: no profile, no note, no week. Rows go with the account.

create table if not exists public.ai_reports (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  kind text not null check (kind in ('coach_answer', 'food_estimate')),
  reason text not null check (reason in ('unsafe', 'wrong', 'offensive', 'off_topic', 'other')),
  answer text not null check (char_length(answer) between 1 and 2000),
  question text check (question is null or char_length(question) between 1 and 500),
  created_at timestamptz not null default now()
);

create index if not exists ai_reports_user_day_idx on public.ai_reports (user_id, created_at);

alter table public.ai_reports enable row level security;

revoke all on table public.ai_reports from public, anon, authenticated;
-- Only these columns: the id and the time are the server's.
grant insert (user_id, kind, reason, answer, question) on table public.ai_reports to authenticated;
grant all on table public.ai_reports to service_role;

drop policy if exists ai_reports_insert_own on public.ai_reports;
create policy ai_reports_insert_own on public.ai_reports
  for insert to authenticated
  with check ((select auth.uid()) = user_id);

-- At most 20 reports per person in any 24 hours, so the table cannot be flooded. It counts as the
-- table's owner, since the person cannot read the table. An advisory lock per person is taken before
-- counting, so twenty reports sent at the same instant from two devices cannot all pass the count.
create or replace function public.ai_reports_limit()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  perform pg_advisory_xact_lock(hashtext('ai_reports:' || new.user_id::text));
  if (select count(*) from public.ai_reports where user_id = new.user_id and created_at > now() - interval '24 hours') >= 20 then
    raise exception 'report_limit' using errcode = 'P0001', hint = 'At most 20 reports a day.';
  end if;
  return new;
end;
$$;

revoke all on function public.ai_reports_limit() from public, anon, authenticated;

drop trigger if exists ai_reports_limit on public.ai_reports;
create trigger ai_reports_limit before insert on public.ai_reports
  for each row execute function public.ai_reports_limit();
