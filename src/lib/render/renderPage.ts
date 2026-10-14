import Konva from 'konva';
import type { Design, Page, DesignElement, VideoElement } from '../../types';
import { getAsset, getImageAsync, seekVideo, videoFor, waitVideoReady } from '../assets';
import { ensureFonts } from '../fonts';
import { applyAnimation, buildPageInto, svgMarkupFor, videoSourceTime, BuildCtx } from './builder';
import { svgImageAsync } from './svgUtil';

/** Load every resource a page needs so a synchronous build draws completely. */
export async function preparePage(design: Design, page: Page, videoKey?: string) {
  const fonts: { family: string; weight?: 'normal' | 'bold'; style?: 'normal' | 'italic' }[] = [];
  const jobs: Promise<unknown>[] = [];
  const bg = page.background.assetId;
  if (bg) {
    const a = getAsset(bg);
    if (a?.meta.kind === 'image' || a?.meta.kind === 'svg') jobs.push(getImageAsync(bg));
    if (a?.meta.kind === 'video' && videoKey !== undefined) {
      const v = videoFor(videoKey + 'bg:' + page.id, bg);
      if (v) jobs.push(waitVideoReady(v));
    }
  }
  for (const el of page.elements) {
    if (el.type === 'text') fonts.push({ family: el.fontFamily, weight: el.fontWeight, style: el.fontStyle });
    if (el.type === 'shape' && el.text) fonts.push({ family: el.textStyle?.fontFamily || 'Inter', weight: el.textStyle?.fontWeight || 'bold' });
    if (el.type === 'image' && el.assetId) jobs.push(getImageAsync(el.assetId));
    if (el.type === 'svg') jobs.push(svgImageAsync(svgMarkupFor(el)));
    if (el.type === 'video' && el.assetId && videoKey !== undefined) {
      const v = videoFor(videoKey + el.id, el.assetId);
      if (v) jobs.push(waitVideoReady(v));
    }
  }
  jobs.push(ensureFonts(fonts));
  await Promise.all(jobs.map((j) => j.catch(() => undefined)));
}

/**
 * Offscreen renderer for one page. Builds Konva nodes once, then renders frames
 * at any time (animations + video frames) — used by exporters, thumbnails,
 * the presenter and transitions.
 */
export class PageRenderer {
  stage: Konva.Stage;
  layer: Konva.Layer;
  nodes: Map<string, Konva.Group>;
  ctx: BuildCtx;
  container: HTMLDivElement;

  constructor(design: Design, page: Page, opts: { scale?: number; transparent?: boolean; videoKey?: string; mode?: 'export' | 'play' } = {}) {
    this.container = document.createElement('div');
    this.stage = new Konva.Stage({ container: this.container, width: design.width, height: design.height });
    this.layer = new Konva.Layer({ listening: false });
    this.stage.add(this.layer);
    this.ctx = {
      mode: opts.mode || 'export',
      scale: opts.scale ?? 1,
      design,
      page,
      videoKey: opts.videoKey ?? 'export:',
      transparent: opts.transparent,
    };
    this.nodes = buildPageInto(this.layer, this.ctx);
  }

  /**
   * Seek videos for time t (seconds into the page). With t = null (a still of
   * the whole design) every video shows its own first frame.
   */
  async seek(t: number | null) {
    const jobs: Promise<void>[] = [];
    for (const el of this.ctx.page.elements) {
      if (el.type !== 'video' || !el.assetId) continue;
      const g = this.nodes.get(el.id);
      const v = g?.getAttr('video') as HTMLVideoElement | undefined;
      if (!v) continue;
      const dur = getAsset(el.assetId)?.meta.duration || v.duration || 0;
      jobs.push(seekVideo(v, videoSourceTime(el as VideoElement, t ?? el.timing?.start ?? 0, dur)));
    }
    const bg = this.layer.findOne('.background') as Konva.Group | undefined;
    const bv = bg?.getAttr('video') as HTMLVideoElement | undefined;
    if (bv && bv.duration) jobs.push(seekVideo(bv, (t ?? 0) % bv.duration));
    await Promise.all(jobs);
  }

  applyTime(t: number | null) {
    const p = this.ctx.page;
    for (const el of p.elements) {
      const g = this.nodes.get(el.id);
      if (g) applyAnimation(g, el, t, p.duration, this.ctx.design.width, this.ctx.design.height);
    }
  }

  /** Render a frame to a canvas at `pixelRatio` */
  async frame(t: number | null, pixelRatio = this.ctx.scale): Promise<HTMLCanvasElement> {
    await this.seek(t);
    this.applyTime(t);
    return this.stage.toCanvas({ pixelRatio });
  }

  destroy() {
    this.stage.destroy();
  }
}

export async function renderPageCanvas(
  design: Design,
  page: Page,
  opts: { scale?: number; time?: number | null; transparent?: boolean } = {},
): Promise<HTMLCanvasElement> {
  await preparePage(design, page, 'export:');
  const r = new PageRenderer(design, page, { scale: opts.scale ?? 1, transparent: opts.transparent, videoKey: 'export:' });
  try {
    // a still shows every element, each video at its first frame
    return await r.frame(opts.time ?? null, opts.scale ?? 1);
  } finally {
    r.destroy();
  }
}

/**
 * A strip of `frames` thumbnails sampled evenly across the page's duration
 * (what the page looks like over time), each `tileH` px tall.
 */
export async function pageStrip(design: Design, page: Page, frames: number, tileH: number): Promise<HTMLCanvasElement> {
  const scale = tileH / design.height;
  const tw = Math.max(1, Math.round(design.width * scale));
  const th = Math.max(1, Math.round(tileH));
  const out = document.createElement('canvas');
  out.width = tw * frames;
  out.height = th;
  const ctx = out.getContext('2d')!;
  await preparePage(design, page, 'strip:');
  const r = new PageRenderer(design, page, { scale, videoKey: 'strip:' });
  try {
    for (let i = 0; i < frames; i++) {
      const t = ((i + 0.5) / frames) * page.duration;
      const c = await r.frame(t, scale);
      ctx.drawImage(c, i * tw, 0, tw, th);
      c.width = c.height = 0;
    }
  } finally {
    r.destroy();
  }
  return out;
}

export async function pageThumbnail(design: Design, page: Page, maxSize = 320): Promise<HTMLCanvasElement> {
  const scale = maxSize / Math.max(design.width, design.height);
  return renderPageCanvas(design, page, { scale });
}

export function canvasToBlob(c: HTMLCanvasElement, type = 'image/png', quality?: number): Promise<Blob> {
  return new Promise((resolve, reject) => c.toBlob((b) => (b ? resolve(b) : reject(new Error('Encoding failed'))), type, quality));
}

export function elementsUsingVideo(page: Page): DesignElement[] {
  return page.elements.filter((e) => e.type === 'video');
}
