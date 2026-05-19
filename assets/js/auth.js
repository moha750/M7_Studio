// M7_Studio — email + password sign in (single-user app).

import { supabase, getSession } from "./lib/supabase.js";
import * as i18n from "./lib/i18n.js";
import { initTheme } from "./lib/theme.js";
import { $, on, isValidEmail } from "./lib/utils.js";

async function boot() {
  initTheme();
  await i18n.init();

  const session = await getSession();
  if (session) {
    location.replace("./dashboard.html");
    return;
  }

  // Legacy auth-callback safety net (e.g. an older magic-link still arrives).
  if (location.hash.includes("access_token") || location.search.includes("code=")) {
    $("#login-form").classList.add("hidden");
    $("#auth-completing").classList.remove("hidden");
    supabase.auth.onAuthStateChange((event) => {
      if (event === "SIGNED_IN") location.replace("./dashboard.html");
    });
    return;
  }

  setupLanguageToggles();
  setupForm();
}

function setupLanguageToggles() {
  document.querySelectorAll("[data-set-locale]").forEach(btn => {
    on(btn, "click", async () => {
      await i18n.setLocale(btn.dataset.setLocale);
      document.querySelectorAll("[data-set-locale]").forEach(b =>
        b.classList.toggle("active", b.dataset.setLocale === i18n.currentLocale())
      );
    });
    btn.classList.toggle("active", btn.dataset.setLocale === i18n.currentLocale());
  });
}

function setupForm() {
  const form           = $("#login-form");
  const emailInput     = $("#email");
  const passwordInput  = $("#password");
  const passwordToggle = $("#password-toggle");
  const emailError     = $("#email-error");
  const passwordError  = $("#password-error");
  const formError      = $("#form-error");

  on(passwordToggle, "click", () => {
    const showing = passwordInput.type === "text";
    passwordInput.type = showing ? "password" : "text";
    passwordToggle.textContent = i18n.t(showing ? "auth.show_password" : "auth.hide_password");
  });

  on(form, "submit", async (e) => {
    e.preventDefault();
    emailError.textContent = "";
    passwordError.textContent = "";
    formError.textContent = "";

    const email = emailInput.value.trim();
    const password = passwordInput.value;

    if (!isValidEmail(email)) {
      emailError.textContent = i18n.t("auth.error_invalid_email");
      return;
    }
    if (!password) {
      passwordError.textContent = i18n.t("auth.error_password_required");
      return;
    }

    setLoading(true);
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    setLoading(false);

    if (error) {
      formError.textContent = mapAuthError(error);
      return;
    }
    location.replace("./dashboard.html");
  });
}

function setLoading(isLoading) {
  const btn = $("#submit-btn");
  btn.disabled = isLoading;
  btn.querySelector(".btn__spinner").classList.toggle("hidden", !isLoading);
  $("#submit-label").textContent = i18n.t(isLoading ? "auth.signing_in" : "auth.signin_button");
}

function mapAuthError(error) {
  const msg = (error?.message || "").toLowerCase();
  if (msg.includes("invalid login") || msg.includes("invalid credentials") || msg.includes("invalid email or password")) {
    return i18n.t("auth.error_invalid_credentials");
  }
  if (msg.includes("rate limit") || msg.includes("too many")) {
    return i18n.t("auth.error_rate_limit");
  }
  return error?.message || i18n.t("auth.error_signin_failed");
}

boot();
