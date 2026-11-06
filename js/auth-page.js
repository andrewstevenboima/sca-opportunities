/* =============================================================
   login.html page logic — tabs, region/country cascade, submit
   ============================================================= */
document.addEventListener("DOMContentLoaded", () => {
  const tabLogin = document.getElementById("tab-login");
  const tabSignup = document.getElementById("tab-signup");
  const formLogin = document.getElementById("form-login");
  const formSignup = document.getElementById("form-signup");
  const errorBox = document.getElementById("auth-error");
  const successBox = document.getElementById("auth-success");

  if (!tabLogin) return; // not on login.html

  function showError(msg) {
    errorBox.textContent = msg;
    errorBox.classList.add("is-visible");
    successBox.classList.remove("is-visible");
  }

  function showSuccess(msg) {
    successBox.textContent = msg;
    successBox.classList.add("is-visible");
    errorBox.classList.remove("is-visible");
  }

  function clearMessages() {
    errorBox.classList.remove("is-visible");
    successBox.classList.remove("is-visible");
  }

  const formCode = document.getElementById("form-code");
  const formReset = document.getElementById("form-reset");
  const forms = [formLogin, formSignup, formCode, formReset].filter(Boolean);
  const cognito = () => Boolean(window.SCA && window.SCA.usesCognito);

  // Email and password kept in memory between steps (sign up -> code ->
  // logged in), never stored.
  let pending = { email: "", password: "" };

  function showForm(form) {
    forms.forEach((f) => f.classList.toggle("is-active", f === form));
  }

  function switchTab(which) {
    clearMessages();
    const isLogin = which === "login";
    tabLogin.classList.toggle("is-active", isLogin);
    tabSignup.classList.toggle("is-active", !isLogin);
    tabLogin.setAttribute("aria-selected", String(isLogin));
    tabSignup.setAttribute("aria-selected", String(!isLogin));
    showForm(isLogin ? formLogin : formSignup);
  }

  function showCodeStep(email, note) {
    email = email.trim().toLowerCase();
    pending.email = email;
    document.getElementById("code-lead").textContent =
      `${note || "We've emailed a 6-digit code to"} ${email}. Enter it to confirm your email.`;
    document.getElementById("code-input").value = "";
    showForm(formCode);
    document.getElementById("code-input").focus();
  }

  function showResetStep(email) {
    email = email.trim().toLowerCase();
    pending.email = email;
    document.getElementById("reset-lead").textContent =
      `If ${email} has an account, we've emailed it a 6-digit code. Enter it and choose a new password.`;
    document.getElementById("reset-code").value = "";
    document.getElementById("reset-password").value = "";
    showForm(formReset);
    document.getElementById("reset-code").focus();
  }

  async function finishLogin() {
    await window.SCA.signIn({ email: pending.email, password: pending.password });
    pending = { email: "", password: "" };
    window.location.href = "account.html";
  }

  tabLogin.addEventListener("click", () => switchTab("login"));
  tabSignup.addEventListener("click", () => switchTab("signup"));

  // Region -> country cascade, covering all of Africa (see js/regions.js)
  const regionSelect = document.getElementById("signup-region");
  const countrySelect = document.getElementById("signup-country");

  Object.keys(window.SCA_REGIONS || {}).forEach((region) => {
    const opt = document.createElement("option");
    opt.value = region;
    opt.textContent = region;
    regionSelect.appendChild(opt);
  });

  regionSelect.addEventListener("change", () => {
    const countries = (window.SCA_REGIONS || {})[regionSelect.value] || [];
    countrySelect.innerHTML = "";
    if (!countries.length) {
      countrySelect.disabled = true;
      countrySelect.innerHTML = '<option value="">Select region first</option>';
      return;
    }
    countrySelect.disabled = false;
    countrySelect.innerHTML =
      '<option value="">Select country</option>' +
      countries.map((c) => `<option value="${c}">${c}</option>`).join("");
  });

  // ---- Log in ----
  formLogin.addEventListener("submit", async (e) => {
    e.preventDefault();
    clearMessages();
    if (!window.SCA || !window.SCA.ready) {
      showError("Accounts aren't set up yet — the site owner still needs to connect Supabase.");
      return;
    }
    const email = document.getElementById("login-email").value.trim();
    const password = document.getElementById("login-password").value;
    const btn = formLogin.querySelector(".auth-submit");
    btn.disabled = true;
    try {
      pending = { email, password };
      await finishLogin();
    } catch (err) {
      if (cognito() && err.code === "UserNotConfirmedException") {
        // Signed up but never entered the code: send a fresh one.
        try { await window.SCA.resendCode(email); } catch (_) { /* the step still works with the old code */ }
        showCodeStep(email, "Please confirm your email first. We've sent a new 6-digit code to");
      } else if (cognito() && err.code === "PasswordResetRequiredException") {
        try { await window.SCA.resetPassword(email); } catch (_) { /* ignore */ }
        showResetStep(email);
        showSuccess("Please choose a new password to continue.");
      } else {
        showError(err.message || "Couldn't log in. Check your email and password.");
      }
    } finally {
      btn.disabled = false;
    }
  });

  document.getElementById("forgot-password").addEventListener("click", async () => {
    clearMessages();
    if (!window.SCA || !window.SCA.ready) {
      showError("Accounts aren't set up yet — the site owner still needs to connect Supabase.");
      return;
    }
    const email = document.getElementById("login-email").value.trim();
    if (!email) {
      showError("Enter your email above first, then click “Forgot password?” again.");
      return;
    }
    try {
      await window.SCA.resetPassword(email);
      if (cognito()) showResetStep(email);
      else showSuccess("Password reset link sent — check your email.");
    } catch (err) {
      showError(err.message || "Couldn't send reset email.");
    }
  });

  // ---- Sign up ----
  formSignup.addEventListener("submit", async (e) => {
    e.preventDefault();
    clearMessages();
    if (!window.SCA || !window.SCA.ready) {
      showError("Accounts aren't set up yet — the site owner still needs to connect Supabase.");
      return;
    }
    const fullName = document.getElementById("signup-name").value.trim();
    const email = document.getElementById("signup-email").value.trim();
    const password = document.getElementById("signup-password").value;
    const region = regionSelect.value;
    const country = countrySelect.value;
    const yearOfStudy = document.getElementById("signup-year").value;
    const university = document.getElementById("signup-university").value.trim();

    const btn = formSignup.querySelector(".auth-submit");
    btn.disabled = true;
    try {
      const data = await window.SCA.signUp({
        email,
        password,
        fullName,
        region,
        country,
        yearOfStudy,
        university,
      });
      if (data.session) {
        window.location.href = "account.html";
      } else if (cognito()) {
        pending = { email, password };
        formSignup.reset();
        showCodeStep(email);
      } else {
        formSignup.reset();
        switchTab("login");
        showSuccess(`We've sent a confirmation link to ${email}. Open it to activate your account, then log in here. Don't see it? Check your Spam or Junk folder — the link works from there too.`);
      }
    } catch (err) {
      showError(err.message || "Couldn't create your account.");
    } finally {
      btn.disabled = false;
    }
  });
  // ---- Confirm email with the 6-digit code (Cognito) ----
  if (formCode) {
    formCode.addEventListener("submit", async (e) => {
      e.preventDefault();
      clearMessages();
      const code = document.getElementById("code-input").value.trim();
      if (!/^[0-9]{6}$/.test(code)) {
        showError("Enter the 6-digit code from the email.");
        return;
      }
      const btn = formCode.querySelector(".auth-submit");
      btn.disabled = true;
      try {
        await window.SCA.confirmSignUp(pending.email, code);
        if (pending.password) {
          await finishLogin();
        } else {
          switchTab("login");
          document.getElementById("login-email").value = pending.email;
          showSuccess("Email confirmed. Log in with your password.");
        }
      } catch (err) {
        showError(err.message || "Couldn't confirm the code.");
      } finally {
        btn.disabled = false;
      }
    });

    document.getElementById("code-resend").addEventListener("click", async () => {
      clearMessages();
      try {
        await window.SCA.resendCode(pending.email);
        showSuccess(`A new code is on its way to ${pending.email}.`);
      } catch (err) {
        showError(err.message || "Couldn't send a new code.");
      }
    });
  }

  // ---- New password with the 6-digit code (Cognito) ----
  if (formReset) {
    formReset.addEventListener("submit", async (e) => {
      e.preventDefault();
      clearMessages();
      const code = document.getElementById("reset-code").value.trim();
      const password = document.getElementById("reset-password").value;
      if (!/^[0-9]{6}$/.test(code)) {
        showError("Enter the 6-digit code from the email.");
        return;
      }
      if (password.length < 10) {
        showError("Use a password of at least 10 characters.");
        return;
      }
      const btn = formReset.querySelector(".auth-submit");
      btn.disabled = true;
      try {
        await window.SCA.confirmResetPassword(pending.email, code, password);
        pending.password = password;
        await finishLogin();
      } catch (err) {
        showError(err.message || "Couldn't save the new password.");
      } finally {
        btn.disabled = false;
      }
    });

    document.getElementById("reset-back").addEventListener("click", () => switchTab("login"));
  }
});
