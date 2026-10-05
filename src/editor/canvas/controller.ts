import Konva from 'konva';
import { create } from 'zustand';
import type { DesignElement, Page, ImageElement, VideoElement, TextElement, DrawElement } from '../../types';
import { useEditor, findElement } from '../../store/editor';
import { useUI, usePrefs } from '../../store/ui';
import { applyAnimation, buildBackground, buildElement, measureText, videoSourceTime, BuildCtx } from '../../lib/render/builder';
import { onAssetsChanged, getAsset, getImage, allVideoEls } from '../../lib/assets';
import { fitCrop } from '../../lib/render/media';
import { snapBox, unionBox, intersects, Box, SnapLine } from './snapping';
import { makeDraw } from '../../lib/defaults';
import { totalDuration } from '../../store/editor';

Konva.dragButtons = [0];

export const SNAP_COLOR = '#ff3d9a';

interface ViewState {
  zoom: number;
  panX: number;
  panY: number;
  vw: number;
  vh: number;
  textRect: { x: number; y: number; w: number; h: number; rotation: number; zoom: number } | null;
  menu: { x: number; y: number; id: string | null } | null;
  hoverId: string | null;
  cropActive: boolean;
}

export const useView = create<ViewState>(() => ({
  zoom: 1,
  panX: 0,
  panY: 0,
  vw: 0,
  vh: 0,
  textRect: null,
  menu: null,
  hoverId: null,
  cropActive: false,
}));

/** Axis-aligned bounds of a rotated element */
export function elementAABB(el: DesignElement): Box {
  const r = ((el.rotation || 0) * Math.PI) / 180;
  if (!r) return { x: el.x, y: el.y, width: el.width, height: el.height };
  const cx = el.x + el.width / 2;
  const cy = el.y + el.height / 2;
  const c = Math.abs(Math.cos(r));
  const s = Math.abs(Math.sin(r));
  const w = el.width * c + el.height * s;
  const h = el.width * s + el.height * c;
  return { x: cx - w / 2, y: cy - h / 2, width: w, height: h };
}

const CORNERS = ['top-left', 'top-right', 'bottom-left', 'bottom-right'];
const ALL_ANCHORS = [...CORNERS, 'top-center', 'bottom-center', 'middle-left', 'middle-right'];

export class CanvasController {
  container: HTMLDivElement;
  stage: Konva.Stage;
  pageLayer: Konva.Layer;
  uiLayer: Konva.Layer;
  tr: Konva.Transformer;
  nodes = new Map<string, Konva.Group>();
  elRefs = new Map<string, DesignElement>();
  bgNode: Konva.Group | null = null;
  bgRef: { page: Page | null; w: number; h: number } = { page: null, w: 0, h: 0 };
  pageId = '';
  pageRect: Konva.Rect;
  snapGroup: Konva.Group;
  hoverRect: Konva.Rect;
  marquee: Konva.Rect;
  overlayGroup: Konva.Group; // grid, margins, guides
  lockGroup: Konva.Group;
  cropGroup: Konva.Group | null = null;
  unsubs: (() => void)[] = [];
  dragging = false;
  transforming = false;
  pendingRebuild = false;
  scaleStep = 1;
  spaceDown = false;
  panning: { x: number; y: number; px: number; py: number } | null = null;
  marqueeStart: { x: number; y: number } | null = null;
  dragStart: Map<string, { x: number; y: number }> | null = null;
  drawing: { line: Konva.Line; pts: number[] } | null = null;
  lastPlayback: { t: number; playing: boolean } = { t: 0, playing: false };
  raf = 0;
  destroyed = false;

  constructor(container: HTMLDivElement) {
    this.container = container;
    this.stage = new Konva.Stage({ container, width: container.clientWidth || 800, height: container.clientHeight || 600 });
    this.pageLayer = new Konva.Layer();
    this.uiLayer = new Konva.Layer();
    this.stage.add(this.pageLayer, this.uiLayer);

    // page shadow/border drawn under content via a rect in UI-less background layer
    this.pageRect = new Konva.Rect({ listening: false, fill: '#fff', shadowColor: 'rgba(20,16,40,0.25)', shadowBlur: 24, shadowOffsetY: 6, shadowEnabled: true });
    const backLayer = new Konva.Layer({ listening: false });
    backLayer.add(this.pageRect);
    this.stage.add(backLayer);
    backLayer.moveToBottom();

    this.overlayGroup = new Konva.Group({ listening: false });
    this.lockGroup = new Konva.Group({ listening: false });
    this.snapGroup = new Konva.Group({ listening: false });
    this.hoverRect = new Konva.Rect({ stroke: '#000', strokeWidth: 1.5, strokeScaleEnabled: false, listening: false, visible: false });
    this.marquee = new Konva.Rect({ fill: 'rgba(109,74,255,0.08)', stroke: '#6d4aff', strokeWidth: 1, strokeScaleEnabled: false, visible: false, listening: false });
    this.tr = new Konva.Transformer({
      rotateAnchorOffset: 28,
      anchorSize: 11,
      anchorCornerRadius: 6,
      anchorStrokeWidth: 1.5,
      borderStrokeWidth: 1.5,
      rotationSnaps: [0, 45, 90, 135, 180, 225, 270, 315],
      rotationSnapTolerance: 4,
      ignoreStroke: true,
      flipEnabled: false,
      shiftBehavior: 'default',
      anchorStyleFunc: (anchor) => {
        const name = anchor.name();
        if (name.includes('rotater')) {
          anchor.cornerRadius(12);
          anchor.width(22);
          anchor.height(22);
          anchor.offsetX(11);
          anchor.offsetY(11);
        } else if (name.includes('middle') || name.includes('center')) {
          const horiz = name.includes('top') || name.includes('bottom');
          anchor.width(horiz ? 22 : 7);
          anchor.height(horiz ? 7 : 22);
          anchor.offsetX(horiz ? 11 : 3.5);
          anchor.offsetY(horiz ? 3.5 : 11);
          anchor.cornerRadius(4);
        }
      },
      boundBoxFunc: (oldBox, newBox) => (Math.abs(newBox.width) < 6 || Math.abs(newBox.height) < 6 ? oldBox : newBox),
    });
    this.uiLayer.add(this.overlayGroup, this.lockGroup, this.hoverRect, this.snapGroup, this.marquee, this.tr);
    this.applyAccent();

    this.bindStageEvents();
    this.bindTransformer();

    this.unsubs.push(
      useEditor.subscribe((s, prev) => {
        if (s.design !== prev.design || s.activePageId !== prev.activePageId) this.sync();
        else if (s.selection !== prev.selection || s.editingTextId !== prev.editingTextId) this.updateSelection();
        if (s.cropId !== prev.cropId) this.updateCrop();
      }),
      useUI.subscribe((s, prev) => {
        if (s.zoom !== prev.zoom && !s.fit) this.zoomTo(s.zoom);
        if (s.fit && (!prev.fit || s.zoom !== prev.zoom)) this.fit();
        if (s.tool !== prev.tool) this.updateTool();
        if (s.playing !== prev.playing) {
          this.updateSelection();
          this.sync();
          this.setPlayback(s.time, s.playing);
        } else if (s.time !== prev.time) this.setPlayback(s.time, s.playing);
      }),
      usePrefs.subscribe((s, prev) => {
        if (s.accent !== prev.accent) this.applyAccent();
        if (s.showGrid !== prev.showGrid || s.gridSize !== prev.gridSize || s.showMargins !== prev.showMargins || s.showBleed !== prev.showBleed) this.drawOverlays();
      }),
      onAssetsChanged(() => this.requestRebuild()),
    );
    this.sync();
    this.fit();
  }

  // ------------------------------------------------------------------ helpers
  get editor() {
    return useEditor.getState();
  }
  get page(): Page | undefined {
    const s = this.editor;
    return s.design?.pages.find((p) => p.id === s.activePageId) || s.design?.pages[0];
  }

  applyAccent() {
    const accent = usePrefs.getState().accent;
    this.tr.setAttrs({ anchorStroke: accent, borderStroke: accent, anchorFill: '#fff' });
    this.marquee.setAttrs({ stroke: accent, fill: accent + '14' });
    this.hoverRect.stroke(accent);
    this.uiLayer.batchDraw();
  }

  pointer(): { x: number; y: number } {
    return this.stage.getRelativePointerPosition() || { x: 0, y: 0 };
  }

  clientToDesign(cx: number, cy: number) {
    const r = this.container.getBoundingClientRect();
    const z = this.stage.scaleX();
    return { x: (cx - r.left - this.stage.x()) / z, y: (cy - r.top - this.stage.y()) / z };
  }

  elementAtClient(cx: number, cy: number): string | null {
    const r = this.container.getBoundingClientRect();
    const hit = this.pageLayer.getIntersection({ x: cx - r.left, y: cy - r.top });
    const g = hit?.findAncestor('.element') as Konva.Group | undefined;
    return g?.id() || null;
  }

  ctx(page: Page): BuildCtx {
    return {
      mode: 'edit',
      scale: this.scaleStep,
      design: this.editor.design!,
      page,
      videoKey: 'edit:',
      onAsync: () => this.requestRebuild(),
    };
  }

  requestRebuild() {
    if (this.dragging || this.transforming) {
      this.pendingRebuild = true;
      return;
    }
    if (this.raf) return;
    this.raf = requestAnimationFrame(() => {
      this.raf = 0;
      this.elRefs.clear();
      this.bgRef = { page: null, w: 0, h: 0 };
      this.sync();
    });
  }

  // ------------------------------------------------------------------ reconcile
  sync() {
    if (this.destroyed) return;
    const d = this.editor.design;
    const page = this.page;
    if (!d || !page) return;
    const pageChanged = page.id !== this.pageId;
    if (pageChanged) {
      this.pageId = page.id;
      this.elRefs.clear();
      for (const n of this.nodes.values()) n.destroy();
      this.nodes.clear();
      this.bgRef = { page: null, w: 0, h: 0 };
      // pause any edit videos of previous page
      for (const [k, v] of allVideoEls()) if (k.startsWith('edit:')) v.pause();
    }
    this.pageRect.setAttrs({ width: d.width, height: d.height });
    this.pageLayer.clip({ x: 0, y: 0, width: d.width, height: d.height });

    const ctx = this.ctx(page);
    if (this.bgRef.page?.background !== page.background || this.bgRef.w !== d.width || this.bgRef.h !== d.height || !this.bgNode) {
      this.bgNode?.destroy();
      this.bgNode = buildBackground(page, ctx);
      this.pageLayer.add(this.bgNode);
      this.bgRef = { page, w: d.width, h: d.height };
    }
    this.bgRef.page = page;

    const ids = new Set(page.elements.map((e) => e.id));
    for (const [id, n] of this.nodes) {
      if (!ids.has(id)) {
        n.destroy();
        this.nodes.delete(id);
        this.elRefs.delete(id);
      }
    }
    const tool = useUI.getState().tool;
    const playing = useUI.getState().playing;
    for (const el of page.elements) {
      const prev = this.elRefs.get(el.id);
      let node = this.nodes.get(el.id);
      if (!node || prev !== el) {
        node?.destroy();
        node = buildElement(el, ctx);
        this.attachNodeEvents(node);
        this.pageLayer.add(node);
        this.nodes.set(el.id, node);
        this.elRefs.set(el.id, el);
      }
      node.draggable(!el.locked && tool === 'select' && !playing);
    }
    // z-order
    this.bgNode!.zIndex(0);
    page.elements.forEach((el, i) => this.nodes.get(el.id)?.zIndex(i + 1));

    this.syncTextHeights(page);
    this.updateSelection();
    this.drawOverlays();
    if (this.lastPlayback) this.applyTime(this.lastPlayback.t, this.lastPlayback.playing);
    this.pageLayer.batchDraw();
    if (this.editor.cropId) this.updateCrop();
  }

  syncTextHeights(page: Page) {
    const fixes: { id: string; h: number }[] = [];
    for (const el of page.elements) {
      if (el.type !== 'text' || !el.autoHeight) continue;
      const h = measureText(el);
      if (Math.abs(h - el.height) > 0.5) fixes.push({ id: el.id, h });
    }
    if (!fixes.length) return;
    queueMicrotask(() =>
      useEditor.getState().update(
        (d) => {
          for (const p of d.pages)
            for (const e of p.elements) {
              const f = fixes.find((x) => x.id === e.id);
              if (f) {
                // keep vertical centre stable when height changes due to rotation
                e.height = f.h;
              }
            }
        },
        { history: false },
      ),
    );
  }

  // ------------------------------------------------------------------ selection
  updateSelection() {
    const { selection, editingTextId, cropId } = this.editor;
    const playing = useUI.getState().playing;
    const page = this.page;
    const els = page?.elements.filter((e) => selection.includes(e.id)) || [];
    const unlocked = els.filter((e) => !e.locked && !e.hidden);
    const nodes = playing || cropId ? [] : (unlocked.map((e) => this.nodes.get(e.id)).filter(Boolean) as Konva.Node[]);
    this.tr.nodes(editingTextId ? [] : nodes);
    if (nodes.length === 1) {
      const el = unlocked[0];
      let anchors = ALL_ANCHORS;
      let keepRatio = false;
      if (el.type === 'text') {
        anchors = [...CORNERS, 'middle-left', 'middle-right'];
        keepRatio = true;
      } else if (el.type === 'line') {
        anchors = ['middle-left', 'middle-right'];
      } else if (el.type === 'image' || el.type === 'video' || (el.type === 'svg' && el.keepRatio !== false && el.meta?.kind !== 'chart' && el.meta?.kind !== 'table')) {
        keepRatio = true;
      } else if (el.type === 'draw') {
        keepRatio = true;
      }
      this.tr.setAttrs({ enabledAnchors: anchors, keepRatio, rotateEnabled: true });
    } else {
      this.tr.setAttrs({ enabledAnchors: CORNERS, keepRatio: true, rotateEnabled: true });
    }
    // locked outlines
    this.lockGroup.destroyChildren();
    for (const e of els.filter((x) => x.locked)) {
      this.lockGroup.add(
        new Konva.Rect({
          x: e.x + e.width / 2,
          y: e.y + e.height / 2,
          offsetX: e.width / 2,
          offsetY: e.height / 2,
          width: e.width,
          height: e.height,
          rotation: e.rotation,
          stroke: usePrefs.getState().accent,
          dash: [6, 4],
          strokeWidth: 1.5,
          strokeScaleEnabled: false,
        }),
      );
    }
    // hide text while it's being edited inline
    for (const [id, n] of this.nodes) {
      const inner = n.findOne('.inner');
      if (inner) inner.opacity(id === editingTextId ? 0 : 1);
    }
    this.hoverRect.visible(false);
    this.uiLayer.batchDraw();
    this.pageLayer.batchDraw();
    this.updateTextRect();
  }

  updateTextRect() {
    const id = this.editor.editingTextId;
    if (!id) {
      if (useView.getState().textRect) useView.setState({ textRect: null });
      return;
    }
    const f = findElement(this.editor.design, id);
    if (!f) return;
    const el = f.el;
    const z = this.stage.scaleX();
    useView.setState({
      textRect: {
        x: this.stage.x() + el.x * z,
        y: this.stage.y() + el.y * z,
        w: el.width * z,
        h: el.height * z,
        rotation: el.rotation,
        zoom: z,
      },
    });
  }

  // ------------------------------------------------------------------ overlays
  drawOverlays() {
    const d = this.editor.design;
    const page = this.page;
    if (!d || !page) return;
    const prefs = usePrefs.getState();
    const g = this.overlayGroup;
    g.destroyChildren();
    const z = this.stage.scaleX() || 1;
    if (prefs.showGrid && prefs.gridSize > 2) {
      const step = prefs.gridSize;
      for (let x = step; x < d.width; x += step) g.add(new Konva.Line({ points: [x, 0, x, d.height], stroke: 'rgba(109,74,255,0.18)', strokeWidth: 1, strokeScaleEnabled: false }));
      for (let y = step; y < d.height; y += step) g.add(new Konva.Line({ points: [0, y, d.width, y], stroke: 'rgba(109,74,255,0.18)', strokeWidth: 1, strokeScaleEnabled: false }));
    }
    if (prefs.showMargins) {
      const m = Math.round(Math.min(d.width, d.height) * 0.05);
      g.add(new Konva.Rect({ x: m, y: m, width: d.width - 2 * m, height: d.height - 2 * m, stroke: '#26b5d9', dash: [6 / z, 4 / z], strokeWidth: 1, strokeScaleEnabled: false }));
    }
    if (prefs.showBleed) {
      const b = Math.round(d.dpi * 0.125);
      g.add(new Konva.Rect({ x: -b, y: -b, width: d.width + 2 * b, height: d.height + 2 * b, stroke: '#e5484d', dash: [6 / z, 4 / z], strokeWidth: 1, strokeScaleEnabled: false }));
    }
    for (const gd of page.guides || []) {
      const line = new Konva.Line({
        points: gd.axis === 'x' ? [gd.pos, -10000, gd.pos, 10000] : [-10000, gd.pos, 10000, gd.pos],
        stroke: '#00a3ff',
        strokeWidth: 1,
        strokeScaleEnabled: false,
        hitStrokeWidth: 8,
      });
      g.add(line);
    }
    this.uiLayer.batchDraw();
  }

  drawSnapLines(lines: SnapLine[]) {
    this.snapGroup.destroyChildren();
    for (const l of lines) {
      this.snapGroup.add(
        new Konva.Line({
          points: l.axis === 'x' ? [l.pos, l.from, l.pos, l.to] : [l.from, l.pos, l.to, l.pos],
          stroke: l.kind === 'guide' ? '#00a3ff' : SNAP_COLOR,
          strokeWidth: 1,
          strokeScaleEnabled: false,
          dash: l.kind === 'page' ? [4, 4] : undefined,
        }),
      );
    }
    this.uiLayer.batchDraw();
  }

  // ------------------------------------------------------------------ node events
  attachNodeEvents(node: Konva.Group) {
    node.on('mouseenter', () => {
      if (this.dragging || useUI.getState().tool !== 'select') return;
      const id = node.id();
      if (this.editor.selection.includes(id)) return;
      const el = this.elRefs.get(id);
      if (!el) return;
      this.hoverRect.setAttrs({
        visible: true,
        x: el.x + el.width / 2,
        y: el.y + el.height / 2,
        offsetX: el.width / 2,
        offsetY: el.height / 2,
        width: el.width,
        height: el.height,
        rotation: el.rotation,
      });
      this.uiLayer.batchDraw();
      this.container.style.cursor = el.locked ? 'default' : 'move';
    });
    node.on('mouseleave', () => {
      this.hoverRect.visible(false);
      this.uiLayer.batchDraw();
      this.container.style.cursor = '';
    });
    node.on('dragstart', (e) => {
      const id = node.id();
      const st = this.editor;
      if (!st.selection.includes(id)) st.select([id], e.evt?.shiftKey);
      this.dragging = true;
      this.hoverRect.visible(false);
      this.dragStart = new Map();
      for (const sid of this.editor.selection) {
        const n = this.nodes.get(sid);
        if (n) this.dragStart.set(sid, { x: n.x(), y: n.y() });
      }
      if (!this.dragStart.has(id)) this.dragStart.set(id, { x: node.x(), y: node.y() });
    });
    node.on('dragmove', (e) => {
      if (!this.dragStart) return;
      const start = this.dragStart.get(node.id())!;
      let dx = node.x() - start.x;
      let dy = node.y() - start.y;
      // shift: constrain to axis
      if (e.evt?.shiftKey) {
        if (Math.abs(dx) > Math.abs(dy)) dy = 0;
        else dx = 0;
      }
      const prefs = usePrefs.getState();
      const page = this.page!;
      const moving = [...this.dragStart.keys()];
      const boxes = moving.map((id) => this.elRefs.get(id)).filter(Boolean).map((el) => elementAABB(el!));
      if (boxes.length) {
        const ub = unionBox(boxes);
        const others = page.elements.filter((x) => !moving.includes(x.id) && !x.hidden).map(elementAABB);
        const snap = e.evt?.altKey
          ? { dx: 0, dy: 0, lines: [] }
          : snapBox({ ...ub, x: ub.x + dx, y: ub.y + dy }, others, this.editor.design!, {
              threshold: 6 / this.stage.scaleX(),
              page: prefs.snapPage,
              objects: prefs.snapObjects,
              guides: page.guides,
              grid: prefs.snapGrid ? prefs.gridSize : undefined,
            });
        dx += snap.dx;
        dy += snap.dy;
        this.drawSnapLines(snap.lines);
      }
      for (const [id, p] of this.dragStart) {
        const n = this.nodes.get(id);
        n?.position({ x: p.x + dx, y: p.y + dy });
      }
    });
    node.on('dragend', () => {
      const moved = this.dragStart;
      this.dragStart = null;
      this.dragging = false;
      this.drawSnapLines([]);
      if (!moved) return;
      const patches = new Map<string, { x: number; y: number }>();
      for (const id of moved.keys()) {
        const n = this.nodes.get(id);
        const el = this.elRefs.get(id);
        if (!n || !el) continue;
        patches.set(id, { x: n.x() - el.width / 2, y: n.y() - el.height / 2 });
      }
      this.editor.update((d) => {
        for (const p of d.pages)
          for (const el of p.elements) {
            const pt = patches.get(el.id);
            if (pt) {
              el.x = pt.x;
              el.y = pt.y;
            }
          }
      });
      if (this.pendingRebuild) {
        this.pendingRebuild = false;
        this.requestRebuild();
      }
    });
    node.on('dblclick dbltap', () => {
      const el = this.elRefs.get(node.id());
      if (!el || el.locked) return;
      if (el.type === 'text') {
        this.editor.select([el.id]);
        this.editor.setEditingText(el.id);
      } else if ((el.type === 'image' || el.type === 'video') && el.assetId) {
        this.editor.select([el.id]);
        this.editor.setCrop(el.id);
      } else if (el.type === 'shape') {
        this.editor.select([el.id]);
        useUI.setState({ panel: null });
        window.dispatchEvent(new CustomEvent('kamva-edit-shape-text', { detail: el.id }));
      }
    });
  }

  // ------------------------------------------------------------------ transformer
  bindTransformer() {
    this.tr.on('transformstart', () => {
      this.transforming = true;
    });
    this.tr.on('transform', () => {
      // live feedback for text side-resize: counter the stretch so text reflows on release
      this.hoverRect.visible(false);
    });
    this.tr.on('transformend', () => {
      this.transforming = false;
      const anchor = this.tr.getActiveAnchor() || '';
      const corner = CORNERS.includes(anchor);
      const patches = new Map<string, Partial<DesignElement> & Record<string, unknown>>();
      for (const n of this.tr.nodes() as Konva.Group[]) {
        const el = this.elRefs.get(n.id());
        if (!el) continue;
        const sx = Math.abs(n.scaleX());
        const sy = Math.abs(n.scaleY());
        let w = el.width * sx;
        let h = el.height * sy;
        const p: any = { rotation: Math.round(n.rotation() * 100) / 100 };
        if (el.type === 'text') {
          if (corner || this.tr.nodes().length > 1) {
            const s = (sx + sy) / 2;
            p.fontSize = Math.max(1, +(el.fontSize * s).toFixed(2));
            p.letterSpacing = el.letterSpacing * s;
            p.effect = { ...el.effect, size: el.effect.size * s, offset: el.effect.offset * s };
            w = el.width * s;
            h = el.height * s;
          } else {
            h = el.height;
          }
        } else if (el.type === 'line') {
          h = el.height;
        } else if ((el.type === 'image' || el.type === 'video') && el.assetId) {
          const a = getAsset(el.assetId);
          const sw = a?.meta.width || 1;
          const sh = a?.meta.height || 1;
          if (Math.abs(sx - sy) > 0.001) p.crop = fitCrop(el.crop, sw, sh, el.width, el.height, w, h);
        } else if (el.type === 'svg' && el.meta?.kind === 'table' && el.meta.table && corner) {
          p.meta = { ...el.meta, table: { ...el.meta.table, fontSize: el.meta.table.fontSize * Math.min(sx, sy) } };
        }
        p.width = w;
        p.height = h;
        p.x = n.x() - w / 2;
        p.y = n.y() - h / 2;
        n.scale({ x: 1, y: 1 });
        patches.set(el.id, p);
      }
      this.editor.update((d) => {
        for (const pg of d.pages)
          for (const el of pg.elements) {
            const p = patches.get(el.id);
            if (p) Object.assign(el, p);
          }
      });
      if (this.pendingRebuild) {
        this.pendingRebuild = false;
        this.requestRebuild();
      }
    });
  }

  // ------------------------------------------------------------------ stage events
  bindStageEvents() {
    const stage = this.stage;

    stage.on('wheel', (e) => {
      e.evt.preventDefault();
      if (e.evt.ctrlKey || e.evt.metaKey) {
        const old = stage.scaleX();
        const p = stage.getPointerPosition()!;
        const factor = Math.exp(-e.evt.deltaY * 0.0022);
        const z = Math.max(0.05, Math.min(8, old * factor));
        const mp = { x: (p.x - stage.x()) / old, y: (p.y - stage.y()) / old };
        stage.scale({ x: z, y: z });
        stage.position({ x: p.x - mp.x * z, y: p.y - mp.y * z });
        this.afterView(true);
      } else {
        const dx = e.evt.shiftKey ? e.evt.deltaY : e.evt.deltaX;
        const dy = e.evt.shiftKey ? 0 : e.evt.deltaY;
        stage.position({ x: stage.x() - dx, y: stage.y() - dy });
        this.clampPan();
        this.afterView(false);
      }
    });

    stage.on('mousedown touchstart', (e) => {
      const evt = e.evt as MouseEvent;
      const tool = useUI.getState().tool;
      if (useView.getState().menu) useView.setState({ menu: null });
      // middle mouse / space / hand => pan
      if (evt.button === 1 || this.spaceDown || tool === 'hand') {
        evt.preventDefault?.();
        const p = stage.getPointerPosition()!;
        this.panning = { x: p.x, y: p.y, px: stage.x(), py: stage.y() };
        this.container.style.cursor = 'grabbing';
        return;
      }
      if (evt.button === 2) return;
      if (tool === 'draw') {
        this.startDraw();
        return;
      }
      const target = e.target;
      const elNode = target.findAncestor('.element') as Konva.Group | undefined;
      const onTransformer = target.getParent()?.className === 'Transformer' || target.findAncestor('Transformer');
      if (onTransformer) return;
      if (this.editor.cropId) {
        // clicking outside the crop UI finishes cropping
        if (!target.findAncestor('.cropUI')) this.editor.setCrop(null);
        return;
      }
      if (elNode) {
        const id = elNode.id();
        const st = this.editor;
        if (st.editingTextId && st.editingTextId !== id) st.setEditingText(null);
        if (evt.shiftKey || evt.ctrlKey || evt.metaKey) st.select([id], true);
        else if (!st.selection.includes(id)) st.select([id]);
        return;
      }
      // empty area / background: start marquee
      if (this.editor.editingTextId) this.editor.setEditingText(null);
      const p = this.pointer();
      this.marqueeStart = p;
      this.marqueeShift = !!evt.shiftKey;
      if (!evt.shiftKey) this.editor.select([]);
      // track outside the canvas too, so a drag released over a panel still selects
      window.addEventListener('mousemove', this.onMarqueeMove);
      window.addEventListener('mouseup', this.onMarqueeUp);
    });

    stage.on('mousemove touchmove', () => {
      if (this.panning) {
        const p = stage.getPointerPosition()!;
        stage.position({ x: this.panning.px + p.x - this.panning.x, y: this.panning.py + p.y - this.panning.y });
        this.afterView(false);
        return;
      }
      if (this.drawing) {
        this.continueDraw();
        return;
      }
      if (useUI.getState().tool === 'draw' && useUI.getState().draw.brush === 'eraser' && (window.event as MouseEvent)?.buttons === 1) {
        this.eraseAtPointer();
        return;
      }
    });

    const end = (e: Konva.KonvaEventObject<MouseEvent | TouchEvent>) => {
      if (this.panning) {
        this.panning = null;
        this.container.style.cursor = this.spaceDown || useUI.getState().tool === 'hand' ? 'grab' : '';
        return;
      }
      if (this.drawing) {
        this.finishDraw();
        return;
      }
      void e;
    };
    stage.on('mouseup touchend', end);
    window.addEventListener('mouseup', this.onWindowUp);

    stage.on('contextmenu', (e) => {
      e.evt.preventDefault();
      const elNode = e.target.findAncestor('.element') as Konva.Group | undefined;
      const id = elNode?.id() || null;
      if (id && !this.editor.selection.includes(id)) this.editor.select([id]);
      if (!id) this.editor.select([]);
      useView.setState({ menu: { x: e.evt.clientX, y: e.evt.clientY, id } });
    });

    stage.on('dblclick', (e) => {
      if (e.target === stage || e.target.findAncestor('.background')) {
        // double-click empty canvas: open background panel
        useUI.setState({ panel: 'background' });
      }
    });
  }

  onWindowUp = () => {
    if (this.marqueeStart && !this.marquee.visible()) this.marqueeStart = null;
  };

  marqueeShift = false;
  onMarqueeMove = (e: MouseEvent) => {
    if (!this.marqueeStart) return;
    const p = this.clientToDesign(e.clientX, e.clientY);
    const s = this.marqueeStart;
    this.marquee.setAttrs({ visible: true, x: Math.min(s.x, p.x), y: Math.min(s.y, p.y), width: Math.abs(p.x - s.x), height: Math.abs(p.y - s.y) });
    this.uiLayer.batchDraw();
  };
  onMarqueeUp = () => {
    window.removeEventListener('mousemove', this.onMarqueeMove);
    window.removeEventListener('mouseup', this.onMarqueeUp);
    if (!this.marqueeStart) return;
    const box = { x: this.marquee.x(), y: this.marquee.y(), width: this.marquee.width(), height: this.marquee.height() };
    const z = this.stage.scaleX();
    const visible = this.marquee.visible() && box.width * z > 3 && box.height * z > 3;
    this.marquee.visible(false);
    this.marqueeStart = null;
    this.uiLayer.batchDraw();
    if (visible) {
      const ids = (this.page?.elements || []).filter((el) => !el.hidden && intersects(elementAABB(el), box)).map((el) => el.id);
      this.editor.select(ids, this.marqueeShift);
    }
  };

  // ------------------------------------------------------------------ drawing
  startDraw() {
    const ds = useUI.getState().draw;
    if (ds.brush === 'eraser') {
      this.eraseAtPointer();
      return;
    }
    const p = this.pointer();
    const hl = ds.brush === 'highlighter';
    const line = new Konva.Line({
      points: [p.x, p.y, p.x + 0.01, p.y],
      stroke: ds.color,
      strokeWidth: ds.size,
      tension: ds.brush === 'pen' ? 0.4 : 0.2,
      lineCap: hl ? 'square' : 'round',
      lineJoin: 'round',
      opacity: hl ? 0.4 * ds.opacity : ds.opacity,
      listening: false,
    });
    this.uiLayer.add(line);
    this.drawing = { line, pts: [p.x, p.y] };
  }
  continueDraw() {
    if (!this.drawing) return;
    const p = this.pointer();
    const pts = this.drawing.pts;
    const lx = pts[pts.length - 2];
    const ly = pts[pts.length - 1];
    if (Math.hypot(p.x - lx, p.y - ly) < 1.5 / this.stage.scaleX()) return;
    pts.push(p.x, p.y);
    this.drawing.line.points(pts);
    this.uiLayer.batchDraw();
  }
  finishDraw() {
    const dr = this.drawing;
    this.drawing = null;
    if (!dr) return;
    dr.line.destroy();
    this.uiLayer.batchDraw();
    const ds = useUI.getState().draw;
    let pts = dr.pts;
    if (pts.length < 4) pts = [pts[0], pts[1], pts[0] + 0.5, pts[1] + 0.5];
    const pad = ds.size / 2;
    let x1 = Infinity, y1 = Infinity, x2 = -Infinity, y2 = -Infinity;
    for (let i = 0; i < pts.length; i += 2) {
      x1 = Math.min(x1, pts[i]);
      x2 = Math.max(x2, pts[i]);
      y1 = Math.min(y1, pts[i + 1]);
      y2 = Math.max(y2, pts[i + 1]);
    }
    x1 -= pad;
    y1 -= pad;
    x2 += pad;
    y2 += pad;
    const w = Math.max(2, x2 - x1);
    const h = Math.max(2, y2 - y1);
    const norm: number[] = [];
    for (let i = 0; i < pts.length; i += 2) norm.push((pts[i] - x1) / w, (pts[i + 1] - y1) / h);
    const el: DrawElement = makeDraw(norm, x1, y1, w, h, {
      stroke: ds.color,
      strokeWidth: ds.size,
      brush: ds.brush as DrawElement['brush'],
      opacity: ds.opacity,
      name: ds.brush === 'highlighter' ? 'Highlight' : 'Drawing',
    });
    this.editor.addElements([el], { select: false });
  }
  eraseAtPointer() {
    const p = this.stage.getPointerPosition();
    if (!p) return;
    const hit = this.pageLayer.getIntersection(p);
    const g = hit?.findAncestor('.element') as Konva.Group | undefined;
    const el = g && this.elRefs.get(g.id());
    if (el?.type === 'draw' && !el.locked) this.editor.deleteElements([el.id]);
  }

  // ------------------------------------------------------------------ tools / keys
  updateTool() {
    const tool = useUI.getState().tool;
    this.container.style.cursor = tool === 'draw' ? 'crosshair' : tool === 'hand' ? 'grab' : '';
    if (tool !== 'select') this.editor.select([]);
    this.sync();
  }

  setSpace(down: boolean) {
    this.spaceDown = down;
    if (!this.panning) this.container.style.cursor = down ? 'grab' : useUI.getState().tool === 'hand' ? 'grab' : '';
  }

  // ------------------------------------------------------------------ view
  resize(w: number, h: number) {
    this.stage.size({ width: w, height: h });
    useView.setState({ vw: w, vh: h });
    if (useUI.getState().fit) this.fit();
    else this.afterView(false);
  }

  fitZoom() {
    const d = this.editor.design;
    if (!d) return 1;
    const w = this.stage.width();
    const h = this.stage.height();
    return Math.max(0.02, Math.min((w - 96) / d.width, (h - 96) / d.height));
  }

  fit() {
    const d = this.editor.design;
    if (!d) return;
    const z = this.fitZoom();
    this.stage.scale({ x: z, y: z });
    this.stage.position({ x: (this.stage.width() - d.width * z) / 2, y: (this.stage.height() - d.height * z) / 2 });
    this.afterView(true, true);
  }

  zoomTo(z: number) {
    const d = this.editor.design;
    if (!d) return;
    const old = this.stage.scaleX();
    if (Math.abs(old - z) < 1e-4) return;
    const c = { x: this.stage.width() / 2, y: this.stage.height() / 2 };
    const mp = { x: (c.x - this.stage.x()) / old, y: (c.y - this.stage.y()) / old };
    this.stage.scale({ x: z, y: z });
    this.stage.position({ x: c.x - mp.x * z, y: c.y - mp.y * z });
    this.clampPan();
    this.afterView(true, true);
  }

  clampPan() {
    const d = this.editor.design;
    if (!d) return;
    const z = this.stage.scaleX();
    const W = d.width * z;
    const H = d.height * z;
    const vw = this.stage.width();
    const vh = this.stage.height();
    const m = 120;
    const x = Math.min(vw - m, Math.max(m - W, this.stage.x()));
    const y = Math.min(vh - m, Math.max(m - H, this.stage.y()));
    this.stage.position({ x, y });
  }

  afterView(zoomChanged: boolean, fromStore = false) {
    const z = this.stage.scaleX();
    useView.setState({ zoom: z, panX: this.stage.x(), panY: this.stage.y() });
    if (zoomChanged && !fromStore) useUI.setState({ zoom: z, fit: false });
    if (zoomChanged && fromStore) useUI.setState({ zoom: z });
    const step = z <= 1 ? 1 : z <= 2 ? 2 : 4;
    if (step !== this.scaleStep) {
      this.scaleStep = step;
      this.requestRebuild();
    }
    if (zoomChanged) this.drawOverlays();
    this.updateTextRect();
    this.stage.batchDraw();
  }

  // ------------------------------------------------------------------ playback
  setPlayback(globalT: number, playing: boolean) {
    this.lastPlayback = { t: globalT, playing };
    this.applyTime(globalT, playing);
  }

  applyTime(globalT: number, playing: boolean) {
    const d = this.editor.design;
    const page = this.page;
    if (!d || !page) return;
    let start = 0;
    for (const p of d.pages) {
      if (p.id === page.id) break;
      if (!p.hidden) start += p.duration;
    }
    const local = Math.max(0, Math.min(page.duration, globalT - start));
    const inPage = globalT >= start - 0.001 && globalT <= start + page.duration + 0.001;
    const animate = playing && inPage;
    for (const el of page.elements) {
      const n = this.nodes.get(el.id);
      if (!n) continue;
      applyAnimation(n, el, animate ? local : null, page.duration, d.width, d.height);
      if (el.type === 'video') this.syncVideo(n, el, local, playing && inPage);
    }
    const bgv = this.bgNode?.getAttr('video') as HTMLVideoElement | undefined;
    if (bgv) {
      bgv.muted = true;
      const target = bgv.duration ? local % bgv.duration : 0;
      if (playing && inPage) {
        if (Math.abs(bgv.currentTime - target) > 0.3) bgv.currentTime = target;
        if (bgv.paused) void bgv.play().catch(() => undefined);
      } else {
        bgv.pause();
        if (Math.abs(bgv.currentTime - target) > 0.04) {
          bgv.currentTime = target;
          bgv.addEventListener('seeked', () => this.pageLayer.batchDraw(), { once: true });
        }
      }
    }
    this.pageLayer.batchDraw();
  }

  syncVideo(n: Konva.Group, el: VideoElement, local: number, playing: boolean) {
    const v = n.getAttr('video') as HTMLVideoElement | undefined;
    if (!v || !el.assetId) return;
    const dur = getAsset(el.assetId)?.meta.duration || v.duration || 0;
    const target = videoSourceTime(el, local, dur);
    const start = el.timing?.start ?? 0;
    const end = el.timing?.end ?? Infinity;
    const active = local >= start && local <= end;
    v.muted = el.muted;
    v.volume = Math.max(0, Math.min(1, el.volume));
    v.playbackRate = el.speed || 1;
    v.loop = false;
    if (playing && active) {
      if (Math.abs(v.currentTime - target) > 0.3) v.currentTime = target;
      if (v.paused) void v.play().catch(() => undefined);
    } else {
      if (!v.paused) v.pause();
      if (Math.abs(v.currentTime - target) > 0.04 && v.readyState >= 1) {
        v.currentTime = target;
        v.addEventListener('seeked', () => this.pageLayer.batchDraw(), { once: true });
      }
    }
  }

  /** Called every animation frame while playing */
  tick() {
    this.pageLayer.batchDraw();
  }

  // ------------------------------------------------------------------ crop mode
  updateCrop() {
    this.cropGroup?.destroy();
    this.cropGroup = null;
    const id = this.editor.cropId;
    useView.setState({ cropActive: !!id });
    if (!id) {
      this.updateSelection();
      return;
    }
    const f = findElement(this.editor.design, id);
    if (!f || (f.el.type !== 'image' && f.el.type !== 'video') || !f.el.assetId) return;
    const el = f.el as ImageElement | VideoElement;
    const asset = getAsset(el.assetId);
    if (!asset) return;
    const sw = asset.meta.width || 1;
    const sh = asset.meta.height || 1;
    const src: CanvasImageSource | undefined = el.type === 'image' ? getImage(el.assetId) : (this.nodes.get(el.id)?.getAttr('video') as HTMLVideoElement);
    if (!src) return;

    this.tr.nodes([]);
    const w = el.width;
    const h = el.height;
    // Local space: element box at (0,0,w,h); group rotated like the element
    const g = new Konva.Group({ name: 'cropUI', x: el.x + w / 2, y: el.y + h / 2, offsetX: w / 2, offsetY: h / 2, rotation: el.rotation });
    const fullW = w / el.crop.w;
    const fullH = h / el.crop.h;
    const img = new Konva.Image({
      image: src as any,
      x: -el.crop.x * fullW,
      y: -el.crop.y * fullH,
      width: fullW,
      height: fullH,
      opacity: 0.45,
      draggable: true,
    });
    const frame = new Konva.Rect({ x: 0, y: 0, width: w, height: h, stroke: '#fff', strokeWidth: 2, strokeScaleEnabled: false, dash: [6, 4], listening: true, fill: 'rgba(0,0,0,0)' });
    // rule of thirds
    const thirds = new Konva.Group({ listening: false });
    const drawThirds = () => {
      thirds.destroyChildren();
      const fx = frame.x();
      const fy = frame.y();
      const fw = frame.width() * frame.scaleX();
      const fh = frame.height() * frame.scaleY();
      for (const k of [1 / 3, 2 / 3]) {
        thirds.add(new Konva.Line({ points: [fx + fw * k, fy, fx + fw * k, fy + fh], stroke: 'rgba(255,255,255,0.7)', strokeWidth: 1, strokeScaleEnabled: false }));
        thirds.add(new Konva.Line({ points: [fx, fy + fh * k, fx + fw, fy + fh * k], stroke: 'rgba(255,255,255,0.7)', strokeWidth: 1, strokeScaleEnabled: false }));
      }
    };
    drawThirds();
    g.add(img, frame, thirds);

    const accent = usePrefs.getState().accent;
    const trFrame = new Konva.Transformer({
      nodes: [frame],
      rotateEnabled: false,
      keepRatio: false,
      flipEnabled: false,
      anchorStroke: accent,
      borderStroke: accent,
      anchorSize: 12,
      enabledAnchors: ALL_ANCHORS,
      boundBoxFunc: (oldB, newB) => (newB.width < 10 || newB.height < 10 ? oldB : newB),
    });
    const trImg = new Konva.Transformer({
      nodes: [img],
      rotateEnabled: false,
      keepRatio: true,
      flipEnabled: false,
      enabledAnchors: CORNERS,
      anchorFill: accent,
      anchorStroke: '#fff',
      borderStroke: 'rgba(255,255,255,0.6)',
      anchorSize: 10,
    });
    g.add(trImg, trFrame);

    // Keep the image covering the frame
    const constrain = () => {
      const fx = frame.x();
      const fy = frame.y();
      const fw = frame.width() * frame.scaleX();
      const fh = frame.height() * frame.scaleY();
      let iw = img.width() * img.scaleX();
      let ih = img.height() * img.scaleY();
      const k = Math.max(1, fw / iw, fh / ih);
      if (k > 1) {
        img.scale({ x: img.scaleX() * k, y: img.scaleY() * k });
        iw *= k;
        ih *= k;
      }
      img.x(Math.min(fx, Math.max(fx + fw - iw, img.x())));
      img.y(Math.min(fy, Math.max(fy + fh - ih, img.y())));
    };
    const constrainFrame = () => {
      // frame must stay inside image
      const ix = img.x();
      const iy = img.y();
      const iw = img.width() * img.scaleX();
      const ih = img.height() * img.scaleY();
      let fx = frame.x();
      let fy = frame.y();
      let fw = frame.width() * frame.scaleX();
      let fh = frame.height() * frame.scaleY();
      if (fx < ix) {
        fw -= ix - fx;
        fx = ix;
      }
      if (fy < iy) {
        fh -= iy - fy;
        fy = iy;
      }
      fw = Math.min(fw, ix + iw - fx);
      fh = Math.min(fh, iy + ih - fy);
      frame.setAttrs({ x: fx, y: fy, width: Math.max(10, fw), height: Math.max(10, fh), scaleX: 1, scaleY: 1 });
    };
    img.on('dragmove', () => {
      constrain();
      drawThirds();
    });
    img.on('transform', () => {
      constrain();
      drawThirds();
    });
    frame.on('transform', () => {
      constrainFrame();
      drawThirds();
    });
    this.uiLayer.add(g);
    this.cropGroup = g;

    const commit = () => {
      const fx = frame.x();
      const fy = frame.y();
      const fw = frame.width() * frame.scaleX();
      const fh = frame.height() * frame.scaleY();
      const iw = img.width() * img.scaleX();
      const ih = img.height() * img.scaleY();
      const crop = { x: (fx - img.x()) / iw, y: (fy - img.y()) / ih, w: fw / iw, h: fh / ih };
      // new element box: frame position in element local space -> design space (account rotation)
      const r = (el.rotation * Math.PI) / 180;
      const cxL = fx + fw / 2 - w / 2;
      const cyL = fy + fh / 2 - h / 2;
      const cx = el.x + w / 2 + cxL * Math.cos(r) - cyL * Math.sin(r);
      const cy = el.y + h / 2 + cxL * Math.sin(r) + cyL * Math.cos(r);
      return { crop, x: cx - fw / 2, y: cy - fh / 2, width: fw, height: fh };
    };
    g.setAttr('commit', commit);
    void sw;
    void sh;
    this.uiLayer.batchDraw();
  }

  /** Called when leaving crop mode via the Done button */
  commitCrop() {
    const id = this.editor.cropId;
    const commit = this.cropGroup?.getAttr('commit') as (() => any) | undefined;
    if (id && commit) {
      const p = commit();
      this.editor.updateElements([id], p);
    }
    this.editor.setCrop(null);
  }

  resetCrop() {
    const id = this.editor.cropId;
    if (!id) return;
    this.editor.updateElements([id], { crop: { x: 0, y: 0, w: 1, h: 1 } } as any);
    this.editor.setCrop(null);
    setTimeout(() => this.editor.setCrop(id));
  }

  // ------------------------------------------------------------------ export snapshot of selection bounds
  selectionScreenBox(): { x: number; y: number; w: number; h: number } | null {
    const nodes = this.tr.nodes();
    if (!nodes.length) {
      const sel = this.editor.selection;
      const els = (this.page?.elements || []).filter((e) => sel.includes(e.id));
      if (!els.length) return null;
      const b = unionBox(els.map(elementAABB));
      const z = this.stage.scaleX();
      return { x: this.stage.x() + b.x * z, y: this.stage.y() + b.y * z, w: b.width * z, h: b.height * z };
    }
    const r = this.tr.getClientRect();
    return { x: r.x, y: r.y, w: r.width, h: r.height };
  }

  totalTime() {
    const d = this.editor.design;
    return d ? totalDuration(d) : 0;
  }

  destroy() {
    this.destroyed = true;
    this.unsubs.forEach((u) => u());
    window.removeEventListener('mouseup', this.onWindowUp);
    window.removeEventListener('mousemove', this.onMarqueeMove);
    window.removeEventListener('mouseup', this.onMarqueeUp);
    cancelAnimationFrame(this.raf);
    for (const [k, v] of allVideoEls()) if (k.startsWith('edit:')) v.pause();
    this.stage.destroy();
  }
}

export let activeCanvas: CanvasController | null = null;
export function setActiveCanvas(c: CanvasController | null) {
  activeCanvas = c;
}

export type { TextElement };
