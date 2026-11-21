import test from 'node:test';
import assert from 'node:assert/strict';
import { findMarker } from '../../app/core/detector.js';

const M = 'WALLED_SENSITIVE';

test('exact match returns a snippet', () => {
  const hit = findMarker(`please summarise ${M} for me`, M);
  assert.equal(hit.found, true);
  assert.match(hit.snippet, /WALLED_SENSITIVE/);
});

test('no match on clean or near-miss text', () => {
  assert.equal(findMarker('nothing to see', M).found, false);
  assert.equal(findMarker('walled_sensitive', M).found, false);
  assert.equal(findMarker('WALLED SENSITIVE', M).found, false);
  assert.equal(findMarker('', M).found, false);
});

test('tolerant mode absorbs OCR noise but not ordinary prose', () => {
  for (const noisy of ['WALLED SENSITIVE', 'WALLED_ SENSITIVE', 'WALLED-SENS1TIVE', 'W A L L E D _ S E N S I T I V E', 'WALLED_5ENSITIVE']) {
    assert.equal(findMarker(noisy, M, { tolerant: true }).found, true, noisy);
  }
  assert.equal(findMarker('a walled, sensitive garden', M, { tolerant: true }).found, false);
});
