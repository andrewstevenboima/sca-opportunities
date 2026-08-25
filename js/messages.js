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
  const threadLinkBtn = document.getElementById("thread-link-btn");

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

  // Handles both explicit [link text](https://url) links (see
  // js/community.js renderLinks — same technique, kept here since
  // this file has its own local escapeHTML/escapeAttr rather than a
  // shared module) and bare https://... URLs pasted directly.
  function renderLinks(escapedText) {
    return escapedText.replace(
      /\[([^[\]]+)\]\((https?:\/\/[^\s()]+)\)|(https?:\/\/[^\s<]+)/g,
      (match, label, bracketUrl, bareUrl) => {
        if (bracketUrl) {
          return `<a href="${bracketUrl}" target="_blank" rel="noopener">${label}</a>`;
        }
        const trailingMatch = bareUrl.match(/[).,!?;:]+$/);
        const trailing = trailingMatch ? trailingMatch[0] : "";
        const clean = trailing ? bareUrl.slice(0, -trailing.length) : bareUrl;
        return `<a href="${clean}" target="_blank" rel="noopener">${clean}</a>${trailing}`;
      }
    );
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

  function startEditingMessage(row, msg) {
    const content = row.querySelector(".thread-bubble-content");
    const original = content.innerHTML;

    content.innerHTML = `
      <form class="edit-form">
        <textarea class="edit-form-body" rows="2" maxlength="2000" required>${escapeHTML(msg.body)}</textarea>
        <div class="composer-toolbar">
          <button type="button" class="link-picker-btn" aria-label="Add link">🔗</button>
          <button type="button" class="emoji-picker-btn" aria-label="Add emoji">🙂</button>
          <div class="edit-form-actions">
            <button type="button" class="btn btn-ghost edit-form-cancel">Cancel</button>
            <button type="submit" class="btn btn-primary">Save</button>
          </div>
        </div>
      </form>
    `;

    const form = content.querySelector(".edit-form");
    const bodyInput = form.querySelector(".edit-form-body");
    bodyInput.focus();

    if (typeof window.attachEmojiPicker === "function") {
      attachEmojiPicker(form.querySelector(".emoji-picker-btn"), bodyInput);
    }
    if (typeof window.attachLinkButton === "function") {
      attachLinkButton(form.querySelector(".link-picker-btn"), bodyInput);
    }

    form.querySelector(".edit-form-cancel").addEventListener("click", () => {
      content.innerHTML = original;
    });
    form.addEventListener("submit", async (e) => {
      e.preventDefault();
      const body = bodyInput.value.trim();
      if (!body) return;
      const saveBtn = form.querySelector("button[type=submit]");
      saveBtn.disabled = true;
      try {
        const updated = await window.SCA.updateMessage(msg.id, body);
        msg.body = updated.body;
        msg.edited_at = updated.edited_at;
        content.innerHTML = `<p>${renderLinks(escapeHTML(msg.body))}</p>`;
        const foot = row.querySelector(".thread-bubble-foot");
        if (foot && !foot.querySelector(".edited-tag")) {
          foot.querySelector(".thread-bubble-time").insertAdjacentHTML("afterend", '<span class="edited-tag">edited</span>');
        }
      } catch (err) {
        alert(err.message || "Couldn't save those changes.");
        saveBtn.disabled = false;
      }
    });
  }

  function renderMessageBubble(msg) {
    const isOwn = msg.sender_id === user.id;
    const row = document.createElement("div");
    row.className = "thread-bubble-row " + (isOwn ? "is-own" : "is-other");
    row.innerHTML = `
      <div class="thread-bubble">
        <div class="thread-bubble-content"><p>${renderLinks(escapeHTML(msg.body))}</p></div>
        <div class="thread-bubble-foot">
          <span class="thread-bubble-time">${formatTime(msg.created_at)}</span>
          ${msg.edited_at ? '<span class="edited-tag">edited</span>' : ""}
          ${isOwn ? '<button type="button" class="thread-bubble-edit">Edit</button>' : ""}
        </div>
      </div>
    `;
    const editBtn = row.querySelector(".thread-bubble-edit");
    if (editBtn) {
      editBtn.addEventListener("click", () => startEditingMessage(row, msg));
    }
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
  if (threadLinkBtn && typeof window.attachLinkButton === "function") {
    attachLinkButton(threadLinkBtn, threadInput);
  }

  await loadConversations();

  const params = new URLSearchParams(window.location.search);
  const withId = params.get("with");
  if (withId) {
    openThread(withId);
  }
});
