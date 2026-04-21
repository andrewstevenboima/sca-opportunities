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
  $("#year").textContent = new Date().getFullYear();
  wireEvents();
  loadOpportunities();
});

/* -------------------------------------------------------------
   Data loading
   ------------------------------------------------------------- */
async function loadOpportunities() {
  try {
    let data;

    if (APPS_SCRIPT_URL && !APPS_SCRIPT_URL.startsWith("REPLACE_")) {
      // Live mode — fetch from Google Apps Script
      const res = await fetch(`${APPS_SCRIPT_URL}?action=opportunities`, {
        method: "GET",
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      data = await res.json();
    } else {
      // Development mode — fall back to local JSON
      console.info("[SCA] Apps Script URL not set, loading from opportunities.json");
      const res = await fetch(FALLBACK_JSON);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      data = await res.json();
    }

    // Accept either { opportunities: [...], updated: "..." } or a raw array
    const list = Array.isArray(data) ? data : data.opportunities || [];
    const updated = Array.isArray(data) ? null : data.updated;

    state.all = list.filter((o) => (o.status || "live").toLowerCase() === "live");

    // Update hero stats
    statCount.textContent = state.all.length;
    statUpdated.textContent = formatUpdated(updated);

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

  return `
    <article class="opp-card" style="animation-delay: ${Math.min(i, 8) * 40}ms">
      <div class="opp-card-head">
        <span class="opp-category">${escapeHTML(o.category || "Opportunity")}</span>
        <button class="opp-bookmark" aria-pressed="${bookmarked}" aria-label="Save this opportunity" data-id="${id}">
          ${bookmarked ? "★" : "☆"}
        </button>
      </div>

      <h3 class="opp-title">${escapeHTML(o.title || "Untitled")}</h3>
      <p class="opp-org">${escapeHTML(o.organization || "")}${
        o.location ? ` · ${escapeHTML(o.location)}` : ""
      }</p>

      ${o.description ? `<p class="opp-desc">${escapeHTML(o.description)}</p>` : ""}

      ${
        tags.length
          ? `<div class="opp-tags">${tags
              .map((t) => `<span class="opp-tag">${escapeHTML(t)}</span>`)
              .join("")}</div>`
          : ""
      }

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

      <div class="opp-actions">
        <a href="${escapeAttr(o.apply_link || "#")}" target="_blank" rel="noopener" class="opp-apply">
          Apply →
        </a>
      </div>
    </article>
  `;
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

  // Quick-start cards
  $$(".quick-card").forEach((card) => {
    card.addEventListener("click", () => {
      const cat = card.dataset.quick;
      setCategory(cat);
      document.getElementById("opportunities").scrollIntoView({ behavior: "smooth" });
    });
  });

  // Filters
  $("#filter-search").addEventListener("input", debounce((e) => {
    state.search = e.target.value;
    applyFilters();
  }, 180));

  $("#filter-location").addEventListener("change", (e) => {
    state.location = e.target.value;
    applyFilters();
  });

  $("#filter-year").addEventListener("change", (e) => {
    state.year = e.target.value;
    applyFilters();
  });

  $("#filter-remote").addEventListener("change", (e) => {
    state.remoteOnly = e.target.checked;
    applyFilters();
  });

  $("#filter-open").addEventListener("change", (e) => {
    state.openOnly = e.target.checked;
    applyFilters();
  });

  $("#filter-reset").addEventListener("click", resetFilters);
  $("#empty-reset").addEventListener("click", resetFilters);

  // Signup form
  $("#signup-form").addEventListener("submit", handleSignup);
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
  state.year = "";
  state.remoteOnly = false;
  state.openOnly = false;
  $("#filter-search").value = "";
  $("#filter-location").value = "";
  $("#filter-year").value = "";
  $("#filter-remote").checked = false;
  $("#filter-open").checked = false;
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
