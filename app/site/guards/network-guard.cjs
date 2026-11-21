// Network backstop: the last line of defence for prompts that reach the model
// through a path the prompt guard does not watch (editing an earlier message,
// a suggestion chip, ...). It only looks at the site's prompt-submission
// endpoint; every other request goes straight to the original fetch.
module.exports = function installNetworkGuard(ns) {

  const APPROVAL_MS = 30_000;
  const approved = new Map(); // normalised prompt -> expiry
  const normalise = (text) => text.replace(/\s+/g, '');
  // Called when the user chose Continue for a prompt, so its request is not asked about twice.
  ns.approveNetwork = (text) => approved.set(normalise(text), Date.now() + APPROVAL_MS);

  function isApproved(text) {
    const key = normalise(text);
    for (const [prompt, until] of approved) {
      if (Date.now() > until) approved.delete(prompt);
      else if (key.includes(prompt)) return true;
    }
    return false;
  }

  // Every string in the JSON request body that carries the marker (the user's prompt).
  function markedStrings(body) {
    const found = [];
    try {
      (function walk(value) {
        if (typeof value === 'string') { if (ns.hasMarker(value)) found.push(value); }
        else if (value && typeof value === 'object') Object.values(value).forEach(walk);
      })(JSON.parse(body));
    } catch { /* not JSON */ }
    return found.length ? found : [body.slice(0, 2000)];
  }

  async function guarded(self, input, init, original) {
    let body = init?.body;
    if (body == null && input instanceof Request) body = await input.clone().text().catch(() => '');
    if (typeof body === 'string' && ns.hasMarker(body)) {
      for (const text of markedStrings(body)) {
        if (isApproved(text)) continue;
        const { allow } = await ns.ask({ kind: 'prompt', text });
        if (!allow) throw new DOMException('Blocked by Walled DLP', 'AbortError');
        ns.approveNetwork(text);
      }
    }
    return original.call(self, input, init);
  }

  const original = window.fetch;
  window.fetch = function fetch(input, init) {
    let url = '';
    try { url = typeof input === 'string' ? input : input instanceof URL ? input.href : input?.url || ''; } catch { /* fall through */ }
    if (ns.site.submitEndpoints.some((pattern) => pattern.test(url))) return guarded(this, input, init, original);
    return original.apply(this, arguments);
  };
};
