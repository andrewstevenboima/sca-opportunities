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

  function renderCard(profile) {
    const card = document.createElement("a");
    card.className = "member-card";
    card.href = `member.html?id=${encodeURIComponent(profile.id)}`;
    const meta = [profile.region, profile.country, profile.university].filter(Boolean).join(" · ");
    card.innerHTML = `
      <div class="account-avatar account-avatar--lg">
        ${profile.avatar_url
          ? `<img src="${escapeAttr(profile.avatar_url)}" alt="" />`
          : `<span>${escapeHTML(initials(profile.full_name))}</span>`}
      </div>
      <h3 class="member-card-name">${escapeHTML(profile.full_name || "A student")}${profile.id === currentUserId ? " (you)" : ""}</h3>
      <p class="member-card-meta">${escapeHTML(meta || "SCA student")}</p>
    `;
    return card;
  }

  let allProfiles = [];

  function renderList(profiles) {
    grid.innerHTML = "";
    empty.hidden = !!profiles.length;
    profiles.forEach((p) => grid.appendChild(renderCard(p)));
  }

  try {
    allProfiles = await window.SCA.listAllProfiles();
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
