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
  const editRegion = document.getElementById("edit-region");
  const editCountry = document.getElementById("edit-country");
  const editYear = document.getElementById("edit-year");
  const editUniversity = document.getElementById("edit-university");
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

  // Region -> country cascade, same Africa-wide list used on signup
  if (editRegion) {
    Object.keys(window.SCA_REGIONS || {}).forEach((region) => {
      const opt = document.createElement("option");
      opt.value = region;
      opt.textContent = region;
      editRegion.appendChild(opt);
    });
    editRegion.addEventListener("change", () => populateCountryOptions(editRegion.value));
  }

  function populateCountryOptions(region, selectedCountry) {
    if (!editCountry) return;
    const countries = (window.SCA_REGIONS || {})[region] || [];
    editCountry.innerHTML = "";
    if (!countries.length) {
      editCountry.disabled = true;
      editCountry.innerHTML = '<option value="">Select region first</option>';
      return;
    }
    editCountry.disabled = false;
    editCountry.innerHTML =
      '<option value="">Select country</option>' +
      countries.map((c) => `<option value="${c}">${c}</option>`).join("");
    if (selectedCountry) editCountry.value = selectedCountry;
  }

  function populateEditForm(profile) {
    if (editRegion) editRegion.value = profile?.region || "";
    if (editRegion) populateCountryOptions(editRegion.value, profile?.country || "");
    if (editYear) editYear.value = profile?.year_of_study || "";
    if (editUniversity) editUniversity.value = profile?.university || "";
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

  const acctBody = document.getElementById("acct-body");

  /** "1993-08-28" -> "28 August 1993" */
  function formatDob(iso) {
    if (!iso) return "—";
    const d = new Date(`${iso}T00:00:00`);
    return isNaN(d.getTime()) ? iso : d.toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" });
  }

  function fillDetails(p) {
    const set = (id, v) => { document.getElementById(id).textContent = v || "—"; };
    set("profile-region", p?.region);
    set("profile-country", p?.country);
    set("profile-year", p?.year_of_study);
    set("profile-university", p?.university);
    set("profile-sex", p?.sex);
    document.getElementById("profile-dob").textContent = formatDob(p?.date_of_birth);
    const nameEl = document.getElementById("account-name");
    if (nameEl) nameEl.textContent = p?.full_name || user.email;
    const summary = [p?.year_of_study, p?.university, p?.country].filter(Boolean).join(" · ");
    welcome.textContent = summary || user.email;
  }

  function showView() {
    if (acctBody) acctBody.classList.remove("is-editing");
    editSection.hidden = true;
    profileBox.hidden = false;
    editError.classList.remove("is-visible");
    editSuccess.classList.remove("is-visible");
  }

  function showEdit() {
    populateEditForm(currentProfile);
    if (acctBody) acctBody.classList.add("is-editing");
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
    fillDetails(profile);
    profileBox.hidden = false;

    setAvatar(profile?.avatar_url, profile?.full_name);
  } catch (err) {
    fillDetails({});
    profileBox.hidden = false;
    setAvatar(null, user.email);
  }

  const linkCompanions = document.getElementById("link-companions");
  const linkCompanioning = document.getElementById("link-companioning");
  if (linkCompanions) linkCompanions.href = `member.html?id=${encodeURIComponent(user.id)}`;
  if (linkCompanioning) linkCompanioning.href = `member.html?id=${encodeURIComponent(user.id)}`;
  try {
    const [companions, companioning] = await Promise.all([
      window.SCA.listCompanions(user.id),
      window.SCA.listCompanioning(user.id),
    ]);
    document.getElementById("stat-companions").textContent = companions.length;
    document.getElementById("stat-companioning").textContent = companioning.length;
    const label = document.getElementById("stat-companions-label");
    if (label) label.textContent = companions.length === 1 ? "companion" : "companions";
  } catch (err) {
    // Non-fatal — leave the counts at their default of 0.
  }

  // "Recommended for you" — opportunities tagged with the student's own
  // country, reusing the country-matching engine already loaded by
  // script.js on this page (APPS_SCRIPT_URL, FALLBACK_JSON, countriesFor).
  (async () => {
    if (!currentProfile?.country || typeof countriesFor !== "function") return;
    const recommendedSection = document.getElementById("recommended-section");
    const recommendedGrid = document.getElementById("recommended-grid");
    const recommendedSub = document.getElementById("recommended-sub");
    if (!recommendedSection || !recommendedGrid) return;

    try {
      let data;
      const url = typeof APPS_SCRIPT_URL !== "undefined" && APPS_SCRIPT_URL && !APPS_SCRIPT_URL.startsWith("REPLACE_")
        ? `${APPS_SCRIPT_URL}?action=opportunities`
        : "opportunities.json";
      try {
        const res = await fetch(url);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        data = await res.json();
      } catch (fetchErr) {
        const res = await fetch("opportunities.json");
        data = await res.json();
      }

      const list = (Array.isArray(data) ? data : data.opportunities || []).filter(
        (o) => (o.status || "live").toLowerCase() === "live"
      );
      const matches = list.filter((o) => countriesFor(o).includes(currentProfile.country)).slice(0, 6);

      if (!matches.length) return;

      recommendedSub.textContent = `${matches.length} opportunit${matches.length === 1 ? "y" : "ies"} open to students in ${currentProfile.country}.`;
      recommendedGrid.innerHTML = matches
        .map((o) => rowHTML({
          title: o.title,
          org: [o.organization, typeof shortLocation === "function" ? shortLocation(o.location) : o.location].filter(Boolean).join(" · "),
          link: o.apply_link,
          deadline: o.deadline,
        }))
        .join("");
      recommendedSection.hidden = false;
    } catch (err) {
      // Non-fatal — recommendations are a bonus, not core functionality.
    }
  })();

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
          region: editRegion.value,
          country: editCountry.value,
          year_of_study: editYear.value,
          university: editUniversity.value.trim() || null,
          sex: editSex.value || null,
          date_of_birth: editDob.value || null,
        };

        const file = editAvatarInput.files[0];
        if (file) {
          updates.avatar_url = await window.SCA.uploadAvatar(user.id, file);
        }

        await window.SCA.updateProfile(user.id, updates);

        currentProfile = { ...currentProfile, ...updates };

        fillDetails(currentProfile);
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
      .map((b) => rowHTML({
        title: b.opportunity_title || "Saved opportunity",
        org: b.opportunity_org,
        link: b.opportunity_apply_link,
        removeId: b.opportunity_id,
      }))
      .join("");

    grid.querySelectorAll(".saved-remove").forEach((btn) => {
      btn.addEventListener("click", async () => {
        const id = btn.dataset.id;
        try {
          await window.SCA.removeBookmark(user.id, id);
          btn.closest(".acct-row").remove();
          if (!grid.querySelector(".acct-row")) savedEmpty.hidden = false;
        } catch (err) {
          alert(err.message || "Couldn't remove that saved opportunity.");
        }
      });
    });
  } catch (err) {
    grid.innerHTML = `<p>Couldn't load your saved opportunities. Please try refreshing.</p>`;
  }

  /** One opportunity as a ruled row, in the same style as the listing. */
  function rowHTML({ title, org, link, deadline, removeId }) {
    let date = "";
    if (deadline && typeof dateBlock === "function") {
      const d = dateBlock(deadline);
      date = `<div class="oc-date ${d.cls}"><span class="sr-only">Deadline: </span><span class="oc-day">${d.day}</span><span class="oc-mon">${d.month}</span>${d.left ? `<span class="oc-left">${d.left}</span>` : ""}</div>`;
    }
    return `
      <article class="acct-row${date ? " has-date" : ""}">
        ${date}
        <div class="acct-row-body">
          <h3><a href="${safeHref(link, "opportunities.html")}" target="_blank" rel="noopener">${escapeHTML(title || "Untitled")}</a></h3>
          ${org ? `<p>${escapeHTML(org)}</p>` : ""}
        </div>
        <div class="acct-row-actions">
          <a href="${safeHref(link, "opportunities.html")}" target="_blank" rel="noopener" class="oc-view">View details <span aria-hidden="true">↗</span></a>
          ${removeId != null ? `<button type="button" class="saved-remove" data-id="${escapeAttr(removeId)}">Remove</button>` : ""}
        </div>
      </article>`;
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

  // Opportunity links come from the Sheet/JSON feed (or a bookmark
  // copied from it) rather than being typed by the viewing student,
  // but escapeAttr alone only neutralizes HTML metacharacters — it
  // does nothing to stop a non-http(s) scheme like "javascript:" from
  // landing in a real href and running when clicked. This is the
  // actual gate on what's allowed there.
  function safeHref(url, fallback) {
    if (typeof url === "string" && /^https?:\/\//i.test(url.trim())) {
      return escapeAttr(url);
    }
    return escapeAttr(fallback);
  }
});
