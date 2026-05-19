// M7_Studio — analytics page for a single QR.

import { supabase } from "./lib/supabase.js";
import * as i18n from "./lib/i18n.js";
import { initTheme, getTheme } from "./lib/theme.js";
import { requireAuth } from "./lib/router.js";
import { mountNav } from "./lib/nav.js";
import {
  $, $$, on, formatRelative, formatDate, formatNumber, csvify, downloadBlob, copyText,
} from "./lib/utils.js";
import { success, error as toastError } from "./lib/toast.js";
import { QrEngine, hydrateConfig } from "./qr-engine.js";

const REDIRECT_BASE = window.M7_CONFIG.REDIRECT_BASE;

let session;
let qrRow;          // the qr_codes row
let currentRange = 30;
let allScans = [];  // scans within range
let urlHistory = [];
let charts = {};    // Chart.js instances by id

async function boot() {
  initTheme();
  await i18n.init();
  session = await requireAuth();
  if (!session) return;
  mountNav("analytics");

  const id = new URLSearchParams(location.search).get("id");
  if (!id) {
    toastError(i18n.t("common.error_generic"));
    location.replace("./dashboard.html");
    return;
  }

  // Load Chart.js dynamically (defer CDN cost from other pages).
  await loadChartJs();

  // Load the QR row + history (no range filter on these).
  const [qrRes, historyRes] = await Promise.all([
    supabase.from("qr_codes").select("*").eq("id", id).maybeSingle(),
    supabase.from("url_history").select("*").eq("qr_code_id", id).order("changed_at", { ascending: false }).limit(50),
  ]);
  if (qrRes.error || !qrRes.data) { toastError(i18n.t("common.error_generic")); return; }
  qrRow = qrRes.data;
  urlHistory = historyRes.data || [];

  // Page header.
  $("#page-title").textContent = qrRow.name;
  $("#page-subtitle").textContent = qrRow.target_url;
  $("#preview-link").textContent = `${REDIRECT_BASE}/${qrRow.short_code}`;

  // Render the QR thumbnail.
  try {
    const cfg = hydrateConfig(qrRow.design_config);
    cfg.width = 200; cfg.height = 200;
    const engine = new QrEngine(cfg, `${REDIRECT_BASE}/${qrRow.short_code}`);
    engine.mount($("#qr-thumb"));
    window.__m7_engine = engine; // for download
  } catch (e) { console.error(e); }

  // Range controls.
  $$("[data-range]").forEach(btn => {
    btn.classList.toggle("active", parseInt(btn.dataset.range, 10) === currentRange);
    on(btn, "click", async () => {
      currentRange = parseInt(btn.dataset.range, 10);
      $$("[data-range]").forEach(b => b.classList.toggle("active", b === btn));
      await loadScans();
      renderAll();
    });
  });

  // Actions
  on($("#export-csv"), "click", exportCsv);
  on($("#copy-link-btn"), "click", async () => {
    if (await copyText(`${REDIRECT_BASE}/${qrRow.short_code}`)) success(i18n.t("create.link_copied"));
  });
  on($("#download-qr"), "click", () => window.__m7_engine?.download(`m7-${qrRow.short_code}`, "png"));

  await loadScans();
  renderAll();

  document.addEventListener("m7:locale-changed", renderAll);
}

async function loadScans() {
  let query = supabase.from("qr_scans").select("*").eq("qr_code_id", qrRow.id).order("scanned_at", { ascending: false });
  if (currentRange) {
    const since = new Date();
    since.setDate(since.getDate() - currentRange);
    query = query.gte("scanned_at", since.toISOString());
  }
  const { data, error } = await query.limit(5000);
  if (error) { console.error(error); allScans = []; return; }
  allScans = data || [];
}

function renderAll() {
  renderStats();
  renderTimeline();
  renderCountries();
  renderDevices();
  renderBrowsers();
  renderOs();
  renderHourly();
  renderRecent();
  renderHistory();
}

// ============ stats cards ============
function renderStats() {
  const total = allScans.length;
  const unique = allScans.filter(s => s.is_unique).length;
  const last = allScans[0]?.scanned_at;
  const days = Math.max(1, currentRange || 30);
  const perDay = total / days;
  const loc = i18n.currentLocale();

  $("#stat-total").textContent  = formatNumber(total, loc);
  $("#stat-unique").textContent = formatNumber(unique, loc);
  $("#stat-last").textContent   = last ? formatRelative(last, i18n.t) : "—";
  $("#stat-perday").textContent = formatNumber(perDay.toFixed(1), loc);
}

// ============ timeline ============
function renderTimeline() {
  const days = currentRange || 30;
  const counts = new Array(days).fill(0);
  const labels = new Array(days).fill("").map((_, i) => {
    const d = new Date();
    d.setDate(d.getDate() - (days - 1 - i));
    return d.toISOString().slice(5, 10); // MM-DD
  });
  const today0 = new Date(); today0.setHours(0,0,0,0);
  for (const s of allScans) {
    const d = new Date(s.scanned_at); d.setHours(0,0,0,0);
    const diff = Math.round((today0 - d) / 86400000);
    const idx = days - 1 - diff;
    if (idx >= 0 && idx < days) counts[idx]++;
  }
  chart("timeline", "line", {
    labels,
    datasets: [{
      label: i18n.t("analytics.chart_timeline"),
      data: counts,
      borderColor: "#6366f1",
      backgroundColor: "rgba(99,102,241,.18)",
      borderWidth: 2.5,
      fill: true,
      tension: 0.32,
      pointRadius: 0,
      pointHoverRadius: 4,
    }]
  }, { plugins: { legend: { display: false } } });
}

// ============ countries ============
function renderCountries() {
  const map = new Map();
  for (const s of allScans) {
    const k = s.country || "—";
    map.set(k, (map.get(k) || 0) + 1);
  }
  const top = [...map.entries()].sort((a,b) => b[1]-a[1]).slice(0, 10);
  chart("countries", "bar", {
    labels: top.map(x => x[0]),
    datasets: [{
      data: top.map(x => x[1]),
      backgroundColor: "rgba(99,102,241,.85)",
      borderRadius: 6,
    }]
  }, { indexAxis: "y", plugins: { legend: { display: false } } });
}

// ============ devices ============
function renderDevices() {
  const map = new Map();
  for (const s of allScans) {
    const k = s.device_type || "unknown";
    map.set(k, (map.get(k) || 0) + 1);
  }
  const entries = [...map.entries()];
  chart("devices", "doughnut", {
    labels: entries.map(([k]) => i18n.t(`device.${k}`) === `device.${k}` ? k : i18n.t(`device.${k}`)),
    datasets: [{
      data: entries.map(([,v]) => v),
      backgroundColor: ["#6366f1", "#a855f7", "#06b6d4", "#f59e0b", "#64748b"],
    }],
  }, { plugins: { legend: { position: "bottom" } } });
}

// ============ browsers ============
function renderBrowsers() {
  const map = new Map();
  for (const s of allScans) {
    const k = s.browser || "—";
    map.set(k, (map.get(k) || 0) + 1);
  }
  const top = [...map.entries()].sort((a,b) => b[1]-a[1]).slice(0, 8);
  chart("browsers", "bar", {
    labels: top.map(x => x[0]),
    datasets: [{
      data: top.map(x => x[1]),
      backgroundColor: "rgba(168,85,247,.85)",
      borderRadius: 6,
    }]
  }, { plugins: { legend: { display: false } } });
}

// ============ os ============
function renderOs() {
  const map = new Map();
  for (const s of allScans) {
    const k = s.os || "—";
    map.set(k, (map.get(k) || 0) + 1);
  }
  const top = [...map.entries()].sort((a,b) => b[1]-a[1]).slice(0, 8);
  chart("os", "bar", {
    labels: top.map(x => x[0]),
    datasets: [{
      data: top.map(x => x[1]),
      backgroundColor: "rgba(6,182,212,.85)",
      borderRadius: 6,
    }]
  }, { plugins: { legend: { display: false } } });
}

// ============ hourly bar ============
function renderHourly() {
  const counts = new Array(24).fill(0);
  for (const s of allScans) counts[new Date(s.scanned_at).getHours()]++;
  chart("hourly", "bar", {
    labels: counts.map((_, i) => `${i}:00`),
    datasets: [{
      data: counts,
      backgroundColor: "rgba(34,197,94,.85)",
      borderRadius: 4,
    }]
  }, { plugins: { legend: { display: false } } });
}

// ============ tables ============
function renderRecent() {
  const rows = allScans.slice(0, 50);
  const tbody = $("#recent-tbody");
  tbody.innerHTML = "";
  const loc = i18n.currentLocale();
  if (!rows.length) {
    tbody.innerHTML = `<tr><td colspan="5" class="text-center text-muted" style="padding:var(--space-6);">${i18n.t("analytics.no_data")}</td></tr>`;
    return;
  }
  for (const s of rows) {
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${formatDate(s.scanned_at, loc)}</td>
      <td>${s.country || "—"}</td>
      <td>${s.device_type ? (i18n.t(`device.${s.device_type}`) === `device.${s.device_type}` ? s.device_type : i18n.t(`device.${s.device_type}`)) : "—"}</td>
      <td>${s.browser || "—"}</td>
      <td>${s.os || "—"}</td>
    `;
    tbody.appendChild(tr);
  }
}

function renderHistory() {
  const tbody = $("#history-tbody");
  tbody.innerHTML = "";
  const loc = i18n.currentLocale();
  if (!urlHistory.length) {
    tbody.innerHTML = `<tr><td colspan="3" class="text-center text-muted" style="padding:var(--space-6);">—</td></tr>`;
    return;
  }
  for (const h of urlHistory) {
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${formatDate(h.changed_at, loc)}</td>
      <td style="direction:ltr;font-family:var(--font-mono);font-size:var(--fs-xs);max-width:240px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${h.old_url || "—"}</td>
      <td style="direction:ltr;font-family:var(--font-mono);font-size:var(--fs-xs);max-width:240px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${h.new_url}</td>
    `;
    tbody.appendChild(tr);
  }
}

// ============ csv export ============
function exportCsv() {
  const rows = allScans.map(s => ({
    scanned_at: s.scanned_at,
    country: s.country || "",
    device_type: s.device_type || "",
    browser: s.browser || "",
    os: s.os || "",
    referrer: s.referrer || "",
    is_unique: s.is_unique ? "1" : "0",
  }));
  if (!rows.length) { toastError(i18n.t("analytics.no_data")); return; }
  const csv = csvify(rows);
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  downloadBlob(blob, `m7-${qrRow.short_code}-scans.csv`);
  success("CSV ✓");
}

// ============ helpers ============
function chartColors() {
  const dark = matchMedia("(prefers-color-scheme: dark)").matches
    ? document.documentElement.getAttribute("data-theme") !== "light"
    : document.documentElement.getAttribute("data-theme") === "dark";
  return {
    grid: dark ? "rgba(255,255,255,.06)" : "rgba(15,23,42,.06)",
    text: dark ? "#b6bedb" : "#475569",
  };
}

function chart(id, type, data, opts = {}) {
  const ctx = document.getElementById(`chart-${id}`);
  if (!ctx) return;
  if (charts[id]) charts[id].destroy();
  const c = chartColors();
  charts[id] = new Chart(ctx, {
    type,
    data,
    options: {
      responsive: true,
      maintainAspectRatio: false,
      animation: { duration: 400 },
      scales: type === "doughnut" || type === "pie" ? {} : {
        x: { grid: { color: c.grid }, ticks: { color: c.text } },
        y: { grid: { color: c.grid }, ticks: { color: c.text }, beginAtZero: true },
      },
      plugins: {
        legend: { labels: { color: c.text } },
        tooltip: {
          backgroundColor: "rgba(15,23,42,.92)",
          padding: 10,
          cornerRadius: 8,
        },
      },
      ...opts,
    },
  });
}

function loadChartJs() {
  return new Promise((resolve, reject) => {
    if (window.Chart) return resolve();
    const s = document.createElement("script");
    s.src = "https://cdn.jsdelivr.net/npm/chart.js@4.4.6/dist/chart.umd.min.js";
    s.onload = resolve;
    s.onerror = reject;
    document.head.appendChild(s);
  });
}

boot();
