// Classifies an upload as 'pdf' | 'image' | 'text' from magic bytes first,
// falling back to MIME type / extension. Never trusts the file name alone.

const IMAGE_EXT = /\.(png|jpe?g|gif|webp|bmp|tiff?|avif|heic|heif|ico)$/i;

function startsWith(buf, bytes, offset = 0) {
  return bytes.every((b, i) => buf[offset + i] === b);
}

function sniffImage(buf) {
  if (startsWith(buf, [0x89, 0x50, 0x4e, 0x47])) return true; // PNG
  if (startsWith(buf, [0xff, 0xd8, 0xff])) return true; // JPEG
  if (startsWith(buf, [0x47, 0x49, 0x46, 0x38])) return true; // GIF
  if (startsWith(buf, [0x42, 0x4d])) return true; // BMP
  if (startsWith(buf, [0x49, 0x49, 0x2a, 0x00]) || startsWith(buf, [0x4d, 0x4d, 0x00, 0x2a])) return true; // TIFF
  if (startsWith(buf, [0x52, 0x49, 0x46, 0x46]) && startsWith(buf, [0x57, 0x45, 0x42, 0x50], 8)) return true; // WEBP
  if (startsWith(buf, [0x66, 0x74, 0x79, 0x70], 4)) {
    const brand = buf.subarray(8, 12).toString('latin1');
    if (/^(avif|avis|heic|heix|hevc|mif1|msf1)$/.test(brand)) return true;
  }
  return false;
}

export function classifyFile({ name = '', mime = '', buffer }) {
  // The PDF header may be preceded by a little junk, so look in the first 1 KB.
  if (buffer.subarray(0, 1024).includes('%PDF-')) return 'pdf';
  if (sniffImage(buffer)) return 'image';
  if (mime === 'application/pdf' || /\.pdf$/i.test(name)) return 'pdf';
  // SVG is XML: scanning it as text is both cheaper and more accurate than OCR.
  if (mime === 'image/svg+xml' || /\.svg$/i.test(name)) return 'text';
  if (mime.startsWith('image/') || IMAGE_EXT.test(name)) return 'image';
  return 'text';
}
