// M7_Studio — shared top navigation for /app/* pages.

import { supabase, getSession } from "./supabase.js";
import * as i18n from "./i18n.js";
import { on } from "./utils.js";

export async function mountNav(active = "dashboard") {
  const host = document.getElementById("app-nav");
  if (!host) return;

  host.innerHTML = `
    <nav class="nav">
      <div class="nav__inner">
        <a class="brand" href="./dashboard.html">
          <span class="brand__mark">M7</span>
          <span class="brand__name" data-i18n="meta.app_name">M7 Studio</span>
        </a>
        <div class="nav__links">
          <a class="nav__link" data-route="dashboard" href="./dashboard.html" data-i18n="nav.dashboard">Dashboard</a>
          <a class="nav__link" data-route="create" href="./create.html" data-i18n="nav.create">Create</a>
          <a class="nav__link" data-route="settings" href="./settings.html" data-i18n="nav.settings">Settings</a>
        </div>
        <div class="nav__spacer"></div>
        <div class="nav__actions">
          <div class="lang-toggle" role="group" aria-label="Language">
            <button type="button" data-set-locale="ar">عربي</button>
            <button type="button" data-set-locale="en">EN</button>
          </div>
          <button class="btn btn-ghost btn-sm" id="nav-logout" data-i18n="nav.logout">Sign out</button>
        </div>
      </div>
    </nav>
  `;

  // Apply i18n to the freshly-injected nav.
  i18n.applyTo(host);

  // Active link
  host.querySelectorAll(".nav__link").forEach(a =>
    a.classList.toggle("nav__link--active", a.dataset.route === active));

  // Language toggle
  host.querySelectorAll("[data-set-locale]").forEach(btn => {
    btn.classList.toggle("active", btn.dataset.setLocale === i18n.currentLocale());
    on(btn, "click", async () => {
      const session = await getSession();
      await i18n.setLocale(btn.dataset.setLocale);
      if (session) {
        supabase
          .from("profiles")
          .update({ locale: btn.dataset.setLocale })
          .eq("id", session.user.id);
      }
      host.querySelectorAll("[data-set-locale]").forEach(b =>
        b.classList.toggle("active", b.dataset.setLocale === i18n.currentLocale()));
    });
  });

  // Logout
  on(host.querySelector("#nav-logout"), "click", async () => {
    await supabase.auth.signOut();
    location.replace("../index.html");
  });

  // Refresh nav text when locale changes (e.g., from settings page).
  document.addEventListener("m7:locale-changed", () => i18n.applyTo(host));
}
