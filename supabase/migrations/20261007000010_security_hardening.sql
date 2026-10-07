-- ===========================================================================
-- Security hardening - items flagged by `supabase db advisors`
-- ===========================================================================
-- Runs after phase 9. Fixes the actionable items the security advisors
-- flagged on the live project:
--
--   1. spatial_ref_sys (PostGIS). On the live project it sits in `public`
--      and shipped without RLS, while anon/authenticated hold full
--      INSERT/UPDATE/DELETE grants on it. The contents are world-readable
--      EPSG metadata, so the correct fix is: RLS on, read-only for API
--      roles. This item is best-effort: the live table belongs to
--      `supabase_admin`, and the role migrations run as (`postgres`) is
--      neither the owner nor a member of that role, so Postgres refuses
--      the ALTER. The block catches that, raises a notice, and moves on
--      so items 2 and 3 still apply. Residual: anon/authenticated can
--      still attempt writes to this table on the live project; it holds
--      no app or user data.
--   2. The live copy of increment_checkin_count() (phase 6) predates the
--      search_path pin that phase 6's file carries, so the live database
--      still shows the "mutable search path" lint. This pins it there too.
--   3. handle_new_user() (phase 9) is executable via /rest/v1/rpc by anon
--      and authenticated roles. PostgREST refuses to route
--      trigger-returning functions, but we revoke EXECUTE outright anyway
--      (from PUBLIC, anon, authenticated), then grant it back to
--      supabase_auth_admin alone - the role GoTrue signs users up with,
--      and the role that fires the on_auth_user_created trigger. Verify
--      with a throwaway signup after applying: the profile row must still
--      be created automatically.
--
-- Deliberately left alone:
--   - rls_auto_enable() and st_estimatedextent() - internal Supabase and
--     PostGIS functions; flagged in every project that has them.
--   - increment_checkin_count()'s own "executable by anon/authenticated"
--     warnings: it returns `trigger`, and PostgreSQL refuses to run such
--     functions outside a trigger ("ERROR: trigger functions can only be
--     called as triggers", verified on this project), so the
--     /rest/v1/rpc route cannot execute it no matter what the grants
--     say. Revoking from PUBLIC would also strip the grant held by
--     `authenticated` - the role that fires it on check-in inserts - so
--     the grants stay as phase 6 left them.
--   - `extension_in_public` (PostGIS lives in `public` on the live
--     project; this repo's migrations install it into `extensions`).
--     Relocating it on live rewrites every existing spatial type
--     reference for no data-safety gain - deferred.
--   - Leaked password protection is an Auth dashboard toggle, not SQL.
--   - The `auth_rls_initplan` performance hints ((select auth.uid())
--     wrapping): no measurable impact at beta scale, and mass-rewriting
--     live policies for a lint is riskier than the lint. Revisit if a
--     query budget ever appears.
--
-- Idempotent: re-running is safe.
-- ===========================================================================

-- 1. spatial_ref_sys: enable RLS, allow reads only. Best-effort - see
--    the header. Guarded two ways: the table may not exist at all (on a
--    database built from this repo's migrations PostGIS lives in the
--    `extensions` schema, so this block is a no-op), and the ALTER may
--    be refused for ownership on projects where the table belongs to
--    supabase_admin rather than the migration role.
do $$
begin
  if exists (
    select 1 from pg_tables
    where schemaname = 'public' and tablename = 'spatial_ref_sys'
  ) then
    begin
      execute 'alter table public.spatial_ref_sys enable row level security';

      if not exists (
        select 1 from pg_policies
        where schemaname = 'public'
          and tablename = 'spatial_ref_sys'
          and policyname = 'SRIDs are public metadata'
      ) then
        execute $policy$
          create policy "SRIDs are public metadata"
          on public.spatial_ref_sys
          for select
          to anon, authenticated
          using (true)
        $policy$;
      end if;
    exception
      when insufficient_privilege then
        raise notice 'spatial_ref_sys is owned by another role; RLS skipped (see migration header)';
    end;
  end if;
end
$$;

-- 2. Pin the check-in counter's search path, matching phase 6's file.
alter function public.increment_checkin_count() set search_path = public;

-- 3. Signup trigger function: not callable through the API.
revoke execute on function public.handle_new_user() from public, anon, authenticated;

-- ...but supabase_auth_admin (the role GoTrue signs users up with, and so
-- the role that fires the on_auth_user_created trigger) held its execute
-- only via the PUBLIC grant that just went away. Grant it back to that
-- one role explicitly, so exactly the signup path can run it.
grant execute on function public.handle_new_user() to supabase_auth_admin;
