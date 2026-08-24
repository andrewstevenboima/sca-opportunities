/* =============================================================
   Shared emoji picker — used by the Common Room (post/comment
   composers, reaction "add" button) and Messages (message composer).

   A small curated set, not the full Unicode emoji library — keeps
   the picker itself quick to scan instead of another endless grid
   to scroll through.
   ============================================================= */

window.EMOJI_PICKER_SET = [
  "😀", "😂", "🙂", "😉", "😍", "🤔", "😅", "😢", "😮", "😴",
  "👍", "👎", "👏", "🙌", "🙏", "💪", "🤝", "👋", "✌️", "🤞",
  "❤️", "🔥", "⭐", "✨", "🎉", "🎓", "🏆", "💡", "✅", "📌",
  "📚", "📝", "💻", "🚀", "⏰", "😊", "😎", "🥳", "😬", "🤯",
];

// Low-level building block: opens a floating grid of emoji anchored
// under `anchorEl`, and calls `onSelect(emoji)` for whichever one the
// student clicks. Closes itself on selection, outside click, or Escape.
function openEmojiPanel(anchorEl, onSelect) {
  const panel = document.createElement("div");
  panel.className = "emoji-picker-panel";
  panel.setAttribute("role", "menu");
  panel.innerHTML = window.EMOJI_PICKER_SET.map(
    (emoji) => `<button type="button" class="emoji-picker-option" role="menuitem">${emoji}</button>`
  ).join("");
  document.body.appendChild(panel);

  const rect = anchorEl.getBoundingClientRect();
  panel.style.left = `${Math.max(8, rect.left)}px`;
  panel.style.top = `${rect.bottom + 6}px`;

  function close() {
    panel.remove();
    document.removeEventListener("mousedown", onOutsideClick, true);
    document.removeEventListener("keydown", onKeydown, true);
  }
  function onOutsideClick(e) {
    if (!panel.contains(e.target) && e.target !== anchorEl) close();
  }
  function onKeydown(e) {
    if (e.key === "Escape") close();
  }

  panel.querySelectorAll(".emoji-picker-option").forEach((btn) => {
    // mousedown (not click) + preventDefault so a composer input
    // never loses focus/caret position before the emoji lands.
    btn.addEventListener("mousedown", (e) => {
      e.preventDefault();
      close();
      onSelect(btn.textContent);
    });
  });

  document.addEventListener("mousedown", onOutsideClick, true);
  document.addEventListener("keydown", onKeydown, true);

  return close;
}

// Attaches a click-to-open emoji grid to `triggerBtn` that calls
// `onSelect(emoji)` — toggles open/closed on repeated clicks.
function attachEmojiPickerButton(triggerBtn, onSelect) {
  let closePanel = null;
  triggerBtn.addEventListener("click", (e) => {
    e.preventDefault();
    if (closePanel) {
      closePanel();
      closePanel = null;
      return;
    }
    closePanel = openEmojiPanel(triggerBtn, (emoji) => {
      closePanel = null;
      onSelect(emoji);
    });
  });
}

// Composer convenience: attaches a picker to `triggerBtn` that inserts
// the chosen emoji into `targetInput` (an <input> or <textarea>) at
// the current caret position.
function attachEmojiPicker(triggerBtn, targetInput) {
  attachEmojiPickerButton(triggerBtn, (emoji) => {
    const start = targetInput.selectionStart ?? targetInput.value.length;
    const end = targetInput.selectionEnd ?? targetInput.value.length;
    const value = targetInput.value;
    targetInput.value = value.slice(0, start) + emoji + value.slice(end);
    const newCaret = start + emoji.length;
    targetInput.focus();
    targetInput.setSelectionRange(newCaret, newCaret);
    // Let any other input listeners (e.g. @mention autocomplete) know
    // the value changed, same as if the student had typed it.
    targetInput.dispatchEvent(new Event("input", { bubbles: true }));
  });
}

if (typeof window !== "undefined") {
  window.attachEmojiPicker = attachEmojiPicker;
  window.attachEmojiPickerButton = attachEmojiPickerButton;
}
