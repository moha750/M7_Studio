// M7_Studio — QR engine.
// Thin wrapper around `qr-code-styling`. Centralizes:
//   • the default design config
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
