-- ===========================================================================
-- Phase 8 - Realtime
-- ===========================================================================
-- MapScreen and VibePopup subscribe to postgres_changes on `events` and
-- `posts`. Realtime only delivers changes for tables that are members of the
-- `supabase_realtime` publication, so this migration adds them.
--
-- Delivery honours the subscriber's SELECT policies: a change is sent to a
-- client only if that client could SELECT the affected row. Both published
-- tables already carry permissive `using (true)` SELECT policies for
-- `authenticated` (phases 2 and 3), so no policy change is needed here.
--
-- Deliberately NOT published:
--   likes     - no screen subscribes to individual likes; posts.like_count
--               (phase 7) already carries the aggregate people see, and the
--               trigger that maintains it is itself a change on posts.
--   checkins  - same reasoning; live_checkin_count on events is the shared
--               number, maintained by the phase 6 trigger.
--
-- Idempotent: each table is added only if it is not already a member
-- (a bare ALTER PUBLICATION ... ADD TABLE errors on the second run).
-- ===========================================================================

do $$
begin
  if not exists (
    select 1 from pg_publication where pubname = 'supabase_realtime'
  ) then
    raise notice 'Publication supabase_realtime does not exist; skipping. Hosted Supabase projects create it by default.';
    return;
  end if;

  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'events'
  ) then
    alter publication supabase_realtime add table public.events;
  end if;

  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'posts'
  ) then
    alter publication supabase_realtime add table public.posts;
  end if;
end
$$;
