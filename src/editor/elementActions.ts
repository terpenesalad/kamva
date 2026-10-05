import type { DesignElement } from '../types';
import { useEditor } from '../store/editor';
import { useUI } from '../store/ui';
import { elementAABB } from './canvas/controller';
import { unionBox } from './canvas/snapping';
import { setPageBackgroundAsset } from '../lib/actions';
import { makeText, makeShape, makeImage, solid, uid } from '../lib/defaults';

const ed = () => useEditor.getState();

export function selectedEls(): DesignElement[] {
  const s = ed();
  const page = s.design?.pages.find((p) => p.id === s.activePageId);
  return page?.elements.filter((e) => s.selection.includes(e.id)) || [];
}

export type AlignMode = 'left' | 'center' | 'right' | 'top' | 'middle' | 'bottom';

/** Align to the page (single element / group) or to each other (multiple) */
export function align(mode: AlignMode, toPage?: boolean) {
  const els = selectedEls().filter((e) => !e.locked);
  const d = ed().design;
  if (!els.length || !d) return;
  const groups = new Set(els.map((e) => e.groupId).filter(Boolean));
  const asOne = els.length === 1 || toPage || (groups.size === 1 && els.every((e) => e.groupId));
  const boxes = els.map(elementAABB);
  const ref = asOne ? { x: 0, y: 0, width: d.width, height: d.height } : unionBox(boxes);
  const moving = asOne ? [unionBox(boxes)] : boxes;
  const deltas = moving.map((b) => {
    let dx = 0;
    let dy = 0;
    if (mode === 'left') dx = ref.x - b.x;
    if (mode === 'center') dx = ref.x + ref.width / 2 - (b.x + b.width / 2);
    if (mode === 'right') dx = ref.x + ref.width - (b.x + b.width);
    if (mode === 'top') dy = ref.y - b.y;
    if (mode === 'middle') dy = ref.y + ref.height / 2 - (b.y + b.height / 2);
    if (mode === 'bottom') dy = ref.y + ref.height - (b.y + b.height);
    return { dx, dy };
  });
  ed().updateElements(
    els.map((e) => e.id),
    (el) => {
      const i = asOne ? 0 : els.findIndex((e) => e.id === el.id);
      el.x += deltas[i].dx;
      el.y += deltas[i].dy;
    },
  );
}

export function distribute(axis: 'h' | 'v') {
  const els = selectedEls().filter((e) => !e.locked);
  if (els.length < 3) return;
  const items = els.map((e) => ({ e, b: elementAABB(e) })).sort((a, b) => (axis === 'h' ? a.b.x - b.b.x : a.b.y - b.b.y));
  const first = items[0].b;
  const last = items[items.length - 1].b;
  const total = items.reduce((s, it) => s + (axis === 'h' ? it.b.width : it.b.height), 0);
  const span = axis === 'h' ? last.x + last.width - first.x : last.y + last.height - first.y;
  const gap = (span - total) / (items.length - 1);
  let pos = axis === 'h' ? first.x : first.y;
  const target = new Map<string, number>();
  for (const it of items) {
    target.set(it.e.id, pos - (axis === 'h' ? it.b.x : it.b.y));
    pos += (axis === 'h' ? it.b.width : it.b.height) + gap;
  }
  ed().updateElements(
    els.map((e) => e.id),
    (el) => {
      const d = target.get(el.id) || 0;
      if (axis === 'h') el.x += d;
      else el.y += d;
    },
  );
}

export function flip(axis: 'x' | 'y') {
  const els = selectedEls().filter((e) => !e.locked);
  ed().updateElements(
    els.map((e) => e.id),
    (el) => {
      if (axis === 'x') el.flipX = !el.flipX;
      else el.flipY = !el.flipY;
    },
  );
}

export function toggleLock() {
  const els = selectedEls();
  if (!els.length) return;
  const lock = !els.every((e) => e.locked);
  ed().updateElements(
    els.map((e) => e.id),
    { locked: lock },
  );
}

export function toggleHidden(id: string) {
  const s = ed();
  const page = s.design?.pages.find((p) => p.id === s.activePageId);
  const el = page?.elements.find((e) => e.id === id);
  if (!el) return;
  s.updateElements([id], { hidden: !el.hidden });
}

export function nudge(dx: number, dy: number) {
  const els = selectedEls().filter((e) => !e.locked);
  if (!els.length) return;
  ed().updateElements(
    els.map((e) => e.id),
    (el) => {
      el.x += dx;
      el.y += dy;
    },
    'nudge',
  );
}

export function deleteSelection() {
  const s = ed();
  if (s.selection.length) s.deleteElements(s.selection);
}

export function groupSelection() {
  const s = ed();
  if (s.selection.length > 1) s.group(s.selection);
}

export function ungroupSelection() {
  const s = ed();
  if (s.selection.length) s.ungroup(s.selection);
}

export function setAsBackground() {
  const els = selectedEls();
  const el = els[0];
  if (!el || (el.type !== 'image' && el.type !== 'video') || !el.assetId) return;
  const s = ed();
  setPageBackgroundAsset(s.activePageId, el.assetId);
  s.deleteElements([el.id]);
}

export function detachBackground() {
  const s = ed();
  const d = s.design;
  const page = d?.pages.find((p) => p.id === s.activePageId);
  if (!d || !page?.background.assetId) return;
  const assetId = page.background.assetId;
  s.updatePage(page.id, (p) => {
    p.background.assetId = null;
  });
  s.addElements([makeImage(assetId, 0, 0, d.width, d.height, { name: 'Background image' })], { index: 0 });
}

/** Add a text box with preset style at the page centre */
export function addText(kind: 'heading' | 'subheading' | 'body', fontFamily?: string, extra: Partial<DesignElement> = {}) {
  const d = ed().design;
  if (!d) return;
  const base = Math.min(d.width, d.height);
  const size = kind === 'heading' ? base * 0.085 : kind === 'subheading' ? base * 0.05 : base * 0.032;
  const text = kind === 'heading' ? 'Add a heading' : kind === 'subheading' ? 'Add a subheading' : 'Add a little bit of body text';
  const w = Math.min(d.width * 0.86, Math.max(size * text.length * (kind === 'body' ? 0.52 : 0.7), size * 4));
  const el = makeText(text, (d.width - w) / 2, d.height / 2 - size * 0.65, w, {
    fontSize: Math.round(size),
    fontWeight: kind === 'body' ? 'normal' : 'bold',
    fontFamily: fontFamily || (kind === 'body' ? 'Inter' : 'Montserrat'),
    role: kind,
    name: kind === 'heading' ? 'Heading' : kind === 'subheading' ? 'Subheading' : 'Body text',
    ...(extra as any),
  });
  ed().addElements([el]);
  return el;
}

export function addShapeCentered(kind: Parameters<typeof makeShape>[0], color?: string) {
  const d = ed().design;
  if (!d) return;
  const s = Math.min(d.width, d.height) * 0.3;
  const w = ['arrowRight', 'arrowLeft', 'parallelogram', 'trapezoid', 'chevron'].includes(kind) ? s * 1.6 : s;
  const h = kind === 'arch' ? s * 1.25 : kind === 'semicircle' ? s / 2 : s;
  const el = makeShape(kind, (d.width - w) / 2, (d.height - h) / 2, w, h, color);
  ed().addElements([el]);
}

export function selectAll() {
  const s = ed();
  const page = s.design?.pages.find((p) => p.id === s.activePageId);
  if (page) s.select(page.elements.filter((e) => !e.hidden).map((e) => e.id));
}

/** Open the right side panel for the selection */
export function editPanelFor(kind: 'photo' | 'animate' | 'position') {
  useUI.setState({ panel: kind });
}

export { solid, uid };
