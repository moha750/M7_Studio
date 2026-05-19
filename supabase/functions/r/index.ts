// M7_Studio — QR redirect + scan tracking Edge Function.
// Public endpoint (no JWT required). Called by every QR scan.
//
// Flow:
//   1. Parse the short_code from the URL.
//   2. Look up the active qr_codes row using the service-role key
//      (bypasses RLS — this endpoint is intentionally public).
//   3. Parse user-agent and country headers.
//   4. Hash the client IP (privacy-preserving).
//   5. Determine if this is a unique scan for this QR.
//   6. Insert a row into qr_scans (best-effort, fire-and-forget).
//   7. Return a 302 redirect to target_url.
//
// 404 path returns a small bilingual HTML page so a human who taps a dead
// QR sees something friendly instead of a JSON error.

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { UAParser } from "https://esm.sh/ua-parser-js@1.0.39";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY  = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const admin = createClient(SUPABASE_URL, SERVICE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

function extractShortCode(url: URL): string | null {
  // Supabase routes /functions/v1/r/<rest> to this function.
  // The last non-empty path segment is the short code.
  const parts = url.pathname.split("/").filter(Boolean);
  const last = parts[parts.length - 1];
  if (!last || last === "r") return null;
  return last;
}

function clientIp(req: Request): string {
  // Supabase / Cloudflare forward the real IP in these headers.
  return (
    req.headers.get("x-real-ip") ||
    req.headers.get("cf-connecting-ip") ||
    (req.headers.get("x-forwarded-for") || "").split(",")[0].trim() ||
    "0.0.0.0"
  );
}

async function sha256(input: string): Promise<string> {
  const bytes = new TextEncoder().encode(input);
  const buf = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(buf))
    .map(b => b.toString(16).padStart(2, "0"))
    .join("");
}

function deviceTypeOf(parsed: UAParser): string {
  const t = parsed.getDevice().type;
  if (t) return t;                                  // mobile | tablet
  const ua = parsed.getUA().toLowerCase();
  if (/bot|crawler|spider|scrape|curl|wget/.test(ua)) return "bot";
  return "desktop";
}

function notFoundPage(): Response {
  const html = `<!doctype html>
<html lang="ar" dir="rtl"><head>
<meta charset="utf-8"/>
<title>M7_Studio — لا يوجد رابط</title>
<meta name="viewport" content="width=device-width,initial-scale=1"/>
<style>
  :root { color-scheme: light dark; }
  body { font-family: system-ui, -apple-system, "Segoe UI", "Cairo", sans-serif;
         display:grid; place-items:center; min-height:100vh; margin:0;
         background:#0b1020; color:#eef1ff; }
  .card { text-align:center; padding:2rem 1.5rem; max-width:420px; }
  h1 { margin:0 0 .5rem; font-size:1.5rem; }
  p  { margin:.25rem 0; opacity:.85; }
  .en { direction:ltr; opacity:.7; margin-top:1rem; font-size:.9rem; }
  .logo { font-weight:800; letter-spacing:.1em; margin-bottom:1rem;
          color:#7aa7ff; }
</style></head>
<body><div class="card">
  <div class="logo">M7_STUDIO</div>
  <h1>الرابط غير موجود أو معطّل</h1>
  <p>قد يكون قد حُذف أو لم يُفعَّل بعد.</p>
  <div class="en">
    <h2 style="margin:0 0 .25rem;font-size:1.1rem;">Link not found</h2>
    <p style="margin:0;">This QR code may be inactive or removed.</p>
  </div>
</div></body></html>`;
  return new Response(html, {
    status: 404,
    headers: { "content-type": "text/html; charset=utf-8" },
  });
}

Deno.serve(async (req) => {
  const url = new URL(req.url);

  // Health probe.
  if (url.pathname.endsWith("/health")) {
    return new Response("ok", { status: 200 });
  }

  const shortCode = extractShortCode(url);
  if (!shortCode) return notFoundPage();

  // Look up the QR.
  const { data: qr, error } = await admin
    .from("qr_codes")
    .select("id, target_url, is_active")
    .eq("short_code", shortCode)
    .maybeSingle();

  if (error || !qr || !qr.is_active) return notFoundPage();

  // Parse client metadata.
  const uaString = req.headers.get("user-agent") || "";
  const parsed = new UAParser(uaString);
  const country =
    req.headers.get("x-country") ||
    req.headers.get("cf-ipcountry") ||
    null;
  const ipHash = await sha256(clientIp(req) + ":" + qr.id);

  // Determine uniqueness (best-effort: a prior scan with same ip_hash for this QR).
  const { count: priorCount } = await admin
    .from("qr_scans")
    .select("id", { count: "exact", head: true })
    .eq("qr_code_id", qr.id)
    .eq("ip_hash", ipHash);

  const scanRow = {
    qr_code_id: qr.id,
    ip_hash: ipHash,
    country,
    user_agent: uaString.slice(0, 500),
    device_type: deviceTypeOf(parsed),
    browser: parsed.getBrowser().name || null,
    os: parsed.getOS().name || null,
    referrer: req.headers.get("referer"),
    is_unique: !priorCount,
  };

  // Fire-and-forget insert — don't block the redirect on logging.
  admin.from("qr_scans").insert(scanRow).then(({ error: insErr }) => {
    if (insErr) console.error("scan insert failed:", insErr.message);
  });

  return Response.redirect(qr.target_url, 302);
});
