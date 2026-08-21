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

  function switchTab(which) {
    clearMessages();
    const isLogin = which === "login";
    tabLogin.classList.toggle("is-active", isLogin);
    tabSignup.classList.toggle("is-active", !isLogin);
    tabLogin.setAttribute("aria-selected", String(isLogin));
    tabSignup.setAttribute("aria-selected", String(!isLogin));
    formLogin.classList.toggle("is-active", isLogin);
    formSignup.classList.toggle("is-active", !isLogin);
  }

  tabLogin.addEventListener("click", () => switchTab("login"));
  tabSignup.addEventListener("click", () => switchTab("signup"));

  // Region -> country cascade, scoped to East & West Africa only
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
      await window.SCA.signIn({ email, password });
      window.location.href = "account.html";
    } catch (err) {
      showError(err.message || "Couldn't log in. Check your email and password.");
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
      showSuccess("Password reset link sent — check your email.");
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
      } else {
        showSuccess("Account created — check your email to confirm, then log in.");
        formSignup.reset();
        switchTab("login");
      }
    } catch (err) {
      showError(err.message || "Couldn't create your account.");
    } finally {
      btn.disabled = false;
    }
  });
});
