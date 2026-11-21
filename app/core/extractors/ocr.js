// OCR engine wrapper (tesseract.js, fully offline: language data ships with the app).
import { createRequire } from 'node:module';
import path from 'node:path';
import os from 'node:os';
import { createWorker } from 'tesseract.js';
import { loadImage, createCanvas } from '@napi-rs/canvas';

const require = createRequire(import.meta.url);
const langPath = path.join(path.dirname(require.resolve('@tesseract.js-data/eng/package.json')), '4.0.0_best_int');

let workerPromise = null;
let queue = Promise.resolve();

function getWorker() {
  workerPromise ??= createWorker('eng', 1, {
    langPath,
    gzip: true,
    cachePath: path.join(os.tmpdir(), 'walled-dlp-ocr-cache'),
  }).catch((err) => {
    workerPromise = null;
    throw err;
  });
  return workerPromise;
}

/** Start loading the OCR engine in the background so the first scan is fast. */
export function warmUpOcr() {
  getWorker().catch(() => {});
}

export async function shutdownOcr() {
  if (!workerPromise) return;
  const worker = await workerPromise.catch(() => null);
  workerPromise = null;
  await worker?.terminate();
}

// Decode any supported raster format, upscale small images (OCR accuracy drops
// sharply on small glyphs) and hand tesseract a plain PNG.
async function normalise(buffer) {
  const image = await loadImage(buffer);
  const longest = Math.max(image.width, image.height);
  const scale = longest < 1600 ? Math.min(3, 1600 / longest) : longest > 4000 ? 4000 / longest : 1;
  const canvas = createCanvas(Math.max(1, Math.round(image.width * scale)), Math.max(1, Math.round(image.height * scale)));
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#fff'; // flatten transparency
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(image, 0, 0, canvas.width, canvas.height);
  return canvas.toBuffer('image/png');
}

/** @returns {Promise<string>} recognised text */
export function recognise(imageBuffer) {
  // One worker, one job at a time.
  const job = queue.then(async () => {
    const png = await normalise(imageBuffer);
    const worker = await getWorker();
    const { data } = await worker.recognize(png);
    return data.text || '';
  });
  queue = job.catch(() => {});
  return job;
}
