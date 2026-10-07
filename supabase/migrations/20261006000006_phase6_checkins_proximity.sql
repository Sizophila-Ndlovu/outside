-- ===========================================================================
-- Phase 6 - Check-ins and Live Pulse
-- ===========================================================================
-- Adds proximity-gated check-ins that feed a live count on events.
--
-- This is the original committed phase6_checkins.sql, moved into
-- supabase/migrations/ and made idempotent so it can be re-run safely.
-- The logic and reasoning are unchanged.
-- ===========================================================================

-- Live check-in counter, kept in sync via trigger below.
alter table public.events
add column if not exists live_checkin_count integer not null default 0;

-- One check-in per user per event.
do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'unique_checkin_per_event'
  ) then
    alter table public.checkins
    add constraint unique_checkin_per_event unique (user_id, event_id);
  end if;
end
$$;

-- Users can only see their own check-ins - the aggregate count on
-- events is the only thing anyone else sees.
drop policy if exists "Users can view their own checkins" on public.checkins;
create policy "Users can view their own checkins"
on public.checkins
for select
to authenticated
using (auth.uid() = user_id);

-- The actual gate: check in as yourself, only within 100m of an
-- event that's currently live. Casts to geography for real
-- meter-based distance (raw geometry measures in degrees).
drop policy if exists "Users can check in only near a live event" on public.checkins;
create policy "Users can check in only near a live event"
on public.checkins
for insert
to authenticated
with check (
  auth.uid() = user_id
  and exists (
    select 1
    from public.events
    where events.id = checkins.event_id
      and events.is_live = true
      and ST_DWithin(
        events.coordinates::geography,
        checkins.coordinates::geography,
        100
      )
  )
);

-- Keeps live_checkin_count in sync the moment a check-in lands.
-- security definer: the checking-in user has no UPDATE rights on
-- events, so this runs with the function owner's privileges instead.
-- Safe because it's narrow - one hardcoded update, no caller input
-- beyond the event_id that already passed the proximity policy above.
create or replace function public.increment_checkin_count()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.events
  set live_checkin_count = live_checkin_count + 1
  where id = new.event_id;
  return new;
end;
$$;

-- set search_path added above: a security definer function without a pinned
-- search_path can be hijacked by objects in a schema the caller controls.

drop trigger if exists on_checkin_insert on public.checkins;
create trigger on_checkin_insert
after insert on public.checkins
for each row
execute function public.increment_checkin_count();
