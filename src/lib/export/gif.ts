// Animated GIF export with gifenc (per-frame palettes, infinite loop).
import { GIFEncoder, quantize, applyPalette } from 'gifenc';
import type { Design } from '../../types';
import { evenSize, frameCount, renderTimeline } from './timeline';
import { Progress, throwIfAborted, tick } from './common';

export type GifMaxWidth = 320 | 480 | 640 | 800 | 0; // 0 = original

export interface GifOptions {
  fps: 10 | 15 | 20;
  maxWidth: GifMaxWidth;
}

export function gifSize(design: Design, maxWidth: GifMaxWidth) {
  const k = maxWidth ? Math.min(1, maxWidth / design.width) : Math.min(1, 1600 / Math.max(design.width, design.height));
  // GIF has no even-size requirement, but keep it tidy and ≥2
  const s = evenSize(design.width * k, design.height * k);
  return s;
}

export async function exportGif(design: Design, opts: GifOptions, onProgress: Progress, signal?: AbortSignal): Promise<Uint8Array> {
  const { width, height } = gifSize(design, opts.maxWidth);
  const fps = opts.fps;
  const total = frameCount(design, fps);
  // GIF delays are in 1/100 s; spread rounding so the total length stays right
  const centis = (i: number) => Math.round(((i + 1) * 100) / fps) - Math.round((i * 100) / fps);
  const gif = GIFEncoder();
  const t0 = performance.now();
  await renderTimeline(
    design,
    { width, height, fps, background: '#ffffff' },
    async ({ index, canvas }) => {
      const ctx = canvas.getContext('2d', { willReadFrequently: true })!;
      const { data } = ctx.getImageData(0, 0, width, height);
      const palette = quantize(data, 256, { format: 'rgb565' });
      const indexed = applyPalette(data, palette, 'rgb565');
      gif.writeFrame(indexed, width, height, { palette, delay: centis(index) * 10, repeat: 0 });
      const done = index + 1;
      const elapsed = (performance.now() - t0) / 1000;
      const left = done > 3 ? Math.round((elapsed / done) * (total - done)) : NaN;
      onProgress((done / total) * 0.98, `Frame ${done} of ${total}` + (isFinite(left) ? ` · about ${Math.max(1, left)} s left` : ''));
      if (index % 4 === 3) await tick();
    },
    signal,
  );
  throwIfAborted(signal);
  gif.finish();
  onProgress(1, 'Done');
  return gif.bytes();
}
