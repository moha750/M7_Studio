// M7_Studio — small utility helpers.

export const $  = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

export function on(el, event, handler, opts) {
  el.addEventListener(event, handler, opts);
  return () => el.removeEventListener(event, handler, opts);
}

export function debounce(fn, ms = 200) {
  let t;
  return (...args) => {
    clearTimeout(t);
    t = setTimeout(() => fn(...args), ms);
  };
}

export function throttle(fn, ms = 100) {
  let last = 0;
  let timer;
  return (...args) => {
    const now = Date.now();
    const remaining = ms - (now - last);
    if (remaining <= 0) {
      last = now;
      fn(...args);
    } else {
      clearTimeout(timer);
      timer = setTimeout(() => { last = Date.now(); fn(...args); }, remaining);
    }
  };
}

export function classNames(...parts) {
  return parts.filter(Boolean).join(" ");
}

const SHORT_ALPHABET = "abcdefghijkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789";
// 8 chars from a 56-char alphabet → ~46 bits ≈ 70 trillion possibilities.
export function generateShortCode(length = 8) {
  const buf = new Uint8Array(length);
  crypto.getRandomValues(buf);
  let out = "";
  for (let i = 0; i < length; i++) out += SHORT_ALPHABET[buf[i] % SHORT_ALPHABET.length];
  return out;
}

export function isValidUrl(value) {
  if (typeof value !== "string") return false;
  try {
    const u = new URL(value);
    return u.protocol === "http:" || u.protocol === "https:";
  } catch { return false; }
}

export function isValidEmail(value) {
  return typeof value === "string" && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim());
}

export function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  setTimeout(() => { document.body.removeChild(a); URL.revokeObjectURL(url); }, 100);
}

export async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    // fallback
    const ta = document.createElement("textarea");
    ta.value = text;
    ta.style.position = "fixed";
    ta.style.opacity = "0";
    document.body.appendChild(ta);
    ta.select();
    let ok = false;
    try { ok = document.execCommand("copy"); } catch { ok = false; }
    document.body.removeChild(ta);
    return ok;
  }
}

export function formatRelative(date, t) {
  if (!date) return "";
  const d  = typeof date === "string" ? new Date(date) : date;
  const ms = Date.now() - d.getTime();
  const s  = Math.max(0, Math.floor(ms / 1000));
  if (s < 45)            return t("common.now");
  const m = Math.floor(s / 60);
  if (m < 2)             return t("common.minute_ago");
  if (m < 60)            return t("common.minutes_ago", { n: m });
  const h = Math.floor(m / 60);
  if (h < 2)             return t("common.hour_ago");
  if (h < 24)            return t("common.hours_ago", { n: h });
  const days = Math.floor(h / 24);
  if (days < 2)          return t("common.day_ago");
  return t("common.days_ago", { n: days });
}

export function formatDate(d, locale = "ar") {
  if (!d) return "";
  const date = typeof d === "string" ? new Date(d) : d;
  return new Intl.DateTimeFormat(locale === "ar" ? "ar-EG" : "en-US", {
    year: "numeric", month: "short", day: "numeric",
    hour: "2-digit", minute: "2-digit"
  }).format(date);
}

export function formatNumber(n, locale = "ar") {
  return new Intl.NumberFormat(locale === "ar" ? "ar-EG" : "en-US").format(n || 0);
}

export function escapeHtml(s) {
  return String(s ?? "").replace(/[&<>"']/g, c => (
    { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]
  ));
}

export function readFileAsDataURL(file) {
  return new Promise((resolve, reject) => {
    const fr = new FileReader();
    fr.onload  = () => resolve(fr.result);
    fr.onerror = () => reject(fr.error);
    fr.readAsDataURL(file);
  });
}

export function csvify(rows) {
  // rows: array of objects with same keys
  if (!rows.length) return "";
  const keys = Object.keys(rows[0]);
  const esc = v => {
    if (v == null) return "";
    const s = String(v).replace(/"/g, '""');
    return /[",\n]/.test(s) ? `"${s}"` : s;
  };
  return [keys.join(","), ...rows.map(r => keys.map(k => esc(r[k])).join(","))].join("\n");
}
