/* =============================================================
   community.html page logic — The Common Room
   ============================================================= */
document.addEventListener("DOMContentLoaded", async () => {
  const signedOutBox = document.getElementById("community-signed-out");
  const signedInBox = document.getElementById("community-signed-in");
  if (!signedInBox) return; // not on community.html

  const postForm = document.getElementById("form-new-post");
  const postTitle = document.getElementById("post-title");
  const postBody = document.getElementById("post-body");
  const postBodyEmojiBtn = document.getElementById("post-body-emoji-btn");
  const postBodyLinkBtn = document.getElementById("post-body-link-btn");
  const postBodyBoldBtn = document.getElementById("post-body-bold-btn");
  const postBodyItalicBtn = document.getElementById("post-body-italic-btn");
  const postBodyUnderlineBtn = document.getElementById("post-body-underline-btn");
  const postBodyBulletBtn = document.getElementById("post-body-bullet-btn");
  const postBodyNumberedBtn = document.getElementById("post-body-numbered-btn");
  const postError = document.getElementById("new-post-error");
  const postSubmit = document.getElementById("new-post-submit");
  const postsList = document.getElementById("posts-list");
  const postsEmpty = document.getElementById("posts-empty");

  // post_id/comment_id -> array of { id, user_id, emoji } — populated
  // in batch whenever posts/comments load, then read from and
  // patched in place as the student adds/removes their own reactions.
  const reactionsByPost = new Map();
  const reactionsByComment = new Map();

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

  async function getAuthor(userId) {
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

  function formatTime(iso) {
    const d = new Date(iso);
    return d.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" }) +
      " · " + d.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });
  }

  // Handles **bold**, *italic*, __underline__ (inserted via the
  // format-tools.js ribbon buttons), explicit [link text](https://url)
  // links (inserted via the 🔗 button, js/link-tool.js), and bare
  // https://... URLs pasted directly — all in a single regex/replace
  // pass, not several separate ones. That's what stops e.g. a
  // bracket-linked URL from also being caught and re-wrapped by the
  // bare-URL branch, or a "**" pair from being split apart by the
  // single-"*" italic branch: once a run of characters is consumed by
  // one alternative, the same scan can't also match a subset of it
  // under another. Runs on already-escaped text, so the link URL can
  // only ever start with a literal http(s):// — nothing else (e.g.
  // javascript:) can reach an href this way.
  function renderInline(escapedText) {
    return escapedText.replace(
      /\*\*(.+?)\*\*|__(.+?)__|\*(.+?)\*|\[([^[\]]+)\]\((https?:\/\/[^\s()]+)\)|(https?:\/\/[^\s<]+)/g,
      (match, bold, underline, italic, linkLabel, linkUrl, bareUrl) => {
        if (bold !== undefined) return `<strong>${bold}</strong>`;
        if (underline !== undefined) return `<u>${underline}</u>`;
        if (italic !== undefined) return `<em>${italic}</em>`;
        if (linkUrl) return `<a href="${linkUrl}" target="_blank" rel="noopener">${linkLabel}</a>`;
        const trailingMatch = bareUrl.match(/[).,!?;:]+$/);
        const trailing = trailingMatch ? trailingMatch[0] : "";
        const clean = trailing ? bareUrl.slice(0, -trailing.length) : bareUrl;
        return `<a href="${clean}" target="_blank" rel="noopener">${clean}</a>${trailing}`;
      }
    );
  }

  // Turns lines starting with "- " into a real <ul>, and lines
  // starting with "1. " (etc.) into a real <ol> — the block-level
  // counterpart to renderInline above. Called after mentions have
  // already been substituted (so a mention can never get split across
  // a line boundary), and calls renderInline on each individual line
  // or list item rather than on the whole multi-line string at once,
  // so a bold/italic/underline run can never silently span a line
  // break either.
  function renderBlocks(text) {
    const lines = text.split("\n");
    const out = [];
    let i = 0;
    while (i < lines.length) {
      const bulletMatch = lines[i].match(/^-\s+(.*)$/);
      const numberedMatch = lines[i].match(/^\d+\.\s+(.*)$/);
      if (bulletMatch) {
        const items = [];
        while (i < lines.length) {
          const m = lines[i].match(/^-\s+(.*)$/);
          if (!m) break;
          items.push(`<li>${renderInline(m[1])}</li>`);
          i++;
        }
        out.push(`<ul>${items.join("")}</ul>`);
      } else if (numberedMatch) {
        const items = [];
        while (i < lines.length) {
          const m = lines[i].match(/^\d+\.\s+(.*)$/);
          if (!m) break;
          items.push(`<li>${renderInline(m[1])}</li>`);
          i++;
        }
        out.push(`<ol>${items.join("")}</ol>`);
      } else {
        out.push(renderInline(lines[i]));
        i++;
      }
    }
    return out.join("\n");
  }

  // ---- @mentions ----

  let allProfilesCache = null;
  async function getAllProfiles() {
    if (allProfilesCache) return allProfilesCache;
    try {
      allProfilesCache = await window.SCA.listAllProfiles();
    } catch (err) {
      allProfilesCache = [];
    }
    return allProfilesCache;
  }

  // Runs on already-escaped text, same as linkify — matches a single
  // pass over the ORIGINAL string (String.replace never re-scans its
  // own output), so a shorter name can never accidentally match
  // inside the <a> tag just inserted for a longer one that starts
  // with the same words (e.g. "Andrew" vs "Andrew Steven Boima").
  function renderMentions(escapedText, profiles) {
    const named = (profiles || []).filter((p) => p.full_name && p.full_name.trim());
    if (!named.length) return escapedText;

    const byEscapedName = new Map();
    const alternatives = [...named]
      .sort((a, b) => b.full_name.length - a.full_name.length)
      .map((p) => {
        const escapedName = escapeHTML(p.full_name);
        byEscapedName.set(escapedName, p);
        return escapedName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      });

    const pattern = new RegExp(`@(${alternatives.join("|")})(?![A-Za-z0-9])`, "g");
    return escapedText.replace(pattern, (match, name) => {
      const profile = byEscapedName.get(name);
      return `<a href="member.html?id=${escapeAttr(profile.id)}" class="mention-link">@${name}</a>`;
    });
  }

  // "@all" isn't a real profile, so it's handled as its own pass
  // before the per-profile one above (that one only ever matches
  // real full names, so the two passes can't collide).
  function renderAllMention(escapedText) {
    return escapedText.replace(/@all(?![A-Za-z0-9])/gi, '<span class="mention-link mention-all">@all</span>');
  }

  // Same alternation technique as renderMentions, but run on raw
  // (unescaped) input text at submit time to work out who to notify,
  // rather than on already-escaped text for display.
  function extractMentionedIds(rawText, profiles) {
    const named = (profiles || []).filter((p) => p.full_name && p.full_name.trim());
    const ids = new Set();
    if (!named.length) return ids;

    const byName = new Map();
    const alternatives = [...named]
      .sort((a, b) => b.full_name.length - a.full_name.length)
      .map((p) => {
        byName.set(p.full_name, p);
        return p.full_name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      });

    const pattern = new RegExp(`@(${alternatives.join("|")})(?![A-Za-z0-9])`, "g");
    let match;
    while ((match = pattern.exec(rawText)) !== null) {
      const profile = byName.get(match[1]);
      if (profile) ids.add(profile.id);
    }
    return ids;
  }

  // Fire-and-forget: a failure here should never block the post or
  // comment itself from being created, since notifications are a
  // bonus on top of the actual content.
  async function notifyMentions(rawText, postId, commentId, kind) {
    try {
      const profiles = await getAllProfiles();
      const mentionsAll = /@all(?![A-Za-z0-9])/i.test(rawText);
      let recipientIds;
      let type;
      if (mentionsAll) {
        recipientIds = profiles.map((p) => p.id).filter((id) => id !== user.id);
        type = kind === "post" ? "mention_all_post" : "mention_all_comment";
      } else {
        const ids = extractMentionedIds(rawText, profiles);
        ids.delete(user.id);
        recipientIds = Array.from(ids);
        type = kind === "post" ? "mention_post" : "mention_comment";
      }
      if (!recipientIds.length) return;
      const rows = recipientIds.map((recipient_id) => ({
        recipient_id,
        actor_id: user.id,
        type,
        post_id: postId,
        comment_id: commentId,
      }));
      await window.SCA.createNotifications(rows);
    } catch (err) {
      // Non-fatal — see comment above.
    }
  }

  // Lightweight "@" autocomplete for a text input or textarea — shows
  // a floating list of matching students below the field, filtered
  // as you type, with keyboard (arrows/Enter/Tab/Escape) and mouse
  // support. Inserts the student's exact full name so renderMentions
  // above can reliably match it back to their profile later.
  function attachMentionAutocomplete(inputEl) {
    let menu = null;
    let activeIndex = -1;
    let currentMatches = [];
    let mentionStart = -1;

    function closeMenu() {
      if (menu) menu.remove();
      menu = null;
      activeIndex = -1;
      currentMatches = [];
      mentionStart = -1;
    }

    function positionMenu() {
      const rect = inputEl.getBoundingClientRect();
      menu.style.left = `${rect.left}px`;
      menu.style.top = `${rect.bottom + 4}px`;
      menu.style.width = `${Math.max(rect.width, 220)}px`;
    }

    function renderMenu() {
      if (!menu) {
        menu = document.createElement("div");
        menu.className = "mention-menu";
        document.body.appendChild(menu);
      }
      positionMenu();
      menu.innerHTML = currentMatches
        .map((p, i) => {
          const cls = "mention-option" + (p.isAll ? " mention-option-all" : "") + (i === activeIndex ? " is-active" : "");
          const avatar = p.isAll
            ? '<div class="account-avatar account-avatar--sm mention-all-icon"><span>@</span></div>'
            : avatarHTML(p, "account-avatar--sm");
          const label = p.isAll ? "Notify everyone" : escapeHTML(p.full_name || "A student");
          return `
        <button type="button" class="${cls}" data-index="${i}">
          ${avatar}
          <span>${label}</span>
        </button>
      `;
        })
        .join("");
      menu.querySelectorAll(".mention-option").forEach((btn) => {
        // mousedown (not click) + preventDefault keeps focus on the
        // input so selecting a suggestion doesn't blur it first.
        btn.addEventListener("mousedown", (e) => {
          e.preventDefault();
          selectMatch(Number(btn.dataset.index));
        });
      });
    }

    function selectMatch(index) {
      const profile = currentMatches[index];
      if (!profile) return;
      const value = inputEl.value;
      const caret = inputEl.selectionStart;
      const before = value.slice(0, mentionStart);
      const after = value.slice(caret);
      const insertion = `@${profile.full_name} `;
      inputEl.value = before + insertion + after;
      const newCaret = before.length + insertion.length;
      inputEl.setSelectionRange(newCaret, newCaret);
      closeMenu();
      inputEl.focus();
    }

    async function handleInput() {
      const value = inputEl.value;
      const caret = inputEl.selectionStart;
      const match = value.slice(0, caret).match(/@([^\s@]{0,30})$/);
      if (!match) {
        closeMenu();
        return;
      }
      mentionStart = caret - match[0].length;
      const query = match[1].toLowerCase();
      const profiles = await getAllProfiles();
      const matches = profiles
        .filter((p) => p.full_name && p.full_name.toLowerCase().includes(query))
        .slice(0, 5);
      if ("all".startsWith(query)) {
        matches.unshift({ id: null, full_name: "all", isAll: true });
      }
      currentMatches = matches.slice(0, 6);
      if (!currentMatches.length) {
        closeMenu();
        return;
      }
      activeIndex = 0;
      renderMenu();
    }

    inputEl.addEventListener("input", handleInput);

    inputEl.addEventListener("keydown", (e) => {
      if (!menu || !currentMatches.length) return;
      if (e.key === "ArrowDown") {
        e.preventDefault();
        activeIndex = (activeIndex + 1) % currentMatches.length;
        renderMenu();
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        activeIndex = (activeIndex - 1 + currentMatches.length) % currentMatches.length;
        renderMenu();
      } else if (e.key === "Enter" || e.key === "Tab") {
        if (activeIndex >= 0) {
          e.preventDefault();
          selectMatch(activeIndex);
        }
      } else if (e.key === "Escape") {
        closeMenu();
      }
    });

    inputEl.addEventListener("blur", () => setTimeout(closeMenu, 150));
  }

  function avatarHTML(profile, sizeClass) {
    const label = escapeHTML(initials(profile?.full_name));
    if (profile?.avatar_url) {
      return `<div class="account-avatar ${sizeClass}"><img src="${escapeAttr(profile.avatar_url)}" alt="" /></div>`;
    }
    return `<div class="account-avatar ${sizeClass}"><span>${label}</span></div>`;
  }

  // ---- Reactions ----

  function renderReactionBar(targetType, targetId, container) {
    const store = targetType === "post" ? reactionsByPost : reactionsByComment;
    const reactions = store.get(targetId) || [];

    const byEmoji = new Map();
    for (const r of reactions) {
      if (!byEmoji.has(r.emoji)) byEmoji.set(r.emoji, []);
      byEmoji.get(r.emoji).push(r);
    }

    const pills = Array.from(byEmoji.entries())
      .map(([emoji, rows]) => {
        const mine = rows.some((r) => r.user_id === user.id);
        return `
          <button type="button" class="reaction-pill${mine ? " is-mine" : ""}" data-emoji="${escapeAttr(emoji)}">
            <span>${escapeHTML(emoji)}</span><span class="reaction-pill-count">${rows.length}</span>
          </button>
        `;
      })
      .join("");

    container.innerHTML = `${pills}<button type="button" class="reaction-add-btn" aria-label="Add reaction">🙂+</button>`;

    container.querySelectorAll(".reaction-pill").forEach((btn) => {
      btn.addEventListener("click", () => toggleReaction(targetType, targetId, btn.dataset.emoji, container));
    });

    const addBtn = container.querySelector(".reaction-add-btn");
    if (typeof window.attachEmojiPickerButton === "function") {
      attachEmojiPickerButton(addBtn, (emoji) => toggleReaction(targetType, targetId, emoji, container));
    }
  }

  async function toggleReaction(targetType, targetId, emoji, container) {
    const store = targetType === "post" ? reactionsByPost : reactionsByComment;
    const reactions = store.get(targetId) || [];
    const mine = reactions.find((r) => r.user_id === user.id && r.emoji === emoji);

    // Optimistic: update the local cache and re-render immediately,
    // then roll back if the request fails.
    if (mine) {
      store.set(targetId, reactions.filter((r) => r !== mine));
      renderReactionBar(targetType, targetId, container);
      try {
        if (targetType === "post") await window.SCA.removePostReaction(user.id, targetId, emoji);
        else await window.SCA.removeCommentReaction(user.id, targetId, emoji);
      } catch (err) {
        reactions.push(mine);
        store.set(targetId, reactions);
        renderReactionBar(targetType, targetId, container);
      }
    } else {
      const optimisticRow = { id: `pending-${Date.now()}`, user_id: user.id, emoji };
      store.set(targetId, [...reactions, optimisticRow]);
      renderReactionBar(targetType, targetId, container);
      try {
        if (targetType === "post") await window.SCA.addPostReaction(user.id, targetId, emoji);
        else await window.SCA.addCommentReaction(user.id, targetId, emoji);
      } catch (err) {
        store.set(targetId, (store.get(targetId) || []).filter((r) => r !== optimisticRow));
        renderReactionBar(targetType, targetId, container);
      }
    }
  }

  async function loadReactionsForPosts(postIds) {
    if (!postIds.length) return;
    try {
      const rows = await window.SCA.listPostReactions(postIds);
      for (const id of postIds) reactionsByPost.set(id, []);
      for (const row of rows) reactionsByPost.get(row.post_id).push(row);
    } catch (err) {
      // Reaction bars just render empty — not worth blocking the feed over.
    }
  }

  async function loadReactionsForComments(commentIds) {
    if (!commentIds.length) return;
    try {
      const rows = await window.SCA.listCommentReactions(commentIds);
      for (const id of commentIds) reactionsByComment.set(id, []);
      for (const row of rows) reactionsByComment.get(row.comment_id).push(row);
    } catch (err) {
      // Reaction bars just render empty — not worth blocking the thread over.
    }
  }

  async function renderPostContent(post) {
    return `
      <h3 class="post-title">${escapeHTML(post.title)}</h3>
      <div class="post-body">${renderBlocks(renderAllMention(renderMentions(escapeHTML(post.body), await getAllProfiles())))}</div>
    `;
  }

  function startEditingPost(card, post, onSaved) {
    const content = card.querySelector(".post-content");
    const original = content.innerHTML;

    content.innerHTML = `
      <form class="edit-form">
        <input type="text" class="edit-form-title" maxlength="150" required value="${escapeAttr(post.title)}" />
        <textarea class="edit-form-body" rows="3" maxlength="5000" required>${escapeHTML(post.body)}</textarea>
        <div class="composer-toolbar">
          <button type="button" class="format-bold-btn" aria-label="Bold">B</button>
          <button type="button" class="format-italic-btn" aria-label="Italic">I</button>
          <button type="button" class="format-underline-btn" aria-label="Underline">U</button>
          <button type="button" class="link-picker-btn" aria-label="Add link">🔗</button>
          <button type="button" class="format-bullet-btn" aria-label="Bulleted list">•</button>
          <button type="button" class="format-numbered-btn" aria-label="Numbered list">1.</button>
          <button type="button" class="emoji-picker-btn" aria-label="Add emoji">🙂</button>
          <div class="edit-form-actions">
            <button type="button" class="btn btn-ghost edit-form-cancel">Cancel</button>
            <button type="submit" class="btn btn-primary">Save</button>
          </div>
        </div>
      </form>
    `;

    const form = content.querySelector(".edit-form");
    const titleInput = form.querySelector(".edit-form-title");
    const bodyInput = form.querySelector(".edit-form-body");
    bodyInput.focus();

    if (typeof window.attachEmojiPicker === "function") {
      attachEmojiPicker(form.querySelector(".emoji-picker-btn"), bodyInput);
    }
    if (typeof window.attachLinkButton === "function") {
      attachLinkButton(form.querySelector(".link-picker-btn"), bodyInput);
    }
    if (typeof window.attachFormatButton === "function") {
      attachFormatButton(form.querySelector(".format-bold-btn"), bodyInput, "bold");
      attachFormatButton(form.querySelector(".format-italic-btn"), bodyInput, "italic");
      attachFormatButton(form.querySelector(".format-underline-btn"), bodyInput, "underline");
      attachFormatButton(form.querySelector(".format-bullet-btn"), bodyInput, "bullet");
      attachFormatButton(form.querySelector(".format-numbered-btn"), bodyInput, "numbered");
    }

    function cancel() {
      content.innerHTML = original;
    }

    form.querySelector(".edit-form-cancel").addEventListener("click", cancel);
    form.addEventListener("submit", async (e) => {
      e.preventDefault();
      const title = titleInput.value.trim();
      const body = bodyInput.value.trim();
      if (!title || !body) return;
      const saveBtn = form.querySelector("button[type=submit]");
      saveBtn.disabled = true;
      try {
        const updated = await window.SCA.updatePost(post.id, { title, body });
        onSaved(updated);
      } catch (err) {
        alert(err.message || "Couldn't save those changes.");
        saveBtn.disabled = false;
      }
    });
  }

  async function renderPostCard(post) {
    const author = await getAuthor(post.user_id);
    const name = author?.full_name || "A student";
    const isOwn = post.user_id === user.id;

    const card = document.createElement("article");
    card.className = "post-card";
    card.dataset.postId = post.id;
    card.innerHTML = `
      <div class="post-card-head">
        <div class="post-author">
          <a href="member.html?id=${escapeAttr(post.user_id)}" class="post-author-avatar-link" aria-label="View ${escapeAttr(name)}'s profile">${avatarHTML(author, "account-avatar--sm")}</a>
          <div>
            <a href="member.html?id=${escapeAttr(post.user_id)}" class="post-author-name">${escapeHTML(name)}</a>
            <div class="post-time">${formatTime(post.created_at)}${post.edited_at ? ' · <span class="edited-tag">edited</span>' : ""}</div>
          </div>
        </div>
      </div>
      <div class="post-content">${await renderPostContent(post)}</div>
      <div class="reaction-bar" data-target-type="post" data-target-id="${escapeAttr(post.id)}"></div>
      <div class="post-actions">
        <button type="button" class="post-toggle-comments" data-post-id="${escapeAttr(post.id)}">Comments</button>
        <button type="button" class="post-share" data-post-id="${escapeAttr(post.id)}">Share</button>
        ${isOwn ? `<button type="button" class="post-edit" data-post-id="${escapeAttr(post.id)}">Edit</button>` : ""}
        ${isOwn ? `<button type="button" class="post-delete" data-post-id="${escapeAttr(post.id)}">Delete</button>` : ""}
      </div>
      <div class="post-comments" hidden></div>
    `;

    renderReactionBar("post", post.id, card.querySelector(".reaction-bar"));
    card.querySelector(".post-toggle-comments").addEventListener("click", () => toggleComments(card, post.id));
    const shareBtn = card.querySelector(".post-share");
    shareBtn.addEventListener("click", () => {
      shareContent(shareBtn, {
        url: `${window.location.origin}/community.html?post=${encodeURIComponent(post.id)}`,
        text: `${name}: "${post.title}" — SCA Opportunities Common Room`,
      });
    });
    const editBtn = card.querySelector(".post-edit");
    if (editBtn) {
      editBtn.addEventListener("click", () => {
        startEditingPost(card, post, async (updated) => {
          post.title = updated.title;
          post.body = updated.body;
          post.edited_at = updated.edited_at;
          card.querySelector(".post-content").innerHTML = await renderPostContent(post);
          const timeEl = card.querySelector(".post-time");
          if (timeEl && !timeEl.querySelector(".edited-tag")) {
            timeEl.innerHTML = `${formatTime(post.created_at)} · <span class="edited-tag">edited</span>`;
          }
        });
      });
    }
    const deleteBtn = card.querySelector(".post-delete");
    if (deleteBtn) {
      deleteBtn.addEventListener("click", async () => {
        if (!confirm("Delete this post? This can't be undone.")) return;
        try {
          await window.SCA.deletePost(post.id);
          card.remove();
        } catch (err) {
          alert(err.message || "Couldn't delete that post.");
        }
      });
    }

    return card;
  }

  function startEditingComment(row, comment) {
    const content = row.querySelector(".comment-content");
    const original = content.innerHTML;

    content.innerHTML = `
      <form class="edit-form">
        <textarea class="edit-form-body" rows="2" maxlength="2000" required>${escapeHTML(comment.body)}</textarea>
        <div class="composer-toolbar">
          <button type="button" class="format-bold-btn" aria-label="Bold">B</button>
          <button type="button" class="format-italic-btn" aria-label="Italic">I</button>
          <button type="button" class="format-underline-btn" aria-label="Underline">U</button>
          <button type="button" class="link-picker-btn" aria-label="Add link">🔗</button>
          <button type="button" class="format-bullet-btn" aria-label="Bulleted list">•</button>
          <button type="button" class="format-numbered-btn" aria-label="Numbered list">1.</button>
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
    if (typeof window.attachFormatButton === "function") {
      attachFormatButton(form.querySelector(".format-bold-btn"), bodyInput, "bold");
      attachFormatButton(form.querySelector(".format-italic-btn"), bodyInput, "italic");
      attachFormatButton(form.querySelector(".format-underline-btn"), bodyInput, "underline");
      attachFormatButton(form.querySelector(".format-bullet-btn"), bodyInput, "bullet");
      attachFormatButton(form.querySelector(".format-numbered-btn"), bodyInput, "numbered");
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
        const updated = await window.SCA.updateComment(comment.id, body);
        comment.body = updated.body;
        comment.edited_at = updated.edited_at;
        content.innerHTML = `<div class="comment-body-text">${renderBlocks(renderAllMention(renderMentions(escapeHTML(comment.body), await getAllProfiles())))}</div>`;
        const nameLink = row.querySelector(".post-author-name");
        if (nameLink && !nameLink.nextElementSibling?.classList.contains("edited-tag")) {
          nameLink.insertAdjacentHTML("afterend", ' · <span class="edited-tag">edited</span>');
        }
      } catch (err) {
        alert(err.message || "Couldn't save those changes.");
        saveBtn.disabled = false;
      }
    });
  }

  async function toggleComments(card, postId) {
    const box = card.querySelector(".post-comments");
    if (!box.hidden) {
      box.hidden = true;
      return;
    }
    box.hidden = false;
    box.innerHTML = `<p class="auth-hint">Loading comments…</p>`;

    try {
      const comments = await window.SCA.listComments(postId);
      box.innerHTML = "";

      const profiles = await getAllProfiles();
      await loadReactionsForComments(comments.map((c) => c.id));
      for (const comment of comments) {
        const author = await getAuthor(comment.user_id);
        const row = document.createElement("div");
        row.className = "comment";
        const commentAuthorName = author?.full_name || "A student";
        const isOwnComment = comment.user_id === user.id;
        row.innerHTML = `
          <a href="member.html?id=${escapeAttr(comment.user_id)}" class="post-author-avatar-link" aria-label="View ${escapeAttr(commentAuthorName)}'s profile">${avatarHTML(author, "account-avatar--sm")}</a>
          <div class="comment-body">
            <a href="member.html?id=${escapeAttr(comment.user_id)}" class="post-author-name">${escapeHTML(commentAuthorName)}</a>${comment.edited_at ? ' · <span class="edited-tag">edited</span>' : ""}
            <div class="comment-content"><div class="comment-body-text">${renderBlocks(renderAllMention(renderMentions(escapeHTML(comment.body), profiles)))}</div></div>
            <div class="reaction-bar" data-target-type="comment" data-target-id="${escapeAttr(comment.id)}"></div>
            <div class="comment-actions">
              <button type="button" class="comment-share">Share</button>
              ${isOwnComment ? `<button type="button" class="comment-edit">Edit</button>` : ""}
            </div>
          </div>
        `;
        renderReactionBar("comment", comment.id, row.querySelector(".reaction-bar"));
        row.querySelector(".comment-share").addEventListener("click", (e) => {
          shareContent(e.currentTarget, {
            url: `${window.location.origin}/community.html?post=${encodeURIComponent(postId)}`,
            text: `${commentAuthorName} commented on the Common Room: "${comment.body}"`,
          });
        });
        const commentEditBtn = row.querySelector(".comment-edit");
        if (commentEditBtn) {
          commentEditBtn.addEventListener("click", () => startEditingComment(row, comment));
        }
        box.appendChild(row);
      }

      const form = document.createElement("form");
      form.className = "comment-form";
      form.innerHTML = `
        <input type="text" placeholder="Write a reply… use @ to mention someone" maxlength="2000" required />
        <button type="button" class="format-bold-btn" aria-label="Bold">B</button>
        <button type="button" class="format-italic-btn" aria-label="Italic">I</button>
        <button type="button" class="format-underline-btn" aria-label="Underline">U</button>
        <button type="button" class="link-picker-btn" aria-label="Add link">🔗</button>
        <button type="button" class="emoji-picker-btn" aria-label="Add emoji">🙂</button>
        <button type="submit" class="btn btn-ghost">Reply</button>
      `;
      attachMentionAutocomplete(form.querySelector("input"));
      if (typeof window.attachEmojiPicker === "function") {
        attachEmojiPicker(form.querySelector(".emoji-picker-btn"), form.querySelector("input"));
      }
      if (typeof window.attachLinkButton === "function") {
        attachLinkButton(form.querySelector(".link-picker-btn"), form.querySelector("input"));
      }
      if (typeof window.attachFormatButton === "function") {
        attachFormatButton(form.querySelector(".format-bold-btn"), form.querySelector("input"), "bold");
        attachFormatButton(form.querySelector(".format-italic-btn"), form.querySelector("input"), "italic");
        attachFormatButton(form.querySelector(".format-underline-btn"), form.querySelector("input"), "underline");
      }
      form.addEventListener("submit", async (e) => {
        e.preventDefault();
        const input = form.querySelector("input");
        const body = input.value.trim();
        if (!body) return;
        try {
          const comment = await window.SCA.addComment(user.id, postId, body);
          notifyMentions(body, postId, comment.id, "comment");
          input.value = "";
          box.hidden = true;
          toggleComments(card, postId);
        } catch (err) {
          alert(err.message || "Couldn't post that reply.");
        }
      });
      box.appendChild(form);
    } catch (err) {
      box.innerHTML = `<p class="auth-hint">Couldn't load comments.</p>`;
    }
  }

  async function loadPosts() {
    try {
      const posts = await window.SCA.listPosts();
      if (!posts.length) {
        postsEmpty.hidden = false;
        return;
      }
      await loadReactionsForPosts(posts.map((p) => p.id));
      postsList.innerHTML = "";
      for (const post of posts) {
        postsList.appendChild(await renderPostCard(post));
      }
      focusPostFromURL();
    } catch (err) {
      postsList.innerHTML = `<p>Couldn't load discussions. Please try refreshing.</p>`;
    }
  }

  // Lets a notification link (community.html?post=<id>) jump straight
  // to the relevant post instead of leaving the student to scroll and
  // find it themselves.
  function focusPostFromURL() {
    const postId = new URLSearchParams(window.location.search).get("post");
    if (!postId) return;
    const card = postsList.querySelector(`[data-post-id="${CSS.escape(postId)}"]`);
    if (!card) return;
    card.scrollIntoView({ behavior: "smooth", block: "center" });
    card.classList.add("post-highlight");
    setTimeout(() => card.classList.remove("post-highlight"), 2000);
    toggleComments(card, postId);
  }

  postForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    postError.classList.remove("is-visible");
    postSubmit.disabled = true;
    postSubmit.textContent = "Posting…";

    try {
      const post = await window.SCA.createPost(user.id, {
        title: postTitle.value.trim(),
        body: postBody.value.trim(),
      });
      notifyMentions(post.body, post.id, null, "post");
      postsEmpty.hidden = true;
      postsList.prepend(await renderPostCard(post));
      postForm.reset();
    } catch (err) {
      postError.textContent = err.message || "Couldn't post that. Please try again.";
      postError.classList.add("is-visible");
    } finally {
      postSubmit.disabled = false;
      postSubmit.textContent = "Post to the Common Room";
    }
  });

  attachMentionAutocomplete(postBody);
  if (postBodyEmojiBtn && typeof window.attachEmojiPicker === "function") {
    attachEmojiPicker(postBodyEmojiBtn, postBody);
  }
  if (postBodyLinkBtn && typeof window.attachLinkButton === "function") {
    attachLinkButton(postBodyLinkBtn, postBody);
  }
  if (typeof window.attachFormatButton === "function") {
    if (postBodyBoldBtn) attachFormatButton(postBodyBoldBtn, postBody, "bold");
    if (postBodyItalicBtn) attachFormatButton(postBodyItalicBtn, postBody, "italic");
    if (postBodyUnderlineBtn) attachFormatButton(postBodyUnderlineBtn, postBody, "underline");
    if (postBodyBulletBtn) attachFormatButton(postBodyBulletBtn, postBody, "bullet");
    if (postBodyNumberedBtn) attachFormatButton(postBodyNumberedBtn, postBody, "numbered");
  }
  getAllProfiles();
  loadPosts();

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
});
