# outside

**go outside. live in reality.**

A spontaneous-events app. A host taps "go live" and a marker appears on the
map for everyone nearby. People walk over, check in (only possible within
100 m of the event, enforced in Postgres), post photos into the event's feed,
and like what they see. When the host ends the event, the marker disappears.

Built with Expo (React Native) and Supabase. There is no backend server —
Row Level Security policies are the security boundary.

---

## Quick start

### 1. Prerequisites

- Node.js 18 or newer (developed against Node 24)
- npm
- A Supabase project — [create one free](https://supabase.com/dashboard)
- Expo Go on your phone, or an EAS development build
  (`react-native-maps` runs in Expo Go on iOS and Android; it will not work in
  a browser)

### 2. Install

```bash
git clone https://github.com/Sizophila-Ndlovu/outside.git
cd outside
npm install
```

### 3. Configure environment

```bash
cp .env.example .env
```

Then fill in three values. All of them must keep the `EXPO_PUBLIC_` prefix or
Expo will not expose them to the app.

| Variable | Where to find it |
| --- | --- |
| `EXPO_PUBLIC_SUPABASE_URL` | Supabase dashboard → your project → **Project Settings → API → Project URL** |
| `EXPO_PUBLIC_SUPABASE_ANON_KEY` | Same page → **anon / public** key |
| `EXPO_PUBLIC_GOOGLE_MAPS_API_KEY` | [Google Cloud Console](https://console.cloud.google.com/google/maps-apis) — see below |

Use the **anon** key, never `service_role`. The anon key is safe to ship in a
client build precisely because RLS constrains it; `service_role` bypasses RLS
entirely and would let any user read or write every row.

### 4. Set up the database

Apply the migrations in `supabase/migrations/` in filename order. Easiest path
is the Supabase dashboard → **SQL Editor**, pasting each file in turn:

1. `...phase1_extensions_and_users.sql`
2. `...phase2_events.sql`
3. `...phase3_posts.sql`
4. `...phase4_likes.sql`
5. `...phase5_checkins_and_storage.sql`
6. `...phase6_checkins_proximity.sql`
7. `...phase7_like_count_trigger.sql`
8. `...phase8_realtime.sql`
9. `...phase9_signup_profile_trigger.sql`

Or with the [Supabase CLI](https://supabase.com/docs/guides/cli):

```bash
supabase link --project-ref <your-project-ref>
supabase db push
```

**If you already have a live project with data**, do not apply these blindly.
They were reconstructed from the application code because the original
migrations were never committed. Capture what actually exists first and diff:

```bash
supabase db pull
```

Also confirm in the dashboard that email confirmation is configured the way
you expect (**Authentication → Sign In / Providers → Email**). If "Confirm
email" is on, a newly registered user cannot sign in until they click the
link, and the app does not currently tell them so.

### 5. Google Maps key (Android)

iOS uses Apple Maps and needs no key. On Android, `react-native-maps` renders
a **blank grey grid** without one.

1. Go to [Google Cloud Console](https://console.cloud.google.com/google/maps-apis) and create a project
2. Enable **Maps SDK for Android**
3. Create an API key under **Credentials**
4. Restrict it to Android apps using package `com.sizophilandlovu.outside`
   plus your signing key's SHA-1 fingerprint
5. Put it in `.env` as `EXPO_PUBLIC_GOOGLE_MAPS_API_KEY`

`app.config.js` reads that variable and injects it into the native config at
build time, so the key never needs to be committed.

### 6. Run

```bash
npx expo start --clear
```

Use `--clear` after any change to `.env`. Environment variables are inlined
when Metro bundles the app, so a plain hot reload will not pick them up.

Then press `a` for an Android emulator, `i` for iOS, or scan the QR code with
Expo Go.

---

## Project structure

```
app.json                     non-secret Expo config (tracked)
app.config.js                merges over app.json, injects secrets from .env
lib/supabase.js              Supabase client with AsyncStorage session persistence
src/
  navigation/AppNavigator.js auth-gated native stack
  hooks/useAuth.js           session state via onAuthStateChange
  screens/
    LoginScreen.js           sign in
    RegisterScreen.js        sign up + create profile row
    MapScreen.js             live map with event markers
    HostDashboardScreen.js   go live, post photos, end event
  components/VibePopup.js    bottom sheet: feed, likes, check-in
supabase/migrations/         numbered, idempotent schema + RLS + storage
```

## Data model

| Table | Purpose |
| --- | --- |
| `users` | Profile row per account: `name`, `email`, `user_type` |
| `events` | A live gathering: title, host, PostGIS point, `is_live`, `live_checkin_count` |
| `posts` | Photo + caption attached to an event, with a cached `like_count` |
| `likes` | One row per user per post, unique-constrained |
| `checkins` | One row per user per event, unique-constrained, proximity-gated |
| `storage.posts` | Public bucket holding uploaded images at `<userId>/<timestamp>.jpg` |

Coordinates are `geometry(Point, 4326)`. Writes use `SRID=4326;POINT(lng lat)`
— longitude first. Reads come back as GeoJSON, so `coordinates[0]` is
longitude and `coordinates[1]` is latitude.

---

## Known gaps

These are tracked and understood, not surprises:

**No sign-out and no profile screen.** Once logged in there is no way back to
the login flow. The `name` collected at registration is never displayed.

**`MediaTypeOptions.Images` is deprecated but still functional.** Verified
against the installed expo-image-picker 17.0.11: `parseMediaTypes` in
`node_modules/expo-image-picker/build/utils.js` still translates the legacy
enum to `['images']` and only emits a `console.warn`. Photo posting works
today. SDK 54 prefers `mediaTypes: ['images']`, and the library's own comment
says the enum "should [be] remove[d] in [a] future release", so migrate before
the next SDK bump.

**`expo-doctor` reports one remaining failure.** 17 of 18 checks pass; the
remaining one does not block a beta:

- *Duplicate native module dependencies.* `expo-constants@18.0.13` exists in
  three places (`expo/`, `expo-auth-session/`, `expo-linking/`). All three are
  the **same version**, so this is a hoisting artefact rather than a real
  conflict — but native builds are meant to carry one copy. Note that
  `expo-auth-session` is declared in `package.json` yet never imported anywhere
  in the app, and it is what pulls in `expo-linking`; removing it would clear
  two of the three copies. It is left in place deliberately because it implies
  planned OAuth sign-in — that is a product decision, not a cleanup.
  `expo-status-bar` is likewise declared but unused.

The former second failure — `expo` 54.0.35 vs the expected `~54.0.37` patch
version — was fixed on 2026-10-07, after the repo moved off OneDrive: `expo`
is now `~54.0.37` in `package.json`, matching `node_modules`.

**Attendees cannot post.** Only the host can add photos, from
`HostDashboardScreen`. `VibePopup` is read-only for everyone else.

No tests, linting, or CI yet.

## Recently fixed

**The map screen no longer has silent failure modes.** The first GPS fix
recentres the map via `animateToRegion` (previously it stayed on the
Johannesburg fallback forever, because `initialRegion` is only read once),
location-permission denial and event-load failures surface as banners instead
of nothing, a malformed `coordinates` row is skipped instead of blanking the
whole screen, and a failed posts fetch offers tap-to-retry instead of an empty
"no posts yet".

**Registration can no longer lose the name.** The profile row is now created
by an `on_auth_user_created` trigger on `auth.users` (phase9), fed by the name
passed as `signUp({ options: { data: { name } } })` — no second client-side
write, so it works whether or not email confirmation is enabled. Registration
also now tells the user to confirm their email when `signUp` returns no
session, instead of leaving them at "Account created" with no way in. The
migration backfills profiles for accounts created while the bug was live,
using the email prefix as the name — edit them via the dashboard if needed.

**Realtime is in.** `MapScreen` and `VibePopup` subscribe to Supabase Realtime
`postgres_changes`, and the `phase8` migration publishes `events` and `posts`.
An event that goes live appears on the map without a restart, ending it removes
the marker, new posts stream into an open feed, other people's likes move the
count as they happen, and the check-in count tracks the server — which also
self-corrects the optimistic increment in `checkIn()`. Delivery honours the
existing SELECT policies, so no policy changed. `likes` and `checkins` are
deliberately not published: the aggregates on `posts` and `events` are what
everyone sees, and the triggers that maintain them (phases 6, 7) make their
changes visible indirectly.

**Like counts are now server-side.** `like_count` used to be maintained by a
second client-side `UPDATE` after each write to `likes`, which raced under
concurrency and required granting every user UPDATE on `posts` — meaning
anyone could rewrite anyone's caption or image URL. Migration `phase7`
derives the count from `likes` via a trigger and narrows the `posts` UPDATE
policy to authors only.


## License

MIT — see [LICENSE](LICENSE).
