/* =============================================================
   students.html page logic — browse/search the student directory
   ============================================================= */
document.addEventListener("DOMContentLoaded", async () => {
  const signedOutBox = document.getElementById("students-signed-out");
  const signedInBox = document.getElementById("students-signed-in");
  if (!signedInBox) return; // not on students.html

  const grid = document.getElementById("students-grid");
  const empty = document.getElementById("students-empty");
  const search = document.getElementById("student-search");

  if (!window.SCA || !window.SCA.ready) {
    signedOutBox.hidden = false;
    return;
  }

  const session = await window.SCA.getSession();
  if (!session) {
    signedOutBox.hidden = false;
    return;
  }

  signedInBox.hidden = false;
  const currentUserId = session.user.id;

  function initials(name) {
    const source = (name || "").trim();
    if (!source) return "—";
    const parts = source.split(/\s+/).filter(Boolean);
    if (parts.length === 1) return parts[0][0].toUpperCase();
    return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  }

  function escapeHTML(str) {
    return String(str).replace(/[&<>"']/g, (c) => ({
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#39;",
    }[c]));
  }
  function escapeAttr(str) {
    return escapeHTML(str);
  }

  // Names and universities are typed by students, so casing varies
  // ("african leadership university", "jea"). Shown tidied; stored as typed.
  const SMALL = new Set(["of", "and", "the", "in", "for", "de", "du", "la", "et"]);
  function tidy(text) {
    const s = String(text || "").trim().replace(/\s+/g, " ");
    // Only all-lowercase or ALL-CAPS text is re-cased; anything with its
    // own mix of capitals ("McKinsey", "UoR") is left as typed.
    if (s !== s.toLowerCase() && s !== s.toUpperCase()) return s;
    return s.toLowerCase().split(" ").map((w, i) =>
      i > 0 && SMALL.has(w) ? w : w.charAt(0).toUpperCase() + w.slice(1)
    ).join(" ");
  }

  function renderCard(profile) {
    const card = document.createElement("a");
    card.className = "sd-row";
    card.href = `member.html?id=${encodeURIComponent(profile.id)}`;
    const name = tidy(profile.full_name) || "A student";
    const uni = tidy(profile.university);
    const place = [profile.country, profile.region].filter(Boolean).join(" · ");
    const isMe = profile.id === currentUserId;
    card.innerHTML = `
      <div class="account-avatar sd-avatar">
        ${profile.avatar_url
          ? `<img src="${escapeAttr(profile.avatar_url)}" alt="" />`
          : `<span>${escapeHTML(initials(name))}</span>`}
      </div>
      <div class="sd-body">
        <span class="sd-name">${escapeHTML(name)}${isMe ? ' <span class="sd-you">You</span>' : ""}</span>
        ${uni ? `<span class="sd-uni">${escapeHTML(uni)}</span>` : ""}
        <span class="sd-place">${escapeHTML(place || "SCA student")}</span>
      </div>
      <span class="sd-go" aria-hidden="true">View profile <span>→</span></span>
    `;
    return card;
  }

  let allProfiles = [];

  const countEl = document.getElementById("students-count");

  function renderList(profiles) {
    grid.innerHTML = "";
    empty.hidden = !!profiles.length;
    profiles.forEach((p) => grid.appendChild(renderCard(p)));
    if (countEl) {
      const n = profiles.length;
      countEl.textContent = search.value.trim()
        ? `${n} of ${allProfiles.length} student${allProfiles.length === 1 ? "" : "s"}`
        : `${n} student${n === 1 ? "" : "s"}`;
    }
  }

  try {
    // You first, then everyone else alphabetically.
    allProfiles = (await window.SCA.listAllProfiles()).sort((a, b) =>
      (b.id === currentUserId) - (a.id === currentUserId) ||
      tidy(a.full_name).localeCompare(tidy(b.full_name))
    );
    renderList(allProfiles);
  } catch (err) {
    grid.innerHTML = `<p>Couldn't load students. Please try refreshing.</p>`;
  }

  search.addEventListener("input", () => {
    const q = search.value.trim().toLowerCase();
    if (!q) {
      renderList(allProfiles);
      return;
    }
    const filtered = allProfiles.filter((p) =>
      [p.full_name, p.country, p.region, p.university]
        .filter(Boolean)
        .some((field) => field.toLowerCase().includes(q))
    );
    renderList(filtered);
  });
});
