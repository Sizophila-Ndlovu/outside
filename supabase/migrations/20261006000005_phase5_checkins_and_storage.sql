-- ===========================================================================
-- Phase 5 - Check-ins table and the posts storage bucket
-- ===========================================================================
-- Creates the bare checkins table. Phase 6 adds the proximity gate, the
-- uniqueness constraint and the live counter trigger.
-- ===========================================================================

create table if not exists public.checkins (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users (id) on delete cascade,
  event_id    uuid not null references public.events (id) on delete cascade,
  coordinates geometry(Point, 4326) not null,
  created_at  timestamptz not null default now()
);

create index if not exists checkins_event_id_idx
on public.checkins (event_id);

create index if not exists checkins_user_id_idx
on public.checkins (user_id);

create index if not exists checkins_coordinates_gix
on public.checkins using gist (coordinates);

-- Normalise anything written before the app sent an explicit SRID.
update public.checkins
set coordinates = ST_SetSRID(coordinates, 4326)
where ST_SRID(coordinates) = 0;

alter table public.checkins enable row level security;

-- ---------------------------------------------------------------------------
-- Storage: the "posts" bucket
-- ---------------------------------------------------------------------------
-- HostDashboardScreen uploads to `${userId}/${Date.now()}.jpg` and then calls
-- getPublicUrl(), so the bucket must be public for images to render in
-- VibePopup's <Image source={{ uri: media_url }} />.
insert into storage.buckets (id, name, public)
values ('posts', 'posts', true)
on conflict (id) do update set public = true;

-- Public read. Without this every image 400s even though the URL is correct.
drop policy if exists "Post images are publicly readable" on storage.objects;
create policy "Post images are publicly readable"
on storage.objects
for select
using (bucket_id = 'posts');

-- Write into your own folder only. storage.foldername() splits the object
-- path, so element 1 is the uploader's user id. This stops anyone from
-- overwriting or filling another user's namespace.
drop policy if exists "Users upload post images to their own folder" on storage.objects;
create policy "Users upload post images to their own folder"
on storage.objects
for insert
to authenticated
with check (
  bucket_id = 'posts'
  and (storage.foldername(name))[1] = auth.uid()::text
);

drop policy if exists "Users delete their own post images" on storage.objects;
create policy "Users delete their own post images"
on storage.objects
for delete
to authenticated
using (
  bucket_id = 'posts'
  and (storage.foldername(name))[1] = auth.uid()::text
);
