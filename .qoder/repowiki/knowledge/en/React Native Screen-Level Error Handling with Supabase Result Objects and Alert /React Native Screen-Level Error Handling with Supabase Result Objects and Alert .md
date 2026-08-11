---
kind: error_handling
name: React Native Screen-Level Error Handling with Supabase Result Objects and Alert Dialogs
category: error_handling
scope:
    - '**'
source_files:
    - src/screens/LoginScreen.js
    - src/screens/RegisterScreen.js
    - src/screens/MapScreen.js
    - src/components/VibePopup.js
    - src/screens/HostDashboardScreen.js
    - src/hooks/useAuth.js
    - src/navigation/AppNavigator.js
    - App.js
---

## Overview

This Expo React Native application does not use a centralized error-handling framework, custom error types, or middleware. Instead, each screen component handles errors locally using the patterns provided by the Supabase client SDK and React Native's `Alert` API.

## How Errors Are Produced

- **Supabase client calls** return result objects of the form `{ data, error }`. There are no thrown exceptions from these calls; callers inspect the `error` property directly.
- **Async operations** (e.g., `Location.requestForegroundPermissionsAsync`, `Location.getCurrentPositionAsync`) may throw native runtime errors, which are caught with `try/catch` blocks.
- **Client-side validation** (missing fields, missing permissions) is handled via early returns and user-facing messages rather than throwing.

## How Errors Are Propagated

There is no error propagation up the call stack. Each screen function:
1. Inspects the `error` field on the Supabase result object.
2. If an error exists, it either logs it to the console (`console.log('Posts error:', error)`, `console.log('Events error:', error)`, `console.log('Profile error:', profileError)`) or displays a user-facing `Alert.alert(...)` dialog.
3. The error is never re-thrown or returned to a parent component — handling is terminal at the screen level.

## Conventions Observed Across Screens

| File | Pattern |
|---|---|
| `LoginScreen.js` | After `supabase.auth.signInWithPassword`, checks `if (error)` and shows `Alert.alert('Error', error.message)` |
| `RegisterScreen.js` | Checks `if (error)` after `signUp`; also validates required fields before calling Supabase and alerts `'Please fill in all fields'` |
| `MapScreen.js` | Logs read errors to console (`console.log('Events error:', error)`) without alerting the user; silently proceeds with empty data |
| `VibePopup.js` | Uses `try/catch` around location permission + check-in flow; distinguishes duplicate-checkin DB error code `23505` as a success case and otherwise alerts `'Can't check in'` |
| `HostDashboardScreen.js` | Wraps multi-step create/post/upload in `try/catch`, rethrows Supabase errors (`throw error`, `throw uploadError`, `throw postError`) so the outer catch can show a single `Alert.alert('Error', error.message)` |
| `useAuth.js` | Does not handle auth errors; relies on `onAuthStateChange` callback which receives no error argument in this usage |

## Notable Design Decisions

- **No global error boundary**: There is no `ErrorBoundary` component or top-level `try/catch` wrapping the app root (`App.js` simply renders `<AppNavigator />`).
- **No custom error classes or error codes module**: Database constraint violations are identified inline by checking `error.code === '23505'` (PostgreSQL unique violation) inside `VibePopup.js`.
- **Silent failures for non-critical reads**: Read-only queries (events, posts, likes, checkins) log errors to console but do not interrupt UI state — they fall through to render whatever data was available.
- **User-visible failures go through `Alert.alert`**: All user-facing error paths end in a modal alert with a short title like `'Error'`, `'Location needed'`, or `'Can't check in'`, followed by a message derived from `error.message` or a hardcoded string.
- **Loading-state gating**: Most async flows set a `loading`/`checkingIn` flag before the operation and reset it in `finally` or after the response, preventing duplicate submissions even when errors occur.

## Key Files

- `src/screens/LoginScreen.js` — sign-in error display
- `src/screens/RegisterScreen.js` — sign-up validation and error display
- `src/screens/MapScreen.js` — silent logging of event fetch errors
- `src/components/VibePopup.js` — try/catch around check-in, duplicate-constraint handling (`error.code === '23505'`)
- `src/screens/HostDashboardScreen.js` — try/catch with explicit `throw error` re-throw pattern for multi-step host flows
- `src/hooks/useAuth.js` — minimal auth state subscription with no error handling
- `App.js` / `src/navigation/AppNavigator.js` — no error boundaries; navigation renders based on auth state only

## Constraints

- No repository-wide documentation or lint rule enforces a specific error-handling convention; the patterns above are what the current implementation does.
- Supabase client calls are always destructured as `{ data, error }` — there are no `.catch()` chains on those promises in this codebase.