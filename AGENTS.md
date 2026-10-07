# Agent instructions for this repo

## Read the versioned docs that match this project

This app is on **Expo SDK 54**. Read
https://docs.expo.dev/versions/v54.0.0/ before writing any code.

Do not use unversioned or "latest" Expo docs, and do not assume APIs from
SDK 55/56. Exact pinned versions that matter:

| Package | Version |
| --- | --- |
| expo | ~54.0.37 |
| react-native | 0.81.5 |
| react | 19.1.0 |
| @supabase/supabase-js | ^2.107.0 |
| react-native-maps | 1.20.1 |
| expo-image-picker | ~17.0.11 |
| expo-location | ~19.0.8 |

SDK 54 note: `ImagePicker.MediaTypeOptions` is deprecated but **not yet
removed**. In the installed 17.0.11, `parseMediaTypes` still maps the legacy
enum to `['images']` and only logs a warning, so existing code runs. Prefer the
array form `mediaTypes: ['images']` in new code; the library comments indicate
the enum is slated for removal in a future release.

## Architecture facts you cannot infer from the code alone

**Row Level Security is the only security boundary.** There is no backend
server. Every Supabase call goes straight from the phone with the anon key,
so anything not enforced by an RLS policy in `supabase/migrations/` is not
enforced at all. Never "fix" a permission error by relaxing a policy without
saying so explicitly.

**`lib/supabase.js` is tracked and contains no secrets.** Credentials come
from `EXPO_PUBLIC_*` variables in a local `.env` (see `.env.example`). This
file used to be gitignored, which is why a fresh clone could not build.

**`app.json` is tracked; `app.config.js` injects secrets over it.** The Google
Maps API key is read from `EXPO_PUBLIC_GOOGLE_MAPS_API_KEY` at config-eval
time. Never hardcode a key into `app.json`.

**Coordinates use SRID 4326.** Insert as `SRID=4326;POINT(lng lat)` —
longitude first. A bare `POINT(...)` parses as SRID 0 and breaks the
`::geography` proximity check. Reads come back as GeoJSON, so
`coordinates[0]` is longitude and `coordinates[1]` is latitude.

**The check-in proximity gate is server-side by design.** `phase6` restricts
check-in inserts to within 100 m of a live event using `ST_DWithin`. The
client only reports its position; it cannot approve its own check-in.

## Working agreements

Migrations in `supabase/migrations/` are numbered by phase and are idempotent
— keep new changes idempotent too, and add a new migration file rather than
editing one that may already have been applied.

`like_count` on `posts` is derived from the `likes` table by a trigger
(`phase7`). Do not reintroduce client-side counter updates — and note that
the `posts` UPDATE policy is author-only, so a non-author cannot write to
`posts` even to adjust a count.

**Profiles are created by a trigger, not by the client.** `phase9` installs
`handle_new_user` on `auth.users`, reading the name from `signUp`'s
`options.data`. Do not reintroduce a client-side profile insert — with email
confirmation on there is no session at that point, RLS rejects the write, and
the name is lost, which is exactly the bug this replaced.

**Commit and push each completed addition.** The owner works solo on `main`.
After a change is done and checked, commit it (specific files, clear message)
and push to `origin` — do not leave finished work uncommitted.

Nothing in this repo is covered by tests yet. When you change behaviour, say
what you verified and how.
