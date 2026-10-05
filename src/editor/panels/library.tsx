import { createElement, memo, useEffect, useMemo, useRef, useState } from 'react';
import type { ChartSpec, DesignElement, Fill, ShapeKind, TableSpec, LineElement } from '../../types';
import { makeImage, makeLine, makeShape, makeSvg, makeText } from '../../lib/defaults';
import { SHAPE_LIST, FRAME_LIST, shapePath, shapeUsesEvenOdd } from '../../lib/shapes';
import { PRESET_GRADIENTS, fillToCss } from '../../lib/color';
import { chartSvg, defaultChart, defaultTable, iconSvg, loadIcons, svgToDataUrl, tableSvg } from '../../lib/render/svgUtil';
import { LibTile, centreXY, pageDims, prettify } from './common';
import { EMOJI } from './emoji';

// ---------------------------------------------------------------------------
// Element factories. Everything is sized relative to the page and centred on it;
// a canvas drop re-centres the element at the drop point.
// ---------------------------------------------------------------------------
const WIDE: ShapeKind[] = ['arrowRight', 'arrowLeft', 'parallelogram', 'trapezoid', 'chevron', 'tag'];

export function shapeAspect(kind: ShapeKind): [number, number] {
  if (WIDE.includes(kind)) return [1.6, 1];
  if (kind === 'arch') return [1, 1.25];
  if (kind === 'semicircle') return [1, 0.5];
  if (kind === 'arrowUp' || kind === 'arrowDown') return [1, 1.4];
  return [1, 1];
}

export function makeShapeEl(kind: ShapeKind, label?: string, fill?: Fill): DesignElement | null {
  const d = pageDims();
  if (!d) return null;
  const s = d.S * 0.3;
  const [aw, ah] = shapeAspect(kind);
  const w = s * aw;
  const h = s * ah;
  const { x, y } = centreXY(w, h);
  const el = makeShape(kind, x, y, w, h);
  if (fill) el.fill = structuredClone(fill);
  if (label) el.name = label;
  return el;
}

export interface LinePreset {
  id: string;
  label: string;
  opts: Partial<LineElement>;
  /** stroke width relative to the default */
  weight?: number;
}

export const LINE_PRESETS: LinePreset[] = [
  { id: 'line', label: 'Line', opts: {} },
  { id: 'dashed', label: 'Dashed line', opts: { strokeDash: 'dashed', lineCap: 'butt' } },
  { id: 'dotted', label: 'Dotted line', opts: { strokeDash: 'dotted', lineCap: 'round' } },
  { id: 'arrow', label: 'Arrow', opts: { end: 'arrow' } },
  { id: 'double', label: 'Double arrow', opts: { start: 'arrow', end: 'arrow' } },
  { id: 'triangle', label: 'Pointer', opts: { end: 'triangle' } },
  { id: 'curved', label: 'Curved line', opts: { curve: 0.3 } },
  { id: 'curvedArrow', label: 'Curved arrow', opts: { curve: 0.3, end: 'arrow' } },
  { id: 'thick', label: 'Thick line', opts: { lineCap: 'butt' }, weight: 3 },
  { id: 'dots', label: 'Connector', opts: { start: 'circle', end: 'circle' } },
];

export function makeLineEl(p: LinePreset): DesignElement | null {
  const d = pageDims();
  if (!d) return null;
  const len = d.W * 0.4;
  const sw = Math.max(2, Math.round((d.S / 180) * (p.weight ?? 1)));
  const h = Math.max(24, sw * 4, p.opts.curve ? len * Math.abs(p.opts.curve) * 0.6 : 0);
  const { x, y } = centreXY(len, h);
  const el = makeLine(x, y, len, { strokeWidth: sw, name: p.label, ...p.opts });
  el.height = h;
  return el;
}

export function makeFrameEl(kind: ShapeKind, label: string): DesignElement | null {
  const d = pageDims();
  if (!d) return null;
  const s = d.S * 0.4;
  const w = s;
  const h = kind === 'arch' ? s * 1.25 : kind === 'semicircle' ? s / 2 : s;
  const { x, y } = centreXY(w, h);
  return makeImage(null, x, y, w, h, { mask: kind === 'rect' ? 'none' : kind, name: `${label} frame` });
}

export function makeGradientEl(fill: Fill, i: number): DesignElement | null {
  const d = pageDims();
  if (!d) return null;
  const s = d.S * 0.4;
  const { x, y } = centreXY(s, s);
  const el = makeShape('rect', x, y, s, s);
  el.fill = structuredClone(fill);
  el.name = `Gradient ${i + 1}`;
  return el;
}

type IconNode = [string, Record<string, string>][];

export function makeIconEl(name: string, nodes: IconNode): DesignElement | null {
  const d = pageDims();
  if (!d) return null;
  const s = d.S * 0.22;
  const { x, y } = centreXY(s, s);
  return makeSvg(iconSvg(nodes, '#1f2937'), x, y, s, s, { meta: { kind: 'icon', icon: name }, strokeWidth: 2, name: prettify(name) });
}

export function makeEmojiEl(emoji: string, name: string): DesignElement | null {
  const d = pageDims();
  if (!d) return null;
  const fs = Math.round(d.S * 0.2);
  const w = fs * 1.5;
  const { x, y } = centreXY(w, fs * 1.3);
  return makeText(emoji, x, y, w, { fontSize: fs, fontFamily: 'Segoe UI Emoji', lineHeight: 1.2, name });
}

export const CHART_TYPES: { type: ChartSpec['type']; label: string }[] = [
  { type: 'column', label: 'Column chart' },
  { type: 'bar', label: 'Bar chart' },
  { type: 'line', label: 'Line chart' },
  { type: 'area', label: 'Area chart' },
  { type: 'pie', label: 'Pie chart' },
  { type: 'donut', label: 'Donut chart' },
  { type: 'progress', label: 'Progress ring' },
];

function chartBox(type: ChartSpec['type'], S: number): [number, number] {
  if (type === 'progress') return [S * 0.35, S * 0.35];
  if (type === 'pie' || type === 'donut') return [S * 0.6, S * 0.4];
  return [S * 0.6, S * 0.4];
}

export function makeChartEl(type: ChartSpec['type'], label: string): DesignElement | null {
  const d = pageDims();
  if (!d) return null;
  const [w, h] = chartBox(type, d.S);
  const { x, y } = centreXY(w, h);
  const chart = defaultChart(type);
  return makeSvg(chartSvg(chart, Math.round(w), Math.round(h)), x, y, w, h, { meta: { kind: 'chart', chart }, keepRatio: false, name: label });
}

export interface TablePreset {
  id: string;
  label: string;
  make: () => TableSpec;
}

export const TABLE_PRESETS: TablePreset[] = [
  { id: 'classic', label: 'Classic table', make: () => defaultTable() },
  {
    id: 'accent',
    label: 'Accent table',
    make: () => ({ ...defaultTable(), headerFill: '#7c5cff', borderColor: '#e4defe', altFill: '#f6f3ff' }),
  },
  {
    id: 'minimal',
    label: 'Minimal table',
    make: () => ({ ...defaultTable(), headerFill: '#ffffff', headerColor: '#111827', altFill: '#ffffff', borderColor: '#e5e7eb' }),
  },
  {
    id: 'grid',
    label: 'Empty grid',
    make: () => ({
      ...defaultTable(),
      rows: [
        ['Header', 'Header', 'Header'],
        ['', '', ''],
        ['', '', ''],
      ],
    }),
  },
];

export function makeTableEl(p: TablePreset): DesignElement | null {
  const d = pageDims();
  if (!d) return null;
  const t = p.make();
  const w = d.S * 0.6;
  const h = Math.min(d.H * 0.6, w * 0.13 * t.rows.length);
  t.fontSize = Math.max(10, Math.round((22 * w) / 600));
  const { x, y } = centreXY(w, h);
  return makeSvg(tableSvg(t, Math.round(w), Math.round(h)), x, y, w, h, { meta: { kind: 'table', table: t }, keepRatio: false, name: p.label });
}

// ---------------------------------------------------------------------------
// Preview components
// ---------------------------------------------------------------------------
export const ShapePreview = memo(function ShapePreview({ kind }: { kind: ShapeKind }) {
  const [aw, ah] = shapeAspect(kind);
  const w = 60 * aw;
  const h = 60 * ah;
  return (
    <svg viewBox={`-2 -2 ${w + 4} ${h + 4}`} className="lib-shape" width="100%" height="100%">
      <path d={shapePath(kind, w, h, kind === 'roundRect' ? Math.min(w, h) * 0.15 : 0)} fillRule={shapeUsesEvenOdd(kind) ? 'evenodd' : 'nonzero'} />
    </svg>
  );
});

export const ShapeGrid = memo(function ShapeGrid({ items }: { items: { kind: ShapeKind; label: string }[] }) {
  return (
    <div className="tile-grid cols-4">
      {items.map((s) => (
        <LibTile key={s.kind} tip={s.label} make={() => makeShapeEl(s.kind, s.label)}>
          <ShapePreview kind={s.kind} />
        </LibTile>
      ))}
    </div>
  );
});

function LinePreview({ p }: { p: LinePreset }) {
  const sw = 3 * (p.weight ?? 1) * 0.8;
  const dash = p.opts.strokeDash === 'dashed' ? `${sw * 3} ${sw * 2}` : p.opts.strokeDash === 'dotted' ? `0.1 ${sw * 2.2}` : undefined;
  const cap = p.opts.strokeDash === 'dotted' ? 'round' : p.opts.lineCap === 'butt' ? 'butt' : 'round';
  const curve = p.opts.curve ?? 0;
  const x0 = p.opts.start && p.opts.start !== 'none' ? 10 : 6;
  const x1 = p.opts.end && p.opts.end !== 'none' ? 54 : 58;
  const d = curve ? `M${x0},36 Q32,${36 - curve * 80} ${x1},36` : `M${x0},32 L${x1},32`;
  const head = (x: number, y: number, dir: 1 | -1, kind?: string) => {
    if (!kind || kind === 'none') return null;
    if (kind === 'circle') return <circle cx={x} cy={y} r={4} className="lib-fill" />;
    if (kind === 'triangle') return <path d={`M${x + dir * 8},${y} L${x - dir * 2},${y - 6} L${x - dir * 2},${y + 6} Z`} className="lib-fill" />;
    return <path d={`M${x - dir * 6},${y - 6} L${x + dir * 2},${y} L${x - dir * 6},${y + 6}`} fill="none" stroke="currentColor" strokeWidth={sw} strokeLinecap="round" strokeLinejoin="round" />;
  };
  const yEnd = curve ? 36 : 32;
  return (
    <svg viewBox="0 0 64 64" width="100%" height="100%" className="lib-line">
      <path d={d} fill="none" stroke="currentColor" strokeWidth={sw} strokeDasharray={dash} strokeLinecap={cap} />
      {head(x0 - 2, yEnd, -1, p.opts.start)}
      {head(x1 + 2, yEnd, 1, p.opts.end)}
    </svg>
  );
}

export const LineGrid = memo(function LineGrid({ items }: { items: LinePreset[] }) {
  return (
    <div className="tile-grid cols-4">
      {items.map((p) => (
        <LibTile key={p.id} tip={p.label} make={() => makeLineEl(p)}>
          <LinePreview p={p} />
        </LibTile>
      ))}
    </div>
  );
});

export const FrameGrid = memo(function FrameGrid({ items }: { items: { kind: ShapeKind; label: string }[] }) {
  return (
    <div className="tile-grid cols-4">
      {items.map((f) => {
        const w = 60;
        const h = f.kind === 'arch' ? 75 : f.kind === 'semicircle' ? 30 : 60;
        return (
          <LibTile key={f.kind} tip={`${f.label} frame`} make={() => makeFrameEl(f.kind, f.label)}>
            <svg viewBox={`-2 -2 ${w + 4} ${h + 4}`} width="100%" height="100%" className="lib-frame">
              <path d={shapePath(f.kind, w, h)} />
              <path d={`M${w * 0.22},${h * 0.72} L${w * 0.42},${h * 0.5} L${w * 0.56},${h * 0.62} L${w * 0.66},${h * 0.54} L${w * 0.8},${h * 0.72} Z`} className="lib-frame-mark" />
              <circle cx={w * 0.66} cy={h * 0.36} r={w * 0.06} className="lib-frame-mark" />
            </svg>
          </LibTile>
        );
      })}
    </div>
  );
});

export const GradientGrid = memo(function GradientGrid({ items }: { items: Fill[] }) {
  return (
    <div className="tile-grid cols-4">
      {items.map((g, i) => (
        <LibTile key={i} tip="Gradient" make={() => makeGradientEl(g, i)} className="flush">
          <span className="lib-gradient" style={{ background: fillToCss(g) }} />
        </LibTile>
      ))}
    </div>
  );
});

// ---------------------------------------------------------------- icons
export interface IconEntry {
  name: string;
  nodes: IconNode;
  hay: string;
}

let iconCache: IconEntry[] | null = null;
let iconPromise: Promise<IconEntry[]> | null = null;

function loadIconEntries(): Promise<IconEntry[]> {
  if (iconCache) return Promise.resolve(iconCache);
  iconPromise ||= loadIcons().then(({ nodes, tags }) => {
    iconCache = Object.keys(nodes)
      .sort()
      .map((name) => ({ name, nodes: nodes[name] as IconNode, hay: (name.replace(/-/g, ' ') + ' ' + (tags[name] || []).join(' ')).toLowerCase() }));
    return iconCache;
  });
  return iconPromise;
}

export function useIcons(): IconEntry[] | null {
  const [list, setList] = useState<IconEntry[] | null>(iconCache);
  useEffect(() => {
    if (list) return;
    let alive = true;
    loadIconEntries()
      .then((l) => alive && setList(l))
      .catch(() => alive && setList([]));
    return () => {
      alive = false;
    };
  }, [list]);
  return list;
}

const FEATURED = ['star', 'heart', 'sparkles', 'zap', 'sun', 'cloud', 'flame', 'leaf', 'gift', 'camera', 'music', 'phone', 'mail', 'map-pin', 'calendar', 'clock', 'globe', 'shopping-bag', 'coffee', 'house', 'rocket', 'trophy', 'crown', 'lightbulb', 'palette', 'thumbs-up', 'message-circle', 'bell', 'party-popper', 'plane'];

/** Popular icons first, then the rest alphabetically */
export function featuredFirst(list: IconEntry[]): IconEntry[] {
  const set = new Set(FEATURED);
  const top = FEATURED.map((n) => list.find((i) => i.name === n)).filter(Boolean) as IconEntry[];
  return [...top, ...list.filter((i) => !set.has(i.name))];
}

export function searchIcons(list: IconEntry[], q: string): IconEntry[] {
  const terms = q.toLowerCase().trim().split(/\s+/).filter(Boolean);
  if (!terms.length) return featuredFirst(list);
  const hits = list.filter((i) => terms.every((t) => i.hay.includes(t)));
  // name matches first
  return hits.sort((a, b) => Number(!a.name.includes(terms[0])) - Number(!b.name.includes(terms[0])));
}

const IconGlyph = memo(function IconGlyph({ nodes }: { nodes: IconNode }) {
  return (
    <svg viewBox="0 0 24 24" width="100%" height="100%" fill="none" stroke="currentColor" strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round">
      {nodes.map(([tag, attrs], i) => {
        const { key: _k, ...rest } = attrs as Record<string, string>;
        return createElement(tag, { key: i, ...rest });
      })}
    </svg>
  );
});

const IconTile = memo(function IconTile({ icon }: { icon: IconEntry }) {
  return (
    <LibTile tip={prettify(icon.name)} make={() => makeIconEl(icon.name, icon.nodes)} className="icon-tile">
      <IconGlyph nodes={icon.nodes} />
    </LibTile>
  );
});

/** Renders a long list in pages, loading more when the sentinel scrolls into view. */
export function Paged<T>({ items, page = 120, render, cols = 5 }: { items: T[]; page?: number; render: (item: T) => React.ReactNode; cols?: number }) {
  const [n, setN] = useState(page);
  const sentinel = useRef<HTMLDivElement>(null);
  useEffect(() => setN(page), [items, page]);
  useEffect(() => {
    const el = sentinel.current;
    if (!el || n >= items.length) return;
    const io = new IntersectionObserver((entries) => {
      if (entries.some((e) => e.isIntersecting)) setN((v) => Math.min(items.length, v + page));
    });
    io.observe(el);
    return () => io.disconnect();
  }, [n, items.length, page]);
  return (
    <>
      <div className={`tile-grid cols-${cols}`}>{items.slice(0, n).map(render)}</div>
      {n < items.length && (
        <div ref={sentinel} className="lib-more">
          <button className="btn sm ghost" onClick={() => setN((v) => v + page)}>
            Show more ({items.length - n} left)
          </button>
        </div>
      )}
    </>
  );
}

export function IconGrid({ items, limit }: { items: IconEntry[]; limit?: number }) {
  if (limit) {
    return <div className="tile-grid cols-5">{items.slice(0, limit).map((i) => <IconTile key={i.name} icon={i} />)}</div>;
  }
  return <Paged items={items} render={(i) => <IconTile key={i.name} icon={i} />} />;
}

// ---------------------------------------------------------------- emoji
export function searchEmoji(q: string) {
  const t = q.toLowerCase().trim();
  if (!t) return EMOJI;
  return EMOJI.filter((e) => e.name.toLowerCase().includes(t) || e.keys.includes(t) || e.char === t);
}

export const EmojiGrid = memo(function EmojiGrid({ items, limit }: { items: typeof EMOJI; limit?: number }) {
  return (
    <div className="tile-grid cols-6 emoji-grid">
      {(limit ? items.slice(0, limit) : items).map((e) => (
        <LibTile key={e.char} tip={e.name} make={() => makeEmojiEl(e.char, e.name)} className="emoji-tile">
          <span className="emoji-glyph">{e.char}</span>
        </LibTile>
      ))}
    </div>
  );
});

// ---------------------------------------------------------------- charts & tables
const ChartPreview = memo(function ChartPreview({ type }: { type: ChartSpec['type'] }) {
  const src = useMemo(() => {
    const [w, h] = type === 'progress' ? [200, 200] : [300, 200];
    return svgToDataUrl(chartSvg(defaultChart(type), w, h));
  }, [type]);
  return <img src={src} alt="" draggable={false} />;
});

export const ChartGrid = memo(function ChartGrid({ limit }: { limit?: number }) {
  const list = limit ? CHART_TYPES.slice(0, limit) : CHART_TYPES;
  return (
    <div className="tile-grid cols-3">
      {list.map((c) => (
        <LibTile key={c.type} tip={c.label} make={() => makeChartEl(c.type, c.label)} className="paper-tile">
          <ChartPreview type={c.type} />
        </LibTile>
      ))}
    </div>
  );
});

const TablePreview = memo(function TablePreview({ p }: { p: TablePreset }) {
  const src = useMemo(() => {
    const t = p.make();
    t.fontSize = 26;
    return svgToDataUrl(tableSvg(t, 300, 60 * t.rows.length));
  }, [p]);
  return <img src={src} alt="" draggable={false} />;
});

export const TableGrid = memo(function TableGrid() {
  return (
    <div className="tile-grid cols-2">
      {TABLE_PRESETS.map((p) => (
        <LibTile key={p.id} tip={p.label} make={() => makeTableEl(p)} className="paper-tile wide">
          <TablePreview p={p} />
        </LibTile>
      ))}
    </div>
  );
});

export { SHAPE_LIST, FRAME_LIST, PRESET_GRADIENTS };
