// M7_Studio — toast notifications.

const CONTAINER_ID = "m7-toast-container";

function ensureContainer() {
  let el = document.getElementById(CONTAINER_ID);
  if (!el) {
    el = document.createElement("div");
    el.id = CONTAINER_ID;
    el.className = "m7-toast-container";
    document.body.appendChild(el);
  }
  return el;
}

const ICONS = {
  success: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>`,
  error:   `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="13"/><line x1="12" y1="16" x2="12" y2="16"/></svg>`,
  info:    `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="11"/><line x1="12" y1="8" x2="12" y2="8"/></svg>`,
  warning: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12" y2="17"/></svg>`,
};

export function toast(message, kind = "info", duration = 3200) {
  const container = ensureContainer();
  const el = document.createElement("div");
  el.className = `m7-toast m7-toast--${kind}`;
  el.setAttribute("role", "status");
  el.innerHTML = `<span class="m7-toast__icon">${ICONS[kind] || ICONS.info}</span><span class="m7-toast__msg"></span>`;
  el.querySelector(".m7-toast__msg").textContent = message;
  container.appendChild(el);

  // animate in
  requestAnimationFrame(() => el.classList.add("m7-toast--in"));

  const dismiss = () => {
    el.classList.remove("m7-toast--in");
    el.classList.add("m7-toast--out");
    setTimeout(() => el.remove(), 220);
  };
  setTimeout(dismiss, duration);
  el.addEventListener("click", dismiss);
  return dismiss;
}

export const success = (m, d) => toast(m, "success", d);
export const error   = (m, d) => toast(m, "error",   d);
export const info    = (m, d) => toast(m, "info",    d);
export const warning = (m, d) => toast(m, "warning", d);
