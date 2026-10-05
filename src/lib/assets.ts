import type { AssetKind, AssetMeta } from '../types';
import { uid } from './defaults';

// ---------------------------------------------------------------------------
// Runtime asset registry. Design JSON only stores AssetMeta; the binary data lives
// here as Blobs + object URLs, and is written into the .kamva zip on save.
// ---------------------------------------------------------------------------

export interface RuntimeAsset {
  meta: AssetMeta;
  blob: Blob;
  url: string;
  image?: HTMLImageElement;
  imagePromise?: Promise<HTMLImageElement>;
  audioBuffer?: AudioBuffer | null;
  audioPromise?: Promise<AudioBuffer | null>;
  text?: string;
}

const registry = new Map<string, RuntimeAsset>();
const listeners = new Set<() => void>();
let version = 0;

export const assetVersion = () => version;

export function onAssetsChanged(cb: () => void) {
  listeners.add(cb);
  return () => listeners.delete(cb);
}

function emit() {
  version++;
  listeners.forEach((l) => l());
}

export function kindFromMime(mime: string, name = ''): AssetKind | null {
  const ext = name.toLowerCase().split('.').pop() || '';
  if (mime === 'image/svg+xml' || ext === 'svg') return 'svg';
  if (mime.startsWith('image/') || ['png', 'jpg', 'jpeg', 'webp', 'gif', 'bmp', 'avif'].includes(ext)) return 'image';
  if (mime.startsWith('video/') || ['mp4', 'webm', 'mov', 'm4v', 'mkv', 'avi'].includes(ext)) return 'video';
  if (mime.startsWith('audio/') || ['mp3', 'wav', 'ogg', 'm4a', 'aac', 'flac', 'opus'].includes(ext)) return 'audio';
  if (mime.startsWith('font/') || ['ttf', 'otf', 'woff', 'woff2'].includes(ext)) return 'font';
  return null;
}

export function getAsset(id: string | null | undefined): RuntimeAsset | undefined {
  if (!id) return undefined;
  return registry.get(id);
}

export function hasAsset(id: string) {
  return registry.has(id);
}

export function allAssets() {
  return [...registry.values()];
}

function loadImageEl(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.decoding = 'async';
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('Could not load image'));
    img.src = url;
  });
}

function probeMedia(url: string, kind: 'video' | 'audio'): Promise<{ width?: number; height?: number; duration: number }> {
  return new Promise((resolve, reject) => {
    const el = document.createElement(kind);
    el.preload = 'metadata';
    el.muted = true;
    el.onloadedmetadata = () => {
      const v = el as HTMLVideoElement;
      resolve({ width: v.videoWidth || undefined, height: v.videoHeight || undefined, duration: isFinite(el.duration) ? el.duration : 0 });
    };
    el.onerror = () => reject(new Error(`This ${kind} format is not supported`));
    el.src = url;
  });
}

function svgSize(text: string): { width: number; height: number } {
  const doc = new DOMParser().parseFromString(text, 'image/svg+xml');
  const svg = doc.documentElement;
  const vb = svg.getAttribute('viewBox')?.split(/[\s,]+/).map(Number);
  const w = parseFloat(svg.getAttribute('width') || '') || (vb ? vb[2] : 0) || 512;
  const h = parseFloat(svg.getAttribute('height') || '') || (vb ? vb[3] : 0) || 512;
  return { width: w, height: h };
}

const fontFamilies = new Map<string, string>(); // assetId -> family

async function registerFont(asset: RuntimeAsset) {
  const base = asset.meta.fontFamily || asset.meta.name.replace(/\.[^.]+$/, '').replace(/[-_]+/g, ' ').trim();
  const family = base || 'Custom Font';
  const buf = await asset.blob.arrayBuffer();
  const face = new FontFace(family, buf);
  await face.load();
  document.fonts.add(face);
  asset.meta.fontFamily = family;
  fontFamilies.set(asset.meta.id, family);
  return family;
}

export function customFontFamilies(): string[] {
  return [...new Set(fontFamilies.values())];
}

/** Register a blob as an asset. If `id` is given (when loading a project) it is reused. */
export async function addAsset(blob: Blob, name: string, opts: { id?: string; meta?: Partial<AssetMeta>; silent?: boolean } = {}): Promise<AssetMeta> {
  const kind = (opts.meta?.kind as AssetKind) || kindFromMime(blob.type, name);
  if (!kind) throw new Error(`Unsupported file type: ${name}`);
  const id = opts.id || uid(12);
  if (registry.has(id)) return registry.get(id)!.meta;
  const typed = blob.type ? blob : new Blob([blob], { type: guessMime(name, kind) });
  const url = URL.createObjectURL(typed);
  const meta: AssetMeta = { id, kind, name, mime: typed.type, size: typed.size, ...(opts.meta || {}) };
  const ra: RuntimeAsset = { meta, blob: typed, url };
  try {
    if (kind === 'image') {
      const img = await loadImageEl(url);
      ra.image = img;
      ra.imagePromise = Promise.resolve(img);
      meta.width = img.naturalWidth;
      meta.height = img.naturalHeight;
    } else if (kind === 'svg') {
      ra.text = await typed.text();
      const s = svgSize(ra.text);
      meta.width = s.width;
      meta.height = s.height;
      const img = await loadImageEl(url).catch(() => undefined);
      if (img) {
        ra.image = img;
        ra.imagePromise = Promise.resolve(img);
      }
    } else if (kind === 'video' || kind === 'audio') {
      const p = await probeMedia(url, kind);
      meta.width = p.width;
      meta.height = p.height;
      meta.duration = p.duration;
    } else if (kind === 'font') {
      registry.set(id, ra);
      await registerFont(ra);
    }
  } catch (e) {
    URL.revokeObjectURL(url);
    registry.delete(id);
    throw e;
  }
  registry.set(id, ra);
  if (!opts.silent) emit();
  return meta;
}

function guessMime(name: string, kind: AssetKind): string {
  const ext = name.toLowerCase().split('.').pop() || '';
  const map: Record<string, string> = {
    png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', webp: 'image/webp', gif: 'image/gif', svg: 'image/svg+xml',
    mp4: 'video/mp4', webm: 'video/webm', mov: 'video/quicktime', mp3: 'audio/mpeg', wav: 'audio/wav', ogg: 'audio/ogg',
    m4a: 'audio/mp4', ttf: 'font/ttf', otf: 'font/otf', woff: 'font/woff', woff2: 'font/woff2',
  };
  return map[ext] || (kind === 'image' ? 'image/png' : 'application/octet-stream');
}

export function removeAsset(id: string) {
  const a = registry.get(id);
  if (!a) return;
  URL.revokeObjectURL(a.url);
  registry.delete(id);
  emit();
}

export function clearAssets(keep: Set<string> = new Set()) {
  // detach video players first so they don't try to reload revoked URLs
  for (const [key, v] of videoEls) {
    if (keep.has(v.dataset.asset || '')) continue;
    v.pause();
    v.removeAttribute('src');
    v.load();
    videoEls.delete(key);
  }
  for (const [id, a] of registry) {
    if (keep.has(id)) continue;
    URL.revokeObjectURL(a.url);
    registry.delete(id);
  }
  emit();
}

export function getImage(id: string | null | undefined): HTMLImageElement | undefined {
  return getAsset(id)?.image;
}

export async function getImageAsync(id: string): Promise<HTMLImageElement | undefined> {
  const a = getAsset(id);
  if (!a) return undefined;
  if (a.image) return a.image;
  a.imagePromise ||= loadImageEl(a.url).then((img) => (a.image = img));
  return a.imagePromise;
}

let audioCtx: AudioContext | null = null;
export function sharedAudioContext(): AudioContext {
  audioCtx ||= new AudioContext();
  return audioCtx;
}

/** Decode the audio track of an audio or video asset (null if it has none) */
export function getAudioBuffer(id: string): Promise<AudioBuffer | null> {
  const a = getAsset(id);
  if (!a) return Promise.resolve(null);
  if (a.audioBuffer !== undefined) return Promise.resolve(a.audioBuffer);
  a.audioPromise ||= a.blob
    .arrayBuffer()
    .then((buf) => sharedAudioContext().decodeAudioData(buf))
    .then((b) => (a.audioBuffer = b))
    .catch(() => (a.audioBuffer = null));
  return a.audioPromise;
}

/** Peaks for waveform drawing */
const peaksCache = new Map<string, Float32Array>();
export async function getPeaks(id: string, buckets = 400): Promise<Float32Array | null> {
  const key = id + ':' + buckets;
  if (peaksCache.has(key)) return peaksCache.get(key)!;
  const buf = await getAudioBuffer(id);
  if (!buf) return null;
  const data = buf.getChannelData(0);
  const out = new Float32Array(buckets);
  const step = Math.max(1, Math.floor(data.length / buckets));
  for (let i = 0; i < buckets; i++) {
    let max = 0;
    const s = i * step;
    for (let j = 0; j < step; j += 16) {
      const v = Math.abs(data[s + j] || 0);
      if (v > max) max = v;
    }
    out[i] = max;
  }
  peaksCache.set(key, out);
  return out;
}

// --- Video elements -------------------------------------------------------
// Each video element on the canvas gets its own <video> so different trims can
// play independently.
const videoEls = new Map<string, HTMLVideoElement>();

export function videoFor(key: string, assetId: string): HTMLVideoElement | undefined {
  const a = getAsset(assetId);
  if (!a) return undefined;
  let v = videoEls.get(key);
  if (v && v.dataset.asset !== assetId) {
    v.pause();
    v.removeAttribute('src');
    videoEls.delete(key);
    v = undefined;
  }
  if (!v) {
    v = document.createElement('video');
    v.dataset.asset = assetId;
    v.preload = 'auto';
    v.playsInline = true;
    v.muted = true;
    v.crossOrigin = 'anonymous';
    v.src = a.url;
    videoEls.set(key, v);
  }
  return v;
}

export function allVideoEls() {
  return videoEls;
}

export function seekVideo(v: HTMLVideoElement, t: number): Promise<void> {
  return new Promise((resolve) => {
    const target = Math.max(0, Math.min(t, (v.duration || t) - 0.001));
    if (Math.abs(v.currentTime - target) < 0.0005 && v.readyState >= 2) return resolve();
    const done = () => {
      v.removeEventListener('seeked', done);
      clearTimeout(timer);
      resolve();
    };
    const timer = setTimeout(done, 3000);
    v.addEventListener('seeked', done);
    v.currentTime = target;
  });
}

export function waitVideoReady(v: HTMLVideoElement): Promise<void> {
  if (v.readyState >= 2) return Promise.resolve();
  return new Promise((resolve) => {
    const done = () => {
      v.removeEventListener('loadeddata', done);
      resolve();
    };
    v.addEventListener('loadeddata', done);
    setTimeout(done, 5000);
  });
}

export async function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result as string);
    r.onerror = reject;
    r.readAsDataURL(blob);
  });
}

export function dataUrlToBlob(dataUrl: string): Blob {
  const [head, body] = dataUrl.split(',');
  const mime = head.match(/data:([^;]+)/)?.[1] || 'application/octet-stream';
  const isB64 = head.includes(';base64');
  if (!isB64) return new Blob([decodeURIComponent(body)], { type: mime });
  const bin = atob(body);
  const arr = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
  return new Blob([arr], { type: mime });
}

export function extForMime(mime: string, fallbackName = ''): string {
  const fromName = fallbackName.split('.').pop();
  const map: Record<string, string> = {
    'image/png': 'png', 'image/jpeg': 'jpg', 'image/webp': 'webp', 'image/gif': 'gif', 'image/svg+xml': 'svg',
    'video/mp4': 'mp4', 'video/webm': 'webm', 'video/quicktime': 'mov', 'audio/mpeg': 'mp3', 'audio/wav': 'wav',
    'audio/ogg': 'ogg', 'audio/mp4': 'm4a', 'audio/webm': 'webm', 'font/ttf': 'ttf', 'font/otf': 'otf', 'font/woff': 'woff', 'font/woff2': 'woff2',
  };
  return map[mime] || (fromName && fromName.length <= 5 ? fromName : 'bin');
}
