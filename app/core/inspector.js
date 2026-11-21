// Turns "a prompt" or "a file" into a verdict. Knows nothing about HTTP or UI.
import { findMarker } from './detector.js';
import { classifyFile } from './filetype.js';
import { extractText } from './extractors/text.js';
import { extractPdf } from './extractors/pdf.js';
import { extractImage } from './extractors/image.js';
import { config } from './config.js';

const EXTRACTORS = { text: extractText, pdf: extractPdf, image: extractImage };

/** @returns {{status: 'clean'|'detected', snippet?: string}} */
export function inspectPrompt(text, marker = config.marker) {
  const hit = findMarker(String(text ?? ''), marker);
  return hit.found ? { status: 'detected', snippet: hit.snippet } : { status: 'clean' };
}

/**
 * @param {{name: string, mime?: string, buffer: Buffer, skipReason?: 'too-large'|'unreadable'}} file
 * @returns {Promise<{status: 'clean'|'detected'|'uninspectable', fileType: string, where?: string, reason?: string}>}
 */
export async function inspectFile(file, marker = config.marker) {
  const fileType = classifyFile(file);
  if (findMarker(file.name, marker).found) return { status: 'detected', fileType, where: 'file name' };
  if (file.skipReason === 'unreadable') {
    return { status: 'uninspectable', fileType, reason: 'the browser could not read it' };
  }
  if (file.skipReason || file.buffer.length > config.maxFileBytes) {
    return { status: 'uninspectable', fileType, reason: 'the file is too large to inspect' };
  }
  try {
    // Segments are produced lazily, so we stop extracting at the first hit.
    for await (const segment of EXTRACTORS[fileType](file.buffer)) {
      if (findMarker(segment.text, marker, { tolerant: segment.tolerant }).found) {
        return { status: 'detected', fileType, where: segment.where };
      }
    }
    return { status: 'clean', fileType };
  } catch (err) {
    const reason = err?.name === 'PasswordException' ? 'the PDF is password-protected' : 'its content could not be read';
    return { status: 'uninspectable', fileType, reason, error: String(err?.message || err) };
  }
}
