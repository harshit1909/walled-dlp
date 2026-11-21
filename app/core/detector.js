// Marker detection. Pure functions, no I/O.

const OCR_CONFUSIONS = { 0: 'O', 1: 'I', 5: 'S', 8: 'B', '|': 'I', $: 'S' };

// Collapses everything OCR / PDF text layers tend to get wrong: spacing,
// underscores read as dashes or dropped, and look-alike glyphs.
function squash(text) {
  return text
    .replace(/[015|$8]/g, (c) => OCR_CONFUSIONS[c])
    .replace(/[^A-Za-z]/g, '');
}

function snippetAround(text, index, length, radius = 60) {
  const start = Math.max(0, index - radius);
  const end = Math.min(text.length, index + length + radius);
  return (start > 0 ? '…' : '') + text.slice(start, end).replace(/\s+/g, ' ').trim() + (end < text.length ? '…' : '');
}

/**
 * @param {string} text
 * @param {string} marker
 * @param {{tolerant?: boolean}} [opts] tolerant=true also matches the marker
 *   after squashing separators/look-alikes (for OCR and PDF text layers).
 * @returns {{found: boolean, snippet?: string}}
 */
export function findMarker(text, marker, { tolerant = false } = {}) {
  if (!text) return { found: false };
  const index = text.indexOf(marker);
  if (index !== -1) return { found: true, snippet: snippetAround(text, index, marker.length) };
  if (tolerant && squash(text).includes(squash(marker))) return { found: true };
  return { found: false };
}
