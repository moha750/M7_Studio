// M7_Studio — minimal auth-guarded "router".
// Pages under /app/* require a session. Otherwise we redirect to login.

import { getSession } from "./supabase.js";

const LOGIN_URL    = "../app/login.html";
const HOME_URL     = "../index.html";
const DASH_URL     = "./dashboard.html";

export async function requireAuth() {
  const session = await getSession();
  if (!session) {
    location.replace(LOGIN_URL);
    return null;
  }
  return session;
}

export async function redirectIfAuthed(target = DASH_URL) {
  const session = await getSession();
  if (session) {
    location.replace(target);
    return true;
  }
  return false;
}

export const URLS = { LOGIN_URL, HOME_URL, DASH_URL };
