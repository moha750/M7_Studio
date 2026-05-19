// M7_Studio — settings page.

import { supabase } from "./lib/supabase.js";
import * as i18n from "./lib/i18n.js";
import { initTheme, applyTheme, getTheme } from "./lib/theme.js";
import { requireAuth, URLS } from "./lib/router.js";
import { $, on } from "./lib/utils.js";
import { success, error as toastError } from "./lib/toast.js";
import { mountNav } from "./lib/nav.js";

async function boot() {
  initTheme();
  await i18n.init();
  const session = await requireAuth();
  if (!session) return;

  mountNav("settings");

  // Load profile
  const { data: profile } = await supabase
    .from("profiles")
    .select("email, display_name, locale")
    .eq("id", session.user.id)
    .maybeSingle();

  $("#email").value = profile?.email || session.user.email || "";
  $("#display-name").value = profile?.display_name || "";

  // Theme selector
  const currentTheme = getTheme();
  document.querySelectorAll("[data-set-theme]").forEach(btn => {
    btn.classList.toggle("active", btn.dataset.setTheme === currentTheme);
    on(btn, "click", () => {
      applyTheme(btn.dataset.setTheme);
      document.querySelectorAll("[data-set-theme]").forEach(b =>
        b.classList.toggle("active", b.dataset.setTheme === btn.dataset.setTheme));
    });
  });

  // Locale selector
  document.querySelectorAll("[data-set-locale]").forEach(btn => {
    btn.classList.toggle("active", btn.dataset.setLocale === i18n.currentLocale());
    on(btn, "click", async () => {
      await i18n.setLocale(btn.dataset.setLocale);
      // Persist to profile
      await supabase
        .from("profiles")
        .update({ locale: btn.dataset.setLocale })
        .eq("id", session.user.id);
      document.querySelectorAll("[data-set-locale]").forEach(b =>
        b.classList.toggle("active", b.dataset.setLocale === i18n.currentLocale()));
    });
  });

  // Save profile
  on($("#save-account"), "click", async () => {
    const display_name = $("#display-name").value.trim();
    const { error } = await supabase
      .from("profiles")
      .update({ display_name })
      .eq("id", session.user.id);
    if (error) {
      toastError(i18n.t("common.error_generic"));
      return;
    }
    success(i18n.t("settings.saved"));
  });

  // Logout
  on($("#logout"), "click", async () => {
    await supabase.auth.signOut();
    location.replace(URLS.HOME_URL);
  });
}

boot();
