import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { inspectPrompt, inspectFile } from '../../app/core/inspector.js';
import { shutdownOcr } from '../../app/core/extractors/ocr.js';

const samples = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..', 'samples');
const load = async (name) => ({ name, buffer: await fs.readFile(path.join(samples, name)) });

after(() => shutdownOcr());

test('prompts', () => {
  assert.equal(inspectPrompt('hello').status, 'clean');
  assert.equal(inspectPrompt('this is WALLED_SENSITIVE data').status, 'detected');
});

const expectations = {
  'sensitive.txt': ['detected', 'text'],
  'clean.txt': ['clean', 'text'],
  'sensitive.pdf': ['detected', 'pdf'],
  'clean.pdf': ['clean', 'pdf'],
  'sensitive-scanned.pdf': ['detected', 'pdf'],
  'sensitive.png': ['detected', 'image'],
  'sensitive-dark.jpg': ['detected', 'image'],
  'clean.png': ['clean', 'image'],
};

for (const [name, [status, fileType]] of Object.entries(expectations)) {
  test(`${name} -> ${status}`, async () => {
    const verdict = await inspectFile(await load(name));
    assert.equal(verdict.status, status, JSON.stringify(verdict));
    assert.equal(verdict.fileType, fileType);
  });
}

test('file type comes from content, not the extension', async () => {
  const pdf = await load('sensitive.pdf');
  const verdict = await inspectFile({ ...pdf, name: 'notes.txt' });
  assert.deepEqual([verdict.status, verdict.fileType], ['detected', 'pdf']);
});

test('UTF-16 text files are decoded', async () => {
  const buffer = Buffer.concat([Buffer.from([0xff, 0xfe]), Buffer.from('secret WALLED_SENSITIVE', 'utf16le')]);
  assert.equal((await inspectFile({ name: 'a.txt', buffer })).status, 'detected');
  const noBom = Buffer.from('secret WALLED_SENSITIVE', 'utf16le');
  assert.equal((await inspectFile({ name: 'b.txt', buffer: noBom })).status, 'detected');
});

test('marker in the file name is detected', async () => {
  const verdict = await inspectFile({ name: 'WALLED_SENSITIVE.txt', buffer: Buffer.from('x') });
  assert.deepEqual([verdict.status, verdict.where], ['detected', 'file name']);
});

test('unreadable files are reported as uninspectable, never silently allowed', async () => {
  const verdict = await inspectFile({ name: 'broken.pdf', buffer: Buffer.from('%PDF-1.7 garbage') });
  assert.equal(verdict.status, 'uninspectable');
  assert.equal((await inspectFile({ name: 'big.bin', buffer: Buffer.alloc(0), skipReason: 'too-large' })).status, 'uninspectable');
});
