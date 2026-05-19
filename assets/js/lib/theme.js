// M7_Studio — theme controller (light / dark / system).

const KEY = "m7.theme";

export function getTheme() {
  return localStorage.getItem(KEY) || "system";
}

export function applyTheme(theme) {
  if (theme === "system") {
    document.documentElement.removeAttribute("data-theme");
  } else {
    document.documentElement.setAttribute("data-theme", theme);
  }
  localStorage.setItem(KEY, theme);
}

export function initTheme() {
  applyTheme(getTheme());
}
