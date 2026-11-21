// Prompt guard: intercepts every way of submitting the composer (Enter, the
// send button, form submit) in the capture phase on `window`, i.e. before any
// of the site's own handlers. A prompt without the marker is never touched.
module.exports = function installPromptGuard(ns) {

  let bypass = null; // text of the approved prompt, set only while we replay its submit
  let reviewing = false; // a native dialog is open for this tab

  const readText = (el) => (typeof el.value === 'string' ? el.value : el.innerText || el.textContent || '');
  const composers = () => [...document.querySelectorAll(ns.site.composer)];
  const promptText = () => [...new Set(composers().map(readText).filter(Boolean))].join('\n');
  const sendButton = () => [...document.querySelectorAll(ns.site.sendButton)].find((b) => !b.disabled && b.getClientRects().length);

  // Replays an approved submit. Event dispatch is synchronous, so the bypass
  // exists only for the duration of this one replay.
  function resubmit(text, composer) {
    bypass = text;
    try {
      const button = sendButton();
      if (button) return button.click();
      const init = { key: 'Enter', code: 'Enter', keyCode: 13, which: 13, bubbles: true, cancelable: true, composed: true };
      (composer?.isConnected ? composer : composers()[0])?.dispatchEvent(new KeyboardEvent('keydown', init));
    } finally {
      bypass = null;
    }
  }

  // Decide synchronously whether this submit attempt must be held.
  function guard(event, read, composer) {
    const text = read();
    if (!ns.hasMarker(text) || (bypass !== null && bypass.includes(text))) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    if (reviewing) return; // one dialog at a time; further attempts stay blocked
    reviewing = true;
    ns.ask({ kind: 'prompt', text }).then(({ allow }) => {
      reviewing = false;
      // Continue: replay the submit untouched. If the user edited the prompt
      // while the dialog was open, the new text simply goes through the guard again.
      if (allow && read() === text) {
        ns.approveNetwork?.(text);
        resubmit(text, composer);
      }
      // Cancel: nothing was sent and the composer still holds the prompt.
    });
  }

  window.addEventListener('keydown', (event) => {
    if (event.key !== 'Enter' || event.shiftKey || event.altKey || event.isComposing || event.keyCode === 229) return;
    const composer = event.target instanceof Element && event.target.closest(ns.site.composer);
    if (composer) guard(event, () => readText(composer), composer);
  }, true);

  window.addEventListener('click', (event) => {
    if (event.target instanceof Element && event.target.closest(ns.site.sendButton)) guard(event, promptText);
  }, true);

  window.addEventListener('submit', (event) => {
    if (event.target instanceof Element && event.target.querySelector(ns.site.composer)) guard(event, promptText);
  }, true);
};
