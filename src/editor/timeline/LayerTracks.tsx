// Per-element tracks for the active page: one row per layer, a bar showing when
// the element is on screen. Drag a bar to move it in time, drag its edges to
// change when it appears / disappears (video edges trim the clip itself).
import React, { memo, useEffect, useRef, useState } from 'react';
import {
  ChevronDown, ChevronRight, Eye, EyeOff, Film, Image as ImageIcon, Lock, Minus, PenLine, Repeat, Shapes, Smile, Type, VolumeX,
} from 'lucide-react';
import type { Design, DesignElement, Page, VideoElement } from '../../types';
import { useEditor } from '../../store/editor';
import { useUI } from '../../store/ui';
import { getAsset, getPeaks } from '../../lib/assets';
import {
  elementSpan, moveSpan, trimSpan, trimVideoEnd, trimVideoStart, videoMotionEnd, videoSourceTime,
} from '../../lib/timing';
import { toggleHidden } from '../elementActions';
import { defaultName } from '../panels/LayersPanel';
import { ContextMenu, MenuItem } from '../../components/ui';
import { pointerDrag, fmtDur } from './common';
import { assetDuration } from './edits';
import { frameAt, getFilmstrip, filmstripNow, Filmstrip } from './filmstrip';
import { elementMenuItems } from './menus';

export const LAYER_H = 30;
export const LAYERS_HEAD_H = 24;
const MAX_CANVAS = 8192;

export type SnapFn = (globalT: number, exclude: Set<string>, len?: number) => number;

const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));

export function TypeIcon({ el, size = 12 }: { el: DesignElement; size?: number }) {
  switch (el.type) {
    case 'text':
      return <Type size={size} />;
    case 'shape':
      return <Shapes size={size} />;
    case 'line':
      return <Minus size={size} />;
    case 'image':
      return <ImageIcon size={size} />;
    case 'video':
      return <Film size={size} />;
    case 'draw':
      return <PenLine size={size} />;
    default:
      return <Smile size={size} />;
  }
}

/** The fields a timeline drag may change */
type TimeFields = Pick<VideoElement, 'trimStart' | 'trimEnd'> & { timing?: DesignElement['timing'] };
function timeFields(el: DesignElement): TimeFields {
  const v = el as VideoElement;
  return { timing: el.timing ? { ...el.timing } : undefined, trimStart: v.trimStart, trimEnd: v.trimEnd };
}
const sameFields = (a: TimeFields, b: TimeFields) =>
  a.trimStart === b.trimStart &&
  a.trimEnd === b.trimEnd &&
  (a.timing?.start ?? null) === (b.timing?.start ?? null) &&
  (a.timing?.end ?? null) === (b.timing?.end ?? null) &&
  !!a.timing === !!b.timing;

export function LayerSection(props: {
  design: Design;
  page: Page;
  pageIndex: number;
  pageStart: number;
  pps: number;
  trackW: number;
  snap: SnapFn;
  collapsed: boolean;
  onToggle: () => void;
  onFocusTimeline: () => void;
}) {
  const { design, page, pageIndex, pageStart, pps, trackW, collapsed } = props;
  const selection = useEditor((s) => s.selection);
  const [menu, setMenu] = useState<{ x: number; y: number; items: MenuItem[] } | null>(null);
  const els = [...page.elements].reverse(); // top layer first, like the Layers panel
  return (
    <>
      <div className="tl-row tl-layers-head" style={{ height: LAYERS_HEAD_H }}>
        <div className="tl-head">
          <button className="tl-section-btn" onClick={props.onToggle} aria-expanded={!collapsed}>
            {collapsed ? <ChevronRight size={12} /> : <ChevronDown size={12} />}
            Layers
            <span className="tl-count">{page.elements.length}</span>
          </button>
        </div>
        <div className="tl-track" style={{ width: trackW }}>
          <div className="tl-page-zone" style={{ left: pageStart * pps, width: page.duration * pps }}>
            <span>{page.name || `Page ${pageIndex + 1}`}</span>
          </div>
        </div>
      </div>
      {!collapsed &&
        els.map((el) => (
          <LayerRow
            key={el.id}
            el={el}
            design={design}
            page={page}
            pageStart={pageStart}
            pps={pps}
            trackW={trackW}
            selected={selection.includes(el.id)}
            snap={props.snap}
            onFocusTimeline={props.onFocusTimeline}
            onMenu={(e) => {
              e.preventDefault();
              const st = useEditor.getState();
              if (!st.selection.includes(el.id)) st.select([el.id]);
              setMenu({ x: e.clientX, y: e.clientY, items: elementMenuItems(el.id) });
            }}
          />
        ))}
      {!collapsed && !els.length && (
        <div className="tl-row" style={{ height: LAYER_H }}>
          <div className="tl-head" />
          <div className="tl-track" style={{ width: trackW }}>
            <div className="tl-empty-lane" style={{ left: pageStart * pps + 8 }}>
              Add text, photos or videos to this page and they show up here.
            </div>
          </div>
        </div>
      )}
      {menu && <ContextMenu x={menu.x} y={menu.y} items={menu.items} onClose={() => setMenu(null)} />}
    </>
  );
}

const LayerRow = memo(function LayerRow(props: {
  el: DesignElement;
  design: Design;
  page: Page;
  pageStart: number;
  pps: number;
  trackW: number;
  selected: boolean;
  snap: SnapFn;
  onFocusTimeline: () => void;
  onMenu: (e: React.MouseEvent) => void;
}) {
  const { el, page, pageStart, pps, trackW, selected } = props;
  const name = defaultName(el);
  return (
    <div className={'tl-row tl-layer' + (selected ? ' selected' : '')} style={{ height: LAYER_H }}>
      <div
        className="tl-head tl-layer-head"
        onPointerDown={(e) => {
          if (e.button !== 0 || (e.target as HTMLElement).closest('button')) return;
          useEditor.getState().select([el.id], e.shiftKey);
          props.onFocusTimeline();
        }}
        onContextMenu={props.onMenu}
        title={name}
      >
        <span className="tl-layer-name">
          <TypeIcon el={el} />
          <span>{name}</span>
        </span>
        {el.locked && <Lock size={11} className="tl-layer-lock" />}
        <button
          className={'tl-eye' + (el.hidden ? ' off' : '')}
          onClick={() => toggleHidden(el.id)}
          aria-label={el.hidden ? 'Show' : 'Hide'}
          title={el.hidden ? 'Show' : 'Hide'}
        >
          {el.hidden ? <EyeOff size={12} /> : <Eye size={12} />}
        </button>
      </div>
      <div
        className="tl-track"
        style={{ width: trackW }}
        onPointerDown={(e) => {
          if (e.target === e.currentTarget || (e.target as HTMLElement).classList.contains('tl-page-zone')) useEditor.getState().select([]);
        }}
      >
        <div className="tl-page-zone" style={{ left: pageStart * pps, width: page.duration * pps }} />
        <LayerBar {...props} name={name} />
      </div>
    </div>
  );
});

function LayerBar(props: {
  el: DesignElement;
  design: Design;
  page: Page;
  pageStart: number;
  pps: number;
  selected: boolean;
  name: string;
  snap: SnapFn;
  onFocusTimeline: () => void;
  onMenu: (e: React.MouseEvent) => void;
}) {
  const { el, design, page, pageStart, pps, selected, name } = props;
  const pageDur = page.duration;
  const span = elementSpan(el, pageDur);
  const left = (pageStart + span.start) * pps;
  const width = Math.max(4, (span.end - span.start) * pps);
  const isVideo = el.type === 'video';
  const dur = isVideo ? assetDuration(design, (el as VideoElement).assetId) : 0;
  const motionEnd = isVideo ? videoMotionEnd(el as VideoElement, dur, pageDur) : span.end;
  const tailW = isVideo ? Math.max(0, (span.end - motionEnd) * pps) : 0;
  const anim = el.animation;
  const len = span.end - span.start;
  const enterW = anim && anim.enter !== 'none' ? Math.min(anim.enterDuration, len) * pps : 0;
  const exitW = anim && anim.exit !== 'none' && len > anim.exitDuration ? Math.min(anim.exitDuration, len) * pps : 0;
  const v = el as VideoElement;

  const drag = (e: React.PointerEvent, mode: 'move' | 'left' | 'right') => {
    if (e.button !== 0) return;
    e.stopPropagation();
    const st = useEditor.getState();
    if (e.shiftKey && mode === 'move') {
      st.select([el.id], true);
      return;
    }
    if (!st.selection.includes(el.id)) st.select([el.id]);
    props.onFocusTimeline();
    if (el.locked) return;
    const sel = useEditor.getState().selection;
    const targets = mode === 'move' ? page.elements.filter((x) => sel.includes(x.id) && !x.locked) : [el];
    if (!targets.length) return;
    const snaps = targets.map((x) => ({ id: x.id, el0: structuredClone(x) as DesignElement, span: elementSpan(x, pageDur) }));
    const me = snaps.find((s) => s.id === el.id) || snaps[0];
    const exclude = new Set(targets.map((x) => x.id));
    const key = `tl-el-${mode}:${el.id}`;
    const minD = Math.max(...snaps.map((s) => -s.span.start));
    const maxD = Math.min(...snaps.map((s) => pageDur - s.span.end));

    const apply = (op: (x: DesignElement) => void) => {
      const cur = useEditor.getState().design?.pages.find((p) => p.id === page.id);
      if (!cur) return;
      const next = new Map<string, TimeFields>();
      for (const s of snaps) {
        const c = structuredClone(s.el0);
        op(c);
        const now = cur.elements.find((x) => x.id === s.id);
        if (now && !sameFields(timeFields(now), timeFields(c))) next.set(s.id, timeFields(c));
      }
      if (!next.size) return;
      useEditor.getState().updateElements(
        [...next.keys()],
        (x) => {
          const f = next.get(x.id)!;
          if (f.timing) x.timing = f.timing;
          else delete x.timing;
          if (x.type === 'video') {
            x.trimStart = f.trimStart;
            x.trimEnd = f.trimEnd;
          }
        },
        key,
      );
    };

    pointerDrag(
      e,
      (dx, _dy, ev) => {
        const free = ev.altKey;
        const r = (t: number) => (free ? Math.round(t * 100) / 100 : t);
        if (mode === 'move') {
          let g = pageStart + me.span.start + dx / pps;
          g = free ? r(g) : props.snap(g, exclude, me.span.end - me.span.start);
          const delta = clamp(g - pageStart - me.span.start, minD, maxD);
          apply((x) => {
            const s = snaps.find((q) => q.id === x.id)!;
            moveSpan(x, s.span.start + delta, pageDur);
          });
        } else {
          const edge0 = mode === 'left' ? me.span.start : me.span.end;
          let g = pageStart + edge0 + dx / pps;
          g = free ? r(g) : props.snap(g, exclude);
          const local = g - pageStart;
          apply((x) => {
            if (x.type === 'video') {
              if (mode === 'left') trimVideoStart(x, local, pageDur, dur);
              else trimVideoEnd(x, local, pageDur, dur);
            } else trimSpan(x, mode === 'left' ? 'start' : 'end', local, pageDur);
          });
        }
      },
      undefined,
      mode === 'move' ? 'grabbing' : 'ew-resize',
    );
  };

  const info = `${name} · ${fmtDur(span.start)}–${fmtDur(span.end)} (${fmtDur(len)})` + (isVideo && tailW > 1 ? ` · holds the last frame for ${fmtDur(span.end - motionEnd)}` : '');

  return (
    <div
      className={`tl-lbar t-${el.type}` + (selected ? ' selected' : '') + (el.hidden ? ' is-hidden' : '') + (el.locked ? ' locked' : '')}
      style={{ left, width }}
      onPointerDown={(e) => drag(e, 'move')}
      onContextMenu={props.onMenu}
      onDoubleClick={() => {
        // double-click jumps the playhead to the clip start
        useUI.getState().setPlaying(false);
        useUI.getState().setTime(pageStart + span.start);
      }}
      title={info}
    >
      {isVideo && <VideoStrip el={v} dur={dur} pageDur={pageDur} width={width} pps={pps} />}
      {enterW > 2 && <div className="tl-anim in" style={{ width: enterW }} />}
      {exitW > 2 && <div className="tl-anim out" style={{ width: exitW }} />}
      {tailW > 1 && <div className="tl-lbar-tail" style={{ width: tailW }} />}
      <div className="tl-lbar-label">
        <TypeIcon el={el} size={11} />
        <span className="tl-lbar-name">{name}</span>
        {isVideo && Math.abs((v.speed || 1) - 1) > 0.001 && <span className="tl-badge">{+(v.speed || 1).toFixed(2)}×</span>}
        {isVideo && v.loop && <Repeat size={10} />}
        {isVideo && v.muted && <VolumeX size={10} />}
      </div>
      {!el.locked && (
        <>
          <div className="tl-clip-edge left" onPointerDown={(e) => drag(e, 'left')} title={isVideo ? 'Drag to trim the start of the clip' : 'Drag to change when it appears'} />
          <div className="tl-clip-edge right" onPointerDown={(e) => drag(e, 'right')} title={isVideo ? 'Drag to trim the end of the clip' : 'Drag to change when it disappears'} />
        </>
      )}
    </div>
  );
}

/** Thumbnails of the frames under each part of a video bar, plus its sound */
function VideoStrip({ el, dur, pageDur, width, pps }: { el: VideoElement; dur: number; pageDur: number; width: number; pps: number }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const [strip, setStrip] = useState<Filmstrip | null>(() => filmstripNow(el.assetId) || null);
  const [peaks, setPeaks] = useState<Float32Array | null>(null);
  useEffect(() => {
    let alive = true;
    if (!strip) void getFilmstrip(el.assetId).then((s) => alive && setStrip(s));
    void getPeaks(el.assetId!, 2000).then((p) => alive && setPeaks(p));
    return () => {
      alive = false;
    };
  }, [el.assetId]); // eslint-disable-line react-hooks/exhaustive-deps

  const span = elementSpan(el, pageDur);
  useEffect(() => {
    const c = ref.current;
    if (!c) return;
    const dpr = window.devicePixelRatio || 1;
    const h = LAYER_H - 6;
    const cw = Math.max(1, Math.min(MAX_CANVAS, Math.round(width * dpr)));
    const ch = Math.round(h * dpr);
    if (c.width !== cw) c.width = cw;
    if (c.height !== ch) c.height = ch;
    const ctx = c.getContext('2d');
    if (!ctx) return;
    ctx.clearRect(0, 0, cw, ch);
    const k = cw / Math.max(1, width); // canvas px per css px
    if (strip) {
      const th = ch;
      const tw = Math.max(8, (strip.fw / strip.fh) * th);
      for (let x = 0; x < cw; x += tw) {
        const t = span.start + (x / k + tw / k / 2) / pps;
        const src = videoSourceTime(el, Math.min(t, span.end), dur || strip.duration);
        const i = frameAt(strip, src);
        ctx.drawImage(strip.sprite, i * strip.fw, 0, strip.fw, strip.fh, x, 0, tw, th);
      }
    }
    // sound: a strip of peaks along the bottom
    const src = dur || strip?.duration || 0;
    if (peaks && src > 0 && !el.muted) {
      const n = peaks.length;
      const bandH = Math.round(ch * 0.32);
      ctx.fillStyle = 'rgba(0,0,0,0.45)';
      ctx.fillRect(0, ch - bandH, cw, bandH);
      ctx.fillStyle = 'rgba(255,255,255,0.85)';
      const step = Math.max(1, Math.round(dpr * 2));
      const motionEnd = videoMotionEnd(el, dur, pageDur);
      for (let x = 0; x < cw; x += step) {
        const t = span.start + x / k / pps;
        if (t > motionEnd) break;
        const s = videoSourceTime(el, t, src);
        const b = Math.floor((s / src) * n);
        const m = Math.min(1, (peaks[b] || 0) * 1.2) * Math.min(1, el.volume);
        const bh = Math.max(dpr * 0.5, m * (bandH - 2 * dpr));
        ctx.fillRect(x, ch - bandH / 2 - bh / 2, Math.max(1, step - 1), bh);
      }
    }
  }, [strip, peaks, width, pps, el, dur, pageDur, span.start, span.end]);

  return <canvas ref={ref} className="tl-vstrip" />;
}

/** Name of a video's source for toolbars */
export function videoName(el: VideoElement) {
  return el.name || getAsset(el.assetId)?.meta.name || 'Video';
}
