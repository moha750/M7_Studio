// M7_Studio — dashboard list of QR codes.

import { supabase } from "./lib/supabase.js";
import * as i18n from "./lib/i18n.js";
import { initTheme } from "./lib/theme.js";
import { requireAuth } from "./lib/router.js";
import { mountNav } from "./lib/nav.js";
import { $, $$, on, debounce, escapeHtml, formatRelative, formatNumber, copyText } from "./lib/utils.js";
import { success, error as toastError } from "./lib/toast.js";
import { QrEngine, hydrateConfig } from "./qr-engine.js";

const REDIRECT_BASE = window.M7_CONFIG.REDIRECT_BASE;

let session;
let allCodes = [];

async function boot() {
  initTheme();
  await i18n.init();
  session = await requireAuth();
  if (!session) return;
  mountNav("dashboard");

  await loadCodes();
  bindToolbar();

  // Refresh translations when locale changes.
  document.addEventListener("m7:locale-changed", () => render());
}

async function loadCodes() {
  // Fetch codes and their aggregated stats in parallel.
  const [codesRes, statsRes] = await Promise.all([
    supabase
      .from("qr_codes")
      .select("id, short_code, name, target_url, is_active, design_config, logo_path, created_at, updated_at")
      .order("created_at", { ascending: false }),
    supabase
      .from("qr_code_stats")
      .select("qr_code_id, scans_count, unique_count, last_scan_at"),
  ]);

  if (codesRes.error) {
    toastError(i18n.t("common.error_generic"));
    console.error(codesRes.error);
    return;
  }

  const statsById = new Map((statsRes.data || []).map(s => [s.qr_code_id, s]));
  allCodes = (codesRes.data || []).map(c => {
    const s = statsById.get(c.id);
    return {
      ...c,
      scans_count: s?.scans_count ?? 0,
      unique_count: s?.unique_count ?? 0,
      last_scan:    s?.last_scan_at ?? null,
    };
  });
  render();
}

function bindToolbar() {
  const search = $("#search");
  on(search, "input", debounce(() => render(search.value.trim().toLowerCase()), 120));

  on($("#refresh-btn"), "click", async () => {
    $("#refresh-btn").querySelector(".spinner").classList.remove("hidden");
    await loadCodes();
    $("#refresh-btn").querySelector(".spinner").classList.add("hidden");
  });
}

function render(filter = "") {
  const list = filter
    ? allCodes.filter(c =>
        c.name.toLowerCase().includes(filter) ||
        (c.target_url || "").toLowerCase().includes(filter) ||
        c.short_code.toLowerCase().includes(filter))
    : allCodes;

  const host = $("#qr-grid");
  const empty = $("#empty");

  if (!list.length) {
    host.innerHTML = "";
    empty.classList.remove("hidden");
    empty.querySelector("[data-i18n]")?.replaceWith(
      Object.assign(document.createElement("h3"), { textContent: i18n.t("dashboard.empty_title") })
    );
    return;
  }
  empty.classList.add("hidden");

  host.innerHTML = "";
  for (const code of list) {
    host.appendChild(buildCard(code));
  }
}

function buildCard(code) {
  const article = document.createElement("article");
  article.className = "qr-card fade-in";
  article.dataset.id = code.id;

  const link = `${REDIRECT_BASE}/${code.short_code}`;
  const lastScanText = code.last_scan
    ? formatRelative(code.last_scan, i18n.t)
    : i18n.t("dashboard.never_scanned");

  article.innerHTML = `
    <div class="qr-card__thumb" data-thumb></div>
    <div>
      <div class="qr-card__title">
        ${escapeHtml(code.name)}
        ${code.is_active
          ? `<span class="badge badge--success badge--dot">${escapeHtml(i18n.t("dashboard.status_active"))}</span>`
          : `<span class="badge badge--warning badge--dot">${escapeHtml(i18n.t("dashboard.status_inactive"))}</span>`}
      </div>
      <div class="qr-card__url" title="${escapeHtml(code.target_url)}">${escapeHtml(code.target_url)}</div>
    </div>
    <div class="qr-card__stats">
      <span class="qr-card__stat">
        <strong>${formatNumber(code.scans_count, i18n.currentLocale())}</strong>
        <span class="text-soft text-xs"> ${escapeHtml(i18n.t("dashboard.scans"))}</span>
      </span>
      <span class="text-soft text-xs">${escapeHtml(lastScanText)}</span>
    </div>
    <div class="qr-card__actions">
      <a class="btn btn-secondary btn-sm" href="./edit.html?id=${code.id}" data-i18n="dashboard.action_edit">Edit</a>
      <a class="btn btn-secondary btn-sm" href="./analytics.html?id=${code.id}" data-i18n="dashboard.action_analytics">Analytics</a>
      <button class="btn btn-ghost btn-sm" data-action="copy-link" title="${escapeHtml(i18n.t("create.copy_link"))}">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="width:14px;height:14px;"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>
      </button>
      <button class="btn btn-ghost btn-sm" data-action="toggle-active" title="${escapeHtml(i18n.t("dashboard.action_toggle_active"))}">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="width:14px;height:14px;">${code.is_active
          ? '<rect x="5" y="5" width="14" height="14" rx="1"/>'
          : '<polygon points="5 3 19 12 5 21 5 3"/>'}</svg>
      </button>
      <button class="btn btn-ghost btn-sm" data-action="delete" title="${escapeHtml(i18n.t("dashboard.action_delete"))}">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="width:14px;height:14px;color:var(--danger);"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/></svg>
      </button>
    </div>
  `;

  // Render thumbnail
  queueMicrotask(() => {
    try {
      const cfg = hydrateConfig(code.design_config);
      cfg.width = 240; cfg.height = 240;
      const engine = new QrEngine(cfg, link);
      engine.mount(article.querySelector("[data-thumb]"));
    } catch (e) { console.error("thumb fail:", e); }
  });

  // Actions
  on(article.querySelector('[data-action="copy-link"]'), "click", async () => {
    if (await copyText(link)) success(i18n.t("create.link_copied"));
  });
  on(article.querySelector('[data-action="toggle-active"]'), "click", async () => {
    const next = !code.is_active;
    const { error } = await supabase.from("qr_codes").update({ is_active: next }).eq("id", code.id);
    if (error) return toastError(i18n.t("common.error_generic"));
    code.is_active = next;
    render();
  });
  on(article.querySelector('[data-action="delete"]'), "click", () => {
    showConfirmDialog({
      title: i18n.t("dashboard.confirm_delete_title"),
      desc:  i18n.t("dashboard.confirm_delete_desc"),
      confirmLabel: i18n.t("common.delete"),
      kind: "danger",
      onConfirm: async () => {
        const { error } = await supabase.from("qr_codes").delete().eq("id", code.id);
        if (error) return toastError(i18n.t("common.error_generic"));
        allCodes = allCodes.filter(c => c.id !== code.id);
        render();
        success(i18n.t("dashboard.delete_confirmed"));
      },
    });
  });

  return article;
}

function showConfirmDialog({ title, desc, confirmLabel, kind = "primary", onConfirm }) {
  const backdrop = document.createElement("div");
  backdrop.className = "m7-modal-backdrop";
  backdrop.innerHTML = `
    <div class="m7-modal">
      <h3></h3>
      <p></p>
      <div class="actions">
        <button class="btn btn-ghost" data-act="cancel" data-i18n="common.cancel">Cancel</button>
        <button class="btn btn-${kind}" data-act="ok"></button>
      </div>
    </div>
  `;
  backdrop.querySelector("h3").textContent = title;
  backdrop.querySelector("p").textContent = desc;
  backdrop.querySelector('[data-act="ok"]').textContent = confirmLabel;
  i18n.applyTo(backdrop);

  document.body.appendChild(backdrop);
  const close = () => backdrop.remove();
  on(backdrop, "click", (e) => { if (e.target === backdrop) close(); });
  on(backdrop.querySelector('[data-act="cancel"]'), "click", close);
  on(backdrop.querySelector('[data-act="ok"]'), "click", async () => {
    close();
    await onConfirm?.();
  });
}

boot();
