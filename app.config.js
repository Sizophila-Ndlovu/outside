const fs = require('fs');
const path = require('path');

/**
 * Minimal .env reader, used only as a fallback.
 *
 * Expo CLI normally loads .env and injects EXPO_PUBLIC_* variables into
 * process.env before evaluating this file. The published docs do not
 * actually guarantee that ordering for config evaluation, so if a
 * variable is missing from process.env we parse .env ourselves.
 *
 * Real environment variables always win over the file, which keeps EAS
 * builds (where secrets are injected as true env vars) working correctly.
 */
function readDotEnv() {
  try {
    const contents = fs.readFileSync(path.join(__dirname, '.env'), 'utf8');
    const parsed = {};
    for (const line of contents.split(/\r?\n/)) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      const separator = trimmed.indexOf('=');
      if (separator === -1) continue;
      const key = trimmed.slice(0, separator).trim();
      let value = trimmed.slice(separator + 1).trim();
      const quoted =
        (value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"));
      if (quoted) value = value.slice(1, -1);
      parsed[key] = value;
    }
    return parsed;
  } catch {
    // No .env file is fine - the app reports the missing config itself.
    return {};
  }
}

const dotEnv = readDotEnv();

function env(name) {
  return process.env[name] || dotEnv[name] || '';
}

const googleMapsApiKey = env('EXPO_PUBLIC_GOOGLE_MAPS_API_KEY');

// app.json stays the source of truth for everything non-secret. This file
// merges on top of it and injects only values that must not be committed.
module.exports = ({ config }) => {
  if (!googleMapsApiKey) {
    console.warn(
      '[app.config.js] EXPO_PUBLIC_GOOGLE_MAPS_API_KEY is not set. ' +
        'The map will render as a blank grey grid on Android. ' +
        'Add it to your .env file (see .env.example).'
    );
    return config;
  }

  return {
    ...config,
    android: {
      ...config.android,
      config: {
        ...config.android?.config,
        googleMaps: {
          ...config.android?.config?.googleMaps,
          apiKey: googleMapsApiKey,
        },
      },
    },
    // iOS defaults to Apple Maps, which needs no key. This is only used if
    // you explicitly switch a MapView to PROVIDER_GOOGLE.
    ios: {
      ...config.ios,
      config: {
        ...config.ios?.config,
        googleMapsApiKey,
      },
    },
  };
};
