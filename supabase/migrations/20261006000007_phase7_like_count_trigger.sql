-- ===========================================================================
-- Phase 7 - Server-side like counts
-- ===========================================================================
-- WHY THIS EXISTS
-- VibePopup used to maintain posts.like_count with a second client-side
-- UPDATE after every insert/delete on likes. That had three problems:
--
--   1. Two separate writes with no transaction, so an interrupted request
--      left the row in likes and the counter out of step permanently.
--   2. Concurrent likes on the same post raced on a read-modify-write of the
--      same integer, so counts drifted under any real load.
--   3. It required granting UPDATE on posts to every authenticated user,
--      meaning anyone could rewrite anyone else's caption or media_url.
--
-- The counter is now derived from the likes table by a trigger, using a
-- recount rather than an increment. A recount is self-healing: even if it
-- ever runs concurrently, the last writer stores a value that was correct at
-- some point, and it can never accumulate permanent drift.
--
-- This mirrors the pattern already used for events.live_checkin_count in
-- phase 6.
-- ===========================================================================

create or replace function public.refresh_post_like_count()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  target_post_id uuid;
begin
  -- On DELETE the row that changed is OLD; on INSERT it is NEW.
  target_post_id := case
    when tg_op = 'DELETE' then old.post_id
    else new.post_id
  end;

  update public.posts
  set like_count = (
    select count(*)::integer
    from public.likes
    where likes.post_id = target_post_id
  )
  where id = target_post_id;

  -- AFTER triggers should return NULL; the return value is ignored and
  -- returning NEW would be misleading about what this function does.
  return null;
end;
$$;

-- security definer is required because the phase 3 UPDATE policy only allows
-- post authors to touch their own rows, and a user liking someone else's
-- post is not its author. It is safe here for the same reason as phase 6:
-- one hardcoded update, no caller input beyond a post_id that is already
-- constrained by the likes table's foreign key and insert policy.
-- search_path is pinned so the function cannot be hijacked via a
-- caller-controlled schema.

drop trigger if exists on_like_change on public.likes;
create trigger on_like_change
after insert or delete on public.likes
for each row
execute function public.refresh_post_like_count();

-- Heal any drift already present from the old client-side approach.
-- No-op on a fresh database; on a live one this is the whole point.
update public.posts p
set like_count = sub.actual
from (
  select post_id, count(*)::integer as actual
  from public.likes
  group by post_id
) sub
where p.id = sub.post_id
  and p.like_count <> sub.actual;

-- Posts with zero likes are not covered by the join above.
update public.posts
set like_count = 0
where like_count <> 0
  and not exists (select 1 from public.likes where likes.post_id = posts.id);

-- Drop the permissive policy that the old client-side counter needed, in
-- case it exists on a database built before phase 3 was corrected.
drop policy if exists "Users can update post like counts" on public.posts;
