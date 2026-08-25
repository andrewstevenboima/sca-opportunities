/* =============================================================
   Shared markdown-lite formatting toolbar — used by the Common
   Room (post/comment composers) and Messages (message composer).

   Inserts **bold**, *italic*, __underline__ markers, or "- "/"1. "
   line prefixes for lists, into the target input/textarea. The
   render-side of this (community.js, member.js, messages.js)
   parses that same syntax back into real <strong>/<em>/<u>/<ul>/
   <ol> markup — see each file's renderInline()/renderBlocks().
   ============================================================= */

function wrapSelection(targetInput, marker) {
  const start = targetInput.selectionStart ?? targetInput.value.length;
  const end = targetInput.selectionEnd ?? targetInput.value.length;
  const value = targetInput.value;
  const selected = value.slice(start, end);

  targetInput.value = value.slice(0, start) + marker + selected + marker + value.slice(end);
  targetInput.focus();
  if (selected) {
    // Keep the wrapped text selected so it's obvious the marker applied.
    targetInput.setSelectionRange(start + marker.length, start + marker.length + selected.length);
  } else {
    // Nothing was selected — place the caret between the markers so
    // typing continues inside them.
    const caret = start + marker.length;
    targetInput.setSelectionRange(caret, caret);
  }
  targetInput.dispatchEvent(new Event("input", { bubbles: true }));
}

// Prefixes every line touched by the current selection (or just the
// current line, if nothing is selected) with a "- " bullet or a
// sequential "1. " / "2. " / … number, replacing any existing
// bullet/number prefix on those lines first so re-clicking the other
// list button switches the style instead of stacking markers.
function prefixLines(targetInput, kind) {
  const start = targetInput.selectionStart ?? 0;
  const end = targetInput.selectionEnd ?? 0;
  const hadSelection = start !== end;
  const value = targetInput.value;

  const lineStart = value.lastIndexOf("\n", start - 1) + 1;
  let lineEnd = value.indexOf("\n", end);
  if (lineEnd === -1) lineEnd = value.length;

  const before = value.slice(0, lineStart);
  const block = value.slice(lineStart, lineEnd);
  const after = value.slice(lineEnd);

  let n = 1;
  const newBlock = block
    .split("\n")
    .map((line) => {
      const stripped = line.replace(/^-\s+/, "").replace(/^\d+\.\s+/, "");
      return kind === "bullet" ? `- ${stripped}` : `${n++}. ${stripped}`;
    })
    .join("\n");

  targetInput.value = before + newBlock + after;
  targetInput.focus();
  if (hadSelection) {
    // Converting existing lines into a list — keep the result selected
    // so the change is visible.
    targetInput.setSelectionRange(before.length, before.length + newBlock.length);
  } else {
    // Starting a fresh (empty) list item — put the caret at the end of
    // the prefix so continuing to type appends after it instead of
    // replacing a selected prefix.
    const caret = before.length + newBlock.length;
    targetInput.setSelectionRange(caret, caret);
  }
  targetInput.dispatchEvent(new Event("input", { bubbles: true }));
}

// Called on a plain Enter keydown (never Shift+Enter, which always
// stays a soft newline) inside a list-authoring textarea. If the
// caret sits on a "- " or "N. " line, this continues the list onto
// the next line (or, if that line was empty, removes the marker and
// exits the list — the same convention Docs/Slack/GitHub use) and
// returns true. Returns false — doing nothing — if the current line
// isn't a list item, so the caller can fall back to its own default
// Enter behavior (a plain newline, or in Messages' case, sending).
function handleListEnter(targetInput, e) {
  if (e.shiftKey) return false;
  const value = targetInput.value;
  const caret = targetInput.selectionStart;
  if (caret !== targetInput.selectionEnd) return false;

  const lineStart = value.lastIndexOf("\n", caret - 1) + 1;
  const line = value.slice(lineStart, caret);
  const bulletMatch = line.match(/^-\s+(.*)$/);
  const numberedMatch = line.match(/^(\d+)\.\s+(.*)$/);
  if (!bulletMatch && !numberedMatch) return false;

  e.preventDefault();
  const emptyItem = bulletMatch ? !bulletMatch[1] : !numberedMatch[2];
  if (emptyItem) {
    // Enter on an empty list item exits the list rather than adding
    // another blank bullet/number forever.
    targetInput.value = value.slice(0, lineStart) + value.slice(caret);
    targetInput.setSelectionRange(lineStart, lineStart);
  } else {
    const insertion = bulletMatch ? "\n- " : `\n${parseInt(numberedMatch[1], 10) + 1}. `;
    targetInput.value = value.slice(0, caret) + insertion + value.slice(caret);
    const newCaret = caret + insertion.length;
    targetInput.setSelectionRange(newCaret, newCaret);
  }
  targetInput.dispatchEvent(new Event("input", { bubbles: true }));
  return true;
}

// Auto-wires list-continuation on Enter for plain textareas that have
// no competing Enter behavior of their own (post/comment/edit-form
// bodies). Skipped for non-textarea inputs, where "\n" isn't
// meaningful, and skipped when the caller wires it manually instead
// (see messages.js's send-on-Enter compose box, which calls
// handleListEnter itself so it can decide between continuing a list
// and sending the message).
const autoEnterWired = new WeakSet();
function wireListAutoEnter(targetInput) {
  if (targetInput.tagName !== "TEXTAREA" || autoEnterWired.has(targetInput)) return;
  autoEnterWired.add(targetInput);
  targetInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter") handleListEnter(targetInput, e);
  });
}

// Wires a single ribbon button to apply its markdown-lite marker to
// `targetInput` at the current selection/caret. `kind` is one of
// "bold" | "italic" | "underline" | "bullet" | "numbered". Pass
// `{ wireEnter: false }` to skip the automatic Enter-continues-list
// wiring (for a composer that handles Enter itself).
function attachFormatButton(triggerBtn, targetInput, kind, options) {
  const opts = options || {};
  const markers = { bold: "**", italic: "*", underline: "__" };
  triggerBtn.addEventListener("click", (e) => {
    e.preventDefault();
    if (kind === "bullet" || kind === "numbered") {
      prefixLines(targetInput, kind);
    } else {
      wrapSelection(targetInput, markers[kind]);
    }
  });
  if ((kind === "bullet" || kind === "numbered") && opts.wireEnter !== false) {
    wireListAutoEnter(targetInput);
  }
}

if (typeof window !== "undefined") {
  window.attachFormatButton = attachFormatButton;
  window.handleListEnter = handleListEnter;
}
