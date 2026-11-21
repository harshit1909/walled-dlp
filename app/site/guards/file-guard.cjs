// File guard: holds every file entering the page (file picker, drag & drop,
// paste) until the desktop app has inspected it, then replays the original
// event carrying only the files that were allowed. The site never sees a file
// that was cancelled, and sees allowed files exactly as the browser delivered them.
module.exports = function installFileGuard(ns) {

  const replayed = new WeakSet(); // events we dispatched ourselves
  const held = new WeakSet(); // native events already taken over
  const busyInputs = new WeakSet();
  const SCAN_TOAST_DELAY_MS = 500;

  /** @returns {Promise<File[]>} the files the user is allowed to upload */
  async function review(files) {
    const timer = setTimeout(() => ns.toast(`Walled DLP is checking ${files.length === 1 ? files[0].name : files.length + ' files'}…`), SCAN_TOAST_DELAY_MS);
    try {
      const answers = await Promise.all(files.map((file) => ns.ask({ kind: 'file', file })));
      if (!answers.some((answer) => answer.unreachable)) ns.hideToast();
      return files.filter((_file, i) => answers[i].allow);
    } finally {
      clearTimeout(timer);
    }
  }

  function transferOf(files, strings = {}) {
    const transfer = new DataTransfer();
    for (const [type, value] of Object.entries(strings)) transfer.setData(type, value);
    for (const file of files) transfer.items.add(file);
    return transfer;
  }

  function hold(event) {
    held.add(event);
    event.stopImmediatePropagation();
  }

  // --- <input type="file"> ---------------------------------------------------
  function onInputEvent(event) {
    const input = event.target;
    if (replayed.has(event) || held.has(event)) return;
    if (!(input instanceof HTMLInputElement) || input.type !== 'file') return;
    if (busyInputs.has(input)) return hold(event); // the 'change' that follows a held 'input'
    const files = [...(input.files || [])];
    if (!files.length) return;
    hold(event);
    busyInputs.add(input);
    review(files).then((allowed) => {
      busyInputs.delete(input);
      if (!allowed.length) {
        input.value = ''; // so the same file can be picked again
        return;
      }
      if (allowed.length !== files.length) input.files = transferOf(allowed).files;
      for (const type of ['input', 'change']) {
        const replay = new Event(type, { bubbles: true, composed: type === 'input' });
        replayed.add(replay);
        input.dispatchEvent(replay);
      }
    });
  }
  window.addEventListener('input', onInputEvent, true);
  window.addEventListener('change', onInputEvent, true);

  // Inputs that are detached or inside a shadow root never reach `window`, so
  // hook them directly at the moment the page opens the picker.
  for (const method of ['click', 'showPicker']) {
    const original = HTMLInputElement.prototype[method];
    if (typeof original !== 'function') continue;
    HTMLInputElement.prototype[method] = function (...args) {
      if (this.type === 'file') {
        this.addEventListener('input', onInputEvent, true);
        this.addEventListener('change', onInputEvent, true);
      }
      return original.apply(this, args);
    };
  }

  // --- drag & drop -------------------------------------------------------------
  window.addEventListener('drop', (event) => {
    if (replayed.has(event)) return;
    const files = [...(event.dataTransfer?.files || [])];
    if (!files.length) return;
    event.preventDefault(); // otherwise the browser would navigate to the file
    hold(event);
    const target = event.target;
    const point = { clientX: event.clientX, clientY: event.clientY, screenX: event.screenX, screenY: event.screenY };
    review(files).then((allowed) => {
      const init = { bubbles: true, cancelable: true, composed: true, ...point };
      const node = target?.isConnected ? target : document.body;
      // Nothing allowed: tell the page the drag is over so its drop overlay closes.
      const replay = allowed.length
        ? new DragEvent('drop', { ...init, dataTransfer: transferOf(allowed) })
        : new DragEvent('dragleave', { ...init, dataTransfer: new DataTransfer() });
      replayed.add(replay);
      node.dispatchEvent(replay);
    });
  }, true);

  // --- paste -----------------------------------------------------------------
  window.addEventListener('paste', (event) => {
    if (replayed.has(event)) return;
    const data = event.clipboardData;
    const files = [...(data?.files || [])];
    if (!files.length) return; // plain text pastes are checked when the prompt is submitted
    const strings = Object.fromEntries(data.types.filter((type) => type !== 'Files').map((type) => [type, data.getData(type)]));
    event.preventDefault();
    hold(event);
    const target = event.target;
    review(files).then((allowed) => {
      if (!allowed.length) return;
      const replay = new ClipboardEvent('paste', { bubbles: true, cancelable: true, composed: true, clipboardData: transferOf(allowed, strings) });
      replayed.add(replay);
      (target?.isConnected ? target : document.body).dispatchEvent(replay);
    });
  }, true);
};
