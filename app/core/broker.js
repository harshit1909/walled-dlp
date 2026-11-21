// Owns the lifecycle of every inspection: inspect -> (maybe) ask the user -> decision.
// The confirmation UI is injected, so the broker is testable without Electron.
import { EventEmitter } from 'node:events';
import { randomUUID } from 'node:crypto';
import { inspectPrompt, inspectFile } from './inspector.js';

const KEEP_DONE_MS = 60_000;

export class Broker extends EventEmitter {
  /** @param {{confirm: (request: object) => Promise<boolean>}} deps confirm resolves true for Continue */
  constructor({ confirm }) {
    super();
    this.confirm = confirm;
    this.inspections = new Map();
    this.dialogQueue = Promise.resolve();
  }

  /** @param {{kind: 'prompt'|'file', site: string, text?: string, name?: string, mime?: string, buffer?: Buffer}} request */
  submit(request) {
    const id = randomUUID();
    const entry = { id, done: false, result: null };
    entry.promise = this.#run(request).then(
      (result) => result,
      (err) => ({ decision: 'block', status: 'error', reason: String(err?.message || err) }),
    ).then((result) => {
      entry.done = true;
      entry.result = result;
      this.emit('decision', { ...describe(request), ...result, at: Date.now() });
      setTimeout(() => this.inspections.delete(id), KEEP_DONE_MS).unref?.();
      return result;
    });
    this.inspections.set(id, entry);
    return entry;
  }

  get(id) {
    return this.inspections.get(id);
  }

  async #run(request) {
    const verdict = request.kind === 'prompt'
      ? inspectPrompt(request.text)
      : await inspectFile(request);
    if (verdict.status === 'clean') return { decision: 'allow', status: 'clean', fileType: verdict.fileType };

    // Native dialogs are shown strictly one at a time, in arrival order.
    const answer = this.dialogQueue.then(() => this.confirm({ ...describe(request), text: request.text, verdict }));
    this.dialogQueue = answer.catch(() => {});
    const proceed = await answer;
    return { decision: proceed ? 'allow' : 'block', status: verdict.status, fileType: verdict.fileType, where: verdict.where, reason: verdict.reason };
  }
}

function describe(request) {
  return request.kind === 'prompt'
    ? { kind: 'prompt', site: request.site, label: preview(request.text) }
    : { kind: 'file', site: request.site, label: request.name, size: request.buffer?.length };
}

function preview(text = '', max = 80) {
  const flat = text.replace(/\s+/g, ' ').trim();
  return flat.length > max ? flat.slice(0, max) + '…' : flat;
}
