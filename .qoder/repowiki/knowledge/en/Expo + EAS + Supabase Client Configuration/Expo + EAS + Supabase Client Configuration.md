---
kind: configuration_system
name: Expo + EAS + Supabase Client Configuration
category: configuration_system
scope:
    - '**'
source_files:
    - app.json
    - eas.json
    - lib/supabase.js
    - index.js
    - App.js
    - package.json
---

## What system/approach is used

This Expo-based React Native app uses a minimal, file-driven configuration approach with three distinct layers:

1. **Expo config (`app.json`)** — declares the app identity (name, slug, scheme, version), platform-specific settings (iOS tablet support, Android adaptive icons and package name `com.sizophilandlovu.outside`), web favicon, and an `extra.eas.projectId` field for linking to the EAS project.
2. **EAS build profiles (`eas.json`)** — defines three build profiles (`development`, `preview`, `production`) controlling distribution type and auto-increment behavior; the CLI version requirement is pinned at `>= 20.1.0`.
3. **Supabase client module** — all data/auth calls go through a shared `lib/supabase.js` module (imported from every screen and component). This file is gitignored (`lib/supabase.js` in `.gitignore`), meaning it contains secrets (project URL and anon key) that are generated locally per developer or injected by CI.

There is no runtime `.env` parsing, no `process.env` usage, and no feature-flag system. The app does not read environment variables at runtime; instead, configuration is baked into static JSON manifests and a local secrets file.

## Key files and packages

- `app.json` — Expo manifest: app metadata, platform configs, Google Maps API key placeholder under `android.config.googleMaps.apiKey`, and `extra.eas.projectId`.
- `eas.json` — EAS Build/Submit configuration with `development`, `preview`, `production` profiles.
- `lib/supabase.js` — Supabase JS client initialization (excluded from VCS via `.gitignore`). Consumed by `src/components/VibePopup.js`, `src/hooks/useAuth.js`, `src/screens/LoginScreen.js`, `src/screens/RegisterScreen.js`, `src/screens/MapScreen.js`, `src/screens/HostDashboardScreen.js`.
- `index.js` — Expo entry point calling `registerRootComponent(App)`.
- `App.js` — thin root component delegating to `./src/navigation/AppNavigator`.
- `package.json` — declares dependencies including `@supabase/supabase-js`, `expo-*` SDK modules, and `react-native-maps`.

## Architecture and conventions

- **Single source of truth per concern**: App identity lives only in `app.json`; build behavior only in `eas.json`; Supabase credentials only in `lib/supabase.js`. There is no duplication across these files.
- **Secrets isolation**: The Supabase client module is explicitly ignored by Git, so developers must create `lib/supabase.js` locally with their own credentials. All UI code imports this module rather than reading env vars directly.
- **No runtime config loading**: The app never reads `process.env`, `expo-constants`, or any runtime configuration loader. Configuration is static at bundle time.
- **Platform-specific config via Expo**: Platform differences (icons, package names, Google Maps keys) are expressed declaratively in `app.json` rather than conditional logic in JS.
- **Build-time vs runtime separation**: EAS profiles control how builds are produced; the resulting binary carries the Expo manifest and bundled JS — there is no post-install configuration step.

## Conventions and constraints

- **Google Maps API key**: Declared as a placeholder string `YOUR_GOOGLE_MAPS_API_KEY` inside `app.json.android.config.googleMaps.apiKey`; must be replaced before building for Android.
- **Supabase client must exist locally**: Every screen/component imports `{ supabase } from '../../lib/supabase'`; if `lib/supabase.js` is missing the app will fail to start. The file's presence is enforced by the import graph, but it is not tracked in version control.
- **EAS project linkage**: The Expo project is linked to EAS via the UUID in `app.json.extras.eas.projectId` (`231b12a8-cecc-473f-8549-082baf3f1cb2`); builds use this ID to resolve remote configuration.
- **Package naming convention**: Android package name follows reverse-DNS style (`com.sizophilandlovu.outside`) matching the owner `sizophila-ndlovu` declared in `app.json.owner`.
- **No `.env` files**: No environment variable files are present or referenced anywhere in the codebase; secrets are kept out of the repo entirely.