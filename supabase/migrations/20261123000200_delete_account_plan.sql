-- Deleting an account while a paid plan is open would leave the payment company charging a person
-- who no longer exists. The app asks the billing function to end the plan first (`cancel-now`), but
-- every copy of the app from before plans calls delete_my_account directly. So the function itself
-- now refuses, with 'plan_active', while the person has a billing_entitlements row that is not
-- expired or revoked, whatever its dates say. A promotional grant (nothing is charged) never blocks.
-- `cancel-now` closes the rows (ended at the provider, or with force:true released and kept as a
-- tombstone in billing_events), after which this goes ahead as before.
--
-- Same signature and grants as 20261113000000_init.sql (create or replace keeps the privileges).

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
  if exists (
    select 1 from public.billing_entitlements
    where user_id = auth.uid()
      and state not in ('expired', 'revoked')
      and source <> 'promotional'
  ) then
    raise exception 'plan_active' using errcode = 'P0001', hint = 'End the paid plan first: the billing function, action cancel-now.';
  end if;
  delete from auth.users where id = auth.uid();
end;
$$;

revoke all on function public.delete_my_account() from public, anon;
grant execute on function public.delete_my_account() to authenticated;
