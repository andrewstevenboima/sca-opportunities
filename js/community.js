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
  const postError = document.getElementById("new-post-error");
  const postSubmit = document.getElementById("new-post-submit");
  const postsList = document.getElementById("posts-list");
  const postsEmpty = document.getElementById("posts-empty");

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

  function linkify(escapedText) {
    return escapedText.replace(/(https?:\/\/[^\s<]+)/g, (url) => {
      const trailingMatch = url.match(/[).,!?;:]+$/);
      const trailing = trailingMatch ? trailingMatch[0] : "";
      const clean = trailing ? url.slice(0, -trailing.length) : url;
      return `<a href="${clean}" target="_blank" rel="noopener">${clean}</a>${trailing}`;
    });
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
            <div class="post-time">${formatTime(post.created_at)}</div>
          </div>
        </div>
      </div>
      <h3 class="post-title">${escapeHTML(post.title)}</h3>
      <p class="post-body">${linkify(renderAllMention(renderMentions(escapeHTML(post.body), await getAllProfiles())))}</p>
      <div class="post-actions">
        <button type="button" class="post-toggle-comments" data-post-id="${escapeAttr(post.id)}">Comments</button>
        <button type="button" class="post-share" data-post-id="${escapeAttr(post.id)}">Share</button>
        ${isOwn ? `<button type="button" class="post-delete" data-post-id="${escapeAttr(post.id)}">Delete</button>` : ""}
      </div>
      <div class="post-comments" hidden></div>
    `;

    card.querySelector(".post-toggle-comments").addEventListener("click", () => toggleComments(card, post.id));
    const shareBtn = card.querySelector(".post-share");
    shareBtn.addEventListener("click", () => {
      shareContent(shareBtn, {
        url: `${window.location.origin}/community.html?post=${encodeURIComponent(post.id)}`,
        text: `${name}: "${post.title}" — SCA Opportunities Common Room`,
      });
    });
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
      for (const comment of comments) {
        const author = await getAuthor(comment.user_id);
        const row = document.createElement("div");
        row.className = "comment";
        const commentAuthorName = author?.full_name || "A student";
        row.innerHTML = `
          <a href="member.html?id=${escapeAttr(comment.user_id)}" class="post-author-avatar-link" aria-label="View ${escapeAttr(commentAuthorName)}'s profile">${avatarHTML(author, "account-avatar--sm")}</a>
          <div class="comment-body">
            <a href="member.html?id=${escapeAttr(comment.user_id)}" class="post-author-name">${escapeHTML(commentAuthorName)}</a>
            <p class="comment-body-text">${linkify(renderAllMention(renderMentions(escapeHTML(comment.body), profiles)))}</p>
            <button type="button" class="comment-share">Share</button>
          </div>
        `;
        row.querySelector(".comment-share").addEventListener("click", (e) => {
          shareContent(e.currentTarget, {
            url: `${window.location.origin}/community.html?post=${encodeURIComponent(postId)}`,
            text: `${commentAuthorName} commented on the Common Room: "${comment.body}"`,
          });
        });
        box.appendChild(row);
      }

      const form = document.createElement("form");
      form.className = "comment-form";
      form.innerHTML = `
        <input type="text" placeholder="Write a reply… use @ to mention someone" maxlength="2000" required />
        <button type="submit" class="btn btn-ghost">Reply</button>
      `;
      attachMentionAutocomplete(form.querySelector("input"));
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
