// Draws the app icon (app/assets/icon.png). Re-run after changing the design.
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createCanvas } from '@napi-rs/canvas';

const out = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'app', 'assets', 'icon.png');
const S = 512;
const canvas = createCanvas(S, S);
const ctx = canvas.getContext('2d');

// Rounded-square tile with a deep indigo gradient.
const tile = (x, y, w, h, r) => { ctx.beginPath(); ctx.roundRect(x, y, w, h, r); };
const bg = ctx.createLinearGradient(0, 0, S, S);
bg.addColorStop(0, '#5b5bf0');
bg.addColorStop(1, '#2a1f8f');
tile(24, 24, S - 48, S - 48, 112);
ctx.fillStyle = bg;
ctx.fill();

// Soft highlight along the top edge.
const sheen = ctx.createLinearGradient(0, 24, 0, S / 2);
sheen.addColorStop(0, 'rgba(255,255,255,0.28)');
sheen.addColorStop(1, 'rgba(255,255,255,0)');
tile(24, 24, S - 48, S - 48, 112);
ctx.fillStyle = sheen;
ctx.fill();

// Shield.
ctx.save();
ctx.shadowColor = 'rgba(10,5,60,0.45)';
ctx.shadowBlur = 28;
ctx.shadowOffsetY = 12;
ctx.beginPath();
ctx.moveTo(256, 108);
ctx.bezierCurveTo(300, 140, 342, 150, 384, 150);
ctx.lineTo(384, 262);
ctx.bezierCurveTo(384, 336, 328, 392, 256, 420);
ctx.bezierCurveTo(184, 392, 128, 336, 128, 262);
ctx.lineTo(128, 150);
ctx.bezierCurveTo(170, 150, 212, 140, 256, 108);
ctx.closePath();
ctx.fillStyle = '#ffffff';
ctx.fill();
ctx.restore();

// Check mark.
ctx.strokeStyle = '#3b34c9';
ctx.lineWidth = 34;
ctx.lineCap = 'round';
ctx.lineJoin = 'round';
ctx.beginPath();
ctx.moveTo(200, 268);
ctx.lineTo(244, 312);
ctx.lineTo(318, 220);
ctx.stroke();

await fs.writeFile(out, canvas.toBuffer('image/png'));
console.log('wrote', out);
