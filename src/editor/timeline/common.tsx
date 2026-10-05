import { CopyPlus, Eye, EyeOff, FilePlus, Pencil, Trash2 } from 'lucide-react';
import type { MenuItem } from '../../components/ui';
import { useEditor, pageStartTime } from '../../store/editor';
import { useUI } from '../../store/ui';

/** 0:03.2 */
export function fmtTime(t: number): string {
  const tenths = Math.round(Math.max(0, t) * 10);
  const m = Math.floor(tenths / 600);
  const s = (tenths % 600) / 10;
  return `${m}:${s.toFixed(1).padStart(4, '0')}`;
}

export function fmtDur(t: number): string {
  return `${(Math.round(t * 10) / 10).toFixed(1)}s`;
}

export function readNum(key: string, fallback: number): number {
  try {
    const v = parseFloat(localStorage.getItem(key) || '');
    return isFinite(v) ? v : fallback;
  } catch {
    return fallback;
  }
}

export function writeNum(key: string, v: number) {
  try {
    localStorage.setItem(key, String(v));
  } catch {
    /* storage unavailable */
  }
}

/** Track a pointer drag with window listeners. `move` gets the offset from the start point. */
export function pointerDrag(
  e: React.PointerEvent | PointerEvent,
  move: (dx: number, dy: number, ev: PointerEvent) => void,
  up?: (moved: boolean, ev: PointerEvent) => void,
  cursor?: string,
) {
  const x0 = e.clientX;
  const y0 = e.clientY;
  let moved = false;
  const prevCursor = document.body.style.cursor;
  if (cursor) document.body.style.cursor = cursor;
  const onMove = (ev: PointerEvent) => {
    const dx = ev.clientX - x0;
    const dy = ev.clientY - y0;
    if (Math.abs(dx) > 2 || Math.abs(dy) > 2) moved = true;
    move(dx, dy, ev);
  };
  const onUp = (ev: PointerEvent) => {
    window.removeEventListener('pointermove', onMove);
    window.removeEventListener('pointerup', onUp);
    window.removeEventListener('pointercancel', onUp);
    if (cursor) document.body.style.cursor = prevCursor;
    up?.(moved, ev);
  };
  window.addEventListener('pointermove', onMove);
  window.addEventListener('pointerup', onUp);
  window.addEventListener('pointercancel', onUp);
}

/** Select a page; while playing, jump the playhead to it so the engine follows. */
export function goToPage(id: string) {
  const st = useEditor.getState();
  const d = st.design;
  if (!d) return;
  const page = d.pages.find((p) => p.id === id);
  if (!page) return;
  const ui = useUI.getState();
  if (ui.playing && !page.hidden) ui.setTime(pageStartTime(d, id));
  st.setActivePage(id);
}

export function pageMenuItems(id: string, onRename: () => void): MenuItem[] {
  const st = useEditor.getState();
  const d = st.design;
  const page = d?.pages.find((p) => p.id === id);
  if (!d || !page) return [];
  const visibleCount = d.pages.filter((p) => !p.hidden).length;
  return [
    { label: 'Duplicate page', icon: <CopyPlus size={16} />, onClick: () => st.duplicatePage(id) },
    { label: 'Add page after', icon: <FilePlus size={16} />, onClick: () => st.addPage(id) },
    { label: 'Rename', icon: <Pencil size={16} />, onClick: onRename },
    {
      label: page.hidden ? 'Show page' : 'Hide page',
      icon: page.hidden ? <Eye size={16} /> : <EyeOff size={16} />,
      disabled: !page.hidden && visibleCount <= 1,
      onClick: () =>
        st.updatePage(id, (p) => {
          p.hidden = !p.hidden;
        }),
    },
    { sep: true },
    {
      label: d.pages.length > 1 ? 'Delete page' : 'Clear page',
      icon: <Trash2 size={16} />,
      danger: true,
      onClick: () => st.deletePage(id),
    },
  ];
}
