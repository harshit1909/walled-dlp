// Generates the demo / test files in samples/: for each format one file that
// contains the marker and one that does not.
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { PDFDocument, StandardFonts } from 'pdf-lib';
import { createCanvas } from '@napi-rs/canvas';

const out = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'samples');
const MARKER = 'WALLED_SENSITIVE';
const sensitive = [`Quarterly revenue forecast - internal only`, `Classification: ${MARKER}`, `Do not share outside the finance team.`];
const clean = [`Quarterly revenue forecast - public summary`, `Classification: public`, `Safe to share with anyone.`];

function png(lines, { dark = false } = {}) {
  const canvas = createCanvas(900, 300);
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = dark ? '#1e1e1e' : '#ffffff';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = dark ? '#f5f5f5' : '#111111';
  ctx.font = '30px Helvetica, Arial, sans-serif';
  lines.forEach((line, i) => ctx.fillText(line, 40, 80 + i * 60));
  return canvas;
}

async function textPdf(lines) {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const page = doc.addPage([595, 842]);
  lines.forEach((line, i) => page.drawText(line, { x: 50, y: 760 - i * 30, size: 16, font }));
  return doc.save();
}

// A "scanned" PDF: the text exists only as pixels, there is no text layer.
async function scannedPdf(lines) {
  const doc = await PDFDocument.create();
  const image = await doc.embedPng(png(lines).toBuffer('image/png'));
  const page = doc.addPage([595, 842]);
  page.drawImage(image, { x: 40, y: 560, width: 515, height: 172 });
  return doc.save();
}

await fs.mkdir(out, { recursive: true });
const files = {
  'sensitive.txt': sensitive.join('\n') + '\n',
  'clean.txt': clean.join('\n') + '\n',
  'sensitive.pdf': await textPdf(sensitive),
  'clean.pdf': await textPdf(clean),
  'sensitive-scanned.pdf': await scannedPdf(sensitive),
  'sensitive.png': png(sensitive).toBuffer('image/png'),
  'sensitive-dark.jpg': png(sensitive, { dark: true }).toBuffer('image/jpeg'),
  'clean.png': png(clean).toBuffer('image/png'),
};
for (const [name, data] of Object.entries(files)) await fs.writeFile(path.join(out, name), data);
console.log(`Wrote ${Object.keys(files).length} files to ${out}`);
