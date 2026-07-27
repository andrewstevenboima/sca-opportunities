/* =============================================================
   SCA Opportunities — Frontend logic
   ============================================================= */

/* -------------------------------------------------------------
   CONFIG — replace with your deployed Apps Script Web App URL
   ------------------------------------------------------------- */
const APPS_SCRIPT_URL = "https://script.google.com/macros/s/AKfycbw18zxmzIiicaePtqdlds9-rioJVjBRXB5c-4wISad6qo7hGRCAnYF7hf-qp1MIeDgg/exec";

// Fallback: if the Apps Script URL is not set, load from local JSON
// so the site still works during initial setup.
const FALLBACK_JSON = "opportunities.json";

// TODO: auto-refresh hook — when you later add a GitHub Action or
// scheduled scraper that regenerates the Sheet, nothing needs to
// change here. The frontend always reads the latest rows.

/* -------------------------------------------------------------
   State
   ------------------------------------------------------------- */
const state = {
  all: [],              // full list of opportunities
  filtered: [],         // after filter/tab application
  category: "All",
  search: "",
  location: "",
  country: "",          // NEW: country substring filter (from marquee)
  year: "",
  remoteOnly: false,
  openOnly: false,
  bookmarks: new Set(), // in-memory bookmarks for the session
};

/* -------------------------------------------------------------
   DOM refs
   ------------------------------------------------------------- */
const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => document.querySelectorAll(sel);

const grid = $("#opp-grid");
const empty = $("#opp-empty");
const errorEl = $("#opp-error");
const resultsCount = $("#results-count");
const bookmarkChip = $("#bookmark-chip");
const bookmarkCount = $("#bookmark-count");
const statCount = $("#stat-count");
const statUpdated = $("#stat-updated");

/* -------------------------------------------------------------
   Init
   ------------------------------------------------------------- */
document.addEventListener("DOMContentLoaded", () => {
  // Update footer year on all pages
  const yearEl = $("#year");
  if (yearEl) yearEl.textContent = new Date().getFullYear();

  // Wire mobile nav (all pages)
  wireMobileNav();

  // Only wire opportunities logic if this page has the grid
  if (document.getElementById("opp-grid")) {
    wireEvents();
    applyURLParams();
    loadOpportunities();
  }
});

// Mobile hamburger toggle
function wireMobileNav() {
  const toggle = document.getElementById("nav-toggle");
  const nav = document.getElementById("site-nav");
  if (!toggle || !nav) return;
  toggle.addEventListener("click", () => {
    const expanded = toggle.getAttribute("aria-expanded") === "true";
    toggle.setAttribute("aria-expanded", !expanded);
    nav.classList.toggle("is-open");
  });
}

// Apply ?filter=X or ?country=X from URL on page load
function applyURLParams() {
  const params = new URLSearchParams(window.location.search);
  const filterParam = params.get("filter");
  const countryParam = params.get("country");
  const searchParam = params.get("search");

  if (filterParam) {
    state.category = filterParam;
    document.querySelectorAll(".tab").forEach((t) => {
      const active = t.dataset.category === filterParam;
      t.classList.toggle("is-active", active);
      t.setAttribute("aria-selected", active ? "true" : "false");
    });
  }

  if (countryParam) {
    state.country = countryParam;
    const pillWrap = document.getElementById("country-pill-wrap");
    const pillName = document.getElementById("country-pill-name");
    if (pillWrap && pillName) {
      pillName.textContent = countryParam;
      pillWrap.hidden = false;
    }
  }

  if (searchParam) {
    const searchEl = document.getElementById("filter-search");
    if (searchEl) {
      searchEl.value = searchParam;
      state.search = searchParam;
    }
  }
}

/* -------------------------------------------------------------
   Data loading
   ------------------------------------------------------------- */
async function loadOpportunities() {
  try {
    let data = null;

    if (APPS_SCRIPT_URL && !APPS_SCRIPT_URL.startsWith("REPLACE_")) {
      // Live mode — try Apps Script first, gracefully fall back to local JSON
      try {
        const res = await fetch(`${APPS_SCRIPT_URL}?action=opportunities`, {
          method: "GET",
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        data = await res.json();
      } catch (fetchErr) {
        console.info("[SCA] Apps Script fetch failed, falling back to local JSON:", fetchErr.message);
        const res = await fetch(FALLBACK_JSON);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        data = await res.json();
      }
    } else {
      // Dev mode — load from local JSON
      const res = await fetch(FALLBACK_JSON);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      data = await res.json();
    }

    // Accept either { opportunities: [...], updated: "..." } or a raw array
    const list = Array.isArray(data) ? data : data.opportunities || [];
    const updated = Array.isArray(data) ? null : data.updated;

    state.all = list.filter((o) => (o.status || "live").toLowerCase() === "live");

    // Update hero stats (only present on homepage — safe null-check)
    if (statCount) statCount.textContent = state.all.length;
    if (statUpdated) statUpdated.textContent = formatUpdated(updated);

    // Populate location filter
    populateLocationFilter();

    applyFilters();
  } catch (err) {
    console.error("[SCA] Failed to load opportunities:", err);
    showError();
  }
}

function showError() {
  grid.setAttribute("aria-busy", "false");
  grid.hidden = true;
  empty.hidden = true;
  errorEl.hidden = false;
  resultsCount.textContent = "";
  statCount.textContent = "—";
}

/* -------------------------------------------------------------
   Filtering + rendering
   ------------------------------------------------------------- */
function applyFilters() {
  const q = state.search.trim().toLowerCase();

  state.filtered = state.all.filter((o) => {
    if (state.category !== "All" && o.category !== state.category) return false;

    if (state.location && o.location !== state.location) return false;

    // Country filter — substring match on location (e.g. "Kigali, Rwanda" contains "Rwanda")
    if (state.country) {
      const loc = (o.location || "").toLowerCase();
      if (!loc.includes(state.country.toLowerCase())) return false;
    }

    if (state.year) {
      const eligs = (o.eligibility_year || "").split(/[,/]/).map((s) => s.trim());
      if (!eligs.includes(state.year) && !eligs.includes("Any")) return false;
    }

    if (state.remoteOnly) {
      const r = String(o.remote || "").toLowerCase();
      if (r !== "yes" && r !== "true" && r !== "1") return false;
    }

    if (state.openOnly) {
      if (isDeadlinePassed(o.deadline)) return false;
    }

    if (q) {
      const hay = [
        o.title,
        o.organization,
        o.description,
        o.tags,
        o.field,
        o.location,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      if (!hay.includes(q)) return false;
    }

    return true;
  });

  renderGrid();
  updateTabCounts();
}

// Compute count of opportunities per category and inject into tab labels
function updateTabCounts() {
  const counts = { All: state.all.length };
  state.all.forEach((o) => {
    const c = o.category || "Other";
    counts[c] = (counts[c] || 0) + 1;
  });

  $$(".tab").forEach((btn) => {
    const cat = btn.dataset.category;
    const count = counts[cat] || 0;
    // Reset content so we don't duplicate the count on re-renders
    const label = btn.dataset.label || btn.textContent.replace(/\s*\(\d+\)$/, "").trim();
    btn.dataset.label = label;
    btn.innerHTML = `${escapeHTML(label)} <span class="tab-count">${count}</span>`;
  });
}

function renderGrid() {
  grid.setAttribute("aria-busy", "false");
  errorEl.hidden = true;

  resultsCount.textContent = `${state.filtered.length} ${
    state.filtered.length === 1 ? "opportunity" : "opportunities"
  }`;

  if (state.filtered.length === 0) {
    grid.hidden = true;
    empty.hidden = false;
    return;
  }

  grid.hidden = false;
  empty.hidden = true;
  grid.innerHTML = state.filtered.map((o, i) => cardHTML(o, i)).join("");
  wireBookmarkButtons();
  wireExpandButtons();
}

// Toggle card expand/collapse
function wireExpandButtons() {
  document.querySelectorAll(".opp-card").forEach((card) => {
    // Click on card itself (except on buttons/links) expands
    card.addEventListener("click", (e) => {
      // Don't expand if clicking a button, link, or the bookmark
      if (e.target.closest("a") || e.target.closest(".opp-bookmark")) return;
      const isExpanded = card.classList.contains("is-expanded");
      card.classList.toggle("is-expanded");
      const btn = card.querySelector(".opp-expand-btn");
      if (btn) {
        const label = btn.querySelector(".opp-expand-label");
        if (label) label.textContent = isExpanded ? "Read more" : "Show less";
        btn.setAttribute("aria-label", isExpanded ? "Show details" : "Hide details");
      }
    });
  });
}

function cardHTML(o, i) {
  const id = escapeAttr(o.id || `${o.title}-${i}`);
  const bookmarked = state.bookmarks.has(id);
  const tags = (o.tags || "")
    .split(",")
    .map((t) => t.trim())
    .filter(Boolean)
    .slice(0, 4);

  const deadlineClass = deadlineBadgeClass(o.deadline);
  const deadlineText = formatDeadline(o.deadline);
  const mode = detectMode(o);

  return `
    <article class="opp-card" data-card-id="${id}" style="animation-delay: ${Math.min(i, 8) * 40}ms">
      ${mode ? `<span class="opp-mode-badge mode-${mode.toLowerCase()}">${mode}</span>` : ""}
      <div class="opp-card-head">
        <span class="opp-category">${escapeHTML(o.category || "Opportunity")}<span class="opp-verified" title="Manually verified by SCA Opportunities">Verified</span></span>
        <button class="opp-bookmark" aria-pressed="${bookmarked}" aria-label="Save this opportunity" data-id="${id}">
          ${bookmarked ? "★" : "☆"}
        </button>
      </div>

      <h3 class="opp-title">${escapeHTML(o.title || "Untitled")}</h3>
      <p class="opp-org">${escapeHTML(o.organization || "")}${
        o.location ? ` · ${escapeHTML(o.location)}` : ""
      }</p>

      <div class="opp-meta">
        ${
          o.eligibility_year
            ? `<span><span class="opp-meta-label">Eligible:</span> ${escapeHTML(
                o.eligibility_year
              )}</span>`
            : ""
        }
        ${
          deadlineText
            ? `<span class="opp-deadline ${deadlineClass}"><span class="opp-meta-label">Deadline:</span> ${deadlineText}</span>`
            : ""
        }
      </div>

      ${o.description ? `<p class="opp-desc">${escapeHTML(o.description)}</p>` : ""}

      ${
        tags.length
          ? `<div class="opp-tags">${tags
              .map((t) => `<span class="opp-tag">${escapeHTML(t)}</span>`)
              .join("")}</div>`
          : ""
      }

      <div class="opp-actions">
        <a href="${escapeAttr(o.apply_link || "#")}" target="_blank" rel="noopener" class="opp-apply">
          Apply →
        </a>
      </div>

      <button class="opp-expand-btn" type="button" aria-label="Show details">
        <span class="opp-expand-label">Read more</span>
      </button>
    </article>
  `;
}

// Detect Onsite/Remote/Hybrid from location or remote_ok field
function detectMode(o) {
  const remoteField = String(o.remote_ok || "").toLowerCase().trim();
  const loc = String(o.location || "").toLowerCase();

  if (remoteField === "yes" || /remote|home-based|virtual|online/.test(loc)) {
    if (/hybrid|some remote|partial/.test(loc) || remoteField === "some") return "Hybrid";
    return "Remote";
  }
  if (remoteField === "some" || /hybrid/.test(loc)) return "Hybrid";
  return "Onsite";
}

function wireBookmarkButtons() {
  $$(".opp-bookmark").forEach((btn) => {
    btn.addEventListener("click", (e) => {
      e.preventDefault();
      const id = btn.dataset.id;
      if (state.bookmarks.has(id)) {
        state.bookmarks.delete(id);
        btn.setAttribute("aria-pressed", "false");
        btn.textContent = "☆";
      } else {
        state.bookmarks.add(id);
        btn.setAttribute("aria-pressed", "true");
        btn.textContent = "★";
      }
      updateBookmarkChip();
    });
  });
}

function updateBookmarkChip() {
  const n = state.bookmarks.size;
  bookmarkCount.textContent = n;
  bookmarkChip.hidden = n === 0;
}

/* -------------------------------------------------------------
   Event wiring
   ------------------------------------------------------------- */
function wireEvents() {
  // Category tabs
  $$(".tab").forEach((tab) => {
    tab.addEventListener("click", () => {
      $$(".tab").forEach((t) => {
        t.classList.remove("is-active");
        t.setAttribute("aria-selected", "false");
      });
      tab.classList.add("is-active");
      tab.setAttribute("aria-selected", "true");
      state.category = tab.dataset.category;
      applyFilters();
    });
  });

  // Quick-start cards (only on homepage — safe null-forEach)
  $$(".quick-card").forEach((card) => {
    card.addEventListener("click", () => {
      const cat = card.dataset.quick;
      setCategory(cat);
      const oppSection = document.getElementById("opportunities");
      if (oppSection) oppSection.scrollIntoView({ behavior: "smooth" });
    });
  });

  // Filters (only exist on opportunities.html — guard each)
  const search = $("#filter-search");
  if (search) {
    search.addEventListener("input", debounce((e) => {
      state.search = e.target.value;
      applyFilters();
    }, 180));
  }

  const loc = $("#filter-location");
  if (loc) loc.addEventListener("change", (e) => { state.location = e.target.value; applyFilters(); });

  const yr = $("#filter-year");
  if (yr) yr.addEventListener("change", (e) => { state.year = e.target.value; applyFilters(); });

  const rem = $("#filter-remote");
  if (rem) rem.addEventListener("change", (e) => { state.remoteOnly = e.target.checked; applyFilters(); });

  const openO = $("#filter-open");
  if (openO) openO.addEventListener("change", (e) => { state.openOnly = e.target.checked; applyFilters(); });

  const reset = $("#filter-reset");
  if (reset) reset.addEventListener("click", resetFilters);

  const emptyReset = $("#empty-reset");
  if (emptyReset) emptyReset.addEventListener("click", resetFilters);

  // Signup form (only on sources.html — guard)
  const signup = $("#signup-form");
  if (signup) signup.addEventListener("submit", handleSignup);

  // Country marquee — clickable countries filter opportunities
  $$(".marquee-item").forEach((btn) => {
    btn.addEventListener("click", (e) => {
      e.preventDefault();
      const country = btn.dataset.country;
      if (!country) return;
      setCountryFilter(country);
    });
  });

  // Country pill clear
  const pillClear = $("#country-pill-clear");
  if (pillClear) {
    pillClear.addEventListener("click", () => {
      clearCountryFilter();
    });
  }
}

function setCountryFilter(country) {
  state.country = country;
  const pillWrap = $("#country-pill-wrap");
  const pillName = $("#country-pill-name");
  if (pillWrap && pillName) {
    pillName.textContent = country;
    pillWrap.hidden = false;
  }
  applyFilters();
  // Scroll to opportunities section smoothly
  const opp = document.getElementById("opportunities");
  if (opp) opp.scrollIntoView({ behavior: "smooth" });
}

function clearCountryFilter() {
  state.country = "";
  const pillWrap = $("#country-pill-wrap");
  if (pillWrap) pillWrap.hidden = true;
  applyFilters();
}

function setCategory(cat) {
  state.category = cat;
  $$(".tab").forEach((t) => {
    const active = t.dataset.category === cat;
    t.classList.toggle("is-active", active);
    t.setAttribute("aria-selected", active ? "true" : "false");
  });
  applyFilters();
}

function resetFilters() {
  state.search = "";
  state.location = "";
  state.country = "";
  state.year = "";
  state.remoteOnly = false;
  state.openOnly = false;
  $("#filter-search").value = "";
  $("#filter-location").value = "";
  $("#filter-year").value = "";
  $("#filter-remote").checked = false;
  $("#filter-open").checked = false;
  const pillWrap = $("#country-pill-wrap");
  if (pillWrap) pillWrap.hidden = true;
  applyFilters();
}

function populateLocationFilter() {
  const locs = [...new Set(state.all.map((o) => o.location).filter(Boolean))].sort();
  const select = $("#filter-location");
  locs.forEach((loc) => {
    const opt = document.createElement("option");
    opt.value = loc;
    opt.textContent = loc;
    select.appendChild(opt);
  });
}

/* -------------------------------------------------------------
   Email signup
   ------------------------------------------------------------- */
async function handleSignup(e) {
  e.preventDefault();
  const email = $("#signup-email").value.trim();
  const consent = $("#signup-consent").checked;
  const msg = $("#signup-msg");
  const btn = $("#signup-btn");

  msg.className = "signup-msg";
  msg.textContent = "";

  if (!isValidEmail(email)) {
    msg.className = "signup-msg is-error";
    msg.textContent = "Please enter a valid email address.";
    return;
  }

  if (!consent) {
    msg.className = "signup-msg is-error";
    msg.textContent = "Please confirm consent to subscribe.";
    return;
  }

  btn.disabled = true;
  btn.textContent = "Subscribing…";

  try {
    if (APPS_SCRIPT_URL && !APPS_SCRIPT_URL.startsWith("REPLACE_")) {
      const formData = new FormData();
      formData.append("action", "subscribe");
      formData.append("email", email);
      formData.append("source_page", window.location.href);

      const res = await fetch(APPS_SCRIPT_URL, {
        method: "POST",
        body: formData,
      });

      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const result = await res.json();
      if (result.status !== "success") throw new Error(result.message || "Unknown error");
    } else {
      // Dev mode — just simulate success
      await new Promise((r) => setTimeout(r, 600));
    }

    msg.className = "signup-msg is-success";
    msg.textContent = "You're in. Watch your inbox on Sunday.";
    $("#signup-form").reset();
  } catch (err) {
    console.error("[SCA] Signup error:", err);
    msg.className = "signup-msg is-error";
    msg.textContent = "Something went wrong. Please try again in a moment.";
  } finally {
    btn.disabled = false;
    btn.textContent = "Subscribe";
  }
}

/* -------------------------------------------------------------
   Utilities
   ------------------------------------------------------------- */
function isValidEmail(e) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e);
}

function debounce(fn, ms) {
  let t;
  return (...args) => {
    clearTimeout(t);
    t = setTimeout(() => fn(...args), ms);
  };
}

function escapeHTML(str) {
  if (str == null) return "";
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function escapeAttr(str) {
  return escapeHTML(str);
}

function isDeadlinePassed(deadline) {
  if (!deadline) return false;
  const d = parseDeadline(deadline);
  if (!d) return false;
  return d.getTime() < Date.now();
}

function parseDeadline(raw) {
  if (!raw) return null;
  // Accept ISO (YYYY-MM-DD), plus "Rolling", "Annual", etc.
  const s = String(raw).trim();
  if (/^rolling|annual|verify/i.test(s)) return null;
  const d = new Date(s);
  return isNaN(d.getTime()) ? null : d;
}

function formatDeadline(raw) {
  if (!raw) return "";
  const s = String(raw).trim();
  if (/^rolling|annual|verify/i.test(s)) return s;
  const d = parseDeadline(raw);
  if (!d) return s;
  return d.toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

function deadlineBadgeClass(raw) {
  const d = parseDeadline(raw);
  if (!d) return "";
  const daysLeft = Math.ceil((d.getTime() - Date.now()) / (1000 * 60 * 60 * 24));
  if (daysLeft < 0) return "is-closed";
  if (daysLeft <= 14) return "is-soon";
  return "is-open";
}

function formatUpdated(raw) {
  if (!raw) {
    // Default to today if not provided
    return new Date().toLocaleDateString("en-GB", {
      day: "numeric",
      month: "short",
      year: "numeric",
    });
  }
  const d = new Date(raw);
  if (isNaN(d.getTime())) return raw;
  return d.toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}
