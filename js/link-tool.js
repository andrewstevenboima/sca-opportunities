/* =============================================================
   Shared "insert link" tool — used by the Common Room (post/comment
   composers) and Messages (message composer).

   Inserts a `[link text](https://example.com)` snippet into the
   target input/textarea. The render-side of this (community.js,
   member.js, messages.js) parses that same bracket syntax back into
   a real <a> tag — see each file's renderLinks().
   ============================================================= */

// Attaches a click-to-open "insert link" popover to `triggerBtn`
// that inserts a [text](url) snippet into `targetInput` at the
// current caret position (or wraps the current selection as the
// pre-filled link text, if any is selected).
function attachLinkButton(triggerBtn, targetInput) {
  let panel = null;

  function close() {
    if (panel) {
      panel.remove();
      panel = null;
    }
    document.removeEventListener("mousedown", onOutsideClick, true);
    document.removeEventListener("keydown", onKeydown, true);
  }

  function onOutsideClick(e) {
    if (panel && !panel.contains(e.target) && e.target !== triggerBtn) close();
  }

  function onKeydown(e) {
    if (e.key === "Escape") close();
  }

  function insertLink(text, url) {
    let href = url.trim();
    if (!/^https?:\/\//i.test(href)) href = `https://${href}`;
    const label = text.trim() || href;

    const start = targetInput.selectionStart ?? targetInput.value.length;
    const end = targetInput.selectionEnd ?? targetInput.value.length;
    const value = targetInput.value;
    const snippet = `[${label}](${href})`;
    targetInput.value = value.slice(0, start) + snippet + value.slice(end);
    const newCaret = start + snippet.length;
    targetInput.focus();
    targetInput.setSelectionRange(newCaret, newCaret);
    targetInput.dispatchEvent(new Event("input", { bubbles: true }));
  }

  function openPanel() {
    const selectionStart = targetInput.selectionStart ?? 0;
    const selectionEnd = targetInput.selectionEnd ?? 0;
    const prefillText = targetInput.value.slice(selectionStart, selectionEnd);

    panel = document.createElement("div");
    panel.className = "link-picker-panel";
    panel.innerHTML = `
      <div class="link-picker-field">
        <label>Link text</label>
        <input type="text" class="link-picker-text" maxlength="150" placeholder="e.g. the application form" />
      </div>
      <div class="link-picker-field">
        <label>URL</label>
        <input type="text" class="link-picker-url" maxlength="500" placeholder="https://…" />
      </div>
      <div class="link-picker-actions">
        <button type="button" class="link-picker-cancel">Cancel</button>
        <button type="button" class="link-picker-insert">Insert</button>
      </div>
    `;
    document.body.appendChild(panel);

    const rect = triggerBtn.getBoundingClientRect();
    panel.style.left = `${Math.max(8, Math.min(rect.left, window.innerWidth - panel.offsetWidth - 8))}px`;
    panel.style.top = `${rect.bottom + 6}px`;

    const textInput = panel.querySelector(".link-picker-text");
    const urlInput = panel.querySelector(".link-picker-url");
    textInput.value = prefillText;
    (prefillText ? urlInput : textInput).focus();

    function submit() {
      const url = urlInput.value.trim();
      if (!url) {
        urlInput.focus();
        return;
      }
      insertLink(textInput.value, url);
      close();
    }

    panel.querySelector(".link-picker-insert").addEventListener("click", submit);
    panel.querySelector(".link-picker-cancel").addEventListener("mousedown", (e) => {
      e.preventDefault();
      close();
    });
    [textInput, urlInput].forEach((el) => {
      el.addEventListener("keydown", (e) => {
        if (e.key === "Enter") {
          e.preventDefault();
          submit();
        }
      });
    });

    document.addEventListener("mousedown", onOutsideClick, true);
    document.addEventListener("keydown", onKeydown, true);
  }

  triggerBtn.addEventListener("click", (e) => {
    e.preventDefault();
    if (panel) {
      close();
    } else {
      openPanel();
    }
  });
}

if (typeof window !== "undefined") window.attachLinkButton = attachLinkButton;
