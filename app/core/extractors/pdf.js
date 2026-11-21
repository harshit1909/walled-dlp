// PDF: first the embedded text layer of every page (fast), then, only if that
// found nothing, OCR of rendered pages to catch scanned / image-only PDFs.
import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs';
import { recognise } from './ocr.js';
import { config } from '../config.js';

export async function* extractPdf(buffer) {
  const pdf = await getDocument({
    data: new Uint8Array(buffer), // copy: pdf.js takes ownership of the array
    useSystemFonts: true,
    isEvalSupported: false,
    verbosity: 0,
  }).promise;
  try {
    for (let n = 1; n <= pdf.numPages; n++) {
      const page = await pdf.getPage(n);
      const content = await page.getTextContent();
      const text = content.items.map((item) => (item.str ?? '') + (item.hasEOL ? '\n' : '')).join('');
      yield { text, where: `page ${n}`, tolerant: true };
    }
    const info = await pdf.getMetadata().catch(() => null);
    if (info?.info) yield { text: Object.values(info.info).filter((v) => typeof v === 'string').join('\n'), where: 'document properties' };

    const pages = Math.min(pdf.numPages, config.maxPdfOcrPages);
    for (let n = 1; n <= pages; n++) {
      const page = await pdf.getPage(n);
      const viewport = page.getViewport({ scale: 2 });
      const { canvas, context } = pdf.canvasFactory.create(Math.ceil(viewport.width), Math.ceil(viewport.height));
      await page.render({ canvasContext: context, canvas, viewport }).promise;
      const text = await recognise(canvas.toBuffer('image/png'));
      yield { text, where: `page ${n} (OCR)`, tolerant: true };
    }
  } finally {
    await pdf.loadingTask.destroy().catch(() => {});
  }
}
