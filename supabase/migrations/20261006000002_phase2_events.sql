-- ===========================================================================
-- Phase 2 - Events
-- ===========================================================================
-- Shape inferred from HostDashboardScreen.goLive(), MapScreen and phase 6.
--
-- COORDINATE SRID - READ THIS
-- The app inserts WKT like `POINT(lng lat)`, which PostGIS parses as SRID 0.
-- Inserting SRID 0 into a geometry(Point, 4326) column raises
--   "Geometry SRID (0) does not match column SRID (4326)".
-- So either your live column is unconstrained `geometry`, or the insert is
-- already failing. This migration declares the correct constrained type and
-- normalises any SRID-0 rows, and the app is being updated to send an
-- explicit `SRID=4326;POINT(...)` prefix - which is accepted by BOTH a
-- constrained and an unconstrained column, so it is safe either way.
-- ===========================================================================

create table if not exists public.events (
  id            uuid primary key default gen_random_uuid(),
  -- References auth.users rather than public.users on purpose: auth.users is
  -- guaranteed to exist for any authenticated caller, so going live can never
  -- fail because a profile row is missing. Compare with your live schema.
  host_id       uuid not null references auth.users (id) on delete cascade,
  title         text not null,
  description   text,
  event_type    text not null default 'popup',
  coordinates   geometry(Point, 4326) not null,
  location_name text not null,
  is_live       boolean not null default false,
  created_at    timestamptz not null default now(),
  ended_at      timestamptz
  -- live_checkin_count is deliberately NOT here; phase 6 adds it.
);

-- Repair rows written before the app started sending an explicit SRID.
-- No-op on a fresh database.
update public.events
set coordinates = ST_SetSRID(coordinates, 4326)
where ST_SRID(coordinates) = 0;

-- Spatial index: the map query and the phase 6 ST_DWithin proximity test both
-- filter on coordinates, and without GiST they become full table scans.
create index if not exists events_coordinates_gix
on public.events using gist (coordinates);

-- The map only ever asks for live events.
create index if not exists events_is_live_idx
on public.events (is_live) where is_live = true;

create index if not exists events_host_id_idx
on public.events (host_id);

alter table public.events enable row level security;

-- Anyone signed in can see every event; MapScreen filters is_live client-side.
drop policy if exists "Authenticated users can view events" on public.events;
create policy "Authenticated users can view events"
on public.events
for select
to authenticated
using (true);

drop policy if exists "Users can host their own events" on public.events;
create policy "Users can host their own events"
on public.events
for insert
to authenticated
with check (auth.uid() = host_id);

-- Needed so a host can end their own event (is_live=false, ended_at=now()).
drop policy if exists "Hosts can update their own events" on public.events;
create policy "Hosts can update their own events"
on public.events
for update
to authenticated
using (auth.uid() = host_id)
with check (auth.uid() = host_id);

drop policy if exists "Hosts can delete their own events" on public.events;
create policy "Hosts can delete their own events"
on public.events
for delete
to authenticated
using (auth.uid() = host_id);
