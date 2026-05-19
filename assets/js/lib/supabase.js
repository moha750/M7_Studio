// M7_Studio — single shared Supabase client.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const cfg = window.M7_CONFIG;
if (!cfg || !cfg.SUPABASE_URL || !cfg.SUPABASE_ANON_KEY) {
  throw new Error("M7_CONFIG missing. Include config.js before any module.");
}

export const supabase = createClient(cfg.SUPABASE_URL, cfg.SUPABASE_ANON_KEY, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
    storage: window.localStorage,
    storageKey: "m7.auth",
  },
});

export async function getUser() {
  const { data } = await supabase.auth.getUser();
  return data.user || null;
}

export async function getSession() {
  const { data } = await supabase.auth.getSession();
  return data.session || null;
}

export function onAuthChange(cb) {
  return supabase.auth.onAuthStateChange((event, session) => cb(event, session));
}
