// Still image export (PNG / JPG / WebP) of pages or of the current selection.
import type { Design, DesignElement, Page } from '../../types';
import { PageRenderer, preparePage } from '../render/renderPage';
import { elementAABB } from '../../editor/canvas/controller';
import {
  canvasBytes,
  ExportFile,
  exactCanvas,
  pageFileName,
  pagesByIds,
  Progress,
  releaseCanvas,
  throwIfAborted,
  tick,
} from './common';

export type RasterFormat = 'png' | 'jpg' | 'webp';

export const RASTER_MIME: Record<RasterFormat, string> = { png: 'image/png', jpg: 'image/jpeg', webp: 'image/webp' };

/** Largest side we let the browser encode (WebP tops out at 16383). */
export const MAX_SIDE = 16000;
const MAX_AREA = 200_000_000;

export interface Box {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** Union of the elements' rotated bounding boxes, rounded outwards to whole pixels. */
export function selectionBox(els: DesignElement[]): Box | null {
  if (!els.length) return null;
  let x0 = Infinity;
  let y0 = Infinity;
  let x1 = -Infinity;
  let y1 = -Infinity;
  for (const el of els) {
    const b = elementAABB(el);
    x0 = Math.min(x0, b.x);
    y0 = Math.min(y0, b.y);
    x1 = Math.max(x1, b.x + b.width);
    y1 = Math.max(y1, b.y + b.height);
  }
  x0 = Math.floor(x0);
  y0 = Math.floor(y0);
  return { x: x0, y: y0, width: Math.max(1, Math.ceil(x1 - x0)), height: Math.max(1, Math.ceil(y1 - y0)) };
}

/** Clamp a pixel ratio so the output stays encodable. */
export function clampScale(scale: number, w: number, h: number): number {
  let s = Math.max(0.01, scale);
  s = Math.min(s, MAX_SIDE / Math.max(w, h));
  if (w * h * s * s > MAX_AREA) s = Math.sqrt(MAX_AREA / (w * h));
  return s;
}

export function outputSize(w: number, h: number, scale: number) {
  return { width: Math.max(1, Math.round(w * scale)), height: Math.max(1, Math.round(h * scale)) };
}

/** Does the page need a video frame (so we must seek to t=0 instead of drawing the static state)? */
function needsTime(page: Page) {
  return !!page.background.assetId || page.elements.some((e) => e.type === 'video');
}

export interface RasterOptions {
  format: RasterFormat;
  /** output pixels per design pixel */
  scale: number;
  transparent: boolean;
  /** 0..1, for JPG and WebP */
  quality: number;
  /** Export only these elements (of `page`), cropped to their bounding box, with no background */
  selection?: string[];
}

/**
 * Render one page (or a selection on it) to a canvas of exactly the advertised
 * size. The caller owns the canvas.
 */
export async function renderPageRaster(design: Design, page: Page, opts: Omit<RasterOptions, 'format' | 'quality'> & { opaqueBackground?: string }): Promise<HTMLCanvasElement> {
  let p = page;
  let box: Box = { x: 0, y: 0, width: design.width, height: design.height };
  let transparent = opts.transparent;
  if (opts.selection?.length) {
    const ids = new Set(opts.selection);
    const els = page.elements.filter((e) => ids.has(e.id) && !e.hidden);
    const b = selectionBox(els);
    if (!b) throw new Error('The selected elements are hidden. Show them or change the selection, then try again.');
    box = b;
    // hide everything else, including the background
    p = { ...page, elements: els, background: { ...page.background, assetId: null } };
    transparent = true;
  }
  const scale = clampScale(opts.scale, box.width, box.height);
  const size = outputSize(box.width, box.height, scale);

  await preparePage(design, p, 'export:');
  const r = new PageRenderer(design, p, { scale, transparent, videoKey: 'export:' });
  try {
    const t = needsTime(p) ? 0 : null;
    if (t !== null) await r.seek(t);
    r.applyTime(t);
    const c = r.stage.toCanvas({ x: box.x, y: box.y, width: box.width, height: box.height, pixelRatio: scale });
    return exactCanvas(c, size.width, size.height, opts.opaqueBackground);
  } finally {
    r.destroy();
  }
}

/** Render the chosen pages to encoded image files. */
export async function exportRaster(
  design: Design,
  pageIds: string[],
  opts: RasterOptions & { baseName: string },
  onProgress: Progress,
  signal?: AbortSignal,
): Promise<ExportFile[]> {
  const pages = opts.selection?.length ? pagesByIds(design, pageIds).slice(0, 1) : pagesByIds(design, pageIds);
  if (!pages.length) throw new Error('Choose at least one page to export.');
  const multi = pages.length > 1;
  const mime = RASTER_MIME[opts.format];
  const alpha = opts.format !== 'jpg' && opts.transparent;
  const files: ExportFile[] = [];
  for (let i = 0; i < pages.length; i++) {
    throwIfAborted(signal);
    onProgress(i / pages.length, multi ? `Rendering page ${i + 1} of ${pages.length}` : 'Rendering');
    await tick();
    const canvas = await renderPageRaster(design, pages[i], {
      scale: opts.scale,
      transparent: alpha,
      selection: opts.selection,
      // JPEG has no alpha: paint white under a transparent selection export
      opaqueBackground: opts.format === 'jpg' && opts.selection?.length ? '#ffffff' : undefined,
    });
    throwIfAborted(signal);
    onProgress((i + 0.6) / pages.length, multi ? `Encoding page ${i + 1} of ${pages.length}` : 'Encoding');
    const data = await canvasBytes(canvas, mime, opts.format === 'png' ? undefined : opts.quality);
    releaseCanvas(canvas);
    files.push({ name: pageFileName(opts.baseName, design, pages[i].id, opts.format, multi), data });
  }
  onProgress(1, 'Done');
  return files;
}
