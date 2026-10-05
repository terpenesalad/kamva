import type { DesignElement } from '../types';
import { useEditor, findElement } from '../store/editor';
import { cloneElement } from '../lib/defaults';
import { idb, UploadRecord } from '../lib/idb';
import { ensureUploadAsset, placeAsset, replaceMedia, setPageBackgroundAsset } from '../lib/actions';
import { getAsset } from '../lib/assets';

export type LibraryPayload =
  | { type: 'element'; element: DesignElement }
  | { type: 'elements'; elements: DesignElement[] }
  | { type: 'upload'; id: string }
  | { type: 'asset'; id: string }
  | { type: 'background'; id: string };

/** Set drag data for an item dragged from a side panel */
export function dragData(e: React.DragEvent, payload: LibraryPayload) {
  e.dataTransfer.setData('application/x-kamva', JSON.stringify(payload));
  e.dataTransfer.effectAllowed = 'copy';
}

/** Drop an element so its centre lands at `at` */
function centreAt(el: DesignElement, at: { x: number; y: number }): DesignElement {
  const c = cloneElement(el);
  c.x = at.x - c.width / 2;
  c.y = at.y - c.height / 2;
  return c;
}

export async function handleLibraryDrop(p: LibraryPayload, at: { x: number; y: number }, targetId: string | null) {
  const st = useEditor.getState();
  if (p.type === 'element') {
    st.addElements([centreAt(p.element, at)]);
  } else if (p.type === 'elements') {
    const xs = p.elements.map((e) => e.x);
    const ys = p.elements.map((e) => e.y);
    const x2 = p.elements.map((e) => e.x + e.width);
    const y2 = p.elements.map((e) => e.y + e.height);
    const cx = (Math.min(...xs) + Math.max(...x2)) / 2;
    const cy = (Math.min(...ys) + Math.max(...y2)) / 2;
    st.addElements(p.elements.map((e) => cloneElement(e, at.x - cx, at.y - cy)));
  } else if (p.type === 'upload' || p.type === 'asset') {
    if (p.type === 'upload' && !getAsset(p.id)) {
      const rec = await idb.get<UploadRecord>('uploads', p.id);
      if (!rec) return;
      await ensureUploadAsset(rec);
    }
    const a = getAsset(p.id);
    const target = targetId ? findElement(st.design, targetId)?.el : null;
    if (a && target && (target.type === 'image' || target.type === 'video') && (a.meta.kind === 'image' || a.meta.kind === 'video')) {
      await replaceMedia(target.id, p.id);
    } else {
      await placeAsset(p.id, at);
    }
  } else if (p.type === 'background') {
    setPageBackgroundAsset(st.activePageId, p.id);
  }
}
