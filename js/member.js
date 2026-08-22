/* =============================================================
   member.html page logic — public student profile + Companion
   ============================================================= */
document.addEventListener("DOMContentLoaded", async () => {
  const signedOutBox = document.getElementById("member-signed-out");
  const notFoundBox = document.getElementById("member-not-found");
  const profileBox = document.getElementById("member-profile");
  const postsSection = document.getElementById("member-posts-section");
  if (!profileBox) return; // not on member.html

  if (!window.SCA || !window.SCA.ready) {
    signedOutBox.hidden = false;
    return;
  }

  const session = await window.SCA.getSession();
  if (!session) {
    signedOutBox.hidden = false;
    return;
  }

  const currentUser = session.user;
  const params = new URLSearchParams(window.location.search);
  const memberId = params.get("id");

  if (!memberId) {
    notFoundBox.hidden = false;
    return;
  }

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

  function linkify(escapedText) {
    return escapedText.replace(/(https?:\/\/[^\s<]+)/g, (url) => {
      const trailingMatch = url.match(/[).,!?;:]+$/);
      const trailing = trailingMatch ? trailingMatch[0] : "";
      const clean = trailing ? url.slice(0, -trailing.length) : url;
      return `<a href="${clean}" target="_blank" rel="noopener">${clean}</a>${trailing}`;
    });
  }

  let profile;
  try {
    profile = await window.SCA.getPublicProfile(memberId);
  } catch (err) {
    profile = null;
  }

  if (!profile) {
    notFoundBox.hidden = false;
    return;
  }

  profileBox.hidden = false;
  postsSection.hidden = false;

  document.getElementById("member-name").textContent = profile.full_name || "A student";
  const metaParts = [profile.region, profile.country, profile.university].filter(Boolean);
  document.getElementById("member-meta").textContent = metaParts.join(" · ") || "SCA student";

  const avatarImg = document.getElementById("member-avatar-img");
  const avatarInitials = document.getElementById("member-avatar-initials");
  if (profile.avatar_url) {
    avatarImg.src = profile.avatar_url;
    avatarImg.hidden = false;
    avatarInitials.hidden = true;
  } else {
    avatarInitials.textContent = initials(profile.full_name);
  }

  const isSelf = memberId === currentUser.id;
  const companionBtn = document.getElementById("btn-companion");
  const selfNote = document.getElementById("member-self-note");
  const messageBtn = document.getElementById("btn-message");
  const messageHint = document.getElementById("member-message-hint");

  async function refreshCounts() {
    const [companions, companioning] = await Promise.all([
      window.SCA.listCompanions(memberId),
      window.SCA.listCompanioning(memberId),
    ]);
    document.getElementById("stat-companions").textContent = companions.length;
    document.getElementById("stat-companioning").textContent = companioning.length;
  }

  async function refreshMessageAccess(currentIsCompanion) {
    // Messaging unlocks once a Companion relationship exists in
    // EITHER direction — matches the messages_insert_companions
    // policy in schema.sql, so the button never promises something
    // sending would then reject.
    let theyCompanionMe = false;
    try {
      theyCompanionMe = await window.SCA.isCompanion(memberId, currentUser.id);
    } catch (err) {
      theyCompanionMe = false;
    }
    const canMessage = currentIsCompanion || theyCompanionMe;
    if (messageBtn) {
      messageBtn.hidden = !canMessage;
      if (canMessage) messageBtn.href = `messages.html?with=${encodeURIComponent(memberId)}`;
    }
    if (messageHint) messageHint.hidden = canMessage;
  }

  if (isSelf) {
    selfNote.hidden = false;
  } else {
    companionBtn.hidden = false;
    let isCompanion = false;
    try {
      isCompanion = await window.SCA.isCompanion(currentUser.id, memberId);
    } catch (err) {
      isCompanion = false;
    }

    function paintButton() {
      companionBtn.textContent = isCompanion ? "Companioned" : "+ Companion";
      companionBtn.classList.toggle("btn-primary", !isCompanion);
      companionBtn.classList.toggle("btn-ghost", isCompanion);
    }
    paintButton();
    await refreshMessageAccess(isCompanion);

    companionBtn.addEventListener("click", async () => {
      companionBtn.disabled = true;
      try {
        if (isCompanion) {
          await window.SCA.removeCompanion(currentUser.id, memberId);
        } else {
          await window.SCA.addCompanion(currentUser.id, memberId);
          window.SCA.createNotifications([
            { recipient_id: memberId, actor_id: currentUser.id, type: "companion_added" },
          ]).catch(() => {
            // Non-fatal — the Companion relationship itself already succeeded.
          });
        }
        isCompanion = !isCompanion;
        paintButton();
        await refreshCounts();
        await refreshMessageAccess(isCompanion);
      } catch (err) {
        alert(err.message || "Couldn't update that.");
      } finally {
        companionBtn.disabled = false;
      }
    });
  }

  await refreshCounts();

  const postsList = document.getElementById("member-posts-list");
  const postsEmpty = document.getElementById("member-posts-empty");
  try {
    const posts = await window.SCA.listPostsByUser(memberId);
    if (!posts.length) {
      postsEmpty.hidden = false;
    } else {
      postsList.innerHTML = posts
        .map(
          (p) => `
        <article class="post-card">
          <h3 class="post-title"><a href="community.html">${escapeHTML(p.title)}</a></h3>
          <p class="post-body">${linkify(escapeHTML(p.body))}</p>
        </article>
      `
        )
        .join("");
    }
  } catch (err) {
    postsEmpty.hidden = false;
  }
});
