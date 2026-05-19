// M7_Studio — QR engine.
// Thin wrapper around `qr-code-styling`. Centralizes:
//   • the default design config
//   • theme presets
//   • config <-> form mapping
//   • render / update / export
//
// Library docs: https://github.com/kozakdenys/qr-code-styling

import QRCodeStyling from "https://esm.sh/qr-code-styling@1.8.4";

export const DOTS_STYLES = [
  "square", "dots", "rounded", "extra-rounded", "classy", "classy-rounded",
];
export const CORNER_SQUARE_STYLES = ["square", "dot", "extra-rounded"];
export const CORNER_DOT_STYLES    = ["square", "dot"];
export const EC_LEVELS = ["L", "M", "Q", "H"];

export function defaultConfig() {
  return {
    width: 280,
    height: 280,
    type: "svg",
    margin: 8,
    qrOptions: { errorCorrectionLevel: "H" },
    dotsOptions: { type: "rounded", color: "#6366f1" },
    backgroundOptions: { color: "#ffffff" },
    cornersSquareOptions: { type: "extra-rounded", color: "#6366f1" },
    cornersDotOptions:    { type: "dot",          color: "#6366f1" },
    imageOptions: { imageSize: 0.25, margin: 6, hideBackgroundDots: true, crossOrigin: "anonymous" },
    image: null,
  };
}

// Preset themes — applied on top of the current config (preserves data).
export const THEMES = [
  { id: "indigo",  name: "Indigo",  fg: "#6366f1", bg: "#ffffff", gradient: ["#6366f1", "#a855f7"] },
  { id: "ocean",   name: "Ocean",   fg: "#0284c7", bg: "#f0f9ff", gradient: ["#0284c7", "#06b6d4"] },
  { id: "sunset",  name: "Sunset",  fg: "#ea580c", bg: "#fff7ed", gradient: ["#ea580c", "#dc2626"] },
  { id: "forest",  name: "Forest",  fg: "#16a34a", bg: "#f0fdf4", gradient: ["#16a34a", "#65a30d"] },
  { id: "royal",   name: "Royal",   fg: "#7c3aed", bg: "#faf5ff", gradient: ["#7c3aed", "#db2777"] },
  { id: "mono",    name: "Mono",    fg: "#0f172a", bg: "#ffffff", gradient: null },
  { id: "ink",     name: "Ink",     fg: "#ffffff", bg: "#0f172a", gradient: null },
  { id: "gold",    name: "Gold",    fg: "#b45309", bg: "#fffbeb", gradient: ["#b45309", "#f59e0b"] },
  { id: "rose",    name: "Rose",    fg: "#db2777", bg: "#fdf2f8", gradient: ["#db2777", "#9333ea"] },
  { id: "neon",    name: "Neon",    fg: "#22d3ee", bg: "#0b1020", gradient: ["#22d3ee", "#a855f7"] },
];

// Apply a theme by id onto a config object (mutating).
export function applyTheme(config, themeId) {
  const t = THEMES.find(x => x.id === themeId);
  if (!t) return config;

  config.backgroundOptions = { color: t.bg };

  if (t.gradient) {
    const grad = {
      type: "linear",
      rotation: 0.7853981633974483, // 45deg
      colorStops: [
        { offset: 0, color: t.gradient[0] },
        { offset: 1, color: t.gradient[1] },
      ],
    };
    config.dotsOptions = { type: config.dotsOptions?.type || "rounded", color: t.gradient[0], gradient: grad };
    config.cornersSquareOptions = { type: config.cornersSquareOptions?.type || "extra-rounded", color: t.gradient[0] };
    config.cornersDotOptions    = { type: config.cornersDotOptions?.type    || "dot",          color: t.gradient[1] };
  } else {
    config.dotsOptions = { type: config.dotsOptions?.type || "rounded", color: t.fg };
    delete config.dotsOptions.gradient;
    config.cornersSquareOptions = { type: config.cornersSquareOptions?.type || "extra-rounded", color: t.fg };
    config.cornersDotOptions    = { type: config.cornersDotOptions?.type    || "dot",          color: t.fg };
  }
  return config;
}

// Strip transient pieces (image as data URL, container size) before storing in DB.
export function serializeConfig(config) {
  const clone = JSON.parse(JSON.stringify(config));
  // Keep `image` if it is an https/storage URL; drop data URLs (they can be huge).
  if (typeof clone.image === "string" && clone.image.startsWith("data:")) {
    clone.image = null;
  }
  return clone;
}

// Merge a saved config back onto defaults (so missing fields don't break).
export function hydrateConfig(saved) {
  const base = defaultConfig();
  if (!saved) return base;
  return deepMerge(base, saved);
}

function deepMerge(a, b) {
  if (typeof a !== "object" || a === null) return b;
  if (typeof b !== "object" || b === null) return b ?? a;
  const out = Array.isArray(a) ? [...a] : { ...a };
  for (const k of Object.keys(b)) {
    out[k] = (k in a) ? deepMerge(a[k], b[k]) : b[k];
  }
  return out;
}

export class QrEngine {
  constructor(config = defaultConfig(), data = "") {
    this.config = { ...config, data };
    this.instance = new QRCodeStyling(this.config);
    this._container = null;
  }
  mount(container) {
    this._container = container;
    container.innerHTML = "";
    this.instance.append(container);
  }
  setData(data) {
    this.config.data = data;
    this.instance.update({ data });
  }
  update(partial) {
    Object.assign(this.config, partial);
    this.instance.update(this.config);
  }
  replaceConfig(newConfig) {
    this.config = { ...newConfig, data: this.config.data };
    this.instance.update(this.config);
  }
  async toBlob(format = "png") {
    return this.instance.getRawData(format);
  }
  async download(filename, format = "png") {
    return this.instance.download({ name: filename, extension: format });
  }
}
