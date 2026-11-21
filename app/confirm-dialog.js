// The native confirmation dialog (NSAlert on macOS, TaskDialog on Windows, GTK on Linux).
// The layout of a native dialog belongs to the OS; what we control is the icon,
// the wording and a scannable structure for the details.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { app, dialog, nativeImage } from 'electron';

const SITE_NAMES = { chatgpt: 'ChatGPT', perplexity: 'Perplexity' };
const FILE_TYPES = { text: 'Text file', pdf: 'PDF document', image: 'Image' };
const icon = nativeImage.createFromPath(path.join(path.dirname(fileURLToPath(import.meta.url)), 'assets', 'icon.png'));

function formatSize(bytes = 0) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

function truncate(text, max = 300) {
  const flat = text.trim();
  return flat.length > max ? flat.slice(0, max).trimEnd() + '…' : flat;
}

export function describeRequest({ kind, site, label, text, size, verdict }, marker) {
  const siteName = SITE_NAMES[site] || site;
  if (kind === 'prompt') {
    return {
      message: 'Sensitive content found in your prompt',
      detail: [
        `Sending to  ${siteName}`,
        `Type  Text prompt`,
        '',
        `“${truncate(text ?? label)}”`,
        '',
        `The marker ${marker} was detected. Do you want to send this prompt anyway?`,
      ].join('\n'),
    };
  }
  const meta = [
    `Sending to  ${siteName}`,
    `Type  ${FILE_TYPES[verdict.fileType] || 'File'} · ${formatSize(size)}`,
    `File  ${label}`,
  ];
  if (verdict.status === 'uninspectable') {
    return {
      message: 'This file could not be checked',
      detail: [...meta, '', `Walled DLP could not inspect it because ${verdict.reason}. Do you want to upload it anyway?`].join('\n'),
    };
  }
  return {
    message: 'Sensitive content found in your file',
    detail: [...meta, `Found in  ${verdict.where}`, '', `The marker ${marker} was detected. Do you want to upload this file anyway?`].join('\n'),
  };
}

/** @returns {(request: object) => Promise<boolean>} resolves true when the user picks Continue */
export function createConfirm({ marker }) {
  // Test seam: in end-to-end tests the dialog is logged to, and answered from, files.
  const e2eDir = process.env.WALLED_DLP_E2E_DIR;
  const auto = process.env.WALLED_DLP_AUTO_ANSWER; // dev/probe only: 'continue' | 'cancel'
  return async (request) => {
    if (auto && !e2eDir) return auto === 'continue';
    if (e2eDir) {
      fs.appendFileSync(path.join(e2eDir, 'dialogs.jsonl'), JSON.stringify(request) + '\n');
      return fs.readFileSync(path.join(e2eDir, 'answer'), 'utf8').trim() === 'continue';
    }
    const { message, detail } = describeRequest(request, marker);
    app.focus({ steal: true }); // the browser has focus, so bring the alert to the front
    const { response } = await dialog.showMessageBox({
      type: 'none', // our own icon instead of the generic warning triangle
      icon,
      title: 'Walled DLP',
      message,
      detail,
      buttons: ['Cancel', 'Continue'],
      defaultId: 0, // Enter and Esc both take the safe option
      cancelId: 0,
      noLink: true,
    });
    return response === 1;
  };
}
