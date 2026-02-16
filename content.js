// ===========================================================
// Enter → Newline (instead of Send) for AI chat sites
// Ctrl+Enter or Cmd+Enter → Send (original behavior)
// ===========================================================

(function () {
  "use strict";

  // ---- helpers ----
  function isEditable(el) {
    if (!el) return false;
    const tag = el.tagName;
    if (tag === "TEXTAREA" || tag === "INPUT") return true;
    if (el.isContentEditable) return true;
    if (el.getAttribute && el.getAttribute("role") === "textbox") return true;
    let parent = el.parentElement;
    for (let i = 0; i < 5 && parent; i++) {
      if (parent.isContentEditable) return true;
      if (parent.getAttribute && parent.getAttribute("role") === "textbox")
        return true;
      parent = parent.parentElement;
    }
    return false;
  }

  function findEditableAncestor(el) {
    let node = el;
    for (let i = 0; i < 10 && node; i++) {
      if (node.tagName === "TEXTAREA") return node;
      if (node.isContentEditable) return node;
      if (node.getAttribute && node.getAttribute("role") === "textbox")
        return node;
      node = node.parentElement;
    }
    return null;
  }

  // ---- Newline insertion strategies ----

  function insertNewlineTextarea(textarea) {
    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const value = textarea.value;
    const nativeSetter = Object.getOwnPropertyDescriptor(
      window.HTMLTextAreaElement.prototype,
      "value",
    ).set;
    nativeSetter.call(
      textarea,
      value.slice(0, start) + "\n" + value.slice(end),
    );
    textarea.selectionStart = textarea.selectionEnd = start + 1;
    textarea.dispatchEvent(new Event("input", { bubbles: true }));
  }

  function insertNewlineContentEditable(editable) {
    // Strategy: Dispatch a synthetic Shift+Enter to the editor.
    // ProseMirror / Tiptap treat Shift+Enter as "insert hard break",
    // which produces a clean <br> without extra whitespace.
    const opts = {
      key: "Enter",
      code: "Enter",
      keyCode: 13,
      which: 13,
      shiftKey: true,
      bubbles: true,
      cancelable: true,
    };
    editable.dispatchEvent(new KeyboardEvent("keydown", opts));
    editable.dispatchEvent(new KeyboardEvent("keypress", opts));
    editable.dispatchEvent(new KeyboardEvent("keyup", opts));

    // ProseMirror / Tiptap handle Shift+Enter natively → done
    if (
      editable.classList.contains("ProseMirror") ||
      editable.classList.contains("tiptap") ||
      editable.closest(".ProseMirror") ||
      editable.closest(".tiptap")
    ) {
      return;
    }

    // For other contentEditable: try beforeinput
    const beforeInput = new InputEvent("beforeinput", {
      inputType: "insertLineBreak",
      bubbles: true,
      cancelable: true,
      composed: true,
    });
    const prevented = !editable.dispatchEvent(beforeInput);
    if (prevented) return;

    // Final fallback: manual <br> insertion
    const sel = window.getSelection();
    if (!sel || sel.rangeCount === 0) return;
    const range = sel.getRangeAt(0);
    range.deleteContents();
    const br = document.createElement("br");
    range.insertNode(br);
    const br2 = document.createElement("br");
    br.parentNode.insertBefore(br2, br.nextSibling);
    range.setStartAfter(br);
    range.setEndAfter(br);
    sel.removeAllRanges();
    sel.addRange(range);
    editable.dispatchEvent(new Event("input", { bubbles: true }));
  }

  // ---- core handler ----
  function handleKeydown(e) {
    if (e.isComposing || e.keyCode === 229) return;
    if (e.key !== "Enter") return;

    // Ctrl/Meta+Enter → let the site send
    if (e.ctrlKey || e.metaKey) return;

    // Our synthetic Shift+Enter → let it through to the editor
    if (e.shiftKey && !e.isTrusted) return;

    // Real Shift+Enter → most sites already treat as newline, let it pass
    if (e.shiftKey) return;

    const target = e.target;
    if (!isEditable(target)) return;

    const editable = findEditableAncestor(target);
    if (!editable) return;

    e.preventDefault();
    e.stopPropagation();
    e.stopImmediatePropagation();

    if (editable.tagName === "TEXTAREA") {
      insertNewlineTextarea(editable);
    } else {
      insertNewlineContentEditable(editable);
    }
  }

  // Attach at window level (earliest capture)
  window.addEventListener("keydown", handleKeydown, { capture: true });

  // Also attach directly to editor elements as they appear
  const observed = new WeakSet();
  function attachToEditors() {
    const selectors = [
      '[contenteditable="true"]',
      '[role="textbox"]',
      "div.ProseMirror",
      "div.tiptap",
      "textarea",
    ];
    document.querySelectorAll(selectors.join(",")).forEach((el) => {
      if (observed.has(el)) return;
      observed.add(el);
      el.addEventListener("keydown", handleKeydown, { capture: true });
    });
  }

  attachToEditors();
  const observer = new MutationObserver(attachToEditors);
  observer.observe(document.body || document.documentElement, {
    childList: true,
    subtree: true,
  });
})();
