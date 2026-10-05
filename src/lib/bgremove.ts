import { useEditor, findElement } from '../store/editor';
import { useUI } from '../store/ui';
import { addAsset, getImageAsync } from './assets';
import { canvasToBlob } from './render/renderPage';

/**
 * Background remover. Samples the colours around the image border, then
 * flood-fills inward from the edges, removing pixels close to those colours.
 * Edges are softened so cut-outs blend cleanly. Works best on photos with a
 * reasonably plain or contrasting background (products, portraits on a wall,
 * logos, scanned artwork).
 */
export function removeBackgroundPixels(img: CanvasImageSource, w: number, h: number, tolerance = 32, feather = 1.5): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const ctx = c.getContext('2d', { willReadFrequently: true })!;
  ctx.drawImage(img, 0, 0, w, h);
  const id = ctx.getImageData(0, 0, w, h);
  const d = id.data;

  // 1. Background palette from border pixels (simple k-means, k<=4)
  const border: number[][] = [];
  const step = Math.max(1, Math.floor((w + h) / 400));
  for (let x = 0; x < w; x += step) {
    border.push(px(d, x, 0, w), px(d, x, h - 1, w));
  }
  for (let y = 0; y < h; y += step) {
    border.push(px(d, 0, y, w), px(d, w - 1, y, w));
  }
  const centers = kmeans(border.filter((p) => p[3] > 10), 4);

  // 2. Flood fill from the edges
  const tol2 = tolerance * tolerance * 3;
  const mask = new Uint8Array(w * h); // 1 = background
  const queue = new Int32Array(w * h);
  let qh = 0;
  let qt = 0;
  const isBg = (i: number) => {
    const o = i * 4;
    if (d[o + 3] < 12) return true;
    for (const cc of centers) {
      const dr = d[o] - cc[0];
      const dg = d[o + 1] - cc[1];
      const db = d[o + 2] - cc[2];
      if (dr * dr + dg * dg + db * db <= tol2) return true;
    }
    return false;
  };
  const seed = (i: number) => {
    if (!mask[i] && isBg(i)) {
      mask[i] = 1;
      queue[qt++] = i;
    }
  };
  for (let x = 0; x < w; x++) {
    seed(x);
    seed((h - 1) * w + x);
  }
  for (let y = 0; y < h; y++) {
    seed(y * w);
    seed(y * w + w - 1);
  }
  while (qh < qt) {
    const i = queue[qh++];
    const x = i % w;
    const y = (i - x) / w;
    if (x > 0) seed(i - 1);
    if (x < w - 1) seed(i + 1);
    if (y > 0) seed(i - w);
    if (y < h - 1) seed(i + w);
  }

  // 3. Alpha from mask with soft edges (box blur of the mask)
  let alpha: Float32Array = new Float32Array(w * h);
  for (let i = 0; i < w * h; i++) alpha[i] = mask[i] ? 0 : 1;
  const r = Math.max(0, Math.round(feather));
  if (r > 0) alpha = boxBlur(alpha, w, h, r);
  for (let i = 0; i < w * h; i++) {
    // only soften the outside edge, keep subject interior solid
    const a = mask[i] ? alpha[i] * 0.85 : Math.max(alpha[i], 0.6 + alpha[i] * 0.4);
    d[i * 4 + 3] = Math.round(d[i * 4 + 3] * Math.max(0, Math.min(1, a)));
  }
  // de-fringe: pull edge pixel colours away from the background colour
  for (let i = 0; i < w * h; i++) {
    const a = d[i * 4 + 3] / 255;
    if (a <= 0.02 || a >= 0.98) continue;
    const o = i * 4;
    let best = centers[0];
    let bd = Infinity;
    for (const cc of centers) {
      const dd = (d[o] - cc[0]) ** 2 + (d[o + 1] - cc[1]) ** 2 + (d[o + 2] - cc[2]) ** 2;
      if (dd < bd) {
        bd = dd;
        best = cc;
      }
    }
    for (let k = 0; k < 3; k++) d[o + k] = Math.max(0, Math.min(255, (d[o + k] - best[k] * (1 - a)) / Math.max(0.2, a)));
  }
  ctx.putImageData(id, 0, 0);
  return c;
}

function px(d: Uint8ClampedArray, x: number, y: number, w: number) {
  const o = (y * w + x) * 4;
  return [d[o], d[o + 1], d[o + 2], d[o + 3]];
}

function kmeans(pts: number[][], k: number): number[][] {
  if (!pts.length) return [[255, 255, 255]];
  let centers = [pts[0], pts[Math.floor(pts.length / 3)], pts[Math.floor((2 * pts.length) / 3)], pts[pts.length - 1]].slice(0, k).map((p) => p.slice(0, 3));
  for (let it = 0; it < 8; it++) {
    const sums = centers.map(() => [0, 0, 0, 0]);
    for (const p of pts) {
      let bi = 0;
      let bd = Infinity;
      centers.forEach((c, i) => {
        const dd = (p[0] - c[0]) ** 2 + (p[1] - c[1]) ** 2 + (p[2] - c[2]) ** 2;
        if (dd < bd) {
          bd = dd;
          bi = i;
        }
      });
      sums[bi][0] += p[0];
      sums[bi][1] += p[1];
      sums[bi][2] += p[2];
      sums[bi][3]++;
    }
    centers = sums.map((s, i) => (s[3] ? [s[0] / s[3], s[1] / s[3], s[2] / s[3]] : centers[i]));
  }
  // drop clusters that represent a tiny share of the border (likely subject touching the edge)
  const counts = centers.map(() => 0);
  for (const p of pts) {
    let bi = 0;
    let bd = Infinity;
    centers.forEach((c, i) => {
      const dd = (p[0] - c[0]) ** 2 + (p[1] - c[1]) ** 2 + (p[2] - c[2]) ** 2;
      if (dd < bd) {
        bd = dd;
        bi = i;
      }
    });
    counts[bi]++;
  }
  return centers.filter((_, i) => counts[i] / pts.length > 0.12);
}

function boxBlur(src: Float32Array, w: number, h: number, r: number): Float32Array<ArrayBuffer> {
  const tmp = new Float32Array(w * h);
  const out = new Float32Array(w * h);
  const n = r * 2 + 1;
  for (let y = 0; y < h; y++) {
    let acc = 0;
    for (let x = -r; x <= r; x++) acc += src[y * w + Math.max(0, Math.min(w - 1, x))];
    for (let x = 0; x < w; x++) {
      tmp[y * w + x] = acc / n;
      acc += src[y * w + Math.min(w - 1, x + r + 1)] - src[y * w + Math.max(0, x - r)];
    }
  }
  for (let x = 0; x < w; x++) {
    let acc = 0;
    for (let y = -r; y <= r; y++) acc += tmp[Math.max(0, Math.min(h - 1, y)) * w + x];
    for (let y = 0; y < h; y++) {
      out[y * w + x] = acc / n;
      acc += tmp[Math.min(h - 1, y + r + 1) * w + x] - tmp[Math.max(0, y - r) * w + x];
    }
  }
  return out;
}

/** Remove the background of an image element, keeping the original as `originalAssetId` for undo */
export async function removeBackground(elId: string, tolerance = 34) {
  const st = useEditor.getState();
  const f = findElement(st.design, elId);
  if (!f || f.el.type !== 'image' || !f.el.assetId) return;
  const el = f.el;
  const ui = useUI.getState();
  const tid = ui.toast('Removing background…', 'progress');
  try {
    const sourceId = (el as any).originalAssetId || el.assetId!;
    const img = await getImageAsync(sourceId);
    if (!img) throw new Error('Image not loaded');
    const max = 2400;
    const k = Math.min(1, max / Math.max(img.naturalWidth, img.naturalHeight));
    const w = Math.round(img.naturalWidth * k);
    const h = Math.round(img.naturalHeight * k);
    await new Promise((r) => setTimeout(r, 30));
    const out = removeBackgroundPixels(img, w, h, tolerance);
    const blob = await canvasToBlob(out, 'image/png');
    const meta = await addAsset(blob, 'Cutout.png');
    useEditor.getState().update((d) => {
      d.assets[meta.id] = meta;
      d.assets[sourceId] ||= d.assets[el.assetId!];
      for (const p of d.pages)
        for (const e of p.elements as any[]) {
          if (e.id === elId) {
            e.originalAssetId = sourceId;
            e.assetId = meta.id;
            e.bgTolerance = tolerance;
          }
        }
    });
    ui.toast('Background removed. Use the Photo panel to fine-tune or restore it.', 'success', 4000);
  } catch (e) {
    ui.toast(`Couldn't remove the background: ${e instanceof Error ? e.message : e}`, 'error');
  } finally {
    ui.dismissToast(tid);
  }
}

export function restoreBackground(elId: string) {
  useEditor.getState().update((d) => {
    for (const p of d.pages)
      for (const e of p.elements as any[]) {
        if (e.id === elId && e.originalAssetId) {
          e.assetId = e.originalAssetId;
          delete e.originalAssetId;
          delete e.bgTolerance;
        }
      }
  });
}
