/* =============================================================
   messages.html page logic — private messages between Companions
   ============================================================= */
document.addEventListener("DOMContentLoaded", async () => {
  const signedOutBox = document.getElementById("messages-signed-out");
  const signedInBox = document.getElementById("messages-signed-in");
  if (!signedInBox) return; // not on messages.html

  const shell = document.getElementById("messages-shell");
  const conversationsList = document.getElementById("conversations-list");
  const conversationsEmpty = document.getElementById("conversations-empty");
  const threadPanel = document.getElementById("thread-panel");
  const threadPlaceholder = document.getElementById("thread-placeholder");
  const threadBack = document.getElementById("thread-back");
  const threadAvatarImg = document.getElementById("thread-avatar-img");
  const threadAvatarInitials = document.getElementById("thread-avatar-initials");
  const threadAvatarLink = document.getElementById("thread-avatar-link");
  const threadPartnerName = document.getElementById("thread-partner-name");
  const threadMessages = document.getElementById("thread-messages");
  const threadForm = document.getElementById("thread-form");
  const threadInput = document.getElementById("thread-input");
  const threadEmojiBtn = document.getElementById("thread-emoji-btn");

  if (!window.SCA || !window.SCA.ready) {
    signedOutBox.hidden = false;
    return;
  }

  const session = await window.SCA.getSession();
  if (!session) {
    signedOutBox.hidden = false;
    return;
  }

  const user = session.user;
  signedInBox.hidden = false;

  const profileCache = new Map();

  async function getProfile(userId) {
    if (profileCache.has(userId)) return profileCache.get(userId);
    try {
      const profile = await window.SCA.getPublicProfile(userId);
      profileCache.set(userId, profile);
      return profile;
    } catch (err) {
      return null;
    }
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

  function formatTime(iso) {
    const d = new Date(iso);
    const now = new Date();
    const sameDay = d.toDateString() === now.toDateString();
    if (sameDay) return d.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });
    return d.toLocaleDateString("en-GB", { day: "numeric", month: "short" });
  }

  function avatarInto(imgEl, initialsEl, profile) {
    if (profile?.avatar_url) {
      imgEl.src = profile.avatar_url;
      imgEl.hidden = false;
      initialsEl.hidden = true;
    } else {
      imgEl.hidden = true;
      initialsEl.hidden = false;
      initialsEl.textContent = initials(profile?.full_name);
    }
  }

  let activePartnerId = null;

  function renderConversationItem(conv, profile) {
    const item = document.createElement("button");
    item.type = "button";
    item.className = "conversation-item";
    item.dataset.partnerId = conv.partnerId;
    const preview = conv.lastMessage.body.length > 60
      ? conv.lastMessage.body.slice(0, 60) + "…"
      : conv.lastMessage.body;
    item.innerHTML = `
      <div class="account-avatar account-avatar--sm">
        ${profile?.avatar_url
          ? `<img src="${escapeAttr(profile.avatar_url)}" alt="" />`
          : `<span>${escapeHTML(initials(profile?.full_name))}</span>`}
      </div>
      <div class="conversation-item-body">
        <div class="conversation-item-top">
          <span class="conversation-item-name">${escapeHTML(profile?.full_name || "A student")}</span>
          <span class="conversation-item-time">${formatTime(conv.lastMessage.created_at)}</span>
        </div>
        <p class="conversation-item-preview">${escapeHTML(preview)}</p>
      </div>
      ${conv.unreadCount ? `<span class="nav-badge conversation-unread">${conv.unreadCount}</span>` : ""}
    `;
    item.addEventListener("click", () => openThread(conv.partnerId, profile));
    return item;
  }

  async function loadConversations() {
    let conversations;
    try {
      conversations = await window.SCA.listConversations(user.id);
    } catch (err) {
      conversationsList.innerHTML = `<p>Couldn't load your messages. Please try refreshing.</p>`;
      return;
    }

    if (!conversations.length) {
      conversationsEmpty.hidden = false;
      return;
    }

    conversationsList.innerHTML = "";
    for (const conv of conversations) {
      const profile = await getProfile(conv.partnerId);
      conversationsList.appendChild(renderConversationItem(conv, profile));
    }
  }

  function renderMessageBubble(msg) {
    const row = document.createElement("div");
    row.className = "thread-bubble-row " + (msg.sender_id === user.id ? "is-own" : "is-other");
    row.innerHTML = `
      <div class="thread-bubble">
        <p>${escapeHTML(msg.body)}</p>
        <span class="thread-bubble-time">${formatTime(msg.created_at)}</span>
      </div>
    `;
    return row;
  }

  async function openThread(partnerId, knownProfile) {
    activePartnerId = partnerId;
    const profile = knownProfile || (await getProfile(partnerId));

    threadPlaceholder.hidden = true;
    threadPanel.hidden = false;
    if (shell) shell.classList.add("show-thread");

    threadPartnerName.textContent = profile?.full_name || "A student";
    threadPartnerName.href = `member.html?id=${encodeURIComponent(partnerId)}`;
    threadAvatarLink.href = `member.html?id=${encodeURIComponent(partnerId)}`;
    avatarInto(threadAvatarImg, threadAvatarInitials, profile);

    threadMessages.innerHTML = `<p class="auth-hint">Loading messages…</p>`;
    try {
      const msgs = await window.SCA.listMessages(user.id, partnerId);
      threadMessages.innerHTML = "";
      if (!msgs.length) {
        threadMessages.innerHTML = `<p class="auth-hint">Say hello — this is the start of your conversation.</p>`;
      } else {
        for (const msg of msgs) threadMessages.appendChild(renderMessageBubble(msg));
      }
      threadMessages.scrollTop = threadMessages.scrollHeight;

      await window.SCA.markThreadRead(user.id, partnerId);
      const item = conversationsList.querySelector(`[data-partner-id="${CSS.escape(partnerId)}"] .conversation-unread`);
      if (item) item.remove();
      if (typeof wireAuthNav === "function") wireAuthNav();
    } catch (err) {
      threadMessages.innerHTML = `<p class="auth-hint">Couldn't load this conversation.</p>`;
    }

    threadInput.focus();
  }

  if (threadBack) {
    threadBack.addEventListener("click", () => {
      if (shell) shell.classList.remove("show-thread");
      threadPanel.hidden = true;
      activePartnerId = null;
    });
  }

  threadForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    const body = threadInput.value.trim();
    if (!body || !activePartnerId) return;

    const submitBtn = threadForm.querySelector("button");
    submitBtn.disabled = true;
    try {
      const msg = await window.SCA.sendMessage(user.id, activePartnerId, body);
      const emptyHint = threadMessages.querySelector(".auth-hint");
      if (emptyHint) emptyHint.remove();
      threadMessages.appendChild(renderMessageBubble(msg));
      threadMessages.scrollTop = threadMessages.scrollHeight;
      threadInput.value = "";
      loadConversations();
    } catch (err) {
      alert(
        err.message && err.message.includes("row-level security")
          ? "You can only message students you're Companions with."
          : err.message || "Couldn't send that message."
      );
    } finally {
      submitBtn.disabled = false;
    }
  });

  if (threadEmojiBtn && typeof window.attachEmojiPicker === "function") {
    attachEmojiPicker(threadEmojiBtn, threadInput);
  }

  await loadConversations();

  const params = new URLSearchParams(window.location.search);
  const withId = params.get("with");
  if (withId) {
    openThread(withId);
  }
});
