import type { Design, DesignElement, Template } from '../types';
import { useEditor, findElement, totalDuration } from '../store/editor';
import { useUI, usePrefs } from '../store/ui';
import { addAsset, getAsset, kindFromMime, clearAssets, blobToDataUrl } from './assets';
import { makeAudioTrack, makeImage, makeSvg, makeVideo, newDesign, newPage, normalizeDesign, uid, clonePage } from './defaults';
import { loadProject, saveProject, usedAssetIds, registerTemplateAssets, designToTemplate } from './project';
import { platform, FILTERS, OpenedFile, isDesktop } from './platform';
import { pageThumbnail, canvasToBlob } from './render/renderPage';
import { idb, UploadRecord } from './idb';
import { coverCrop } from './render/media';
import { svgColors } from './render/svgUtil';

const toast = (t: string, k: 'info' | 'success' | 'error' | 'progress' = 'info', ms?: number) => useUI.getState().toast(t, k, ms);

export function errorMessage(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}

// ---------------------------------------------------------------------------
// Creating / opening / closing
// ---------------------------------------------------------------------------
export function startDesign(d: Design, filePath: string | null = null) {
  useEditor.getState().setDesign(d, filePath);
  useUI.setState({
    screen: 'editor',
    fit: true,
    playing: false,
    time: 0,
    panel: d.pages.some((p) => p.elements.length) ? 'elements' : 'templates',
    timelineOpen: d.pages.length > 1 && (d.audio.length > 0 || d.pages.some((p) => p.elements.some((e) => e.type === 'video'))),
  });
}

export function createDesign(width: number, height: number, name?: string, unit: Design['unit'] = 'px', category?: string) {
  const d = newDesign(width, height, name || 'Untitled design', unit, category);
  d.fps = usePrefs.getState().fpsDefault;
  d.pages[0].duration = usePrefs.getState().pageDurationDefault;
  startDesign(d);
}

export async function createFromTemplate(t: Template) {
  await registerTemplateAssets(t);
  const d = newDesign(t.width, t.height, t.name);
  d.pages = t.pages.map((p) => clonePage(p));
  d.audio = structuredClone(t.audio || []);
  for (const id of usedAssetIds(d)) {
    const a = getAsset(id);
    if (a) d.assets[id] = a.meta;
  }
  startDesign(normalizeDesign(d));
}

/** Apply a template's pages into the current design (scaled to fit) */
export async function applyTemplate(t: Template, mode: 'replace' | 'add') {
  const st = useEditor.getState();
  const d = st.design;
  if (!d) return createFromTemplate(t);
  await registerTemplateAssets(t);
  const sx = d.width / t.width;
  const sy = d.height / t.height;
  const s = Math.min(sx, sy);
  const ox = (d.width - t.width * s) / 2;
  const oy = (d.height - t.height * s) / 2;
  const pages = t.pages.map((p) => {
    const c = clonePage(p);
    c.elements = c.elements.map((e) => scaleElement(e, s, ox, oy));
    return c;
  });
  st.update((dd) => {
    for (const id of Object.keys(t.assets || {})) {
      const a = getAsset(id);
      if (a) dd.assets[id] = a.meta;
    }
    const idx = dd.pages.findIndex((p) => p.id === st.activePageId);
    const cur = dd.pages[idx];
    if (mode === 'replace' && cur && cur.elements.length === 0) {
      dd.pages.splice(idx, 1, ...pages);
    } else {
      dd.pages.splice(idx + 1, 0, ...pages);
    }
  });
  useEditor.getState().setActivePage(pages[0].id);
}

export function scaleElement<T extends DesignElement>(e: T, s: number, ox = 0, oy = 0): T {
  const c = structuredClone(e) as any;
  c.x = e.x * s + ox;
  c.y = e.y * s + oy;
  c.width = e.width * s;
  c.height = e.height * s;
  if (c.type === 'text') {
    c.fontSize *= s;
    c.letterSpacing *= s;
    if (c.effect) {
      c.effect.size *= s;
      c.effect.offset *= s;
    }
  }
  if ('strokeWidth' in c && typeof c.strokeWidth === 'number' && c.type !== 'draw') c.strokeWidth *= s;
  if (c.type === 'draw') {
    c.strokeWidth *= s;
    c.baseWidth = c.width;
    c.baseHeight = c.height;
  }
  if ('cornerRadius' in c) c.cornerRadius *= s;
  if ('borderWidth' in c) c.borderWidth *= s;
  if (c.shadow) {
    c.shadow.blur *= s;
    c.shadow.offsetX *= s;
    c.shadow.offsetY *= s;
  }
  if (c.type === 'shape' && c.textStyle?.fontSize) c.textStyle.fontSize *= s;
  if (c.type === 'svg' && c.meta?.table) c.meta.table.fontSize *= s;
  return c;
}

/** Resize the design; optionally scale the content to fit */
export function resizeDesign(width: number, height: number, unit: Design['unit'], scaleContent: boolean) {
  const st = useEditor.getState();
  const d = st.design;
  if (!d) return;
  const s = Math.min(width / d.width, height / d.height);
  const ox = (width - d.width * s) / 2;
  const oy = (height - d.height * s) / 2;
  st.update((dd) => {
    dd.width = Math.round(width);
    dd.height = Math.round(height);
    dd.unit = unit;
    if (scaleContent) {
      // scale from the non-draft originals: structuredClone can't clone immer drafts
      dd.pages.forEach((p, i) => (p.elements = d.pages[i].elements.map((e) => scaleElement(e, s, ox, oy))));
    }
  });
  useUI.setState({ fit: true });
}

export async function openDesignData(data: Uint8Array, filePath: string | null) {
  const keep = new Set<string>();
  clearAssets(keep);
  const d = await loadProject(data);
  startDesign(d, filePath);
}

export async function openDesignDialog() {
  if (!(await confirmDiscard())) return;
  const files = await platform.openFiles({ filters: [...FILTERS.project, ...FILTERS.pdf], title: 'Open design' });
  const f = files[0];
  if (!f) return;
  try {
    if (f.name.toLowerCase().endsWith('.pdf')) await importPdf(f, true);
    else await openDesignData(f.data, isDesktop ? f.path : null);
  } catch (e) {
    toast(`Couldn't open ${f.name}: ${errorMessage(e)}`, 'error', 6000);
  }
}

export async function openDesignPath(p: string) {
  try {
    const f = await platform.readFile(p);
    await openDesignData(f.data, p);
  } catch (e) {
    toast(`Couldn't open ${p}: ${errorMessage(e)}`, 'error', 6000);
  }
}

export async function openFromLibrary(id: string) {
  try {
    const data = await platform.libraryLoad(id);
    await openDesignData(data, null);
  } catch (e) {
    toast(`Couldn't open this design: ${errorMessage(e)}`, 'error');
  }
}

/** Ask before discarding unsaved changes. Returns true if OK to continue. */
export async function confirmDiscard(): Promise<boolean> {
  const { dirty, design } = useEditor.getState();
  if (!design || !dirty) return true;
  // Library autosave keeps a copy, so we save there silently rather than nag.
  await autosave(true);
  return true;
}

export async function goHome() {
  await autosave(true);
  useUI.setState({ screen: 'home', playing: false, presenting: false });
  useEditor.getState().setDesign(null);
}

// ---------------------------------------------------------------------------
// Saving
// ---------------------------------------------------------------------------
function safeName(n: string) {
  return (n || 'Untitled design').replace(/[\\/:*?"<>|]+/g, '-').trim() || 'design';
}

async function designThumbBlob(d: Design): Promise<Blob | null> {
  try {
    const c = await pageThumbnail(d, d.pages[0], 480);
    return await canvasToBlob(c, 'image/png');
  } catch {
    return null;
  }
}

export async function saveDesign(saveAs = false): Promise<boolean> {
  const st = useEditor.getState();
  const d = st.design;
  if (!d) return false;
  try {
    const thumb = await designThumbBlob(d);
    const data = await saveProject(d, { thumbnail: thumb });
    let path = st.filePath;
    if (!path || saveAs || !isDesktop) {
      path = await platform.saveFile({ defaultName: safeName(d.name) + '.kamva', filters: FILTERS.project, data, title: 'Save design' });
      if (!path) return false;
    } else {
      await platform.writeFile(path, data);
    }
    useEditor.setState({ filePath: isDesktop ? path : null, dirty: false });
    toast('Saved', 'success', 1600);
    void autosave(true);
    return true;
  } catch (e) {
    toast(`Couldn't save: ${errorMessage(e)}`, 'error', 6000);
    return false;
  }
}

let autosaving = false;
let lastAutosaved = 0;
/** Save a copy of the current design into the app's design library (for Home + recovery). */
export async function autosave(force = false) {
  const { design } = useEditor.getState();
  if (!design || autosaving) return;
  if (!force && design.updatedAt <= lastAutosaved) return;
  if (!design.pages.some((p) => p.elements.length) && !design.pages.some((p) => p.background.assetId) && design.pages.length === 1) {
    const f = design.pages[0].background.fill;
    if (f.type === 'solid' && f.color.toLowerCase() === '#ffffff') return; // nothing worth keeping
  }
  autosaving = true;
  try {
    const thumb = await designThumbBlob(design);
    const data = await saveProject(design, { thumbnail: thumb });
    const thumbArr = thumb ? new Uint8Array(await thumb.arrayBuffer()) : null;
    await platform.librarySave(design.id, data, thumbArr, {
      name: design.name,
      width: design.width,
      height: design.height,
      unit: design.unit,
      pages: design.pages.length,
      updatedAt: design.updatedAt,
      createdAt: design.createdAt,
      category: design.category,
      duration: totalDuration(design),
    });
    lastAutosaved = design.updatedAt;
  } catch (e) {
    console.warn('autosave failed', e);
  } finally {
    autosaving = false;
  }
}

export async function saveAsTemplate(name: string, category = 'My templates') {
  const d = useEditor.getState().design;
  if (!d) return;
  const thumbCanvas = await pageThumbnail(d, d.pages[0], 360);
  const t = await designToTemplate(d, name, category, thumbCanvas.toDataURL('image/jpeg', 0.85));
  await idb.put('templates', t);
  toast(`Saved “${name}” to your templates`, 'success');
}

// ---------------------------------------------------------------------------
// Importing
// ---------------------------------------------------------------------------
const BROWSER_PLAYABLE_VIDEO = ['video/mp4', 'video/webm'];
const BROWSER_PLAYABLE_AUDIO = ['audio/mpeg', 'audio/wav', 'audio/ogg', 'audio/mp4', 'audio/aac', 'audio/webm', 'audio/flac', 'audio/opus', 'audio/x-wav'];

function centerFit(sw: number, sh: number, frac = 0.6) {
  const d = useEditor.getState().design!;
  const s = Math.min((d.width * frac) / sw, (d.height * frac) / sh, 1e9);
  const w = sw * s;
  const h = sh * s;
  return { x: (d.width - w) / 2, y: (d.height - h) / 2, w, h };
}

function registerInDesign(metaId: string) {
  const a = getAsset(metaId);
  if (!a) return;
  useEditor.getState().update(
    (d) => {
      d.assets[metaId] = a.meta;
    },
    { history: false },
  );
}

async function thumbFor(blob: Blob, kind: string): Promise<string | undefined> {
  try {
    if (kind === 'image' || kind === 'svg') {
      const url = URL.createObjectURL(blob);
      const img = new Image();
      img.src = url;
      await img.decode();
      const c = document.createElement('canvas');
      const s = 240 / Math.max(img.naturalWidth || 240, img.naturalHeight || 240);
      c.width = Math.max(1, (img.naturalWidth || 240) * s);
      c.height = Math.max(1, (img.naturalHeight || 240) * s);
      c.getContext('2d')!.drawImage(img, 0, 0, c.width, c.height);
      URL.revokeObjectURL(url);
      return c.toDataURL('image/webp', 0.8);
    }
    if (kind === 'video') {
      const url = URL.createObjectURL(blob);
      const v = document.createElement('video');
      v.muted = true;
      v.src = url;
      await new Promise((r) => {
        v.onloadeddata = r;
        v.onerror = r;
      });
      v.currentTime = Math.min(1, (v.duration || 2) / 3);
      await new Promise((r) => {
        v.onseeked = r;
        setTimeout(r, 1500);
      });
      const c = document.createElement('canvas');
      const s = 240 / Math.max(v.videoWidth || 240, v.videoHeight || 240);
      c.width = Math.max(1, v.videoWidth * s);
      c.height = Math.max(1, v.videoHeight * s);
      c.getContext('2d')!.drawImage(v, 0, 0, c.width, c.height);
      URL.revokeObjectURL(url);
      return c.toDataURL('image/webp', 0.8);
    }
  } catch {
    /* no thumb */
  }
  return undefined;
}

/** Save an asset into the persistent uploads library */
async function addToUploads(id: string) {
  const a = getAsset(id);
  if (!a) return;
  const rec: UploadRecord = {
    id,
    name: a.meta.name,
    kind: a.meta.kind as UploadRecord['kind'],
    mime: a.blob.type,
    blob: a.blob,
    width: a.meta.width,
    height: a.meta.height,
    duration: a.meta.duration,
    created: Date.now(),
    thumb: await thumbFor(a.blob, a.meta.kind),
  };
  await idb.put('uploads', rec).catch(() => undefined);
  window.dispatchEvent(new Event('kamva-uploads-changed'));
}

/** Make an upload record available as an asset in the current session */
export async function ensureUploadAsset(rec: UploadRecord) {
  if (!getAsset(rec.id)) await addAsset(rec.blob, rec.name, { id: rec.id, meta: { kind: rec.kind } });
  registerInDesign(rec.id);
  return getAsset(rec.id)!;
}

/** Add an asset to the canvas as the right kind of element */
export async function placeAsset(id: string, at?: { x: number; y: number }) {
  const a = getAsset(id);
  const st = useEditor.getState();
  const d = st.design;
  if (!a || !d) return;
  registerInDesign(id);
  const { kind, width = 400, height = 300, duration = 0 } = a.meta;
  const place = (w: number, h: number) => {
    if (!at) return centerFit(w, h);
    const f = centerFit(w, h);
    return { ...f, x: at.x - f.w / 2, y: at.y - f.h / 2 };
  };
  if (kind === 'image') {
    const p = place(width, height);
    st.addElements([makeImage(id, p.x, p.y, p.w, p.h, { name: a.meta.name })]);
  } else if (kind === 'svg') {
    const p = place(width, height);
    const text = a.text || (await a.blob.text());
    const el = makeSvg(text, p.x, p.y, p.w, p.h, { name: a.meta.name, meta: { kind: 'svg' } });
    st.addElements([el]);
    void svgColors;
  } else if (kind === 'video') {
    // Videos fill the page like Canva and set the page length
    const page = d.pages.find((pp) => pp.id === st.activePageId)!;
    const fillPage = page.elements.length === 0;
    const crop = fillPage ? coverCrop(width, height, d.width, d.height) : { x: 0, y: 0, w: 1, h: 1 };
    const p = fillPage ? { x: 0, y: 0, w: d.width, h: d.height } : place(width, height);
    st.addElements([makeVideo(id, p.x, p.y, p.w, p.h, { crop, name: a.meta.name })]);
    if (duration > 0 && (fillPage || duration > page.duration)) {
      st.updatePage(page.id, (pg) => {
        pg.duration = Math.round(duration * 10) / 10;
      });
    }
    useUI.setState({ timelineOpen: true });
  } else if (kind === 'audio') {
    const lanes = d.audio.map((t) => t.lane);
    const lane = lanes.length ? Math.max(...lanes) + 1 : 0;
    st.addAudio(makeAudioTrack(id, a.meta.name, 0, d.audio.length ? lane : 0));
    useUI.setState({ timelineOpen: true });
    toast(`Added “${a.meta.name}” to the timeline`, 'success');
  } else if (kind === 'font') {
    toast(`Font “${a.meta.fontFamily}” is ready to use`, 'success');
  }
}

/** Add files (from dialog, drag & drop or paste). */
export async function importFiles(files: (OpenedFile | File)[], opts: { place?: boolean; at?: { x: number; y: number } } = {}) {
  const place = opts.place !== false;
  for (const f of files) {
    const name = f.name;
    const isFile = f instanceof File;
    const mime = isFile ? f.type : f.mime;
    const ext = name.toLowerCase().split('.').pop() || '';
    try {
      if (ext === 'kamva') {
        const data = isFile ? new Uint8Array(await f.arrayBuffer()) : f.data;
        await openDesignData(data, !isFile && isDesktop ? f.path : null);
        continue;
      }
      if (ext === 'pdf') {
        await importPdf(isFile ? { name, data: new Uint8Array(await f.arrayBuffer()) } : f, !useEditor.getState().design);
        continue;
      }
      let blob: Blob = isFile ? f : new Blob([f.data as BlobPart], { type: mime });
      let kind = kindFromMime(mime, name);
      if (!kind) throw new Error('This file type is not supported');
      let assetName = name;
      // Convert media the engine can't play natively (mov, mkv, avi, flac…)
      if ((kind === 'video' && !BROWSER_PLAYABLE_VIDEO.includes(blob.type)) || (kind === 'audio' && blob.type && !BROWSER_PLAYABLE_AUDIO.includes(blob.type))) {
        const probe = document.createElement(kind);
        const playable = probe.canPlayType(blob.type);
        if (!playable && isDesktop) {
          const tid = toast(`Converting ${name}…`, 'progress');
          try {
            const out = await platform.transcode(new Uint8Array(await blob.arrayBuffer()), ext, kind === 'video' ? 'video' : 'audio');
            blob = new Blob([out as BlobPart], { type: kind === 'video' ? 'video/mp4' : 'audio/mp4' });
            assetName = name.replace(/\.[^.]+$/, kind === 'video' ? '.mp4' : '.m4a');
          } finally {
            useUI.getState().dismissToast(tid);
          }
        }
      }
      const meta = await addAsset(blob, assetName);
      kind = meta.kind;
      registerInDesign(meta.id);
      void addToUploads(meta.id);
      if (place && useEditor.getState().design && kind !== 'font') await placeAsset(meta.id, opts.at);
      if (kind === 'font') toast(`Font “${meta.fontFamily}” added`, 'success');
    } catch (e) {
      toast(`Couldn't import ${name}: ${errorMessage(e)}`, 'error', 6000);
    }
  }
}

export async function importDialog(kind: 'all' | 'images' | 'video' | 'audio' | 'fonts' = 'all', place = true) {
  const filters = kind === 'all' ? FILTERS.all : FILTERS[kind];
  const files = await platform.openFiles({ filters, multi: true, title: 'Import files' });
  if (files.length) await importFiles(files, { place });
}

export async function importFontFiles() {
  const files = await platform.openFiles({ filters: FILTERS.fonts, multi: true, title: 'Upload fonts' });
  for (const f of files) {
    try {
      const meta = await addAsset(new Blob([f.data as BlobPart], { type: f.mime }), f.name);
      registerInDesign(meta.id);
      void addToUploads(meta.id);
      toast(`Font “${meta.fontFamily}” added`, 'success');
    } catch (e) {
      toast(`Couldn't load ${f.name}: ${errorMessage(e)}`, 'error');
    }
  }
}

/** Restore uploaded fonts from the library at startup so they're always available */
export async function restoreLibraryFonts() {
  try {
    const all = await idb.all<UploadRecord>('uploads');
    for (const r of all.filter((x) => x.kind === 'font')) {
      if (!getAsset(r.id)) await addAsset(r.blob, r.name, { id: r.id, meta: { kind: 'font' }, silent: true }).catch(() => undefined);
    }
  } catch {
    /* ignore */
  }
}

/** Import a PDF: each page becomes a page with the rendered PDF page as an image. */
export async function importPdf(f: { name: string; data: Uint8Array }, asNewDesign: boolean) {
  const tid = toast(`Importing ${f.name}…`, 'progress');
  try {
    const pdfjs = await import('pdfjs-dist');
    const workerUrl = (await import('pdfjs-dist/build/pdf.worker.min.mjs?url')).default;
    pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;
    const doc = await pdfjs.getDocument({ data: f.data.slice() }).promise;
    const first = await doc.getPage(1);
    const vp1 = first.getViewport({ scale: 96 / 72 });
    const makeNew = asNewDesign || !useEditor.getState().design;
    const target = makeNew ? newDesign(vp1.width, vp1.height, f.name.replace(/\.pdf$/i, '')) : useEditor.getState().design!;
    const newPages: { page: ReturnType<typeof newPage>; meta: Awaited<ReturnType<typeof addAsset>> }[] = [];
    for (let i = 1; i <= doc.numPages; i++) {
      useUI.getState().updateToast(tid, { text: `Importing page ${i} of ${doc.numPages}…`, progress: i / doc.numPages });
      const pg = await doc.getPage(i);
      const vp = pg.getViewport({ scale: (96 / 72) * 2 });
      const c = document.createElement('canvas');
      c.width = Math.ceil(vp.width);
      c.height = Math.ceil(vp.height);
      await pg.render({ canvasContext: c.getContext('2d')!, viewport: vp, canvas: c } as any).promise;
      const blob = await canvasToBlob(c, 'image/png');
      const meta = await addAsset(blob, `${f.name} p${i}.png`, { silent: true });
      const page = newPage();
      const s = Math.min(target.width / c.width, target.height / c.height);
      const w = c.width * s;
      const h = c.height * s;
      page.elements.push(makeImage(meta.id, (target.width - w) / 2, (target.height - h) / 2, w, h, { name: `PDF page ${i}` }));
      newPages.push({ page, meta });
    }
    if (makeNew) {
      target.pages = newPages.map((x) => x.page);
      for (const { meta } of newPages) target.assets[meta.id] = meta;
      startDesign(target);
    } else {
      useEditor.getState().update((dd) => {
        for (const { page, meta } of newPages) {
          dd.assets[meta.id] = meta;
          dd.pages.push(page);
        }
      });
    }
    useEditor.getState().setActivePage(newPages[0].page.id);
    toast(`Imported ${doc.numPages} page${doc.numPages > 1 ? 's' : ''} from ${f.name}`, 'success');
  } catch (e) {
    toast(`Couldn't import ${f.name}: ${errorMessage(e)}`, 'error', 6000);
  } finally {
    useUI.getState().dismissToast(tid);
  }
}

/** Replace the media in an image/video element or frame */
export async function replaceMedia(elId: string, assetId: string) {
  const st = useEditor.getState();
  const found = findElement(st.design, elId);
  const a = getAsset(assetId);
  if (!found || !a) return;
  const el = found.el;
  if (el.type !== 'image' && el.type !== 'video') return;
  registerInDesign(assetId);
  const crop = coverCrop(a.meta.width || 1, a.meta.height || 1, el.width, el.height);
  if (a.meta.kind === 'video' && el.type === 'image') {
    st.update((d) => {
      const p = d.pages.find((pp) => pp.id === found.page.id)!;
      const i = p.elements.findIndex((e) => e.id === elId);
      const old = p.elements[i] as any;
      p.elements[i] = makeVideo(assetId, old.x, old.y, old.width, old.height, {
        id: old.id, crop, mask: old.mask, cornerRadius: old.cornerRadius, rotation: old.rotation, opacity: old.opacity,
        borderColor: old.borderColor, borderWidth: old.borderWidth, shadow: old.shadow, animation: old.animation,
      } as any);
    });
  } else if (a.meta.kind === 'image' || a.meta.kind === 'video') {
    st.updateElements([elId], { assetId, crop } as any);
  }
}

/** Use an image/video as the page background */
export function setPageBackgroundAsset(pageId: string, assetId: string | null) {
  if (assetId) registerInDesign(assetId);
  useEditor.getState().updatePage(pageId, (p) => {
    p.background.assetId = assetId;
  });
}

export async function pasteFromClipboardEvent(e: ClipboardEvent) {
  const items = Array.from(e.clipboardData?.items || []);
  const files = items.filter((i) => i.kind === 'file').map((i) => i.getAsFile()).filter(Boolean) as File[];
  if (files.length) {
    e.preventDefault();
    await importFiles(files.map((f) => (f.name && f.name !== 'image.png' ? f : new File([f], `Pasted image ${new Date().toLocaleTimeString().replace(/:/g, '.')}.png`, { type: f.type }))));
    return true;
  }
  const text = e.clipboardData?.getData('text/plain');
  if (text && /^<svg[\s>]/i.test(text.trim())) {
    e.preventDefault();
    await importFiles([new File([text], 'Pasted.svg', { type: 'image/svg+xml' })]);
    return true;
  }
  return false;
}

export async function recordToAsset(blob: Blob, name: string) {
  const meta = await addAsset(blob, name);
  registerInDesign(meta.id);
  void addToUploads(meta.id);
  await placeAsset(meta.id);
}

export { uid, blobToDataUrl };
