// Shared helpers for every exporter: progress/abort plumbing, file naming,
// page selection, destination picking and writing (single file, folder or ZIP).
import JSZip from 'jszip';
import type { AudioTrack, Design, Page } from '../../types';
import { isDesktop, platform } from '../platform';
import { uid } from '../defaults';
import { pageStartTime } from '../../store/editor';

export type Progress = (fraction: number, label: string) => void;

export interface ExportFile {
  name: string;
  data: Uint8Array;
}

export class ExportCancelled extends Error {
  constructor() {
    super('Export cancelled');
    this.name = 'AbortError';
  }
}

export function throwIfAborted(signal?: AbortSignal) {
  if (signal?.aborted) throw new ExportCancelled();
}

export const isAbort = (e: unknown) => e instanceof ExportCancelled || (e as { name?: string } | null)?.name === 'AbortError';

/** Let the browser breathe (paint progress, handle input) between heavy steps. */
export const tick = () => new Promise<void>((r) => setTimeout(r, 0));

export const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, Math.max(0, ms)));

/** A file-system-safe base name (no extension) */
export function safeFileName(n: string): string {
  const s = (n || '')
    // eslint-disable-next-line no-control-regex
    .replace(/[\u0000-\u001f\\/:*?"<>|]+/g, '-')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/[. ]+$/, '')
    .slice(0, 120);
  return s || 'Untitled design';
}

export function blobBytes(b: Blob): Promise<Uint8Array> {
  return b.arrayBuffer().then((a) => new Uint8Array(a));
}

export function canvasBlob(c: HTMLCanvasElement, mime: string, quality?: number): Promise<Blob> {
  return new Promise((resolve, reject) =>
    c.toBlob((b) => (b ? resolve(b) : reject(new Error('The image could not be encoded. Try a smaller size.'))), mime, quality),
  );
}

export async function canvasBytes(c: HTMLCanvasElement, mime: string, quality?: number): Promise<Uint8Array> {
  return blobBytes(await canvasBlob(c, mime, quality));
}

/** Uint8Array -> base64 without blowing the call stack on big inputs */
export function bytesToBase64(bytes: Uint8Array): string {
  let s = '';
  const CH = 0x8000;
  for (let i = 0; i < bytes.length; i += CH) s += String.fromCharCode.apply(null, bytes.subarray(i, i + CH) as unknown as number[]);
  return btoa(s);
}

/** Free a canvas' backing store right away (big exports churn through many). */
export function releaseCanvas(c: HTMLCanvasElement | null | undefined) {
  if (!c) return;
  c.width = 0;
  c.height = 0;
}

/**
 * Return a canvas of exactly w×h. Canvas sizes truncate fractional pixels, so a
 * render at a non-integer pixel ratio can come out a pixel short.
 * `background` paints under the content (for formats without alpha).
 */
export function exactCanvas(src: HTMLCanvasElement, w: number, h: number, background?: string): HTMLCanvasElement {
  if (src.width === w && src.height === h && !background) return src;
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const ctx = c.getContext('2d')!;
  if (background) {
    ctx.fillStyle = background;
    ctx.fillRect(0, 0, w, h);
  }
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(src, 0, 0, w, h);
  if (c !== src) releaseCanvas(src);
  return c;
}

// ---------------------------------------------------------------------------
// Pages
// ---------------------------------------------------------------------------
export function pagesByIds(design: Design, ids: string[]): Page[] {
  const set = new Set(ids);
  return design.pages.filter((p) => set.has(p.id));
}

/** 1-based page number in the design */
export function pageNumber(design: Design, pageId: string): number {
  return design.pages.findIndex((p) => p.id === pageId) + 1;
}

export function visiblePageIds(design: Design): string[] {
  const v = design.pages.filter((p) => !p.hidden).map((p) => p.id);
  return v.length ? v : design.pages.map((p) => p.id);
}

/**
 * A design that contains only the chosen pages (shown, in design order). Audio
 * tracks are cut and moved so each page keeps the sound that played under it.
 * When every visible page is chosen the original design is returned untouched.
 */
export function subDesign(design: Design, pageIds: string[]): Design {
  const pages = pagesByIds(design, pageIds);
  const visible = design.pages.filter((p) => !p.hidden);
  const same = pages.length === visible.length && pages.every((p, i) => p === visible[i]);
  if (same) return design;

  const audio: AudioTrack[] = [];
  let at = 0;
  for (const page of pages) {
    // where the page sits on the original timeline (hidden pages take no time)
    const s = page.hidden ? -1 : pageStartTime(design, page.id);
    const e = s + page.duration;
    if (s >= 0) {
      for (const t of design.audio) {
        if (t.muted) continue;
        const len = t.trimEnd !== null ? t.trimEnd - t.trimStart : Infinity;
        const ts = t.start;
        const te = t.start + len;
        const os = Math.max(s, ts);
        const oe = Math.min(e, te);
        if (oe - os < 0.01) continue;
        const into = os - ts;
        audio.push({
          ...t,
          id: uid(),
          start: at + (os - s),
          trimStart: t.trimStart + into,
          trimEnd: t.trimStart + into + (oe - os),
          fadeIn: os <= ts + 0.001 ? t.fadeIn : 0,
          fadeOut: oe >= te - 0.001 ? t.fadeOut : 0,
        });
      }
    }
    at += page.duration;
  }
  return {
    ...design,
    id: uid(12),
    pages: pages.map((p) => (p.hidden ? { ...p, hidden: false } : p)),
    audio,
  };
}

// ---------------------------------------------------------------------------
// Destinations
// ---------------------------------------------------------------------------
export type Destination = { kind: 'file'; path: string } | { kind: 'folder'; dir: string };

/**
 * Ask where to save. Multi-file exports go to a folder on desktop, or one ZIP
 * (always in the browser). Returns null when the person cancels the dialog.
 */
export async function chooseDestination(opts: {
  base: string;
  ext: string;
  typeName: string;
  multi: boolean;
  zip: boolean;
}): Promise<Destination | null> {
  if (opts.multi && !opts.zip && isDesktop) {
    const dir = await platform.pickFolder();
    return dir ? { kind: 'folder', dir } : null;
  }
  const ext = opts.multi ? 'zip' : opts.ext;
  const path = await platform.pickSavePath({
    defaultName: `${opts.base}.${ext}`,
    filters: [{ name: opts.multi ? 'ZIP archive' : opts.typeName, extensions: [ext] }],
    title: 'Export',
  });
  return path ? { kind: 'file', path } : null;
}

function joinPath(dir: string, name: string) {
  const sep = dir.includes('\\') && !dir.includes('/') ? '\\' : '/';
  return dir.replace(/[\\/]+$/, '') + sep + name;
}

/**
 * Write exported files to the destination. Several files going to a single file
 * path are bundled into a ZIP. Returns the path to reveal afterwards.
 */
export async function writeFiles(dest: Destination, files: ExportFile[], opts: { compress?: boolean } = {}): Promise<string> {
  if (!files.length) throw new Error('Nothing was exported.');
  if (dest.kind === 'folder') {
    let first = '';
    for (const f of files) {
      const p = await platform.writeFile(joinPath(dest.dir, f.name), f.data);
      first ||= p;
    }
    return first;
  }
  if (files.length === 1 && !/\.zip$/i.test(dest.path)) {
    return platform.writeFile(dest.path, files[0].data);
  }
  const zip = new JSZip();
  for (const f of files) zip.file(f.name, f.data, { compression: opts.compress ? 'DEFLATE' : 'STORE' });
  const data = await zip.generateAsync({ type: 'uint8array', compression: opts.compress ? 'DEFLATE' : 'STORE', compressionOptions: { level: 6 } });
  return platform.writeFile(dest.path, data);
}

/** File names for page exports: name.ext for one page, name-3.ext per page otherwise */
export function pageFileName(base: string, design: Design, pageId: string, ext: string, multi: boolean): string {
  return multi ? `${base}-${pageNumber(design, pageId)}.${ext}` : `${base}.${ext}`;
}
