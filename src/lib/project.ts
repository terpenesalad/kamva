import JSZip from 'jszip';
import type { Design, Template } from '../types';
import { addAsset, blobToDataUrl, dataUrlToBlob, extForMime, getAsset } from './assets';
import { normalizeDesign, uid } from './defaults';

export const FORMAT_VERSION = 1;

/** Asset ids referenced anywhere in a design */
export function usedAssetIds(d: Pick<Design, 'pages' | 'audio'>): Set<string> {
  const ids = new Set<string>();
  for (const p of d.pages) {
    if (p.background.assetId) ids.add(p.background.assetId);
    for (const e of p.elements) {
      if ((e.type === 'image' || e.type === 'video') && e.assetId) ids.add(e.assetId);
      if ((e as any).originalAssetId) ids.add((e as any).originalAssetId);
    }
  }
  for (const a of d.audio || []) ids.add(a.assetId);
  return ids;
}

/** Serialize a design (and the assets it uses, plus fonts) into a .kamva zip */
export async function saveProject(design: Design, opts: { thumbnail?: Blob | null; includeAll?: boolean } = {}): Promise<Uint8Array> {
  const zip = new JSZip();
  const used = usedAssetIds(design);
  const assets: Design['assets'] = {};
  for (const [id, meta] of Object.entries(design.assets)) {
    // keep fonts and anything referenced
    if (!opts.includeAll && !used.has(id) && meta.kind !== 'font') continue;
    const ra = getAsset(id);
    if (!ra) continue;
    const ext = extForMime(ra.blob.type, meta.name);
    zip.file(`assets/${id}.${ext}`, ra.blob);
    assets[id] = { ...meta, mime: ra.blob.type };
  }
  const json = { format: 'kamva', formatVersion: FORMAT_VERSION, design: { ...design, assets } };
  zip.file('design.json', JSON.stringify(json));
  if (opts.thumbnail) zip.file('thumbnail.png', opts.thumbnail);
  return zip.generateAsync({ type: 'uint8array', compression: 'DEFLATE', compressionOptions: { level: 6 } });
}

export async function loadProject(data: Uint8Array | ArrayBuffer): Promise<Design> {
  const zip = await JSZip.loadAsync(data);
  const f = zip.file('design.json');
  if (!f) throw new Error('Not a Kamva design file');
  const json = JSON.parse(await f.async('string'));
  const design = normalizeDesign(json.design as Design);
  const files = zip.file(/^assets\//);
  await Promise.all(
    files.map(async (file) => {
      const name = file.name.replace(/^assets\//, '');
      const id = name.replace(/\.[^.]+$/, '');
      const meta = design.assets[id];
      if (!meta) return;
      const raw = await file.async('blob');
      const blob = new Blob([raw], { type: meta.mime });
      try {
        await addAsset(blob, meta.name, { id, meta, silent: true });
      } catch (e) {
        console.warn('Asset failed to load', meta.name, e);
      }
    }),
  );
  return design;
}

/** Make a template from a design (assets embedded as data URLs) */
export async function designToTemplate(design: Design, name: string, category = 'My templates', thumb?: string): Promise<Template> {
  const used = usedAssetIds(design);
  const assetData: Record<string, string> = {};
  const assets: Design['assets'] = {};
  for (const id of used) {
    const ra = getAsset(id);
    if (!ra) continue;
    assetData[id] = await blobToDataUrl(ra.blob);
    assets[id] = ra.meta;
  }
  return {
    id: uid(),
    name,
    category,
    width: design.width,
    height: design.height,
    pages: structuredClone(design.pages),
    audio: structuredClone(design.audio),
    thumb,
    assets,
    assetData,
  };
}

export async function registerTemplateAssets(t: Template) {
  if (!t.assetData || !t.assets) return;
  await Promise.all(
    Object.entries(t.assetData).map(async ([id, url]) => {
      if (getAsset(id)) return;
      const meta = t.assets![id];
      await addAsset(dataUrlToBlob(url), meta?.name || id, { id, meta, silent: true }).catch(() => undefined);
    }),
  );
}
