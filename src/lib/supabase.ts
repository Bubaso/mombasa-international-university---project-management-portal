import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

/**
 * Whether a real backend is configured.
 *
 * Without it the client still exists, but points at a placeholder host, so
 * every request fails. The UI needs to tell that apart from "there is no data
 * yet" — an unconfigured build used to render as a healthy, empty portal,
 * which is the worst possible answer in a system people make decisions from.
 */
export const isSupabaseConfigured = Boolean(supabaseUrl && supabaseAnonKey);

if (!isSupabaseConfigured) {
  console.warn(
    'Supabase is not configured: set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY in .env.local. ' +
      'The app will run, but no project data can be loaded or saved.',
  );
}

/**
 * The project this build talks to, as a bare host.
 *
 * Shown on the access-denied screen. It is not a secret — it is compiled into
 * every bundle and sent with every request — and it is the fastest way to see
 * the failure that looks like all the others: a build pointed at a different
 * project from the one somebody just set their profile up in. Both are baked
 * in at build time, so this is also a reminder that fixing it means building
 * again rather than changing something live.
 */
export const supabaseHost = (() => {
  if (!supabaseUrl) return null;
  try {
    return new URL(supabaseUrl).host;
  } catch {
    return supabaseUrl;
  }
})();

export const supabase = createClient(
  supabaseUrl || 'https://placeholder.supabase.co',
  supabaseAnonKey || 'placeholder-key',
);
