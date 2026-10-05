// Renders the design's timeline frame by frame (animations, video frames and
// page transitions) into one output canvas. Shared by the video and GIF exporters.
import type { Design, Page } from '../../types';
import { PageRenderer, preparePage } from '../render/renderPage';
import { drawTransition } from '../render/animation';
import { releaseCanvas, throwIfAborted } from './common';

export interface FrameInfo {
  /** 0-based frame index */
  index: number;
  total: number;
  /** seconds on the design timeline */
  time: number;
  canvas: HTMLCanvasElement;
}

export function timelinePages(design: Design): Page[] {
  return design.pages.filter((p) => !p.hidden && p.duration > 0);
}

export function timelineDuration(design: Design): number {
  return timelinePages(design).reduce((a, p) => a + p.duration, 0);
}

export function frameCount(design: Design, fps: number): number {
  return Math.max(1, Math.round(timelineDuration(design) * fps));
}

/** Even output dimensions (≥2) with the design's aspect ratio */
export function evenSize(w: number, h: number) {
  const even = (v: number) => Math.max(2, Math.round(v / 2) * 2);
  return { width: even(w), height: even(h) };
}

/**
 * Walk the timeline at `fps`, calling `onFrame` with a w×h canvas for every
 * frame. The canvas is reused: encode it before returning from `onFrame`.
 * `background` paints behind each frame (for formats without alpha).
 */
export async function renderTimeline(
  design: Design,
  opts: { width: number; height: number; fps: number; background?: string },
  onFrame: (f: FrameInfo) => Promise<void> | void,
  signal?: AbortSignal,
): Promise<void> {
  const pages = timelinePages(design);
  if (!pages.length) throw new Error('There are no visible pages to export. Show a page or give it a duration, then try again.');
  const { width: W, height: H, fps } = opts;
  const scale = W / design.width;
  const total = frameCount(design, fps);
  const out = document.createElement('canvas');
  out.width = W;
  out.height = H;
  const octx = out.getContext('2d', { alpha: !opts.background })!;
  octx.imageSmoothingQuality = 'high';

  const paint = (src: HTMLCanvasElement) => {
    octx.save();
    if (opts.background) {
      octx.fillStyle = opts.background;
      octx.fillRect(0, 0, W, H);
    } else octx.clearRect(0, 0, W, H);
    octx.drawImage(src, 0, 0, W, H);
    octx.restore();
  };

  let index = 0;
  let pageStart = 0;
  for (let pi = 0; pi < pages.length; pi++) {
    throwIfAborted(signal);
    const page = pages[pi];
    const next = pages[pi + 1];
    const pageEnd = pageStart + page.duration;
    const trType = next ? page.transition?.type ?? 'none' : 'none';
    const trDur = trType !== 'none' ? Math.min(Math.max(0, page.transition.duration || 0), page.duration) : 0;

    await preparePage(design, page, 'export:');
    const r = new PageRenderer(design, page, { scale, videoKey: 'export:' });
    let nextFirst: HTMLCanvasElement | null = null;
    let mix: HTMLCanvasElement | null = null;
    try {
      // every frame whose time falls inside this page (the last page takes the remainder)
      while (index < total && (index / fps < pageEnd - 1e-9 || pi === pages.length - 1)) {
        throwIfAborted(signal);
        const T = index / fps;
        const t = Math.max(0, Math.min(page.duration, T - pageStart));
        const frame = await r.frame(t, scale);
        throwIfAborted(signal);
        if (trDur > 0 && t > page.duration - trDur) {
          if (!nextFirst) {
            // the incoming page at its first moment, rendered once
            await preparePage(design, next, 'export:');
            const nr = new PageRenderer(design, next, { scale, videoKey: 'export:' });
            try {
              nextFirst = await nr.frame(0, scale);
            } finally {
              nr.destroy();
            }
            mix = document.createElement('canvas');
            mix.width = W;
            mix.height = H;
          }
          const p = Math.max(0, Math.min(1, (t - (page.duration - trDur)) / trDur));
          const mctx = mix!.getContext('2d')!;
          drawTransition(mctx, trType, p, frame, nextFirst, W, H);
          paint(mix!);
        } else {
          paint(frame);
        }
        releaseCanvas(frame);
        await onFrame({ index, total, time: T, canvas: out });
        index++;
      }
    } finally {
      r.destroy();
      releaseCanvas(nextFirst);
      releaseCanvas(mix);
    }
    pageStart = pageEnd;
  }
}
