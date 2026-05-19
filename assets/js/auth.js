// M7_Studio — magic-link sign in.

import { supabase, getSession } from "./lib/supabase.js";
import * as i18n from "./lib/i18n.js";
import { initTheme } from "./lib/theme.js";
import { $, on, isValidEmail } from "./lib/utils.js";
import { error as toastError } from "./lib/toast.js";

async function boot() {
  initTheme();
  await i18n.init();

  // If already logged in, jump to dashboard.
  const session = await getSession();
  if (session) {
    location.replace("./dashboard.html");
    return;
  }

  // Detect auth callback (supabase-js handles tokens in URL automatically).
  if (location.hash.includes("access_token") || location.search.includes("code=")) {
    $("#login-form").classList.add("hidden");
    $("#login-completing").classList.remove("hidden");
    // supabase-js will trigger onAuthStateChange — listen and redirect.
    supabase.auth.onAuthStateChange((event) => {
      if (event === "SIGNED_IN") location.replace("./dashboard.html");
    });
    return;
  }

  // Language toggles
  document.querySelectorAll("[data-set-locale]").forEach(btn => {
    on(btn, "click", async () => {
      await i18n.setLocale(btn.dataset.setLocale);
      // Refresh active state
      document.querySelectorAll("[data-set-locale]").forEach(b =>
        b.classList.toggle("active", b.dataset.setLocale === i18n.currentLocale())
      );
    });
    btn.classList.toggle("active", btn.dataset.setLocale === i18n.currentLocale());
  });

  const form = $("#login-form");
  const emailInput = $("#email");
  const submitBtn  = $("#submit-btn");
  const errorBox   = $("#login-error");
  const sentBox    = $("#login-sent");
  const sentEmail  = $("#sent-email");

  on(form, "submit", async (e) => {
    e.preventDefault();
    errorBox.textContent = "";
    const email = emailInput.value.trim();
    if (!isValidEmail(email)) {
      errorBox.textContent = i18n.t("auth.error_invalid_email");
      return;
    }
    submitBtn.disabled = true;
    submitBtn.querySelector(".btn__label").textContent = i18n.t("auth.sending");
    submitBtn.querySelector(".btn__spinner").classList.remove("hidden");

    const redirectTo = new URL("./login.html", location.href).toString();
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: { emailRedirectTo: redirectTo },
    });

    submitBtn.disabled = false;
    submitBtn.querySelector(".btn__label").textContent = i18n.t("auth.send_link");
    submitBtn.querySelector(".btn__spinner").classList.add("hidden");

    if (error) {
      toastError(i18n.t("auth.error_send_failed"));
      errorBox.textContent = error.message || i18n.t("auth.error_send_failed");
      return;
    }

    form.classList.add("hidden");
    sentEmail.textContent = email;
    sentBox.classList.remove("hidden");
  });
}

boot();
