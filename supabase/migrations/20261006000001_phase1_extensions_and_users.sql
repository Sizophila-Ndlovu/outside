-- ===========================================================================
-- Phase 1 - Extensions and user profiles
-- ===========================================================================
-- RECONSTRUCTION NOTICE
-- This migration was reverse-engineered from the application code (it was
-- never committed). Before applying it to your existing Supabase project,
-- capture the real schema with `supabase db pull` and diff the two. Apply
-- these files as-is only to a FRESH database.
--
-- Every statement is idempotent so re-running is safe.
-- ===========================================================================

-- PostGIS provides the geometry/geography types used for event and check-in
-- coordinates, including the ST_DWithin proximity test in phase 6.
create extension if not exists postgis with schema extensions;

-- gen_random_uuid() is built in on Postgres 13+, but pgcrypto is enabled
-- anyway because Supabase projects commonly expect it.
create extension if not exists pgcrypto with schema extensions;

-- ---------------------------------------------------------------------------
-- public.users - profile data that cannot live in auth.users
-- ---------------------------------------------------------------------------
-- RegisterScreen inserts one of these right after signUp(), with the shape
-- { id, name, email, user_type: 'explorer' }.
create table if not exists public.users (
  id          uuid primary key references auth.users (id) on delete cascade,
  name        text not null,
  email       text,
  -- Kept unconstrained on purpose: the app only ever writes 'explorer' today,
  -- but a check constraint here would reject future values during rollout.
  user_type   text not null default 'explorer',
  created_at  timestamptz not null default now()
);

alter table public.users enable row level security;

drop policy if exists "Users can view all profiles" on public.users;
create policy "Users can view all profiles"
on public.users
for select
to authenticated
using (true);

-- Profiles are created by the client, not by a trigger, so the insert policy
-- must allow a user to create exactly their own row.
drop policy if exists "Users can insert their own profile" on public.users;
create policy "Users can insert their own profile"
on public.users
for insert
to authenticated
with check (auth.uid() = id);

drop policy if exists "Users can update their own profile" on public.users;
create policy "Users can update their own profile"
on public.users
for update
to authenticated
using (auth.uid() = id)
with check (auth.uid() = id);

drop policy if exists "Users can delete their own profile" on public.users;
create policy "Users can delete their own profile"
on public.users
for delete
to authenticated
using (auth.uid() = id);
