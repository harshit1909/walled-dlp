// Per-page runtime shared by the guards: the `ask` channel to the main process
// and a small status toast. Everything is held in closures, nothing is exposed
// on `window`, so the page's own scripts cannot reach it.
module.exports = function createRuntime({ ipcRenderer, site, policy }) {
  const ns = { site };

  ns.hasMarker = (text) => typeof text === 'string' && text.includes(policy.marker);

  /**
   * Ask the main process for a decision on a prompt or a file.
   * Fails closed: if anything goes wrong the answer is "not allowed".
   * @param {{kind: 'prompt', text: string} | {kind: 'file', file: File}} request
   * @returns {Promise<{allow: boolean}>}
   */
  ns.ask = async (request) => {
    try {
      const payload = { kind: request.kind, site: site.id };
      if (request.kind === 'prompt') payload.text = request.text;
      else {
        const { file } = request;
        Object.assign(payload, { name: file.name, mime: file.type, size: file.size });
        if (file.size > policy.maxFileBytes) payload.skipReason = 'too-large';
        else {
          try { payload.data = new Uint8Array(await file.arrayBuffer()); } catch { payload.skipReason = 'unreadable'; }
        }
      }
      const result = await ipcRenderer.invoke('dlp:inspect', payload);
      return { allow: result?.decision === 'allow' };
    } catch {
      return { allow: false };
    }
  };

  // Status toast (informational only; confirmation always happens in the native dialog).
  let toastEl = null;
  let toastTimer = 0;
  ns.toast = (text, autoHideMs = 0) => {
    clearTimeout(toastTimer);
    if (!toastEl) {
      toastEl = document.createElement('div');
      toastEl.setAttribute('role', 'status');
      toastEl.style.cssText = 'position:fixed;z-index:2147483647;right:20px;bottom:20px;max-width:360px;display:flex;gap:10px;' +
        'align-items:flex-start;padding:12px 16px 12px 14px;border-radius:12px;background:#1d1f2d;color:#fff;' +
        'font:13px/1.45 -apple-system,system-ui,sans-serif;border:1px solid rgba(255,255,255,.12);' +
        'box-shadow:0 10px 30px rgba(0,0,0,.35);pointer-events:none;border-left:4px solid #6c66ff';
      toastEl.append(document.createElement('b'), document.createElement('span'));
      toastEl.firstChild.textContent = 'Walled DLP';
      toastEl.firstChild.style.cssText = 'color:#a9a5ff;white-space:nowrap';
    }
    toastEl.lastChild.textContent = text;
    (document.body || document.documentElement).append(toastEl);
    if (autoHideMs) toastTimer = setTimeout(ns.hideToast, autoHideMs);
  };
  ns.hideToast = () => { clearTimeout(toastTimer); toastEl?.remove(); };

  return ns;
};
