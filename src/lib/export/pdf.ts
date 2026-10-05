// Multi-page PDF built from rasterised pages (JPEG, or PNG with alpha).
import { jsPDF } from 'jspdf';
import type { Design } from '../../types';
import { renderPageRaster, clampScale, outputSize } from './raster';
import { canvasBytes, pagesByIds, Progress, releaseCanvas, throwIfAborted, tick } from './common';

export type PdfQuality = 'standard' | 'print';

export interface PdfOptions {
  quality: PdfQuality;
  transparent: boolean;
}

/** Pixel ratio used for a PDF quality setting */
export function pdfScale(design: Design, quality: PdfQuality): number {
  if (quality === 'standard') return clampScale(1, design.width, design.height);
  const dpi = design.dpi || 96;
  // 300 dpi equivalent, capped so the longest side is at most 6000px, but never below standard
  const s = Math.min(300 / dpi, 6000 / Math.max(design.width, design.height));
  return clampScale(Math.max(1, s), design.width, design.height);
}

/** PDF page size in points for the design */
export function pdfPageSize(design: Design) {
  const dpi = design.dpi || 96;
  return { w: (design.width / dpi) * 72, h: (design.height / dpi) * 72 };
}

export function pdfPixelSize(design: Design, quality: PdfQuality) {
  return outputSize(design.width, design.height, pdfScale(design, quality));
}

export async function exportPdf(design: Design, pageIds: string[], opts: PdfOptions, onProgress: Progress, signal?: AbortSignal): Promise<Uint8Array> {
  const pages = pagesByIds(design, pageIds);
  if (!pages.length) throw new Error('Choose at least one page to export.');
  const { w, h } = pdfPageSize(design);
  const orientation = w > h ? 'landscape' : 'portrait';
  const doc = new jsPDF({ orientation, unit: 'pt', format: [w, h], compress: true, putOnlyUsedFonts: true });
  doc.setProperties({ title: design.name || 'Untitled design', creator: 'Kamva' });
  const scale = pdfScale(design, opts.quality);

  for (let i = 0; i < pages.length; i++) {
    throwIfAborted(signal);
    onProgress(i / pages.length, `Rendering page ${i + 1} of ${pages.length}`);
    await tick();
    const canvas = await renderPageRaster(design, pages[i], { scale, transparent: opts.transparent });
    throwIfAborted(signal);
    onProgress((i + 0.5) / pages.length, `Adding page ${i + 1} of ${pages.length}`);
    await tick();
    if (i > 0) doc.addPage([w, h], orientation);
    if (opts.transparent) {
      // PNG keeps the alpha channel (jsPDF writes it as an SMask)
      const png = await canvasBytes(canvas, 'image/png');
      doc.addImage(png, 'PNG', 0, 0, w, h, undefined, 'FAST');
    } else {
      const jpg = await canvasBytes(canvas, 'image/jpeg', 0.95);
      doc.addImage(jpg, 'JPEG', 0, 0, w, h, undefined, 'NONE');
    }
    releaseCanvas(canvas);
  }
  throwIfAborted(signal);
  onProgress(0.99, 'Writing PDF');
  await tick();
  const out = new Uint8Array(doc.output('arraybuffer'));
  onProgress(1, 'Done');
  return out;
}
