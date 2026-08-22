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
          ${avatarHTML(author, "account-avatar--sm")}
          <div>
            <a href="member.html?id=${escapeAttr(post.user_id)}" class="post-author-name">${escapeHTML(name)}</a>
            <div class="post-time">${formatTime(post.created_at)}</div>
          </div>
        </div>
      </div>
      <h3 class="post-title">${escapeHTML(post.title)}</h3>
      <p class="post-body">${escapeHTML(post.body)}</p>
      <div class="post-actions">
        <button type="button" class="post-toggle-comments" data-post-id="${escapeAttr(post.id)}">Comments</button>
        ${isOwn ? `<button type="button" class="post-delete" data-post-id="${escapeAttr(post.id)}">Delete</button>` : ""}
      </div>
      <div class="post-comments" hidden></div>
    `;

    card.querySelector(".post-toggle-comments").addEventListener("click", () => toggleComments(card, post.id));
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

      for (const comment of comments) {
        const author = await getAuthor(comment.user_id);
        const row = document.createElement("div");
        row.className = "comment";
        row.innerHTML = `
          ${avatarHTML(author, "account-avatar--sm")}
          <div class="comment-body">
            <a href="member.html?id=${escapeAttr(comment.user_id)}" class="post-author-name">${escapeHTML(author?.full_name || "A student")}</a>
            <p class="comment-body-text">${escapeHTML(comment.body)}</p>
          </div>
        `;
        box.appendChild(row);
      }

      const form = document.createElement("form");
      form.className = "comment-form";
      form.innerHTML = `
        <input type="text" placeholder="Write a reply…" maxlength="2000" required />
        <button type="submit" class="btn btn-ghost">Reply</button>
      `;
      form.addEventListener("submit", async (e) => {
        e.preventDefault();
        const input = form.querySelector("input");
        const body = input.value.trim();
        if (!body) return;
        try {
          await window.SCA.addComment(user.id, postId, body);
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
    } catch (err) {
      postsList.innerHTML = `<p>Couldn't load discussions. Please try refreshing.</p>`;
    }
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
