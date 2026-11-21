// End-to-end test: launches the real desktop app (real preload, guards,
// inspection and dialog flow) with ChatGPT and Perplexity replaced by a local
// mock page served on their real URLs. The native dialog is replaced by a
// scripted answer, and Puppeteer drives the embedded pages over DevTools.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import electron from 'electron';
import puppeteer from 'puppeteer';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const sample = (name) => path.join(root, 'samples', name);
const SITES = { chatgpt: 'https://chatgpt.com/', perplexity: 'https://www.perplexity.ai/' };
const MARKED = 'summarise this WALLED_SENSITIVE memo';
const PORT = 9333;

// --- launch the app --------------------------------------------------------------
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'walled-dlp-e2e-'));
const answerFile = path.join(dir, 'answer');
const logFile = path.join(dir, 'dialogs.jsonl');
const setAnswer = (value) => fs.writeFileSync(answerFile, value);
const dialogs = () => (fs.existsSync(logFile) ? fs.readFileSync(logFile, 'utf8').split('\n').filter(Boolean).map((line) => JSON.parse(line)) : []);
const clearDialogs = () => fs.rmSync(logFile, { force: true });
setAnswer('cancel');

const env = { ...process.env, WALLED_DLP_E2E_DIR: dir, WALLED_DLP_E2E_PORT: String(PORT) };
delete env.ELECTRON_RUN_AS_NODE;
const app = spawn(electron, [root, `--user-data-dir=${path.join(dir, 'profile')}`], { env, stdio: 'ignore' });

async function connect() {
  for (let i = 0; i < 60; i++) {
    try { return await puppeteer.connect({ browserURL: `http://127.0.0.1:${PORT}`, defaultViewport: null }); } catch { await new Promise((r) => setTimeout(r, 500)); }
  }
  throw new Error('desktop app did not start');
}
const browser = await connect();
let failures = 0;

async function findPage(match) {
  for (let i = 0; i < 80; i++) {
    for (const page of await browser.pages()) if (match(page.url())) return page;
    await new Promise((r) => setTimeout(r, 250));
  }
  throw new Error('page not found');
}
const tabsPage = await findPage((url) => url.endsWith('tabs.html'));

async function openSite(site, url) {
  const page = await findPage((u) => u.startsWith(url));
  await tabsPage.evaluate((name) => window.tabs.select(name), site); // hidden tabs do not take input
  await page.waitForSelector('#send');
  return page;
}

const state = (page) => page.evaluate(() => ({ sent: window.sent, uploads: window.uploads, text: document.getElementById('prompt-textarea').innerText }));
const settle = (page, ms = 400) => new Promise((resolve) => setTimeout(resolve, ms));
async function waitFor(page, fn, arg) { await page.waitForFunction(fn, { timeout: 30_000 }, arg); }
async function type(page, text) { await page.click('#prompt-textarea'); await page.keyboard.type(text); }
async function reset(page) {
  clearDialogs();
  await page.evaluate(() => { window.sent = []; window.uploads = []; document.getElementById('prompt-textarea').innerText = ''; document.getElementById('file').value = ''; });
}
// Simulates a user drop / paste of real files taken from the file input.
async function deliver(page, kind, files) {
  const input = await page.evaluateHandle(() => Object.assign(document.createElement('input'), { type: 'file', multiple: true }));
  await input.uploadFile(...files);
  await page.evaluate((el, kind) => {
    const transfer = new DataTransfer();
    for (const file of el.files) transfer.items.add(file);
    const event = kind === 'drop'
      ? new DragEvent('drop', { bubbles: true, cancelable: true, dataTransfer: transfer })
      : new ClipboardEvent('paste', { bubbles: true, cancelable: true, clipboardData: transfer });
    document.getElementById('prompt-textarea').dispatchEvent(event);
  }, input, kind);
}

async function check(name, fn) {
  try { await fn(); console.log(`  ok   ${name}`); }
  catch (error) { failures++; console.log(`  FAIL ${name}\n       ${String(error.message).split('\n').join('\n       ')}`); }
}

for (const [site, url] of Object.entries(SITES)) {
  console.log(`\n${site}`);
  const page = await openSite(site, url);

  await check('prompt without the marker is submitted with no dialog', async () => {
    await reset(page);
    await type(page, 'hello there');
    await page.keyboard.press('Enter');
    await waitFor(page, () => window.sent.length === 1);
    assert.equal(dialogs().length, 0);
  });

  await check('marked prompt + Enter + Cancel: blocked, prompt stays editable', async () => {
    await reset(page); setAnswer('cancel');
    await type(page, MARKED);
    await page.keyboard.press('Enter');
    await settle(page);
    const s = await state(page);
    assert.deepEqual(s.sent, []);
    assert.equal(s.text.trim(), MARKED);
    assert.equal(dialogs().length, 1);
    assert.deepEqual([dialogs()[0].kind, dialogs()[0].site, dialogs()[0].text], ['prompt', site, MARKED]);
    // ...and after removing the marker it submits normally
    await page.evaluate(() => { document.getElementById('prompt-textarea').innerText = 'now it is clean'; });
    await page.click('#send');
    await waitFor(page, () => window.sent.length === 1);
    assert.equal(dialogs().length, 1);
  });

  await check('marked prompt + Enter + Continue: submitted once, unmodified', async () => {
    await reset(page); setAnswer('continue');
    await type(page, MARKED);
    await page.keyboard.press('Enter');
    await waitFor(page, () => window.sent.length === 1);
    await settle(page);
    assert.deepEqual((await state(page)).sent.map((t) => t.trim()), [MARKED]);
    assert.equal(dialogs().length, 1);
  });

  await check('marked prompt + send button: Cancel blocks, Continue submits', async () => {
    await reset(page); setAnswer('cancel');
    await type(page, MARKED);
    await page.click('#send');
    await settle(page);
    assert.deepEqual((await state(page)).sent, []);
    setAnswer('continue');
    await page.click('#send');
    await waitFor(page, () => window.sent.length === 1);
    assert.equal(dialogs().length, 2);
  });

  await check('clean files (txt, pdf, png) upload with no dialog', async () => {
    await reset(page);
    await (await page.$('#file')).uploadFile(sample('clean.txt'), sample('clean.pdf'), sample('clean.png'));
    await waitFor(page, () => window.uploads.length === 3);
    assert.equal(dialogs().length, 0);
  });

  for (const file of ['sensitive.txt', 'sensitive.pdf', 'sensitive-scanned.pdf', 'sensitive.png', 'sensitive-dark.jpg']) {
    await check(`${file}: dialog names the file; Cancel blocks, Continue uploads`, async () => {
      await reset(page); setAnswer('cancel');
      const input = await page.$('#file');
      await input.uploadFile(sample(file));
      await waitFor(page, () => document.getElementById('file').value === '');
      assert.deepEqual((await state(page)).uploads, []);
      assert.deepEqual([dialogs()[0].kind, dialogs()[0].label, dialogs()[0].verdict.status], ['file', file, 'detected']);
      setAnswer('continue');
      await input.uploadFile(sample(file));
      await waitFor(page, () => window.uploads.length === 1);
      assert.deepEqual((await state(page)).uploads, [file]);
      assert.equal(dialogs().length, 2);
    });
  }

  await check('mixed selection + Cancel: only the clean file is uploaded', async () => {
    await reset(page); setAnswer('cancel');
    await (await page.$('#file')).uploadFile(sample('clean.txt'), sample('sensitive.pdf'));
    await waitFor(page, () => window.uploads.length === 1);
    assert.deepEqual((await state(page)).uploads, ['clean.txt']);
    assert.equal(dialogs().length, 1);
  });

  for (const kind of ['drop', 'paste']) {
    await check(`${kind}: Cancel blocks, Continue delivers, clean passes silently`, async () => {
      await reset(page); setAnswer('cancel');
      await deliver(page, kind, [sample('sensitive.png')]);
      await waitFor(page, () => true); await settle(page, 3000);
      assert.deepEqual((await state(page)).uploads, []);
      assert.equal(dialogs().length, 1);
      setAnswer('continue');
      await deliver(page, kind, [sample('sensitive.png')]);
      await waitFor(page, () => window.uploads.length === 1);
      await deliver(page, kind, [sample('clean.txt')]);
      await waitFor(page, () => window.uploads.length === 2);
      assert.equal(dialogs().length, 2);
    });
  }

  await check('network backstop holds a marked request to the submit endpoint', async () => {
    await reset(page); setAnswer('cancel');
    const endpoint = site === 'chatgpt' ? '/backend-api/f/conversation' : '/rest/sse/perplexity_ask';
    const send = (text) => page.evaluate((endpoint, text) => fetch(endpoint, { method: 'POST', body: JSON.stringify({ messages: [{ content: { parts: [text] } }] }) }).then(() => 'sent', (e) => e.name), endpoint, text);
    assert.equal(await send('edited message WALLED_SENSITIVE'), 'AbortError');
    assert.equal(dialogs()[0].text, 'edited message WALLED_SENSITIVE');
    assert.equal(await send('clean message'), 'sent');
    setAnswer('continue');
    assert.equal(await send('edited message WALLED_SENSITIVE'), 'sent');
    assert.equal(dialogs().length, 2);
  });

  await check('AI responses are recoloured, user messages are not', async () => {
    const colors = await page.evaluate((id) => ({
      answer: getComputedStyle(document.getElementById(id)).color,
      user: getComputedStyle(document.getElementById('user-message')).color,
    }), `answer-${site}`);
    assert.equal(colors.answer, 'rgb(232, 89, 12)'); // the default #e8590c from the app's policy
    assert.notEqual(colors.user, colors.answer);
  });

  await page.close();
}

await browser.disconnect();
app.kill();
await new Promise((resolve) => app.once('exit', resolve));
fs.rmSync(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
console.log(failures ? `\n${failures} check(s) failed` : '\nAll checks passed');
process.exit(failures ? 1 : 0);
