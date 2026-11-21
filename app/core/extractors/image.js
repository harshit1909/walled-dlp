import { recognise } from './ocr.js';

export async function* extractImage(buffer) {
  yield { text: await recognise(buffer), where: 'image text (OCR)', tolerant: true };
}
