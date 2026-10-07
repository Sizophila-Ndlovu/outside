-- ===========================================================================
-- Phase 4 - Likes
-- ===========================================================================
-- Shape inferred from VibePopup.fetchUserLikes() and toggleLike().
-- ===========================================================================

create table if not exists public.likes (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users (id) on delete cascade,
  post_id     uuid not null references public.posts (id) on delete cascade,
  created_at  timestamptz not null default now(),
  -- Without this a double-tap or a retry creates two rows for one like and
  -- inflates like_count permanently. VibePopup already treats a duplicate as
  -- "already liked", so enforcing it here matches intended behaviour.
  constraint likes_user_post_unique unique (user_id, post_id)
);

create index if not exists likes_post_id_idx
on public.likes (post_id);

create index if not exists likes_user_id_idx
on public.likes (user_id);

alter table public.likes enable row level security;

-- Select is open to all signed-in users so like counts can later be derived
-- from this table instead of a cached column. The app currently only reads
-- its own rows, which this also permits.
drop policy if exists "Authenticated users can view likes" on public.likes;
create policy "Authenticated users can view likes"
on public.likes
for select
to authenticated
using (true);

drop policy if exists "Users can like as themselves" on public.likes;
create policy "Users can like as themselves"
on public.likes
for insert
to authenticated
with check (auth.uid() = user_id);

-- Unliking. Scoped to your own likes, which is all toggleLike() ever does.
drop policy if exists "Users can unlike their own likes" on public.likes;
create policy "Users can unlike their own likes"
on public.likes
for delete
to authenticated
using (auth.uid() = user_id);
