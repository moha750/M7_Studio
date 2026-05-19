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

// Convert a camelCase or kebab-case shape id ("extraRounded" / "extra-rounded")
// into a friendly title ("Extra Rounded").
function formatShapeLabel(id) {
  return String(id)
    .replace(/[-_]/g, " ")
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/\b\w/g, c => c.toUpperCase());
}

function radioGroup(container, options, current, onChange) {
  container.innerHTML = "";
  options.forEach(opt => {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "radio-chip__label";
    btn.textContent = formatShapeLabel(opt);
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
  // Rules:
  //  - One mode at a time: solid OR gradient, exclusive.
  //  - Gradient applies to the main dots only. Corners always solid (clean look + scan reliability).
  //  - Corner colors follow the main color by default; user can override via "Customize corners".
  //  - Background is independent (transparent by default).
  // qr-code-styling deep-merges on .update() and won't drop a removed `gradient`, so we use
  // engine.rebuild() to recreate the instance whenever the mode might leave stale state.
  const modeChips        = $$("#color-mode .radio-chip__label");
  const solidPane        = $("#color-solid");
  const gradientPane     = $("#color-gradient");
  const fgSolid          = $("#fg-color");
  const gradC1           = $("#grad-color1");
  const gradC2           = $("#grad-color2");
  const gradType         = $("#grad-type");
  const gradAngle        = $("#grad-angle");
  const useCustomCorners = $("#use-custom-corners");
  const customCornersRow = $("#custom-corners-row");
  const cornerSqColor    = $("#corner-sq-color");
  const cornerDotColor   = $("#corner-dot-color");
  const useBg = $("#use-bg");
  const bgRow = $("#bg-row");
  const bg    = $("#bg-color");

  let colorMode = "solid"; // "solid" | "gradient"

  function setColorModeUI(mode) {
    colorMode = mode;
    modeChips.forEach(c => c.classList.toggle("active", c.dataset.mode === mode));
    solidPane.classList.toggle("hidden", mode !== "solid");
    gradientPane.classList.toggle("hidden", mode !== "gradient");
  }

  function mainColor() {
    return colorMode === "solid" ? fgSolid.value : gradC1.value;
  }

  function applyForeground() {
    const dotsType      = engine.config.dotsOptions?.type          || "rounded";
    const cornerSqType  = engine.config.cornersSquareOptions?.type || "rounded";
    const cornerDotType = engine.config.cornersDotOptions?.type    || "rounded";

    // Build dotsOptions fresh (replace, don't mutate — to avoid sticky gradient).
    if (colorMode === "solid") {
      engine.config.dotsOptions = { type: dotsType, color: fgSolid.value };
    } else {
      const c1 = gradC1.value;
      const c2 = gradC2.value;
      const grad = {
        type: gradType.value,
        rotation: D2R(parseFloat(gradAngle.value) || 0),
        colorStops: [
          { offset: 0, color: c1 },
          { offset: 1, color: c2 },
        ],
      };
      engine.config.dotsOptions = { type: dotsType, color: c1, gradient: grad };
    }

    // Corners are always solid. Follow main color unless user customized.
    const sqColor  = useCustomCorners.checked ? cornerSqColor.value  : mainColor();
    const dotColor = useCustomCorners.checked ? cornerDotColor.value : mainColor();
    engine.config.cornersSquareOptions = { type: cornerSqType,  color: sqColor };
    engine.config.cornersDotOptions    = { type: cornerDotType, color: dotColor };

    engine.rebuild();
    trigger();
  }

  function setBgColor(c) {
    engine.config.backgroundOptions.color = c;
    engine.update({});
    trigger();
  }

  modeChips.forEach(chip => {
    on(chip, "click", () => {
      setColorModeUI(chip.dataset.mode);
      applyForeground();
    });
  });

  on(fgSolid,  "input",  applyForeground);
  on(gradC1,   "input",  applyForeground);
  on(gradC2,   "input",  applyForeground);
  on(gradType, "change", applyForeground);
  on(gradAngle,"input",  applyForeground);

  on(useCustomCorners, "change", () => {
    customCornersRow.classList.toggle("hidden", !useCustomCorners.checked);
    // When turning on, seed corner pickers with the current main color so the
    // user sees parity before they start tweaking.
    if (useCustomCorners.checked) {
      const seed = mainColor();
      cornerSqColor.value  = seed;
      cornerDotColor.value = seed;
    }
    applyForeground();
  });
  on(cornerSqColor,  "input", applyForeground);
  on(cornerDotColor, "input", applyForeground);

  on(bg, "input", () => setBgColor(bg.value));
  on(useBg, "change", () => {
    bgRow.classList.toggle("hidden", !useBg.checked);
    setBgColor(useBg.checked ? bg.value : "transparent");
  });

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
  const logoInput    = $("#logo-input");
  const logoSize     = $("#logo-size");
  const logoHide     = $("#logo-hide-dots");
  const logoRemove   = $("#logo-remove");
  const logoPreview  = $("#logo-preview");
  const logoActions  = $("#logo-actions");
  const logoRemoveBg = $("#logo-remove-bg");
  const logoRestoreBg = $("#logo-restore-bg");
  const logoBgTools  = $("#logo-bg-tools");
  const bgTolerance  = $("#bg-tolerance");
  const bgToleranceVal = $("#bg-tolerance-val");

  // Holds the unmodified upload so the user can re-apply at different tolerance or restore.
  let originalLogo = null;

  function showLogoUI(dataUrl) {
    logoPreview.src = dataUrl;
    logoPreview.classList.remove("hidden");
    logoActions.classList.remove("hidden");
    logoActions.style.display = "flex";
  }
  function hideLogoUI() {
    logoPreview.src = "";
    logoPreview.classList.add("hidden");
    logoActions.classList.add("hidden");
    logoBgTools.classList.add("hidden");
  }

  on(logoInput, "change", async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const url = await readFileAsDataURL(file);
    originalLogo = url;
    engine.config.image = url;
    engine.update({});
    showLogoUI(url);
    logoBgTools.classList.add("hidden");
    trigger();
  });

  on(logoRemove, "click", () => {
    originalLogo = null;
    engine.config.image = null;
    engine.update({});
    logoInput.value = "";
    hideLogoUI();
    trigger();
  });

  on(logoRemoveBg, "click", async () => {
    if (!originalLogo) return;
    logoRemoveBg.disabled = true;
    try {
      const processed = await removeImageBackground(originalLogo, parseInt(bgTolerance.value, 10));
      engine.config.image = processed;
      engine.update({});
      logoPreview.src = processed;
      logoBgTools.classList.remove("hidden");
      trigger();
    } finally {
      logoRemoveBg.disabled = false;
    }
  });

  const applyTolerance = debounce(async () => {
    if (!originalLogo) return;
    const processed = await removeImageBackground(originalLogo, parseInt(bgTolerance.value, 10));
    engine.config.image = processed;
    engine.update({});
    logoPreview.src = processed;
    trigger();
  }, 120);

  on(bgTolerance, "input", () => {
    bgToleranceVal.textContent = bgTolerance.value;
    applyTolerance();
  });

  on(logoRestoreBg, "click", () => {
    if (!originalLogo) return;
    engine.config.image = originalLogo;
    engine.update({});
    logoPreview.src = originalLogo;
    logoBgTools.classList.add("hidden");
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

    // Background
    const bgColor = c.backgroundOptions?.color;
    const hasBg = !!bgColor && bgColor !== "transparent" && bgColor !== "rgba(0,0,0,0)";
    useBg.checked = hasBg;
    bgRow.classList.toggle("hidden", !hasBg);
    bg.value = hasBg ? bgColor : "#ffffff";

    // Foreground — detect mode from saved config
    const grad = c.dotsOptions?.gradient;
    let main;
    if (grad) {
      setColorModeUI("gradient");
      gradC1.value    = grad.colorStops?.[0]?.color || "#6366f1";
      gradC2.value    = grad.colorStops?.[1]?.color || "#a855f7";
      gradType.value  = grad.type || "linear";
      gradAngle.value = Math.round(R2D(grad.rotation || 0));
      main = gradC1.value;
    } else {
      setColorModeUI("solid");
      fgSolid.value = c.dotsOptions?.color || "#6366f1";
      main = fgSolid.value;
    }

    // Detect whether corners use custom colors (different from main color).
    const sqHex  = (c.cornersSquareOptions?.color || main).toLowerCase();
    const dotHex = (c.cornersDotOptions?.color    || main).toLowerCase();
    const cornersCustom = sqHex !== main.toLowerCase() || dotHex !== main.toLowerCase();
    useCustomCorners.checked = cornersCustom;
    customCornersRow.classList.toggle("hidden", !cornersCustom);
    if (cornersCustom) {
      cornerSqColor.value  = c.cornersSquareOptions?.color || main;
      cornerDotColor.value = c.cornersDotOptions?.color    || main;
    }

    margin.value = c.margin ?? 8;
    logoSize.value = c.imageOptions?.imageSize ?? 0.25;
    logoHide.checked = c.imageOptions?.hideBackgroundDots ?? true;
    if (c.image) {
      originalLogo = originalLogo || c.image;
      showLogoUI(c.image);
    } else {
      hideLogoUI();
    }
  }

  syncFromConfig();
  return { syncFromConfig };
}

// Edge-sample dominant color + remove similar pixels with soft-edge falloff.
// tolerance: 5–80, higher = removes more aggressively.
async function removeImageBackground(dataUrl, tolerance) {
  const img = await loadImage(dataUrl);
  const w = img.naturalWidth || img.width;
  const h = img.naturalHeight || img.height;
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  ctx.drawImage(img, 0, 0, w, h);

  const imgData = ctx.getImageData(0, 0, w, h);
  const px = imgData.data;

  // Sample edge pixels to estimate background color (median per channel).
  const rs = [], gs = [], bs = [];
  const stepX = Math.max(1, Math.floor(w / 60));
  const stepY = Math.max(1, Math.floor(h / 60));
  const sample = (x, y) => {
    const i = (y * w + x) * 4;
    if (px[i + 3] < 8) return; // skip already-transparent pixels
    rs.push(px[i]); gs.push(px[i + 1]); bs.push(px[i + 2]);
  };
  for (let x = 0; x < w; x += stepX) { sample(x, 0); sample(x, h - 1); }
  for (let y = stepY; y < h - 1; y += stepY) { sample(0, y); sample(w - 1, y); }
  if (!rs.length) return dataUrl;

  const median = (arr) => {
    const s = arr.slice().sort((a, b) => a - b);
    return s[Math.floor(s.length / 2)];
  };
  const bgR = median(rs), bgG = median(gs), bgB = median(bs);

  // Map slider 5–80 → distance threshold (roughly 30 → light cleanup, 80 → aggressive).
  const maxDist = (tolerance / 100) * 220;
  const softZone = maxDist * 0.35; // smooth edges instead of hard cut

  for (let i = 0; i < px.length; i += 4) {
    const dr = px[i] - bgR;
    const dg = px[i + 1] - bgG;
    const db = px[i + 2] - bgB;
    const dist = Math.sqrt(dr * dr + dg * dg + db * db);
    if (dist < maxDist - softZone) {
      px[i + 3] = 0;
    } else if (dist < maxDist) {
      const t = (dist - (maxDist - softZone)) / softZone;
      px[i + 3] = Math.round(px[i + 3] * t);
    }
  }

  ctx.putImageData(imgData, 0, 0);
  return canvas.toDataURL("image/png");
}

function loadImage(src) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload  = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });
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
      <div class="field">
        <label class="field-label" data-i18n="create.color_label">Code color</label>
        <div id="color-mode" class="radio-chips">
          <button type="button" class="radio-chip__label active" data-mode="solid" data-i18n="create.color_solid">Solid</button>
          <button type="button" class="radio-chip__label" data-mode="gradient" data-i18n="create.color_gradient">Gradient</button>
        </div>
      </div>

      <div id="color-solid" class="field mt-4">
        <input id="fg-color" type="color" class="input-color" value="#6366f1"/>
      </div>

      <div id="color-gradient" class="hidden mt-4">
        <div class="grid" style="grid-template-columns:1fr 1fr;gap:var(--space-3);">
          <div class="field">
            <label class="field-label" data-i18n="create.gradient_color1" for="grad-color1">Color 1</label>
            <input id="grad-color1" type="color" class="input-color" value="#6366f1"/>
          </div>
          <div class="field">
            <label class="field-label" data-i18n="create.gradient_color2" for="grad-color2">Color 2</label>
            <input id="grad-color2" type="color" class="input-color" value="#a855f7"/>
          </div>
        </div>
        <div class="grid mt-3" style="grid-template-columns:1fr 1fr;gap:var(--space-3);">
          <div class="field">
            <label class="field-label" data-i18n="create.gradient_type" for="grad-type">Type</label>
            <select id="grad-type" class="select">
              <option value="linear" data-i18n="create.gradient_linear">Linear</option>
              <option value="radial" data-i18n="create.gradient_radial">Radial</option>
            </select>
          </div>
          <div class="field">
            <label class="field-label" data-i18n="create.gradient_rotation" for="grad-angle">Angle</label>
            <input id="grad-angle" type="range" min="0" max="360" value="45" class="input-range"/>
          </div>
        </div>
        <div class="field-hint mt-2" data-i18n="create.gradient_note">Gradient applies to the dots only.</div>
      </div>

      <label class="switch mt-5">
        <input id="use-custom-corners" type="checkbox"/>
        <span class="switch__track"></span>
        <span data-i18n="create.customize_corners">Customize corner colors</span>
      </label>
      <div id="custom-corners-row" class="hidden mt-3">
        <div class="grid" style="grid-template-columns:1fr 1fr;gap:var(--space-3);">
          <div class="field">
            <label class="field-label" data-i18n="create.corner_square" for="corner-sq-color">Corner square</label>
            <input id="corner-sq-color" type="color" class="input-color" value="#6366f1"/>
          </div>
          <div class="field">
            <label class="field-label" data-i18n="create.corner_dot" for="corner-dot-color">Corner dot</label>
            <input id="corner-dot-color" type="color" class="input-color" value="#6366f1"/>
          </div>
        </div>
      </div>

      <div style="border-top:1px solid var(--border);margin-top:var(--space-6);padding-top:var(--space-5);">
        <label class="switch">
          <input id="use-bg" type="checkbox"/>
          <span class="switch__track"></span>
          <span data-i18n="create.use_bg">Add background color</span>
        </label>
        <div id="bg-row" class="field hidden mt-3">
          <input id="bg-color" type="color" class="input-color" value="#ffffff"/>
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

      <div id="logo-actions" class="hidden" style="display:flex;gap:var(--space-2);flex-wrap:wrap;margin-top:var(--space-2);">
        <button id="logo-remove-bg" type="button" class="btn btn-secondary btn-sm">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="width:14px;height:14px;"><path d="M3 3h18v18H3z" opacity=".2"/><path d="m5 21 6-6 4 4 8-8"/><circle cx="8" cy="8" r="2"/></svg>
          <span data-i18n="create.remove_bg">Remove background</span>
        </button>
        <button id="logo-remove" type="button" class="btn btn-ghost btn-sm" data-i18n="create.remove_logo">Remove logo</button>
      </div>

      <div id="logo-bg-tools" class="hidden mt-4">
        <div class="field">
          <label class="field-label" for="bg-tolerance" style="display:flex;justify-content:space-between;">
            <span data-i18n="create.bg_tolerance">Tolerance</span>
            <span id="bg-tolerance-val" class="text-muted" style="font-weight:500;">30</span>
          </label>
          <input id="bg-tolerance" type="range" min="5" max="80" value="30" class="input-range"/>
        </div>
        <button id="logo-restore-bg" type="button" class="btn btn-ghost btn-sm mt-2" data-i18n="create.restore_bg">Restore original</button>
      </div>

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
