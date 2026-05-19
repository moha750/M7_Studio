// M7_Studio — design controls binder.
// Reads/writes the QR engine config from a form panel.

import { $, $$, on, readFileAsDataURL, debounce } from "./lib/utils.js";
import {
  DOTS_STYLES, CORNER_SQUARE_STYLES, CORNER_DOT_STYLES, EC_LEVELS,
} from "./qr-engine.js";
import * as i18n from "./lib/i18n.js";

// degrees ↔ radians
const D2R = (d) => (d * Math.PI) / 180;
const R2D = (r) => (r * 180) / Math.PI;

function radioGroup(container, options, current, onChange) {
  container.innerHTML = "";
  options.forEach(opt => {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "radio-chip__label";
    btn.textContent = opt;
    btn.classList.toggle("active", opt === current);
    on(btn, "click", () => {
      [...container.children].forEach(c => c.classList.remove("active"));
      btn.classList.add("active");
      onChange(opt);
    });
    container.appendChild(btn);
  });
}

export function bindControls(engine, onChange) {
  const trigger = debounce(() => onChange(engine.config), 80);

  // ------------ Colors ------------
  const fg  = $("#fg-color");
  const bg  = $("#bg-color");
  const useGradient = $("#use-gradient");
  const gradientType = $("#gradient-type");
  const gradColor2 = $("#gradient-color2");
  const gradRotation = $("#gradient-rotation");
  const gradRow = $("#gradient-row");

  function setFgColor(c) {
    delete engine.config.dotsOptions.gradient;
    engine.config.dotsOptions.color = c;
    engine.config.cornersSquareOptions.color = c;
    engine.config.cornersDotOptions.color = c;
    engine.update({});
    trigger();
  }
  function setBgColor(c) {
    engine.config.backgroundOptions.color = c;
    engine.update({});
    trigger();
  }
  function rebuildGradient() {
    if (!useGradient.checked) {
      delete engine.config.dotsOptions.gradient;
      delete engine.config.cornersSquareOptions.gradient;
      engine.update({});
      trigger();
      return;
    }
    const grad = {
      type: gradientType.value,
      rotation: D2R(parseFloat(gradRotation.value || 0)),
      colorStops: [
        { offset: 0, color: fg.value },
        { offset: 1, color: gradColor2.value },
      ],
    };
    engine.config.dotsOptions.gradient = grad;
    engine.config.cornersSquareOptions.gradient = { ...grad };
    engine.update({});
    trigger();
  }

  on(fg, "input", () => { if (useGradient.checked) rebuildGradient(); else setFgColor(fg.value); });
  on(bg, "input", () => setBgColor(bg.value));
  on(useGradient, "change", () => { gradRow.classList.toggle("hidden", !useGradient.checked); rebuildGradient(); });
  on(gradientType, "change", rebuildGradient);
  on(gradColor2, "input", rebuildGradient);
  on(gradRotation, "input", rebuildGradient);

  // ------------ Shapes ------------
  radioGroup($("#dots-style"), DOTS_STYLES, engine.config.dotsOptions.type, (v) => {
    engine.config.dotsOptions.type = v; engine.update({}); trigger();
  });
  radioGroup($("#corner-square-style"), CORNER_SQUARE_STYLES, engine.config.cornersSquareOptions.type, (v) => {
    engine.config.cornersSquareOptions.type = v; engine.update({}); trigger();
  });
  radioGroup($("#corner-dot-style"), CORNER_DOT_STYLES, engine.config.cornersDotOptions.type, (v) => {
    engine.config.cornersDotOptions.type = v; engine.update({}); trigger();
  });

  // ------------ Logo ------------
  const logoInput  = $("#logo-input");
  const logoSize   = $("#logo-size");
  const logoHide   = $("#logo-hide-dots");
  const logoRemove = $("#logo-remove");
  const logoPreview= $("#logo-preview");

  on(logoInput, "change", async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const url = await readFileAsDataURL(file);
    engine.config.image = url;
    engine.update({});
    logoPreview.src = url;
    logoPreview.classList.remove("hidden");
    logoRemove.classList.remove("hidden");
    trigger();
  });
  on(logoRemove, "click", () => {
    engine.config.image = null;
    engine.update({});
    logoInput.value = "";
    logoPreview.src = "";
    logoPreview.classList.add("hidden");
    logoRemove.classList.add("hidden");
    trigger();
  });
  on(logoSize, "input", () => {
    engine.config.imageOptions.imageSize = parseFloat(logoSize.value);
    engine.update({}); trigger();
  });
  on(logoHide, "change", () => {
    engine.config.imageOptions.hideBackgroundDots = logoHide.checked;
    engine.update({}); trigger();
  });

  // ------------ Advanced ------------
  const margin = $("#margin");
  const ec     = $("#ec");
  on(margin, "input", () => {
    engine.config.margin = parseInt(margin.value, 10) || 0;
    engine.update({}); trigger();
  });
  radioGroup($("#ec"), EC_LEVELS, engine.config.qrOptions.errorCorrectionLevel, (v) => {
    engine.config.qrOptions.errorCorrectionLevel = v;
    engine.update({}); trigger();
  });

  function syncFromConfig() {
    const c = engine.config;
    fg.value = c.dotsOptions.color || "#6366f1";
    bg.value = c.backgroundOptions.color || "#ffffff";
    const hasGrad = !!c.dotsOptions.gradient;
    useGradient.checked = hasGrad;
    gradRow.classList.toggle("hidden", !hasGrad);
    if (hasGrad) {
      gradientType.value = c.dotsOptions.gradient.type || "linear";
      gradColor2.value = c.dotsOptions.gradient.colorStops?.[1]?.color || "#a855f7";
      gradRotation.value = Math.round(R2D(c.dotsOptions.gradient.rotation || 0));
    }
    margin.value = c.margin ?? 8;
    logoSize.value = c.imageOptions?.imageSize ?? 0.25;
    logoHide.checked = c.imageOptions?.hideBackgroundDots ?? true;
    if (c.image) {
      logoPreview.src = c.image;
      logoPreview.classList.remove("hidden");
      logoRemove.classList.remove("hidden");
    }
  }

  syncFromConfig();
  return { syncFromConfig };
}

// Render the static control-panel markup. Returns the host element.
// Called from create.html scripts to keep the HTML lean.
export function renderControlsPanel(host) {
  host.innerHTML = `
    <div class="tabs__bar" role="tablist">
      <button type="button" class="tab active" data-tab="colors" role="tab" aria-selected="true">
        <svg class="tab__icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="13.5" cy="6.5" r="1.5"/><circle cx="17.5" cy="10.5" r="1.5"/><circle cx="8.5" cy="7.5" r="1.5"/><circle cx="6.5" cy="12.5" r="1.5"/><path d="M12 2C6.5 2 2 6.5 2 12s4.5 10 10 10c.926 0 1.648-.746 1.648-1.688 0-.437-.18-.835-.437-1.125-.29-.289-.438-.652-.438-1.125a1.64 1.64 0 0 1 1.668-1.668h1.996c3.051 0 5.555-2.503 5.555-5.554C21.965 6.012 17.461 2 12 2z"/></svg>
        <span class="tab__label" data-i18n="create.section_colors">Colors</span>
      </button>
      <button type="button" class="tab" data-tab="shapes" role="tab" aria-selected="false">
        <svg class="tab__icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="3.5"/><rect x="3" y="14" width="7" height="7" rx="3.5"/><rect x="14" y="14" width="7" height="7" rx="1"/></svg>
        <span class="tab__label" data-i18n="create.section_shapes">Shapes</span>
      </button>
      <button type="button" class="tab" data-tab="logo" role="tab" aria-selected="false">
        <svg class="tab__icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg>
        <span class="tab__label" data-i18n="create.section_logo">Logo</span>
      </button>
      <button type="button" class="tab" data-tab="advanced" role="tab" aria-selected="false">
        <svg class="tab__icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="4" y1="6" x2="20" y2="6"/><line x1="4" y1="12" x2="20" y2="12"/><line x1="4" y1="18" x2="20" y2="18"/><circle cx="9" cy="6" r="2" fill="var(--bg-elevated)"/><circle cx="15" cy="12" r="2" fill="var(--bg-elevated)"/><circle cx="7" cy="18" r="2" fill="var(--bg-elevated)"/></svg>
        <span class="tab__label" data-i18n="create.section_options">Advanced</span>
      </button>
    </div>

    <div class="tab-panel active" data-panel="colors" role="tabpanel">
      <div class="grid" style="grid-template-columns:1fr 1fr;gap:var(--space-4);">
        <div class="field">
          <label class="field-label" data-i18n="create.fg_color" for="fg-color">Foreground</label>
          <input id="fg-color" type="color" class="input-color" value="#6366f1"/>
        </div>
        <div class="field">
          <label class="field-label" data-i18n="create.bg_color" for="bg-color">Background</label>
          <input id="bg-color" type="color" class="input-color" value="#ffffff"/>
        </div>
      </div>
      <label class="switch mt-5">
        <input id="use-gradient" type="checkbox"/>
        <span class="switch__track"></span>
        <span data-i18n="create.gradient_toggle">Use gradient</span>
      </label>
      <div id="gradient-row" class="grid hidden mt-4" style="grid-template-columns:1fr 1fr 1fr;gap:var(--space-3);">
        <div class="field">
          <label class="field-label" data-i18n="create.gradient_type" for="gradient-type">Type</label>
          <select id="gradient-type" class="select">
            <option value="linear" data-i18n="create.gradient_linear">Linear</option>
            <option value="radial" data-i18n="create.gradient_radial">Radial</option>
          </select>
        </div>
        <div class="field">
          <label class="field-label" data-i18n="create.gradient_color2" for="gradient-color2">Color 2</label>
          <input id="gradient-color2" type="color" class="input-color" value="#a855f7"/>
        </div>
        <div class="field">
          <label class="field-label" data-i18n="create.gradient_rotation" for="gradient-rotation">Rotation</label>
          <input id="gradient-rotation" type="range" min="0" max="360" value="45" class="input-range"/>
        </div>
      </div>
    </div>

    <div class="tab-panel" data-panel="shapes" role="tabpanel">
      <div class="field">
        <label class="field-label" data-i18n="create.dots_style">Dots style</label>
        <div id="dots-style" class="radio-chips"></div>
      </div>
      <div class="field mt-5">
        <label class="field-label" data-i18n="create.corner_square_style">Corner square</label>
        <div id="corner-square-style" class="radio-chips"></div>
      </div>
      <div class="field mt-5">
        <label class="field-label" data-i18n="create.corner_dot_style">Corner dot</label>
        <div id="corner-dot-style" class="radio-chips"></div>
      </div>
    </div>

    <div class="tab-panel" data-panel="logo" role="tabpanel">
      <label class="input-file-label">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="width:16px;height:16px;"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>
        <span data-i18n="create.upload_logo">Upload a logo</span>
        <input id="logo-input" type="file" accept="image/png,image/jpeg,image/svg+xml"/>
      </label>
      <img id="logo-preview" class="hidden" alt="" style="max-width:64px;max-height:64px;margin-top:var(--space-2);border-radius:var(--radius-2);background:var(--bg-subtle);padding:6px;"/>
      <button id="logo-remove" type="button" class="btn btn-ghost btn-sm hidden mt-2" data-i18n="create.remove_logo">Remove logo</button>
      <div class="field mt-5">
        <label class="field-label" for="logo-size" data-i18n="create.logo_size">Logo size</label>
        <input id="logo-size" type="range" min="0.10" max="0.40" step="0.02" value="0.25" class="input-range"/>
      </div>
      <label class="switch mt-4">
        <input id="logo-hide-dots" type="checkbox" checked/>
        <span class="switch__track"></span>
        <span data-i18n="create.logo_hide_dots">Hide dots behind logo</span>
      </label>
    </div>

    <div class="tab-panel" data-panel="advanced" role="tabpanel">
      <div class="field">
        <label class="field-label" for="margin" data-i18n="create.margin">Margin</label>
        <input id="margin" type="range" min="0" max="30" value="8" class="input-range"/>
      </div>
      <div class="field mt-5">
        <label class="field-label" data-i18n="create.error_correction">Error correction</label>
        <div id="ec" class="radio-chips"></div>
      </div>
    </div>
  `;
  i18n.applyTo(host);
  bindTabs(host);
}

function bindTabs(host) {
  const tabs   = host.querySelectorAll(".tab");
  const panels = host.querySelectorAll(".tab-panel");
  tabs.forEach(tab => {
    on(tab, "click", () => {
      const target = tab.dataset.tab;
      tabs.forEach(t => {
        const active = t === tab;
        t.classList.toggle("active", active);
        t.setAttribute("aria-selected", String(active));
      });
      panels.forEach(p => p.classList.toggle("active", p.dataset.panel === target));
    });
  });
}
