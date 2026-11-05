/* =============================================================
   Mobile nav + auth-aware nav links, for pages that can't load
   script.js (e.g. match.html, which declares its own top-level
   `state`/`$`/APPS_SCRIPT_URL and would collide with it).
   ============================================================= */
document.addEventListener("DOMContentLoaded", () => {
  const yearEl = document.getElementById("year");
  if (yearEl) yearEl.textContent = new Date().getFullYear();

  const toggle = document.getElementById("nav-toggle");
  const nav = document.getElementById("site-nav");
  if (toggle && nav) {
    toggle.addEventListener("click", () => {
      const expanded = toggle.getAttribute("aria-expanded") === "true";
      toggle.setAttribute("aria-expanded", !expanded);
      nav.classList.toggle("is-open");
    });
  }

  // Header dropdowns (Explore, Community): same behaviour as script.js.
  const dropdowns = Array.from(document.querySelectorAll(".site-nav .nav-dropdown"));
  const closeDropdown = (d) => {
    d.classList.remove("is-open");
    const t = d.querySelector(".nav-dropdown-toggle");
    if (t) t.setAttribute("aria-expanded", "false");
  };
  dropdowns.forEach((dropdown) => {
    const t = dropdown.querySelector(".nav-dropdown-toggle");
    if (!t) return;
    t.addEventListener("click", (e) => {
      e.stopPropagation();
      dropdowns.filter((d) => d !== dropdown).forEach(closeDropdown);
      t.setAttribute("aria-expanded", String(dropdown.classList.toggle("is-open")));
    });
  });
  document.addEventListener("click", (e) => {
    dropdowns.forEach((d) => { if (!d.contains(e.target)) closeDropdown(d); });
  });
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") dropdowns.forEach(closeDropdown);
  });

  const loginLink = document.getElementById("nav-login");
  const accountLink = document.getElementById("nav-account");
  if ((loginLink || accountLink) && window.SCA && window.SCA.ready) {
    const paint = (session) => {
      const loggedIn = !!session;
      if (loginLink) loginLink.hidden = loggedIn;
      if (accountLink) accountLink.hidden = !loggedIn;
    };
    window.SCA.getSession().then(paint);
    window.SCA.onAuthChange(paint);
  }
});
