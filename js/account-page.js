/* =============================================================
   account.html page logic — profile + saved opportunities
   ============================================================= */
document.addEventListener("DOMContentLoaded", async () => {
  const grid = document.getElementById("saved-grid");
  if (!grid) return; // not on account.html

  const welcome = document.getElementById("account-welcome");
  const profileBox = document.getElementById("account-profile");
  const savedEmpty = document.getElementById("saved-empty");
  const logoutBtn = document.getElementById("btn-logout");

  const avatarImg = document.getElementById("avatar-img");
  const avatarInitials = document.getElementById("avatar-initials");

  const btnEditProfile = document.getElementById("btn-edit-profile");
  const editSection = document.getElementById("edit-profile-section");
  const editForm = document.getElementById("form-edit-profile");
  const editCancelBtn = document.getElementById("edit-profile-cancel");
  const editSex = document.getElementById("edit-sex");
  const editDob = document.getElementById("edit-dob");
  const editAvatarInput = document.getElementById("profile-avatar-input");
  const editAvatarImg = document.getElementById("edit-avatar-img");
  const editAvatarInitials = document.getElementById("edit-avatar-initials");
  const editError = document.getElementById("edit-profile-error");
  const editSuccess = document.getElementById("edit-profile-success");
  const editSaveBtn = document.getElementById("edit-profile-save");

  if (!window.SCA || !window.SCA.ready) {
    welcome.textContent = "Accounts aren't set up yet — the site owner still needs to connect Supabase.";
    return;
  }

  const session = await window.SCA.getSession();
  if (!session) {
    window.location.href = "login.html";
    return;
  }

  const user = session.user;

  logoutBtn.addEventListener("click", async () => {
    await window.SCA.signOut();
    window.location.href = "index.html";
  });

  function initials(name, email) {
    const source = (name || email || "").trim();
    if (!source) return "—";
    const parts = source.split(/\s+/).filter(Boolean);
    if (parts.length === 1) return parts[0][0].toUpperCase();
    return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  }

  function setAvatar(url, name) {
    const label = initials(name, user.email);
    [avatarImg, editAvatarImg].forEach((img) => {
      if (!img) return;
      if (url) {
        img.src = url;
        img.hidden = false;
      } else {
        img.hidden = true;
        img.removeAttribute("src");
      }
    });
    [avatarInitials, editAvatarInitials].forEach((span) => {
      if (!span) return;
      span.hidden = !!url;
      span.textContent = label;
    });
  }

  let currentProfile = null;

  function populateEditForm(profile) {
    if (editSex) editSex.value = profile?.sex || "";
    if (editDob) editDob.value = profile?.date_of_birth || "";
    if (editAvatarInput) editAvatarInput.value = "";
    if (editAvatarImg && editAvatarInitials) {
      if (profile?.avatar_url) {
        editAvatarImg.src = profile.avatar_url;
        editAvatarImg.hidden = false;
        editAvatarInitials.hidden = true;
      } else {
        editAvatarImg.hidden = true;
        editAvatarInitials.hidden = false;
        editAvatarInitials.textContent = initials(profile?.full_name, user.email);
      }
    }
  }

  function showView() {
    editSection.hidden = true;
    profileBox.hidden = false;
    editError.classList.remove("is-visible");
    editSuccess.classList.remove("is-visible");
  }

  function showEdit() {
    populateEditForm(currentProfile);
    profileBox.hidden = true;
    editSection.hidden = false;
  }

  if (btnEditProfile) {
    btnEditProfile.addEventListener("click", showEdit);
  }
  if (editCancelBtn) {
    editCancelBtn.addEventListener("click", showView);
  }

  try {
    const profile = await window.SCA.getProfile(user.id);
    currentProfile = profile;
    welcome.textContent = `Welcome back, ${profile?.full_name || user.email}.`;
    document.getElementById("profile-region").textContent = profile?.region || "—";
    document.getElementById("profile-country").textContent = profile?.country || "—";
    document.getElementById("profile-year").textContent = profile?.year_of_study || "—";
    document.getElementById("profile-university").textContent = profile?.university || "—";
    document.getElementById("profile-sex").textContent = profile?.sex || "—";
    document.getElementById("profile-dob").textContent = profile?.date_of_birth || "—";
    profileBox.hidden = false;

    setAvatar(profile?.avatar_url, profile?.full_name);
  } catch (err) {
    welcome.textContent = `Welcome back, ${user.email}.`;
    setAvatar(null, user.email);
  }

  if (editAvatarInput) {
    editAvatarInput.addEventListener("change", () => {
      const file = editAvatarInput.files[0];
      if (!file) return;
      if (file.size > 2 * 1024 * 1024) {
        editError.textContent = "That photo is larger than 2MB — please choose a smaller file.";
        editError.classList.add("is-visible");
        editAvatarInput.value = "";
        return;
      }
      editError.classList.remove("is-visible");
      const reader = new FileReader();
      reader.onload = () => {
        editAvatarImg.src = reader.result;
        editAvatarImg.hidden = false;
        if (editAvatarInitials) editAvatarInitials.hidden = true;
      };
      reader.readAsDataURL(file);
    });
  }

  if (editForm) {
    editForm.addEventListener("submit", async (e) => {
      e.preventDefault();
      editError.classList.remove("is-visible");
      editSuccess.classList.remove("is-visible");
      editSaveBtn.disabled = true;
      editSaveBtn.textContent = "Saving…";

      try {
        const updates = {
          sex: editSex.value || null,
          date_of_birth: editDob.value || null,
        };

        const file = editAvatarInput.files[0];
        if (file) {
          updates.avatar_url = await window.SCA.uploadAvatar(user.id, file);
        }

        await window.SCA.updateProfile(user.id, updates);

        currentProfile = { ...currentProfile, ...updates };

        document.getElementById("profile-sex").textContent = updates.sex || "—";
        document.getElementById("profile-dob").textContent = updates.date_of_birth || "—";
        if (updates.avatar_url) setAvatar(updates.avatar_url, currentProfile?.full_name);

        // Success — close the edit form and return to the normal
        // profile view + saved-opportunities layout.
        showView();
      } catch (err) {
        console.error("Profile update failed:", err);
        editError.textContent = err.message || "Couldn't save your changes. Please try again.";
        editError.classList.add("is-visible");
      } finally {
        editSaveBtn.disabled = false;
        editSaveBtn.textContent = "Save changes";
      }
    });
  }

  try {
    const bookmarks = await window.SCA.listBookmarks(user.id);
    if (!bookmarks.length) {
      savedEmpty.hidden = false;
      return;
    }
    grid.innerHTML = bookmarks
      .map(
        (b) => `
      <article class="saved-card" data-opportunity-id="${escapeAttr(b.opportunity_id)}">
        <h3>${escapeHTML(b.opportunity_title || "Saved opportunity")}</h3>
        ${b.opportunity_org ? `<p>${escapeHTML(b.opportunity_org)}</p>` : ""}
        <div class="saved-card-actions">
          <a href="${escapeAttr(b.opportunity_apply_link || "opportunities.html")}" target="_blank" rel="noopener" class="opp-apply">Apply →</a>
          <button class="saved-remove" data-id="${escapeAttr(b.opportunity_id)}">Remove</button>
        </div>
      </article>
    `
      )
      .join("");

    grid.querySelectorAll(".saved-remove").forEach((btn) => {
      btn.addEventListener("click", async () => {
        const id = btn.dataset.id;
        try {
          await window.SCA.removeBookmark(user.id, id);
          btn.closest(".saved-card").remove();
          if (!grid.querySelector(".saved-card")) savedEmpty.hidden = false;
        } catch (err) {
          alert(err.message || "Couldn't remove that saved opportunity.");
        }
      });
    });
  } catch (err) {
    grid.innerHTML = `<p>Couldn't load your saved opportunities. Please try refreshing.</p>`;
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
});
