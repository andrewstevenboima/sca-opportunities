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

// Opportunities are prioritized by how recently they were added to
// the platform. That relies on a "date_added" column existing in the
// Sheet (Code.gs passes any column through verbatim by header name —
// see getOpportunities() there) — accepts a couple of common aliases
// in case the column ends up named slightly differently. Rows without
// a parseable date sort after every dated row, in their original
// (Sheet) order, rather than being scattered randomly or crashing.
const RECENCY_FIELD_ALIASES = ["date_added", "posted_date", "date_posted", "added_at"];
function recencyTimestamp(o) {
  for (const field of RECENCY_FIELD_ALIASES) {
    if (o[field]) {
      const t = new Date(o[field]).getTime();
      if (!Number.isNaN(t)) return t;
    }
  }
  return -Infinity;
}
function sortByRecency(list) {
  // Array.prototype.sort is a stable sort in every modern engine, so
  // undated rows (all tied at -Infinity) keep their original relative
  // order instead of being shuffled.
  return [...list].sort((a, b) => recencyTimestamp(b) - recencyTimestamp(a));
}

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
let currentUserId = null;

document.addEventListener("DOMContentLoaded", async () => {
  // Update footer year on all pages
  const yearEl = $("#year");
  if (yearEl) yearEl.textContent = new Date().getFullYear();

  // Wire mobile nav (all pages)
  wireMobileNav();

  // Wire the "Community" nav dropdown (all pages)
  wireNavDropdown();

  // Toggle "Log In" / "My Account" nav links (all pages)
  wireAuthNav();

  // Notification bell (all pages)
  wireNotifications();

  // Install-as-app prompt + offline support (all pages)
  registerServiceWorker();
  wireInstallPrompt();

  // Confirmation-link redirects can land on any page depending on the
  // Supabase project's configured Site URL, so this check (and the
  // flag it reads) has to run globally rather than on one page.
  if (window.SCA && window.SCA.justConfirmedEmail) {
    showToast("Email confirmed. You're all set, welcome to SCA Opportunities.");
    history.replaceState(null, "", window.location.pathname);
  }

  // Only wire opportunities logic if this page has the grid
  if (document.getElementById("opp-grid")) {
    await hydrateBookmarksFromAccount();
    await applyProfileCountryDefault();
    wireEvents();
    applyURLParams();
    loadOpportunities();
  }

  // Homepage-only, but harmless (no-ops) on every other page since
  // each checks for its own element before doing anything.
  wireAnnouncementBar();
  loadHomepagePreview();
  wireScrollReveal();
});

// A single-post teaser pointing new/signed-out visitors toward the
// Common Room. Dismissal is remembered per-post (in localStorage) so
// closing it doesn't hide the NEXT new post too.
async function wireAnnouncementBar() {
  const bar = document.getElementById("announcement-bar");
  const link = document.getElementById("announcement-link");
  const closeBtn = document.getElementById("announcement-close");
  if (!bar || !window.SCA || !window.SCA.ready) return;

  let post;
  try {
    post = await window.SCA.getLatestPostTeaser();
  } catch (err) {
    return;
  }
  if (!post) return;

  let dismissedId = null;
  try {
    dismissedId = localStorage.getItem("sca_announcement_dismissed");
  } catch (err) {
    // Non-fatal — worst case the bar just isn't dismissible this session.
  }
  if (dismissedId === post.id) return;

  link.textContent = `New in the Common Room: "${post.title}" — join the discussion →`;
  link.href = `community.html?post=${encodeURIComponent(post.id)}`;
  bar.hidden = false;

  closeBtn.addEventListener("click", () => {
    bar.hidden = true;
    try {
      localStorage.setItem("sca_announcement_dismissed", post.id);
    } catch (err) {
      // Non-fatal.
    }
  });
}

// Homepage "Live right now" strip — reuses the same opportunities
// feed and live-status filter as opportunities.html, just capped to
// a handful of picks.
async function loadHomepagePreview() {
  const section = document.getElementById("home-preview");
  const grid = document.getElementById("home-preview-grid");
  if (!section || !grid) return;

  try {
    let data;
    const url =
      typeof APPS_SCRIPT_URL !== "undefined" && APPS_SCRIPT_URL && !APPS_SCRIPT_URL.startsWith("REPLACE_")
        ? `${APPS_SCRIPT_URL}?action=opportunities`
        : "opportunities.json";
    try {
      const res = await fetch(url);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      data = await res.json();
    } catch (fetchErr) {
      const res = await fetch("opportunities.json");
      data = await res.json();
    }

    const list = sortByRecency(
      (Array.isArray(data) ? data : data.opportunities || []).filter(
        (o) => (o.status || "live").toLowerCase() === "live"
      )
    );
    const picks = list.slice(0, 4);
    if (!picks.length) return;

    grid.innerHTML = picks
      .map(
        (o) => `
      <article class="home-preview-card reveal">
        <span class="home-preview-cat">${escapeHTML(o.category || "Opportunity")}</span>
        <h3>${escapeHTML(o.title || "Untitled")}</h3>
        ${o.organization ? `<p>${escapeHTML(o.organization)}</p>` : ""}
        <a href="${safeHref(o.apply_link, "opportunities.html")}" target="_blank" rel="noopener" class="opp-apply">Apply →</a>
      </article>
    `
      )
      .join("");
    section.hidden = false;
    wireScrollReveal();
  } catch (err) {
    // Non-fatal — the homepage works fine without this bonus section.
  }
}

// Fades/slides `.reveal` elements in as they scroll into view. Safe
// to call more than once (e.g. after the preview grid injects new
// `.reveal` cards) — already-observed elements just get skipped.
const revealObserver =
  "IntersectionObserver" in window
    ? new IntersectionObserver(
        (entries) => {
          entries.forEach((entry) => {
            if (entry.isIntersecting) {
              entry.target.classList.add("is-visible");
              revealObserver.unobserve(entry.target);
            }
          });
        },
        { threshold: 0.15 }
      )
    : null;

function wireScrollReveal() {
  const items = document.querySelectorAll(".reveal:not(.is-visible)");
  if (!items.length) return;
  if (!revealObserver) {
    items.forEach((el) => el.classList.add("is-visible"));
    return;
  }
  items.forEach((el) => revealObserver.observe(el));
}

// Default the country filter to a logged-in student's own profile
// country, so they land on opportunities near them — never a hard
// restriction, just a starting point they can clear with one click.
// An explicit ?country= URL param (applied right after this, in
// applyURLParams) always wins over this default.
async function applyProfileCountryDefault() {
  if (!currentUserId) return;
  try {
    const profile = await window.SCA.getProfile(currentUserId);
    if (!profile?.country) return;
    state.country = profile.country;
    const pillWrap = document.getElementById("country-pill-wrap");
    const pillName = document.getElementById("country-pill-name");
    if (pillWrap && pillName) {
      pillName.textContent = profile.country;
      pillWrap.hidden = false;
    }
  } catch (err) {
    // Not fatal — just skip the default if the profile fetch fails.
  }
}

// Show "My Account" instead of "Log In" once a Supabase session exists
function wireAuthNav() {
  const loginLink = document.getElementById("nav-login");
  const accountLink = document.getElementById("nav-account");
  const unreadBadge = document.getElementById("nav-unread-badge");
  if (!loginLink && !accountLink) return;
  if (!window.SCA || !window.SCA.ready) return; // Supabase not configured yet

  const paint = (session) => {
    const loggedIn = !!session;
    if (loginLink) loginLink.hidden = loggedIn;
    if (accountLink) accountLink.hidden = !loggedIn;
    if (unreadBadge && loggedIn) {
      window.SCA.unreadMessageCount(session.user.id)
        .then((count) => {
          unreadBadge.hidden = !count;
          unreadBadge.textContent = count > 9 ? "9+" : String(count);
        })
        .catch(() => {});
    } else if (unreadBadge) {
      unreadBadge.hidden = true;
    }
  };

  window.SCA.getSession().then(paint);
  window.SCA.onAuthChange(paint);
}

// Pull a logged-in student's saved opportunities from Supabase so
// their bookmark stars are correct on first render. Guests keep the
// existing session-only (in-memory) bookmark behaviour.
async function hydrateBookmarksFromAccount() {
  if (!window.SCA || !window.SCA.ready) return;
  const session = await window.SCA.getSession();
  if (!session) return;
  currentUserId = session.user.id;
  try {
    const bookmarks = await window.SCA.listBookmarks(currentUserId);
    bookmarks.forEach((b) => state.bookmarks.add(b.opportunity_id));
  } catch (err) {
    console.warn("[SCA] Couldn't load saved opportunities:", err.message);
  }
}

// Self-contained (inline-styled) so it renders correctly on any page
// regardless of which stylesheets that page happens to load.
function showToast(message) {
  const toast = document.createElement("div");
  toast.textContent = message;
  toast.setAttribute("role", "status");
  Object.assign(toast.style, {
    position: "fixed",
    bottom: "24px",
    left: "50%",
    transform: "translateX(-50%)",
    background: "#1A1A1A",
    color: "#FDFBF5",
    padding: "0.875rem 1.5rem",
    borderRadius: "999px",
    fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, sans-serif",
    fontSize: "0.9375rem",
    boxShadow: "0 12px 30px -12px rgba(0,0,0,0.4)",
    zIndex: "1000",
    maxWidth: "90vw",
    textAlign: "center",
  });
  document.body.appendChild(toast);
  setTimeout(() => toast.remove(), 6000);
}

// "Community" nav dropdown (Common Room / Students / Messages)
function wireNavDropdown() {
  const dropdown = document.getElementById("nav-community-dropdown");
  const toggle = document.getElementById("nav-dropdown-toggle");
  if (!dropdown || !toggle) return;

  toggle.addEventListener("click", (e) => {
    e.stopPropagation();
    const isOpen = dropdown.classList.toggle("is-open");
    toggle.setAttribute("aria-expanded", String(isOpen));
  });

  document.addEventListener("click", (e) => {
    if (!dropdown.contains(e.target)) {
      dropdown.classList.remove("is-open");
      toggle.setAttribute("aria-expanded", "false");
    }
  });

  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") {
      dropdown.classList.remove("is-open");
      toggle.setAttribute("aria-expanded", "false");
    }
  });
}

// Share menu — used for profiles, posts, and comments. Tries the
// device's native share sheet first (WhatsApp, Messages, etc. all
// show up there automatically on mobile); falls back to a small
// custom menu with direct platform links + copy-link on browsers
// that don't support navigator.share (most desktop browsers).
function shareContent(trigger, { url, text }) {
  if (navigator.share) {
    navigator.share({ text, url }).catch(() => {});
    return;
  }

  document.querySelectorAll(".share-menu").forEach((el) => el.remove());

  const menu = document.createElement("div");
  menu.className = "share-menu";
  const links = [
    { label: "WhatsApp", href: `https://wa.me/?text=${encodeURIComponent(text + " " + url)}` },
    { label: "X (Twitter)", href: `https://twitter.com/intent/tweet?text=${encodeURIComponent(text)}&url=${encodeURIComponent(url)}` },
    { label: "Facebook", href: `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(url)}` },
    { label: "LinkedIn", href: `https://www.linkedin.com/sharing/share-offsite/?url=${encodeURIComponent(url)}` },
  ];
  menu.innerHTML =
    links.map((l) => `<a href="${l.href}" target="_blank" rel="noopener">${l.label}</a>`).join("") +
    `<button type="button" class="share-menu-copy">Copy link</button>`;

  document.body.appendChild(menu);
  const rect = trigger.getBoundingClientRect();
  menu.style.top = `${rect.bottom + 6}px`;
  menu.style.left = `${Math.min(rect.left, window.innerWidth - 200)}px`;

  menu.querySelector(".share-menu-copy").addEventListener("click", async () => {
    try {
      await navigator.clipboard.writeText(url);
      showToast("Link copied.");
    } catch (err) {
      showToast("Couldn't copy the link.");
    }
    menu.remove();
  });

  menu.querySelectorAll("a").forEach((a) => a.addEventListener("click", () => menu.remove()));

  setTimeout(() => {
    document.addEventListener("click", function onDocClick(e) {
      if (!menu.contains(e.target) && e.target !== trigger) {
        menu.remove();
        document.removeEventListener("click", onDocClick);
      }
    });
  }, 0);
}

// Notification bell — @mentions from the Common Room. Runs on every
// page since a mention can happen while the recipient is anywhere
// on the site, not just on community.html.
function wireNotifications() {
  const bell = document.getElementById("notif-bell");
  const toggle = document.getElementById("notif-bell-toggle");
  const badge = document.getElementById("notif-unread-badge");
  const list = document.getElementById("notif-list");
  const empty = document.getElementById("notif-empty");
  const markAllBtn = document.getElementById("notif-mark-all-read");
  if (!bell || !window.SCA || !window.SCA.ready) return;

  const profileCache = new Map();
  async function getActor(userId) {
    if (profileCache.has(userId)) return profileCache.get(userId);
    try {
      const profile = await window.SCA.getPublicProfile(userId);
      profileCache.set(userId, profile);
      return profile;
    } catch (err) {
      return null;
    }
  }

  function messageFor(n, rawActorName) {
    // rawActorName is another student's full_name — free text they
    // chose at signup, not app-controlled — so it must be escaped
    // before landing in the innerHTML this feeds below, same as
    // every other rendering of a student's name in this app.
    const actorName = escapeHTML(rawActorName);
    switch (n.type) {
      case "mention_post":
        return `${actorName} mentioned you in a post`;
      case "mention_comment":
        return `${actorName} mentioned you in a comment`;
      case "mention_all_post":
        return `${actorName} mentioned everyone in a post`;
      case "mention_all_comment":
        return `${actorName} mentioned everyone in a comment`;
      case "companion_added":
        return `${actorName} added you as a Companion`;
      default:
        return `${actorName} mentioned you`;
    }
  }

  function formatNotifTime(iso) {
    const d = new Date(iso);
    return (
      d.toLocaleDateString("en-GB", { day: "numeric", month: "short" }) +
      " · " +
      d.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })
    );
  }

  async function loadNotifications(userId) {
    let notifications;
    try {
      notifications = await window.SCA.listNotifications(userId);
    } catch (err) {
      list.innerHTML = "";
      empty.hidden = false;
      empty.textContent = "Couldn't load notifications.";
      return;
    }
    if (!notifications.length) {
      list.innerHTML = "";
      empty.hidden = false;
      empty.textContent = "No notifications yet.";
      return;
    }
    empty.hidden = true;
    list.innerHTML = "";
    for (const n of notifications) {
      const actor = await getActor(n.actor_id);
      const item = document.createElement("button");
      item.type = "button";
      item.className = "notif-item" + (n.read_at ? "" : " is-unread");
      item.innerHTML = `
        ${messageFor(n, actor?.full_name || "A student")}
        <span class="notif-item-time">${formatNotifTime(n.created_at)}</span>
      `;
      item.addEventListener("click", async () => {
        if (!n.read_at) {
          try {
            await window.SCA.markNotificationRead(n.id);
          } catch (err) {
            // Non-fatal — the notification still opens either way.
          }
        }
        if (n.type === "companion_added") {
          window.location.href = `member.html?id=${encodeURIComponent(n.actor_id)}`;
        } else {
          window.location.href = n.post_id
            ? `community.html?post=${encodeURIComponent(n.post_id)}`
            : "community.html";
        }
      });
      list.appendChild(item);
    }
  }

  async function refreshBadge(userId) {
    try {
      const count = await window.SCA.unreadNotificationCount(userId);
      badge.hidden = !count;
      badge.textContent = count > 9 ? "9+" : String(count);
    } catch (err) {
      // Non-fatal — leave the badge at its previous state.
    }
  }

  window.SCA.getSession().then((session) => {
    if (!session) return;
    bell.hidden = false;
    refreshBadge(session.user.id);

    toggle.addEventListener("click", (e) => {
      e.stopPropagation();
      const isOpen = bell.classList.toggle("is-open");
      toggle.setAttribute("aria-expanded", String(isOpen));
      if (isOpen) loadNotifications(session.user.id);
    });

    document.addEventListener("click", (e) => {
      if (!bell.contains(e.target)) {
        bell.classList.remove("is-open");
        toggle.setAttribute("aria-expanded", "false");
      }
    });

    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape") {
        bell.classList.remove("is-open");
        toggle.setAttribute("aria-expanded", "false");
      }
    });

    if (markAllBtn) {
      markAllBtn.addEventListener("click", async () => {
        try {
          await window.SCA.markAllNotificationsRead(session.user.id);
          list.querySelectorAll(".notif-item.is-unread").forEach((el) => el.classList.remove("is-unread"));
          refreshBadge(session.user.id);
        } catch (err) {
          alert("Couldn't mark notifications as read.");
        }
      });
    }
  });
}

/* -------------------------------------------------------------
   Install-as-app + offline support
   ------------------------------------------------------------- */
function registerServiceWorker() {
  if (!("serviceWorker" in navigator)) return;
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("/sw.js").catch(() => {
      // Non-fatal — the site still works fully without offline support.
    });
  });
}

const INSTALL_DISMISS_KEY = "sca-install-dismissed-at";
const INSTALL_DISMISS_COOLDOWN_DAYS = 14;

function isRunningStandalone() {
  return (
    window.matchMedia("(display-mode: standalone)").matches ||
    window.navigator.standalone === true // iOS Safari's own flag
  );
}

function recentlyDismissedInstallPrompt() {
  try {
    const dismissedAt = Number(localStorage.getItem(INSTALL_DISMISS_KEY));
    if (!dismissedAt) return false;
    const daysSince = (Date.now() - dismissedAt) / (1000 * 60 * 60 * 24);
    return daysSince < INSTALL_DISMISS_COOLDOWN_DAYS;
  } catch (err) {
    return false;
  }
}

function markInstallPromptDismissed() {
  try {
    localStorage.setItem(INSTALL_DISMISS_KEY, String(Date.now()));
  } catch (err) {
    // Non-fatal — worst case the banner just reappears next visit.
  }
}

function showInstallBanner({ title, sub, actionLabel, onAction }) {
  if (document.querySelector(".install-banner")) return; // already showing

  const banner = document.createElement("div");
  banner.className = "install-banner";
  banner.innerHTML = `
    <img src="assets/icon-192.png" alt="" class="install-banner-icon" />
    <div class="install-banner-body">
      <p class="install-banner-title">${escapeHTML(title)}</p>
      <p class="install-banner-sub">${escapeHTML(sub)}</p>
    </div>
    <div class="install-banner-actions">
      ${actionLabel ? `<button type="button" class="install-banner-btn">${escapeHTML(actionLabel)}</button>` : ""}
      <button type="button" class="install-banner-close" aria-label="Dismiss">✕</button>
    </div>
  `;
  document.body.appendChild(banner);

  if (actionLabel) {
    banner.querySelector(".install-banner-btn").addEventListener("click", onAction);
  }
  banner.querySelector(".install-banner-close").addEventListener("click", () => {
    markInstallPromptDismissed();
    banner.remove();
  });

  return banner;
}

// Chrome/Edge/Android (and desktop Chrome) fire beforeinstallprompt
// when their own installability heuristics are met; iOS never fires
// it at all — "Add to Home Screen" only exists as a manual step from
// the Share sheet — so it gets its own instructional banner below.
function wireInstallPrompt() {
  if (isRunningStandalone() || recentlyDismissedInstallPrompt()) return;

  let deferredPrompt = null;
  window.addEventListener("beforeinstallprompt", (event) => {
    event.preventDefault();
    deferredPrompt = event;
    showInstallBanner({
      title: "Install SCA Opportunities",
      sub: "Add it to your home screen for one-tap access, even offline.",
      actionLabel: "Install",
      onAction: async () => {
        if (!deferredPrompt) return;
        deferredPrompt.prompt();
        await deferredPrompt.userChoice;
        deferredPrompt = null;
        document.querySelector(".install-banner")?.remove();
      },
    });
  });

  window.addEventListener("appinstalled", () => {
    document.querySelector(".install-banner")?.remove();
    markInstallPromptDismissed();
  });

  const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) && !window.MSStream;
  if (isIOS) {
    showInstallBanner({
      title: "Install SCA Opportunities",
      sub: "Tap the Share icon below, then “Add to Home Screen.”",
      actionLabel: "Got it",
      onAction: () => {
        markInstallPromptDismissed();
        document.querySelector(".install-banner")?.remove();
      },
    });
  }
}

// Mobile hamburger toggle
function wireMobileNav() {
  const toggle = document.getElementById("nav-toggle");
  const nav = document.getElementById("site-nav");
  const backdrop = document.getElementById("nav-backdrop");
  const closeBtn = document.getElementById("nav-drawer-close");
  if (!toggle || !nav) return;

  function openDrawer() {
    nav.classList.add("is-open");
    toggle.setAttribute("aria-expanded", "true");
    if (backdrop) backdrop.classList.add("is-open");
    document.body.style.overflow = "hidden";
  }

  function closeDrawer() {
    nav.classList.remove("is-open");
    toggle.setAttribute("aria-expanded", "false");
    if (backdrop) backdrop.classList.remove("is-open");
    document.body.style.overflow = "";
  }

  toggle.addEventListener("click", () => {
    if (nav.classList.contains("is-open")) closeDrawer();
    else openDrawer();
  });

  if (backdrop) backdrop.addEventListener("click", closeDrawer);
  if (closeBtn) closeBtn.addEventListener("click", closeDrawer);

  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") closeDrawer();
  });

  // Closing on link click matters here since the drawer is a fixed
  // overlay now, not an inline panel — without this it would still
  // be sitting open (mid-transition) during the page navigation.
  nav.querySelectorAll("a").forEach((a) => a.addEventListener("click", closeDrawer));
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

    state.all = sortByRecency(list.filter((o) => (o.status || "live").toLowerCase() === "live"));

    // Update hero stats (only present on homepage — safe null-check)
    if (statCount) statCount.textContent = state.all.length;
    if (statUpdated) statUpdated.textContent = formatUpdated(updated);

    buildCountryIndex();
    paintLiveCounts(state.all.length);
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

/* ============================================================
   MATCHING ENGINE  (v5)
   Country registry with aliases + word-boundary matching,
   and tokenised AND search across all meaningful fields.
   ============================================================ */

const COUNTRY_REGISTRY = [
  { name: "Rwanda",          flag: "\u{1F1F7}\u{1F1FC}", aliases: ["rwanda","rwandan","kigali","huye","musanze","butare"] },
  { name: "Sierra Leone",    flag: "\u{1F1F8}\u{1F1F1}", aliases: ["sierra leone","sierra leonean","freetown","kono","koidu","makeni","njala","bo district"] },
  { name: "Kenya",           flag: "\u{1F1F0}\u{1F1EA}", aliases: ["kenya","kenyan","nairobi","mombasa","kisumu","kwale"] },
  { name: "Nigeria",         flag: "\u{1F1F3}\u{1F1EC}", aliases: ["nigeria","nigerian","lagos","abuja","ibadan"] },
  { name: "Ghana",           flag: "\u{1F1EC}\u{1F1ED}", aliases: ["ghana","ghanaian","accra","kumasi","legon"] },
  { name: "South Africa",    flag: "\u{1F1FF}\u{1F1E6}", aliases: ["south africa","south african","johannesburg","pretoria","cape town","durban"] },
  { name: "Uganda",          flag: "\u{1F1FA}\u{1F1EC}", aliases: ["uganda","ugandan","kampala","makerere"] },
  { name: "Ethiopia",        flag: "\u{1F1EA}\u{1F1F9}", aliases: ["ethiopia","ethiopian","addis ababa"] },
  { name: "Egypt",           flag: "\u{1F1EA}\u{1F1EC}", aliases: ["egypt","egyptian","cairo"] },
  { name: "Morocco",         flag: "\u{1F1F2}\u{1F1E6}", aliases: ["morocco","moroccan","rabat","casablanca"] },
  { name: "Senegal",         flag: "\u{1F1F8}\u{1F1F3}", aliases: ["senegal","senegalese","dakar"] },
  { name: "Tanzania",        flag: "\u{1F1F9}\u{1F1FF}", aliases: ["tanzania","tanzanian","dar es salaam","zanzibar","dodoma"] },
  { name: "Cameroon",        flag: "\u{1F1E8}\u{1F1F2}", aliases: ["cameroon","cameroonian","yaound","douala"] },
  { name: "Côte d'Ivoire", flag: "\u{1F1E8}\u{1F1EE}", aliases: ["ivoire","ivory coast","ivorian","abidjan"] },
  { name: "Liberia",         flag: "\u{1F1F1}\u{1F1F7}", aliases: ["liberia","liberian","monrovia"] },
  { name: "Zambia",          flag: "\u{1F1FF}\u{1F1F2}", aliases: ["zambia","zambian","lusaka"] },
  { name: "Zimbabwe",        flag: "\u{1F1FF}\u{1F1FC}", aliases: ["zimbabwe","zimbabwean","harare"] },
  { name: "Botswana",        flag: "\u{1F1E7}\u{1F1FC}", aliases: ["botswana","gaborone"] },
  { name: "Togo",            flag: "\u{1F1F9}\u{1F1EC}", aliases: ["togo","togolese","lomé","lome"] },
  { name: "Mauritius",       flag: "\u{1F1F2}\u{1F1FA}", aliases: ["mauritius","mauritian","port louis"] },
  { name: "Mozambique",      flag: "\u{1F1F2}\u{1F1FF}", aliases: ["mozambique","mozambican","maputo"] },
  { name: "Malawi",          flag: "\u{1F1F2}\u{1F1FC}", aliases: ["malawi","malawian","lilongwe","blantyre"] },
  { name: "The Gambia",      flag: "\u{1F1EC}\u{1F1F2}", aliases: ["gambia","gambian","banjul"] },
  { name: "Burkina Faso",    flag: "\u{1F1E7}\u{1F1EB}", aliases: ["burkina","burkinab","ouagadougou","bobo-dioulasso"] },
  { name: "DR Congo",        flag: "\u{1F1E8}\u{1F1E9}", aliases: ["democratic republic of the congo","dr congo","drc","kinshasa","goma","bukavu","beni","lubumbashi"] },
  { name: "Burundi",         flag: "\u{1F1E7}\u{1F1EE}", aliases: ["burundi","burundian","bujumbura"] },
  { name: "Chad",           flag: "\u{1F1F9}\u{1F1E9}", aliases: ["chad","chadian","n'djamena","ndjamena"] },
  { name: "Libya",           flag: "\u{1F1F1}\u{1F1FE}", aliases: ["libya","libyan","tripoli"] },
  { name: "Sudan",           flag: "\u{1F1F8}\u{1F1E9}", aliases: ["sudan","sudanese","khartoum","kassala"] },
  { name: "South Sudan",     flag: "\u{1F1F8}\u{1F1F8}", aliases: ["south sudan","juba"] },
  { name: "Mauritania",      flag: "\u{1F1F2}\u{1F1F7}", aliases: ["mauritania","nouakchott"] },
  { name: "Namibia",         flag: "\u{1F1F3}\u{1F1E6}", aliases: ["namibia","namibian","windhoek"] },
  { name: "Benin",           flag: "\u{1F1E7}\u{1F1EF}", aliases: ["benin","cotonou","porto-novo"] },
  { name: "Mali",            flag: "\u{1F1F2}\u{1F1F1}", aliases: ["mali","malian","bamako"] },
  { name: "Guinea",          flag: "\u{1F1EC}\u{1F1F3}", aliases: ["guinea","conakry"] },
  { name: "Somalia",         flag: "\u{1F1F8}\u{1F1F4}", aliases: ["somalia","somali","mogadishu"] },
  { name: "Tunisia",         flag: "\u{1F1F9}\u{1F1F3}", aliases: ["tunisia","tunisian","tunis"] },
  { name: "Algeria",         flag: "\u{1F1E9}\u{1F1FF}", aliases: ["algeria","algerian","algiers"] },
];

function escapeRe(s) { return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"); }

// Fields a country can legitimately appear in.
function countryHaystack(o) {
  return [o.location, o.eligibility_nationality, o.title, o.tags, o.organization]
    .filter(Boolean).join(" ").toLowerCase();
}

// Full-text haystack for search.
function searchHaystack(o) {
  return [o.title, o.organization, o.description, o.tags, o.field,
          o.location, o.eligibility_nationality, o.eligibility_year, o.category]
    .filter(Boolean).join(" ").toLowerCase();
}

// Which countries does this opportunity belong to?
function countriesFor(o) {
  let hay = countryHaystack(o);
  const found = new Set();

  // Disambiguate "South Sudan" before testing "Sudan".
  if (/\bsouth sudan\b/.test(hay)) {
    found.add("South Sudan");
    hay = hay.replace(/\bsouth sudan\b/g, " ");
  }

  COUNTRY_REGISTRY.forEach((c) => {
    if (c.name === "South Sudan") return;
    const hit = c.aliases.some((a) => new RegExp("\\b" + escapeRe(a), "i").test(hay));
    if (hit) found.add(c.name);
  });
  return [...found];
}

// Build once after data loads.
function buildCountryIndex() {
  state.countryCounts = {};
  state.all.forEach((o) => {
    o._countries = countriesFor(o);
    o._search = searchHaystack(o);
    o._countries.forEach((c) => {
      state.countryCounts[c] = (state.countryCounts[c] || 0) + 1;
    });
  });
}

// Tokenised AND search — every word must appear somewhere.
function matchesSearch(o, tokens) {
  const hay = o._search || searchHaystack(o);
  return tokens.every((t) => hay.includes(t));
}

function applyFilters() {
  const q = state.search.trim().toLowerCase();

  state.filtered = state.all.filter((o) => {
    if (state.category !== "All" && o.category !== state.category) return false;

    // Country dropdown and country ribbon share one index.
    if (state.location && !(o._countries || []).includes(state.location)) return false;

    if (state.country && !(o._countries || []).includes(state.country)) return false;

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
      const tokens = q.split(/\s+/).filter(Boolean);
      if (!matchesSearch(o, tokens)) return false;
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
    grid.innerHTML = "";
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
        <a href="${safeHref(o.apply_link, "#")}" target="_blank" rel="noopener" class="opp-apply">
          Apply →
        </a>
      </div>

      <button class="opp-expand-btn" type="button" aria-label="Show details">
        <span class="opp-expand-label">Read more</span>
      </button>
    </article>
  `;
}

// Detect Onsite/Remote/Hybrid from location or remote field
function detectMode(o) {
  const remoteField = String(o.remote || "").toLowerCase().trim();
  const loc = String(o.location || "").toLowerCase();

  if (remoteField === "yes" || remoteField === "true" || /remote|home-based|virtual|online/.test(loc)) {
    if (/hybrid|some remote|partial/.test(loc) || remoteField === "some") return "Hybrid";
    return "Remote";
  }
  if (remoteField === "some" || /hybrid/.test(loc)) return "Hybrid";
  return "Onsite";
}

function wireBookmarkButtons() {
  $$(".opp-bookmark").forEach((btn) => {
    btn.addEventListener("click", async (e) => {
      e.preventDefault();
      const id = btn.dataset.id;
      const wasBookmarked = state.bookmarks.has(id);

      if (wasBookmarked) {
        state.bookmarks.delete(id);
        btn.setAttribute("aria-pressed", "false");
        btn.textContent = "☆";
      } else {
        state.bookmarks.add(id);
        btn.setAttribute("aria-pressed", "true");
        btn.textContent = "★";
      }
      updateBookmarkChip();

      // Guests keep session-only bookmarks (matches prior behaviour).
      // Logged-in students get theirs persisted to Supabase.
      if (!currentUserId) return;
      try {
        if (wasBookmarked) {
          await window.SCA.removeBookmark(currentUserId, id);
        } else {
          const opportunity = state.all.find((o) => String(o.id || "") === id) || {};
          await window.SCA.addBookmark(currentUserId, { id, ...opportunity });
        }
      } catch (err) {
        console.warn("[SCA] Couldn't sync saved opportunity:", err.message);
      }
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
  const select = $("#filter-location");
  if (!select) return;
  const counts = state.countryCounts || {};
  const names = Object.keys(counts).sort((a, b) => counts[b] - counts[a] || a.localeCompare(b));
  select.innerHTML = '<option value="">All countries</option>';
  names.forEach((name) => {
    const opt = document.createElement("option");
    opt.value = name;
    opt.textContent = `${name} (${counts[name]})`;
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

// Opportunity links come from the Sheet/JSON feed rather than being
// typed by the viewing student, but escapeAttr alone only neutralizes
// HTML metacharacters — it does nothing to stop a non-http(s) scheme
// like "javascript:" from landing in a real href and running when
// clicked. This is the actual gate on what's allowed there.
function safeHref(url, fallback) {
  if (typeof url === "string" && /^https?:\/\//i.test(url.trim())) {
    return escapeAttr(url);
  }
  return escapeAttr(fallback);
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


/* Write the true live opportunity count anywhere [data-live-count] appears. */
function paintLiveCounts(n) {
  document.querySelectorAll("[data-live-count]").forEach((el) => {
    el.textContent = n;
  });
}

/* Home/About/Sources have no grid but still show the number — fetch it. */
if (!document.getElementById("opp-grid") &&
    document.querySelector("[data-live-count]")) {
  (async () => {
    try {
      const url = (APPS_SCRIPT_URL && !APPS_SCRIPT_URL.startsWith("REPLACE_"))
        ? `${APPS_SCRIPT_URL}?action=opportunities` : FALLBACK_JSON;
      const res = await fetch(url);
      const data = await res.json();
      const list = Array.isArray(data) ? data : (data.opportunities || []);
      const n = list.filter((o) => String(o.status || "live").toLowerCase() === "live").length;
      if (n) paintLiveCounts(n);

    } catch (e) {
      document.querySelectorAll("[data-live-count]").forEach((el) => {
        if (el.textContent === "—") el.textContent = "80+";
      });
    }
  })();
}
