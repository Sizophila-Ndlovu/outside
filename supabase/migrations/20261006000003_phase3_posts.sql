-- ===========================================================================
-- Phase 3 - Posts (photos attached to a live event)
-- ===========================================================================
-- Shape inferred from HostDashboardScreen.pickAndPost() and VibePopup.
-- ===========================================================================

create table if not exists public.posts (
  id          uuid primary key default gen_random_uuid(),
  event_id    uuid not null references public.events (id) on delete cascade,
  user_id     uuid not null references auth.users (id) on delete cascade,
  caption     text,
  media_url   text not null,
  media_type  text not null default 'image',
  like_count  integer not null default 0,
  created_at  timestamptz not null default now()
);

-- VibePopup fetches every post for one event, newest first.
create index if not exists posts_event_created_idx
on public.posts (event_id, created_at desc);

create index if not exists posts_user_id_idx
on public.posts (user_id);

alter table public.posts enable row level security;

drop policy if exists "Authenticated users can view posts" on public.posts;
create policy "Authenticated users can view posts"
on public.posts
for select
to authenticated
using (true);

-- Posts may only be added to an event that is currently live, so a photo
-- cannot be attached to something that already ended.
drop policy if exists "Users can post to live events" on public.posts;
create policy "Users can post to live events"
on public.posts
for insert
to authenticated
with check (
  auth.uid() = user_id
  and exists (
    select 1 from public.events
    where events.id = posts.event_id
      and events.is_live = true
  )
);

-- Authors may edit their own posts. Deliberately NOT open to everyone:
-- like_count is maintained by a trigger (phase 7), so no client needs
-- UPDATE rights on posts in order to like something.
drop policy if exists "Authors can update their own posts" on public.posts;
create policy "Authors can update their own posts"
on public.posts
for update
to authenticated
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

-- Authors can delete their own posts; the event host can moderate theirs.
drop policy if exists "Authors and hosts can delete posts" on public.posts;
create policy "Authors and hosts can delete posts"
on public.posts
for delete
to authenticated
using (
  auth.uid() = user_id
  or exists (
    select 1 from public.events
    where events.id = posts.event_id
      and events.host_id = auth.uid()
  )
);
