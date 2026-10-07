import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient } from '@supabase/supabase-js';

// Credentials come from EXPO_PUBLIC_* variables in your .env file, which
// Expo inlines at build time. Because nothing secret lives in this file
// any more, it is safe (and necessary) to keep it in version control.
const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;

// Fail loudly at startup rather than throwing opaque network errors from
// deep inside a screen. Copy .env.example to .env and fill in both values.
if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error(
    'Missing Supabase configuration.\n\n' +
      'Create a .env file in the project root (copy .env.example) with:\n' +
      '  EXPO_PUBLIC_SUPABASE_URL=https://<your-project-ref>.supabase.co\n' +
      '  EXPO_PUBLIC_SUPABASE_ANON_KEY=<your-anon-key>\n\n' +
      'Then fully restart the Metro bundler with: npx expo start --clear\n' +
      'Env vars are inlined at bundle time, so a reload is not enough.'
  );
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    // React Native has no localStorage; AsyncStorage keeps the session
    // alive across app restarts so users are not logged out every time.
    storage: AsyncStorage,
    autoRefreshToken: true,
    persistSession: true,
    // No browser redirects in a native app.
    detectSessionInUrl: false,
  },
});
