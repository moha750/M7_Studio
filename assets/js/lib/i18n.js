// M7_Studio — lightweight i18n.
// Loads a JSON locale, replaces `data-i18n` text, and updates dir/lang.

const STORAGE_KEY = "m7.locale";
const SUPPORTED = ["ar", "en"];

let current = null;
let dict    = {};

function deepGet(obj, path) {
  return path.split(".").reduce((o, k) => (o == null ? o : o[k]), obj);
}

function interpolate(str, vars) {
  if (!vars) return str;
  return String(str).replace(/\{(\w+)\}/g, (_, k) => (k in vars ? String(vars[k]) : `{${k}}`));
}

export function pickInitialLocale() {
  const stored = localStorage.getItem(STORAGE_KEY);
  if (stored && SUPPORTED.includes(stored)) return stored;
  const browser = (navigator.language || "ar").slice(0, 2).toLowerCase();
  return SUPPORTED.includes(browser) ? browser : "ar";
}

export async function loadLocale(locale) {
  if (!SUPPORTED.includes(locale)) locale = "ar";
  const here = new URL(window.location.href);
  // Resolve `/assets/locales/<locale>.json` relative to the site root.
  // Works for both root (index.html) and `/app/*.html` because we use absolute path.
  const base = window.M7_BASE || (here.pathname.includes("/app/") ? "../" : "./");
  const res = await fetch(`${base}assets/locales/${locale}.json`, { cache: "no-store" });
  if (!res.ok) throw new Error(`Failed to load locale ${locale}`);
  dict = await res.json();
  current = locale;

  const meta = dict.meta || {};
  document.documentElement.setAttribute("lang", meta.lang || locale);
  document.documentElement.setAttribute("dir",  meta.dir  || (locale === "ar" ? "rtl" : "ltr"));
  localStorage.setItem(STORAGE_KEY, locale);

  applyTo(document);
  document.dispatchEvent(new CustomEvent("m7:locale-changed", { detail: { locale } }));
  return dict;
}

export function t(key, vars) {
  const val = deepGet(dict, key);
  if (val == null) return key;
  if (typeof val === "string") return interpolate(val, vars);
  return val;
}

export function currentLocale() { return current; }

export function applyTo(root) {
  // Text content
  root.querySelectorAll("[data-i18n]").forEach(el => {
    const key = el.getAttribute("data-i18n");
    const txt = t(key);
    if (txt !== key) el.textContent = txt;
  });
  // Attributes — e.g. data-i18n-placeholder="auth.email_placeholder"
  root.querySelectorAll("*").forEach(el => {
    for (const attr of el.attributes) {
      if (!attr.name.startsWith("data-i18n-")) continue;
      const target = attr.name.replace("data-i18n-", "");
      const txt = t(attr.value);
      if (txt !== attr.value) el.setAttribute(target, txt);
    }
  });
  // Title
  const titleKey = document.documentElement.getAttribute("data-i18n-title");
  if (titleKey) {
    const txt = t(titleKey);
    if (txt && txt !== titleKey) document.title = txt;
  }
}

export async function setLocale(locale) {
  if (locale === current) return;
  await loadLocale(locale);
}

export function init() {
  return loadLocale(pickInitialLocale());
}
