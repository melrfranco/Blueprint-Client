import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error('Missing Supabase environment variables');
}

// ── Startup: purge corrupt or non-client sessions ──────────────
// An oversized JWT (e.g. base64 avatar in user_metadata) causes
// ERR_CONNECTION_RESET / ERR_HTTP2_PROTOCOL_ERROR on every request.
// Also purge sessions from non-client users (admin/stylist) that
// got stuck from a previous login to the wrong app.
try {
  for (let i = localStorage.length - 1; i >= 0; i--) {
    const k = localStorage.key(i);
    if (!k?.startsWith('sb-')) continue;
    try {
      const raw = localStorage.getItem(k);
      if (!raw) continue;
      const parsed = JSON.parse(raw);
      // Purge if session data is oversized (>100KB JWT will break HTTP/2)
      const tokenLen = parsed?.currentSession?.access_token?.length || 0;
      if (tokenLen > 50000) {
        console.warn(`[supabase] Purging oversized session (${(tokenLen / 1024).toFixed(0)}KB token) for key ${k}`);
        localStorage.removeItem(k);
        continue;
      }
      // Purge if user role is not 'client'
      const role = parsed?.currentSession?.user?.user_metadata?.role;
      if (role && role !== 'client') {
        console.warn(`[supabase] Purging non-client session (role: ${role}) for key ${k}`);
        localStorage.removeItem(k);
      }
    } catch { /* unparseable — leave it, Supabase will handle */ }
  }
} catch { /* localStorage access denied — ignore */ }

// Resilient storage that handles quota errors gracefully.
// The Supabase JWT can be oversized (e.g. base64 avatar in user_metadata)
// which causes localStorage quota errors and breaks auth completely.
const resilientStorage = {
  getItem: (key: string): string | null => {
    try { return localStorage.getItem(key); } catch { /* quota or access error */ }
    try { return sessionStorage.getItem(key); } catch { /* fallback also failed */ }
    return null;
  },
  setItem: (key: string, value: string): void => {
    // Reject oversized sessions before they corrupt localStorage
    try {
      const parsed = JSON.parse(value);
      const tokenLen = parsed?.currentSession?.access_token?.length || 0;
      if (tokenLen > 50000) {
        console.warn(`[supabase] Refusing to store oversized session (${(tokenLen / 1024).toFixed(0)}KB token)`);
        // Fall through to sessionStorage as last resort
        try { sessionStorage.setItem(key, value); } catch { /* give up */ }
        return;
      }
    } catch { /* not JSON — store as-is */ }

    try { localStorage.setItem(key, value); return; } catch { /* quota exceeded */ }
    // Clear stale supabase keys and retry
    try {
      for (let i = localStorage.length - 1; i >= 0; i--) {
        const k = localStorage.key(i);
        if (k?.startsWith('sb-')) localStorage.removeItem(k);
      }
      localStorage.setItem(key, value);
      return;
    } catch { /* still failed */ }
    // Last resort: sessionStorage (lost on tab close, but at least works)
    try { sessionStorage.setItem(key, value); } catch { /* give up silently */ }
  },
  removeItem: (key: string): void => {
    try { localStorage.removeItem(key); } catch { /* ignore */ }
    try { sessionStorage.removeItem(key); } catch { /* ignore */ }
  },
};

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    storage: resilientStorage,
    persistSession: true,
    detectSessionInUrl: true,
  },
});

// ── Cached access token ──────────────────────────────────
// Updated by AuthContext on every auth state change.
// Other code (ClientDataContext) reads this instead of calling getSession().
let _cachedAccessToken: string | null = null;
export function setCachedAccessToken(token: string | null) { _cachedAccessToken = token; }
export function getCachedAccessToken(): string | null { return _cachedAccessToken; }

export function getSupabaseConfig() {
  return {
    url: supabaseUrl,
    anonKey: supabaseAnonKey,
  };
}

export function saveSupabaseConfig(url: string, anonKey: string) {
  localStorage.setItem('supabase_url', url);
  localStorage.setItem('supabase_anon_key', anonKey);
}

export function clearSupabaseConfig() {
  localStorage.removeItem('supabase_url');
  localStorage.removeItem('supabase_anon_key');
}
