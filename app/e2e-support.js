// Test-only: when WALLED_DLP_E2E_DIR is set, ChatGPT and Perplexity are served
// from a local mock page on their real URLs, so the real preload, guards,
// inspection and dialog flow run exactly as in production without a network.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { net } from 'electron';

const mockPage = fs.readFileSync(path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'test', 'e2e', 'mock-site.html'));
const MOCKED = /^(chatgpt\.com|www\.perplexity\.ai)$/;

export function setUpE2E(session) {
  session.protocol.handle('https', (request) => {
    const url = new URL(request.url);
    if (!MOCKED.test(url.hostname)) return net.fetch(request, { bypassCustomProtocolHandlers: true });
    if (request.method === 'GET' && url.pathname === '/') return new Response(mockPage, { headers: { 'content-type': 'text/html' } });
    return new Response('ok'); // stands in for the conversation endpoints
  });
}
