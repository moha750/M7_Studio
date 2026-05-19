// Public configuration — safe to commit.
// The anon/publishable key is protected by Row Level Security (RLS).
// The dangerous tokens (service_role, access_token) live only in Supabase
// dashboard or .mcp.json (which is in .gitignore).

window.M7_CONFIG = Object.freeze({
  SUPABASE_URL: "https://mmxzunywueozltfdilra.supabase.co",
  SUPABASE_ANON_KEY: "sb_publishable_SOHB2LSDUhuklMrlJHMaHw_nO8NJVB4",
  REDIRECT_BASE: "https://mmxzunywueozltfdilra.supabase.co/functions/v1/r",
  APP_NAME: "M7_Studio",
  APP_VERSION: "0.1.0",
  DEFAULT_LOCALE: "ar",
  SUPPORTED_LOCALES: ["ar", "en"],
});
