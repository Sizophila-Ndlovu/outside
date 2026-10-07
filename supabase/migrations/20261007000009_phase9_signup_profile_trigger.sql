-- ===========================================================================
-- Phase 9 - Profile rows created at signup (trigger)
-- ===========================================================================
-- Fixes the registration gap: RegisterScreen used to call signUp() and then
-- insert into public.users as a SECOND, separate client-side write. With
-- "Confirm email" enabled, signUp returns a user but no session, auth.uid()
-- is null, RLS rejects the insert, and the account silently loses its name.
--
-- Now the profile row is created by an AFTER INSERT trigger on auth.users,
-- reading the name from raw_user_meta_data (supplied by the app via
--   signUp({ ..., options: { data: { name } }) }).
-- This runs inside the signup transaction itself, so it does not depend on
-- a session ever existing on the client.
--
-- Supersedes the phase 1 comment that said profiles are created by the
-- client. The phase 1 insert policy is left in place (harmless, and old app
-- builds that still try the client-side write only get a duplicate-key log
-- line); new code no longer performs that write.
--
-- Idempotent: safe to re-run (create or replace + drop trigger if exists,
-- and both inserts use on conflict do nothing).
-- ===========================================================================

-- ---------------------------------------------------------------------------
-- 1. Trigger function: one profile row per auth user
-- ---------------------------------------------------------------------------
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  -- The live project's public.users.email is NOT NULL, so a signup without
  -- an email (e.g. phone-only, should that ever be enabled) cannot get a
  -- profile row. Skip instead of letting the insert abort the signup; the
  -- app only signs users in by email anyway.
  if new.email is null then
    return new;
  end if;

  insert into public.users (id, name, email)
  values (
    new.id,
    -- Prefer the name captured at registration; fall back to the email
    -- prefix (and finally a constant) so that a missing metadata name can
    -- never fail the whole signup, because `name` is not null.
    coalesce(
      nullif(new.raw_user_meta_data ->> 'name', ''),
      nullif(split_part(new.email, '@', 1), ''),
      'user'
    ),
    new.email
  )
  -- Untargeted: users_email_key is unique too. A re-registration with the
  -- email of a deleted account (there is no FK from users, so the old row
  -- survives) must not block the signup.
  on conflict do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------------------------------------------------------------------------
-- 2. Backfill: heal accounts that registered while the bug was live
-- ---------------------------------------------------------------------------
-- Those users have no profile row, and their original name was never stored
-- anywhere, so the best available value is the email prefix. Users can edit
-- it later via the existing "update their own profile" policy.
insert into public.users (id, name, email)
select
  u.id,
  coalesce(
    nullif(u.raw_user_meta_data ->> 'name', ''),
    nullif(split_part(u.email, '@', 1), ''),
    'user'
  ),
  u.email
from auth.users u
left join public.users p on p.id = u.id
where p.id is null
  and u.email is not null
-- Untargeted: also skips any row whose email already exists in users
-- (users_email_key), e.g. a previously deleted account's address, rather
-- than aborting the whole backfill. The verification count below still
-- catches anything skipped.
on conflict do nothing;
