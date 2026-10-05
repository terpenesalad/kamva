import type { Crop, ImageAdjust } from '../../types';
import { defaultAdjust } from '../defaults';

// ---------------------------------------------------------------------------
// Filter presets: each is a set of adjustment deltas applied at `intensity`.
// ---------------------------------------------------------------------------
export interface FilterPreset {
  id: string;
  name: string;
  adjust: Partial<ImageAdjust>;
}

export const FILTERS: FilterPreset[] = [
  { id: 'none', name: 'Original', adjust: {} },
  { id: 'vivid', name: 'Vivid', adjust: { saturation: 45, contrast: 15, brightness: 4 } },
  { id: 'warm', name: 'Warm', adjust: { temperature: 45, saturation: 10, brightness: 4 } },
  { id: 'cool', name: 'Cool', adjust: { temperature: -45, tint: -5, saturation: 5 } },
  { id: 'mono', name: 'Mono', adjust: { grayscale: 100, contrast: 10 } },
  { id: 'noir', name: 'Noir', adjust: { grayscale: 100, contrast: 55, brightness: -10, vignette: 40 } },
  { id: 'vintage', name: 'Vintage', adjust: { sepia: 45, contrast: -10, saturation: -20, vignette: 35, grain: 25 } },
  { id: 'fade', name: 'Faded', adjust: { contrast: -30, brightness: 10, saturation: -25, shadows: 30 } },
  { id: 'dramatic', name: 'Dramatic', adjust: { contrast: 45, saturation: -15, vignette: 50, highlights: -20 } },
  { id: 'film', name: 'Film', adjust: { contrast: 12, saturation: -8, temperature: 12, grain: 35, shadows: 15 } },
  { id: 'retro', name: 'Retro', adjust: { sepia: 25, hue: -10, saturation: 20, contrast: 10, vignette: 25 } },
  { id: 'summer', name: 'Summer', adjust: { temperature: 30, saturation: 30, brightness: 10, highlights: 10 } },
  { id: 'chill', name: 'Chill', adjust: { temperature: -25, saturation: -15, brightness: 6, tint: 8 } },
  { id: 'sunset', name: 'Sunset', adjust: { temperature: 55, tint: 18, saturation: 18, contrast: 8 } },
  { id: 'rosy', name: 'Rosy', adjust: { tint: 35, brightness: 6, saturation: 6 } },
  { id: 'cinema', name: 'Cinema', adjust: { contrast: 25, saturation: -10, temperature: -12, tint: -6, vignette: 30, shadows: -10 } },
  { id: 'lomo', name: 'Lomo', adjust: { saturation: 40, contrast: 35, vignette: 70 } },
  { id: 'matte', name: 'Matte', adjust: { contrast: -20, shadows: 40, saturation: -10 } },
  { id: 'golden', name: 'Golden', adjust: { temperature: 40, sepia: 20, brightness: 6, contrast: 10 } },
  { id: 'arctic', name: 'Arctic', adjust: { temperature: -60, brightness: 12, saturation: -20 } },
  { id: 'pop', name: 'Pop', adjust: { saturation: 70, contrast: 25, hue: 8 } },
  { id: 'dream', name: 'Dream', adjust: { blur: 6, brightness: 12, saturation: 15, contrast: -10 } },
  { id: 'invert', name: 'Negative', adjust: { invert: 100 } },
  { id: 'sharp', name: 'Crisp', adjust: { sharpen: 60, contrast: 10 } },
];

const ADJ_KEYS = Object.keys(defaultAdjust()) as (keyof ImageAdjust)[];

export function effectiveAdjust(adjust: ImageAdjust | undefined, filter: string | undefined, intensity = 1): ImageAdjust {
  const base = { ...defaultAdjust(), ...(adjust || {}) };
  const preset = FILTERS.find((f) => f.id === filter);
  if (!preset || preset.id === 'none') return base;
  const out = { ...base };
  for (const k of ADJ_KEYS) {
    const d = preset.adjust[k];
    if (d) out[k] = base[k] + d * intensity;
  }
  return out;
}

export function isNeutral(a: ImageAdjust): boolean {
  return ADJ_KEYS.every((k) => Math.abs(a[k] || 0) < 0.01);
}

export function needsPixelOps(a: ImageAdjust): boolean {
  return Math.abs(a.highlights) > 0.5 || Math.abs(a.shadows) > 0.5 || a.sharpen > 0.5;
}

/** CSS canvas filter string. `size` is the drawn size used to scale blur. */
export function cssFilter(a: ImageAdjust, size: number): string {
  const parts: string[] = [];
  if (a.brightness) parts.push(`brightness(${Math.max(0, 1 + a.brightness / 100)})`);
  if (a.contrast) parts.push(`contrast(${Math.max(0, 1 + a.contrast / 100)})`);
  if (a.saturation) parts.push(`saturate(${Math.max(0, 1 + a.saturation / 100)})`);
  if (a.hue) parts.push(`hue-rotate(${a.hue}deg)`);
  if (a.sepia) parts.push(`sepia(${Math.min(1, a.sepia / 100)})`);
  if (a.grayscale) parts.push(`grayscale(${Math.min(1, a.grayscale / 100)})`);
  if (a.invert) parts.push(`invert(${Math.min(1, a.invert / 100)})`);
  if (a.blur > 0) parts.push(`blur(${((a.blur / 100) * size * 0.04).toFixed(2)}px)`);
  return parts.length ? parts.join(' ') : 'none';
}

let noiseCanvas: HTMLCanvasElement | null = null;
function noisePattern(): HTMLCanvasElement {
  if (noiseCanvas) return noiseCanvas;
  const c = document.createElement('canvas');
  c.width = c.height = 256;
  const ctx = c.getContext('2d')!;
  const id = ctx.createImageData(256, 256);
  for (let i = 0; i < id.data.length; i += 4) {
    const v = 128 + (Math.random() - 0.5) * 255;
    id.data[i] = id.data[i + 1] = id.data[i + 2] = v;
    id.data[i + 3] = 255;
  }
  ctx.putImageData(id, 0, 0);
  noiseCanvas = c;
  return c;
}

/**
 * Draw (cropped) media into a w×h box on a 2D context with colour adjustments.
 * Pixel-level operations (highlights/shadows/sharpen) are not applied here.
 */
export function drawMedia(
  ctx: CanvasRenderingContext2D,
  source: CanvasImageSource,
  sw: number,
  sh: number,
  crop: Crop,
  a: ImageAdjust,
  w: number,
  h: number,
) {
  if (!sw || !sh || w <= 0 || h <= 0) return;
  ctx.save();
  ctx.beginPath();
  ctx.rect(0, 0, w, h);
  ctx.clip();
  const f = cssFilter(a, Math.min(w, h));
  if (f !== 'none') ctx.filter = f;
  const sx = crop.x * sw;
  const sy = crop.y * sh;
  const cw = Math.max(1, crop.w * sw);
  const ch = Math.max(1, crop.h * sh);
  // If blurring, overdraw slightly so edges don't fade to transparent
  const pad = a.blur > 0 ? (a.blur / 100) * Math.min(w, h) * 0.08 : 0;
  try {
    ctx.drawImage(source, sx, sy, cw, ch, -pad, -pad, w + pad * 2, h + pad * 2);
  } catch {
    /* source not ready */
  }
  ctx.filter = 'none';

  if (a.temperature) {
    ctx.globalCompositeOperation = 'soft-light';
    ctx.globalAlpha = Math.min(1, Math.abs(a.temperature) / 100) * 0.75;
    ctx.fillStyle = a.temperature > 0 ? '#ff9a2e' : '#2e8bff';
    ctx.fillRect(0, 0, w, h);
  }
  if (a.tint) {
    ctx.globalCompositeOperation = 'soft-light';
    ctx.globalAlpha = Math.min(1, Math.abs(a.tint) / 100) * 0.6;
    ctx.fillStyle = a.tint > 0 ? '#ff2ed1' : '#2eff6a';
    ctx.fillRect(0, 0, w, h);
  }
  if (a.grain > 0) {
    ctx.globalCompositeOperation = 'overlay';
    ctx.globalAlpha = Math.min(1, a.grain / 100) * 0.55;
    const pat = ctx.createPattern(noisePattern(), 'repeat');
    if (pat) {
      ctx.fillStyle = pat;
      ctx.fillRect(0, 0, w, h);
    }
  }
  if (a.vignette > 0) {
    ctx.globalCompositeOperation = 'source-over';
    ctx.globalAlpha = 1;
    const r = Math.hypot(w, h) / 2;
    const g = ctx.createRadialGradient(w / 2, h / 2, r * 0.35, w / 2, h / 2, r);
    g.addColorStop(0, 'rgba(0,0,0,0)');
    g.addColorStop(1, `rgba(0,0,0,${Math.min(1, a.vignette / 100) * 0.85})`);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);
  }
  ctx.restore();
}

function pixelOps(ctx: CanvasRenderingContext2D, w: number, h: number, a: ImageAdjust) {
  const img = ctx.getImageData(0, 0, w, h);
  const d = img.data;
  const hl = a.highlights / 100;
  const sh = a.shadows / 100;
  if (hl || sh) {
    for (let i = 0; i < d.length; i += 4) {
      const lum = (0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2]) / 255;
      // highlights affect bright tones, shadows affect dark tones
      const hw = Math.max(0, (lum - 0.5) * 2);
      const sw = Math.max(0, (0.5 - lum) * 2);
      const delta = (hl * hw * hw + sh * sw * sw) * 90;
      d[i] += delta;
      d[i + 1] += delta;
      d[i + 2] += delta;
    }
  }
  if (a.sharpen > 0) {
    const amt = (a.sharpen / 100) * 1.2;
    const src = new Uint8ClampedArray(d);
    const W = w * 4;
    for (let y = 1; y < h - 1; y++) {
      for (let x = 1; x < w - 1; x++) {
        const i = y * W + x * 4;
        for (let c = 0; c < 3; c++) {
          const v = src[i + c] * (1 + 4 * amt) - amt * (src[i + c - 4] + src[i + c + 4] + src[i + c - W] + src[i + c + W]);
          d[i + c] = v;
        }
      }
    }
  }
  ctx.putImageData(img, 0, 0);
}

// Cache processed images keyed by source + params + output size
const cache = new Map<string, HTMLCanvasElement>();
const cacheOrder: string[] = [];
const CACHE_MAX = 60;

export function processImage(
  source: HTMLImageElement | HTMLCanvasElement,
  sourceKey: string,
  crop: Crop,
  a: ImageAdjust,
  outW: number,
  outH: number,
): HTMLCanvasElement {
  outW = Math.max(1, Math.round(outW));
  outH = Math.max(1, Math.round(outH));
  const key = `${sourceKey}|${outW}x${outH}|${crop.x},${crop.y},${crop.w},${crop.h}|${JSON.stringify(a)}`;
  const hit = cache.get(key);
  if (hit) return hit;
  const c = document.createElement('canvas');
  c.width = outW;
  c.height = outH;
  const ctx = c.getContext('2d', { willReadFrequently: needsPixelOps(a) })!;
  const sw = (source as HTMLImageElement).naturalWidth || source.width;
  const sh = (source as HTMLImageElement).naturalHeight || source.height;
  drawMedia(ctx, source, sw, sh, crop, a, outW, outH);
  if (needsPixelOps(a)) pixelOps(ctx, outW, outH, a);
  cache.set(key, c);
  cacheOrder.push(key);
  while (cacheOrder.length > CACHE_MAX) cache.delete(cacheOrder.shift()!);
  return c;
}

export function clearMediaCache() {
  cache.clear();
  cacheOrder.length = 0;
}

/**
 * New crop after the element box changes from oldW×oldH to w×h, keeping the
 * same source-pixels-per-design-pixel scale (so side handles reveal/hide image)
 * and shrinking uniformly when that would exceed the source.
 */
export function fitCrop(prev: Crop, sw: number, sh: number, oldW: number, oldH: number, w: number, h: number): Crop {
  const scale = (prev.w * sw) / Math.max(1, oldW);
  let cw = w * scale;
  let ch = h * scale;
  const k = Math.min(1, sw / cw, sh / ch);
  cw *= k;
  ch *= k;
  const nw = cw / sw;
  const nh = ch / sh;
  const cx = prev.x + prev.w / 2;
  const cy = prev.y + prev.h / 2;
  const nx = Math.max(0, Math.min(1 - nw, cx - nw / 2));
  const ny = Math.max(0, Math.min(1 - nh, cy - nh / 2));
  return { x: nx, y: ny, w: nw, h: nh };
}

/** Crop that fills a w×h box from a sw×sh source ("cover") */
export function coverCrop(sw: number, sh: number, w: number, h: number): Crop {
  const sa = sw / sh;
  const ba = w / h;
  if (sa > ba) {
    const cw = ba / sa;
    return { x: (1 - cw) / 2, y: 0, w: cw, h: 1 };
  }
  const ch = sa / ba;
  return { x: 0, y: (1 - ch) / 2, w: 1, h: ch };
}
