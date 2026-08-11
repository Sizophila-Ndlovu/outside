---
kind: build_system
name: Expo + EAS Build System for React Native App
category: build_system
scope:
    - '**'
source_files:
    - package.json
    - app.json
    - eas.json
---

## Build System Overview

This repository is an Expo-based React Native application. The build and distribution pipeline is entirely managed through the Expo ecosystem — specifically `expo` CLI scripts in `package.json` and Expo Application Services (EAS) configuration in `eas.json`, with app metadata declared in `app.json`. There are no Makefiles, Dockerfiles, or custom CI/CD pipelines present in the repository.

## Key Files and Responsibilities

- **`package.json`** — Declares all runtime dependencies (`expo ^54.0.35`, `react-native 0.81.5`, navigation, Supabase, maps, etc.) and defines four npm scripts: `start` (runs `expo start`), `android` (`expo start --android`), `ios` (`expo start --ios`), and `web` (`expo start --web`). These are the only entry points for local development builds.
- **`app.json`** — Central Expo config that declares the app name, slug, scheme, version (`1.0.0`), platform-specific settings (Android package `com.sizophilandlovu.outside`, iOS tablet support, Google Maps API placeholder, web favicon), owner (`sizophila-ndlovu`), and EAS project ID.
- **`eas.json`** — EAS build and submit configuration. Defines three build profiles:
  - `development`: enables `developmentClient: true` and `distribution: internal` for local dev builds.
  - `preview`: `distribution: internal` for sharing preview builds.
  - `production`: uses `autoIncrement: true` to auto-increment the native build number on each production build.
  - Also pins the minimum EAS CLI version (`>= 20.1.0`) and sets `appVersionSource: remote` so the app version is pulled from the EAS server rather than `app.json` during builds.
  - A `submit.production` profile exists for submitting to app stores.

## Architecture and Conventions

- **No custom build scripts**: All compilation, bundling, and native asset processing are delegated to the Expo toolchain via `expo start` and `eas build`. There are no shell scripts, Makefiles, or Gradle/Xcode project edits in this repo.
- **Versioning strategy**: The JS-level version lives in `package.json` (`1.0.0`) and is mirrored in `app.json` under `expo.version`. Production native builds auto-increment their own build number via `eas.json`'s `autoIncrement: true`, decoupling JS version from native build numbers.
- **Multi-platform target**: The same source tree targets Android, iOS, and Web through Expo's unified build; platform-specific assets live under `assets/` (icons, splash) and platform-specific config lives inline in `app.json`.
- **Development workflow**: Local development uses `npm run android|ios|web` to launch the Expo dev server and Metro bundler. For pre-release testing, `eas build` with the `development` or `preview` profiles produces internal-distribution builds.
- **Distribution**: Production builds use the `production` EAS profile; submission to app stores is configured via the `submit.production` block in `eas.json`.

## Conventions and Constraints

- Dependencies are pinned at major/minor versions in `package.json` (e.g., `expo ^54.0.35`, `react-native 0.81.5`); `package-lock.json` is committed to lock exact resolved versions.
- The EAS CLI version is constrained to `>= 20.1.0` in `eas.json`; builds will fail if a locally installed EAS CLI does not satisfy this constraint.
- The app is marked `private: true` in `package.json`, indicating it is not published to npm.
- Platform identifiers (Android package name, EAS project ID, owner) are centralized in `app.json` and referenced by EAS during builds.
- No CI/CD pipeline files (GitHub Actions, GitLab CI, etc.) exist in the repository; builds are intended to be triggered manually or externally via the EAS CLI.