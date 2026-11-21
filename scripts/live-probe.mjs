// Dev tool: checks the guards against the REAL sites inside the running app
// (not signed in). Start the app with: WALLED_DLP_DEBUG_PORT=9444 WALLED_DLP_AUTO_ANSWER=cancel npm start
import puppeteer from 'puppeteer';

setTimeout(() => { console.log('probe timed out'); process.exit(2); }, 100000).unref();

const browser = await puppeteer.connect({ browserURL: 'http://127.0.0.1:9444', defaultViewport: null });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const tabs = (await browser.pages()).find((p) => p.url().endsWith('tabs.html'));
for (const [name, host] of [['chatgpt', 'chatgpt.com'], ['perplexity', 'perplexity.ai']]) {
  await tabs.evaluate((n) => window.tabs.select(n), name);
  await sleep(9000);
  const page = (await browser.pages()).find((p) => p.url().includes(host));
  if (!page) { console.log(name, 'page not found'); continue; }
  const info = await page.evaluate(() => ({
    url: location.href, title: document.title,
    style: !!document.getElementById('walled-dlp-response-style'),
    composer: document.querySelectorAll('#prompt-textarea, #ask-input, textarea, [contenteditable="true"]').length,
    blocked: /verify you are human|just a moment|access denied/i.test(document.body?.innerText || ''),
  }));
  console.log(name, JSON.stringify(info));
  const sel = '#prompt-textarea, #ask-input, textarea, [contenteditable="true"]';
  const focused = await page.evaluate((q) => { const el = [...document.querySelectorAll(q)].find((e) => e.getClientRects().length); el?.focus(); return !!el; }, sel);
  if (focused) {
    await page.keyboard.type('probe WALLED_SENSITIVE probe', { delay: 5 });
    await page.keyboard.press('Enter');
    await sleep(3000);
    console.log(name, 'after Enter (auto-cancel): prompt still in composer =', await page.evaluate((q) => [...document.querySelectorAll(q)].some((e) => (e.value ?? e.innerText).includes('WALLED_SENSITIVE')), sel));
  } else console.log(name, 'composer not visible (probably needs sign-in)');
}
browser.disconnect();
