// Thumbnail strips for video clips on the timeline. Frames are grabbed once per
// asset from a private <video> (so playback on the canvas isn't disturbed) and
// packed into one sprite canvas.
import { getAsset, waitVideoReady } from '../../lib/assets';

export interface Filmstrip {
  /** frames side by side, each `fw`×`fh` */
  sprite: HTMLCanvasElement;
  fw: number;
  fh: number;
  /** source time of each frame */
  times: number[];
  duration: number;
}

const FRAME_H = 72;
const cache = new Map<string, Promise<Filmstrip | null>>();
const ready = new Map<string, Filmstrip>();
// one decode at a time keeps the UI responsive with several long clips
let queue: Promise<unknown> = Promise.resolve();

export function filmstripNow(assetId: string | null | undefined): Filmstrip | undefined {
  return assetId ? ready.get(assetId) : undefined;
}

export function getFilmstrip(assetId: string | null | undefined): Promise<Filmstrip | null> {
  if (!assetId) return Promise.resolve(null);
  let p = cache.get(assetId);
  if (!p) {
    p = queue.then(() => build(assetId)).catch(() => null);
    queue = p;
    cache.set(assetId, p);
  }
  return p;
}

function seek(v: HTMLVideoElement, t: number): Promise<void> {
  return new Promise((resolve) => {
    const done = () => {
      v.removeEventListener('seeked', done);
      clearTimeout(timer);
      resolve();
    };
    const timer = setTimeout(done, 2500);
    v.addEventListener('seeked', done);
    v.currentTime = t;
  });
}

async function build(assetId: string): Promise<Filmstrip | null> {
  const a = getAsset(assetId);
  if (!a || a.meta.kind !== 'video') return null;
  const v = document.createElement('video');
  v.muted = true;
  v.preload = 'auto';
  v.playsInline = true;
  v.src = a.url;
  try {
    await waitVideoReady(v);
    if (!v.videoWidth || !v.videoHeight) return null;
    const duration = isFinite(v.duration) && v.duration > 0 ? v.duration : a.meta.duration || 0;
    if (!(duration > 0)) return null;
    // about one frame per second for short clips, capped for long ones
    const n = Math.max(4, Math.min(60, Math.ceil(duration)));
    const fh = FRAME_H;
    const fw = Math.max(16, Math.round((fh * v.videoWidth) / v.videoHeight));
    const sprite = document.createElement('canvas');
    sprite.width = fw * n;
    sprite.height = fh;
    const ctx = sprite.getContext('2d')!;
    const times: number[] = [];
    for (let i = 0; i < n; i++) {
      const t = Math.min(duration - 0.05, ((i + 0.5) / n) * duration);
      await seek(v, Math.max(0, t));
      try {
        ctx.drawImage(v, i * fw, 0, fw, fh);
      } catch {
        /* frame not decodable */
      }
      times.push(t);
    }
    const strip = { sprite, fw, fh, times, duration };
    ready.set(assetId, strip);
    return strip;
  } finally {
    v.removeAttribute('src');
    v.load();
  }
}

/** Index of the frame nearest to source time t */
export function frameAt(strip: Filmstrip, t: number): number {
  const n = strip.times.length;
  const i = Math.round((t / strip.duration) * n - 0.5);
  return Math.max(0, Math.min(n - 1, i));
}
