# Changelog

Notable changes to **outside**, newest first. Commit hashes refer to
`origin/main`.

## 2026-10-08

- **First full device pass complete.** A physical iPhone 11 running Expo Go
  (SDK 57) executed the whole loop against the live database: register with a
  name, sign in, go live, post a photo, check in, end the event, view the
  profile, and sign out and back in. Confirmed working: the named profile
  auto-created by the phase9 signup trigger, photo upload to storage, the
  proximity-gated check-in counted by the phase10-hardened
  `increment_checkin_count()`, and the profile/sign-out flow.
- **Stale live events cleaned.** "Test Vibe" (live since 2026-06-10) and
  "Guy" (live since 2026-07-13) were ended directly on the live database
  (`is_live = false`, `ended_at = now()`; their posts and check-ins were
  kept). Events never expire on their own — see README, Known gaps — and an
  auto-expiry rule is an open pre-beta decision.
- Recorded the auth reality: sign-in is email and password only; the app
  contains no Google/OAuth flow.

## 2026-10-07

- **Expo SDK 54 → 57** (`b0048cb`). The App Store's Expo Go runs SDK 57
  projects only, so the SDK 54 project refused to open on the test phone
  ("Project is incompatible with this version of Expo Go"). Dependencies
  moved to the SDK 57 set — expo `~57.0.1` (resolving to `57.0.27`), React
  `19.2.3`, React Native `0.86.3` — `npm install` resolved cleanly with no
  peer-dependency errors, and the upgrade was verified on device the same
  day.
- **Phase10 security hardening applied and verified** (`aa4f6e3`).
  `increment_checkin_count()` now runs with a pinned `search_path`, and
  `handle_new_user()` is executable only by `supabase_auth_admin` (GoTrue's
  signup role) instead of every role. A throwaway signup confirmed the
  profile trigger still fires. Residual advisor findings and why they are
  accepted are documented in the phase10 migration header.
- **Phase8 and phase9 brought up on the live project**, then hardened for
  the live schema (`bd11766`): realtime publishes `events` and `posts`, the
  `on_auth_user_created` trigger auto-creates profiles, and existing accounts
  were backfilled. All verified against the live database.

## Baseline (before 2026-10-07)

- MVP schema and app: migrations phase1–phase7 (users, events, posts, likes,
  proximity-gated check-ins, storage, server-side like counts), and the Expo
  app — auth gate, live map, host dashboard, feed popup with photos and
  likes. See README → Recently fixed for the hardening that followed.
