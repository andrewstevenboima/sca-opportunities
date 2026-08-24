/* =============================================================
   SCA Opportunities — Service Worker

   Bump CACHE_VERSION whenever a deploy needs to force clients past
   a stale cache (e.g. a security fix in one of the precached JS
   files) — the activate handler below deletes any cache whose name
   doesn't match the current version.
   ============================================================= */
const CACHE_VERSION = "v1";
const CACHE_NAME = `sca-opportunities-${CACHE_VERSION}`;

// The "app shell" — precached on install so the site opens instantly
// (and works at all offline) even before anything has been visited.
const PRECACHE_URLS = [
  "/",
  "/about.html",
  "/account.html",
  "/community.html",
  "/index.html",
  "/login.html",
  "/match.html",
  "/member.html",
  "/messages.html",
  "/opportunities.html",
  "/privacy.html",
  "/sources.html",
  "/students.html",
  "/terms.html",
  "/styles.css",
  "/auth.css",
  "/community.css",
  "/legal.css",
  "/script.js",
  "/match.js",
  "/js/account-page.js",
  "/js/auth-page.js",
  "/js/community.js",
  "/js/emoji-picker.js",
  "/js/member.js",
  "/js/messages.js",
  "/js/regions.js",
  "/js/site-nav.js",
  "/js/students.js",
  "/js/supabase-client.js",
  "/site.webmanifest",
  "/assets/logo.png",
  "/assets/icon-192.png",
  "/assets/icon-512.png",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(CACHE_NAME)
      .then((cache) => cache.addAll(PRECACHE_URLS))
      // Activate this version immediately rather than waiting for
      // every open tab to close — important for shipping fixes
      // (including security fixes) without students needing to fully
      // quit and reopen the installed app first.
      .then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((names) => Promise.all(names.filter((n) => n !== CACHE_NAME).map((n) => caches.delete(n))))
      .then(() => self.clients.claim())
  );
});

function isSameOrigin(url) {
  return url.origin === self.location.origin;
}

// Anything hitting Supabase (auth/data API) or the Apps Script feed
// must always go straight to the network — never cached. This is
// live, auth-sensitive data; serving a stale or cross-session cached
// response here would be a correctness and privacy bug, not a
// performance win.
function isLiveApi(url) {
  return url.hostname.endsWith("supabase.co") || url.hostname.endsWith("script.google.com");
}

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;

  const url = new URL(request.url);
  if (!isSameOrigin(url) || isLiveApi(url)) return; // let the browser handle it normally

  // Page navigations: network-first, falling back to the cached
  // shell when offline — students should see live content whenever
  // there's a connection, and still get *something* when there isn't.
  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request)
        .then((response) => {
          const copy = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(request, copy));
          return response;
        })
        .catch(() => caches.match(request).then((cached) => cached || caches.match("/index.html")))
    );
    return;
  }

  // Static assets (CSS/JS/images/manifest): stale-while-revalidate —
  // answer instantly from cache when available, and refresh the
  // cache in the background so the *next* load picks up any change.
  event.respondWith(
    caches.open(CACHE_NAME).then((cache) =>
      cache.match(request).then((cached) => {
        const networkFetch = fetch(request)
          .then((response) => {
            if (response.ok) cache.put(request, response.clone());
            return response;
          })
          .catch(() => cached);
        return cached || networkFetch;
      })
    )
  );
});
