// M7_Studio — create / edit page logic.
// Reused by both create.html (no id param) and edit.html (?id=<uuid>).

import { supabase } from "./lib/supabase.js";
import * as i18n from "./lib/i18n.js";
import { initTheme } from "./lib/theme.js";
import { requireAuth } from "./lib/router.js";
import { mountNav } from "./lib/nav.js";
import {
  $, on, generateShortCode, isValidUrl, copyText, downloadBlob,
} from "./lib/utils.js";
import { success, error as toastError } from "./lib/toast.js";
import { QrEngine, hydrateConfig, serializeConfig } from "./qr-engine.js";
import { renderControlsPanel, bindControls } from "./design-controls.js";

const REDIRECT_BASE = window.M7_CONFIG.REDIRECT_BASE;

let session;
let editingId = null;
let editingShortCode = null;
let engine;
let pendingLogoFile = null;   // File to upload on save (if any)

async function boot() {
  initTheme();
  await i18n.init();
  session = await requireAuth();
  if (!session) return;

  const params = new URLSearchParams(location.search);
  editingId = params.get("id");
  mountNav(editingId ? "create" : "create");

  // Load existing code if editing.
  let initialConfig = hydrateConfig(null);
  if (editingId) {
    const { data: row, error } = await supabase
      .from("qr_codes")
      .select("id, short_code, name, target_url, is_active, design_config, logo_path")
      .eq("id", editingId)
      .maybeSingle();
    if (error || !row) { toastError(i18n.t("common.error_generic")); return; }
    editingShortCode = row.short_code;
    $("#name").value = row.name;
    $("#target-url").value = row.target_url;
    $("#is-active").checked = row.is_active;
    initialConfig = hydrateConfig(row.design_config);
    // If a logo URL was stored, attach it.
    if (row.logo_path) {
      const { data: pub } = supabase.storage.from("qr-logos").getPublicUrl(row.logo_path);
      if (pub?.publicUrl) initialConfig.image = pub.publicUrl;
    }
    $("#page-title").textContent = i18n.t("create.title_edit");
    $("#export-row").classList.remove("hidden");
  }

  // Engine + preview
  const shortCodeForPreview = editingShortCode || generateShortCode();
  const previewLink = `${REDIRECT_BASE}/${shortCodeForPreview}`;
  engine = new QrEngine(initialConfig, previewLink);
  engine.mount($("#preview"));
  $("#preview-link").textContent = previewLink;

  // Controls
  renderControlsPanel($("#controls"));
  bindControls(engine, (cfg) => {
    // re-render when config changes (engine handles it internally, this is a hook)
  });

  // Logo file capture (for storage upload on save)
  const logoInput = document.getElementById("logo-input");
  if (logoInput) {
    on(logoInput, "change", (e) => {
      pendingLogoFile = e.target.files?.[0] || null;
    });
  }
  const logoRemove = document.getElementById("logo-remove");
  if (logoRemove) {
    on(logoRemove, "click", () => { pendingLogoFile = null; });
  }

  // Form
  on($("#save-btn"), "click", () => saveCode(false));
  on($("#copy-link-btn"), "click", async () => {
    if (await copyText(previewLink)) success(i18n.t("create.link_copied"));
  });

  // Export buttons
  on($("#download-png"), "click", () => downloadExport("png"));
  on($("#download-svg"), "click", () => downloadExport("svg"));
  on($("#download-jpeg"), "click", () => downloadExport("jpeg"));

  // Re-localize on language switch.
  document.addEventListener("m7:locale-changed", () => {
    renderControlsPanel($("#controls"));
    bindControls(engine, () => {});
  });
}

async function downloadExport(format) {
  if (!editingId) return toastError(i18n.t("create.save_first_to_export"));
  const filename = `m7-${editingShortCode || "qr"}`;
  await engine.download(filename, format);
}

async function saveCode() {
  const name = $("#name").value.trim();
  const target = $("#target-url").value.trim();
  const isActive = $("#is-active").checked;

  $("#error-name").textContent = "";
  $("#error-target").textContent = "";
  if (!name) { $("#error-name").textContent = i18n.t("create.error_name_required"); return; }
  if (!target) { $("#error-target").textContent = i18n.t("create.error_url_required"); return; }
  if (!isValidUrl(target)) { $("#error-target").textContent = i18n.t("create.error_url_invalid"); return; }

  const btn = $("#save-btn");
  btn.disabled = true;
  const labelEl = btn.querySelector(".btn__label");
  const originalLabel = labelEl.textContent;
  labelEl.textContent = i18n.t("create.saving");

  try {
    // 1) Upload logo to Storage if a new file was picked.
    let logoPath = null;
    if (pendingLogoFile) {
      const ext = (pendingLogoFile.name.split(".").pop() || "png").toLowerCase();
      logoPath = `${session.user.id}/${(editingShortCode || generateShortCode())}-${Date.now()}.${ext}`;
      const { error: upErr } = await supabase.storage
        .from("qr-logos")
        .upload(logoPath, pendingLogoFile, { upsert: true, cacheControl: "31536000" });
      if (upErr) throw upErr;
      const { data: pub } = supabase.storage.from("qr-logos").getPublicUrl(logoPath);
      engine.config.image = pub.publicUrl;
      engine.update({});
    }

    // 2) Persist row.
    const design_config = serializeConfig(engine.config);
    delete design_config.data; // store-time: data is reconstructed from short_code at render-time

    if (editingId) {
      const { error } = await supabase
        .from("qr_codes")
        .update({ name, target_url: target, is_active: isActive, design_config, ...(logoPath ? { logo_path: logoPath } : {}) })
        .eq("id", editingId);
      if (error) throw error;
    } else {
      const short = editingShortCode || generateShortCode();
      const { data, error } = await supabase
        .from("qr_codes")
        .insert({
          user_id: session.user.id,
          short_code: short,
          name,
          target_url: target,
          is_active: isActive,
          design_config,
          logo_path: logoPath,
        })
        .select("id, short_code")
        .single();
      if (error) throw error;
      editingId = data.id;
      editingShortCode = data.short_code;
      // Switch URL to /edit.html so the user can keep working without a 404 on reload.
      const newUrl = new URL("./edit.html", location.href);
      newUrl.searchParams.set("id", editingId);
      history.replaceState({}, "", newUrl.toString());
      $("#export-row").classList.remove("hidden");
    }
    success(i18n.t("create.saved_success"));
  } catch (e) {
    console.error(e);
    toastError(e.message || i18n.t("common.error_generic"));
  } finally {
    btn.disabled = false;
    labelEl.textContent = originalLabel;
  }
}

boot();
