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
  a browser). The project targets **Expo SDK 57** — keep Expo Go updated from
  the App Store or Play Store, which ship SDK 57.

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
10. `...phase10_security_hardening.sql`

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
link — registration now shows a "Confirm your email" notice saying exactly
that.

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

If Expo Go says "Project is incompatible with this version of Expo Go",
update Expo Go from the store — the project tracks the newest SDK (57 as of
October 2026).

Then press `a` for an Android emulator, `i` for iOS, or scan the QR code with
Expo Go.

---

## Project structure

```
app.json                     non-secret Expo config (tracked)
app.config.js                merges over app.json, injects secrets from .env
CHANGELOG.md                 dated record of notable changes
lib/supabase.js              Supabase client with AsyncStorage session persistence
src/
  navigation/AppNavigator.js auth-gated native stack
  hooks/useAuth.js           session state via onAuthStateChange
  screens/
    LoginScreen.js           sign in
    RegisterScreen.js        sign up (profile row comes from a DB trigger)
    MapScreen.js             live map with event markers
    HostDashboardScreen.js   go live, post photos, end event
    ProfileScreen.js         your name, sign out
  components/VibePopup.js    bottom sheet: feed, post photos, likes, check-in
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

**Posting is not check-in-gated.** Any authenticated user can post to a live
event without being near it — the `posts` insert policy (phase3) only requires
the event to be live. Fine for a beta where trust is assumed; tightening to
"checked-in users only" is a one-policy change if it ever matters.

**Live events never expire on their own.** `is_live` flips to false only when
the host ends the event, so an abandoned event's marker stays on the map
indefinitely. Two stale test events from June and July 2026 were ended
manually on 2026-10-08; deciding on an auto-expiry rule is a pre-beta open
question.

**Sign-in is email/password only.** There is no Google/OAuth flow anywhere in
the app. `expo-auth-session` is declared in `package.json` but never imported,
and it is what pulls in `expo-linking`; it is left in place pending a decision
on social sign-in. `expo-status-bar` is likewise declared but unused.

**`expo-doctor` has not been re-run since the SDK 57 upgrade (2026-10-07).**
Before the upgrade it passed 17 of 18 checks; the one failure was a duplicate
native module dependency — `expo-constants` present in three places (`expo/`,
`expo-auth-session/`, `expo-linking/`), all at the same version, a hoisting
artefact rather than a real conflict. The SDK 57 `npm install` resolved
cleanly with no peer-dependency errors; run `npx expo-doctor` to check the
current state.

No tests, linting, or CI yet.

## Recently fixed

**The full loop is verified on a real device (2026-10-07/08).** On a physical
iPhone 11 running Expo Go (SDK 57): register with a name, sign in, go live,
post a photo, check in, end the event, view the profile, and sign out and
back in — all confirmed against the live database, including the phase9
signup profile trigger and the phase10-hardened `increment_checkin_count()`.

**Expo Go works again — SDK 57 upgrade.** The store's Expo Go runs SDK 57
projects only, so the SDK 54 project failed to open ("Project is incompatible
with this version of Expo Go"). Dependencies moved to the SDK 57 set — expo
`~57.0.1` (resolving to `57.0.27`), React `19.2.3`, React Native `0.86.3` —
and `npm install` resolved cleanly.

**Security hardening (phase10).** `increment_checkin_count()` now runs with a
pinned `search_path`, and `handle_new_user()` can be executed only by
`supabase_auth_admin` (GoTrue's signup role) instead of by every role. A
throwaway signup confirmed the profile trigger still fires. Residual advisor
findings and why they are accepted are documented in the phase10 migration
header.

**You can sign out, see your profile, and post as an attendee.** The map has
a "profile" button top-right: `ProfileScreen` shows your `users.name` and the
session email, and signing out returns to the login stack through
`onAuthStateChange` rather than navigating by hand. `VibePopup` gained an
"+ add your photo" button — the phase3 policy already allowed any
authenticated user to post to a live event, and uploads stay confined to the
poster's own storage folder by the phase5 policy. Both photo pickers now pass
`mediaTypes: ['images']` (the current array form) instead of the deprecated
`MediaTypeOptions` enum. `App.js` mounts `SafeAreaProvider`, so map controls
and popup padding respect the notch and home indicator on newer iPhones.

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
