import React, { memo, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowRightLeft, ChevronDown, Copy, Maximize2, Mic, Music, Pause, Play, Plus, Scissors, SkipBack, SkipForward,
  Square, StepBack, StepForward, Trash2, Volume2, VolumeX, X, ZoomIn, ZoomOut, MoveHorizontal,
} from 'lucide-react';
import type { AudioTrack, Design, Page, TransitionType, VideoElement } from '../../types';
import { useEditor, pageStartTime, totalDuration } from '../../store/editor';
import { useUI, usePrefs } from '../../store/ui';
import { getAsset, getAudioBuffer } from '../../lib/assets';
import { importDialog, importFiles, placeAssetOnTimeline, ensureUploadAsset } from '../../lib/actions';
import { newPage, uid } from '../../lib/defaults';
import { idb, UploadRecord } from '../../lib/idb';
import { TRANSITIONS } from '../../lib/render/animation';
import { elementSpan, videoMotionEnd } from '../../lib/timing';
import { ContextMenu, MenuItem, NumberField, Popover, Slider } from '../../components/ui';
import type { LibraryPayload } from '../dnd';
import { usePageThumb, usePageStrip, pageMoves, useInView } from './thumbs';
import { seekTo, trackLength, trackSourceDuration } from './playback';
import { fmtDur, fmtTime, goToPage, pageMenuItems, pointerDrag, readNum, writeNum } from './common';
import { ClipLabel, Waveform } from './AudioClip';
import { RenameInput } from './PagesStrip';
import { startVoiceOver, stopVoiceOver, useRecorder } from './recorder';
import { LayerSection, LAYER_H, LAYERS_HEAD_H, SnapFn } from './LayerTracks';
import { ElementToolbar } from './ElementToolbar';
import { assetDuration, seekEdge, splitAtPlayhead, stepFrames } from './edits';

const HEAD_W = 128;
const RULER_H = 24;
const PAGE_H = 52;
const LANE_H = 40;
const SNAP_PX = 6;
const PPS_MIN = 4;
const PPS_MAX = 400;
const PPS_KEY = 'kamva.timeline.pps';
const LAYERS_KEY = 'kamva.timeline.layersCollapsed';

const round1 = (v: number) => Math.round(v * 10) / 10;
const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));

export function ExpandedTimeline({ design, height }: { design: Design; height: number }) {
  const activeId = useEditor((s) => s.activePageId);
  const selection = useEditor((s) => s.selection);
  const [pps, setPpsState] = useState(() => clamp(readNum(PPS_KEY, 48), PPS_MIN, PPS_MAX));
  const ppsRef = useRef(pps);
  ppsRef.current = pps;
  const setPps = useCallback((v: number) => {
    const n = clamp(v, PPS_MIN, PPS_MAX);
    ppsRef.current = n;
    setPpsState(n);
    writeNum(PPS_KEY, n);
  }, []);
  const [selClip, setSelClipState] = useState<string | null>(null);
  const [menu, setMenu] = useState<{ x: number; y: number; items: MenuItem[] } | null>(null);
  const [renaming, setRenaming] = useState<string | null>(null);
  const [trans, setTrans] = useState<{ id: string; anchor: HTMLElement } | null>(null);
  const [layersCollapsed, setLayersCollapsed] = useState(() => readNum(LAYERS_KEY, 0) === 1);
  const [pageDrag, setPageDrag] = useState<{ id: string; insert: number } | null>(null);
  const [dropAt, setDropAt] = useState<{ kind: 'pages'; insert: number } | { kind: 'audio'; lane: number; t: number } | null>(null);
  const [, setDecoded] = useState(0);
  const rootRef = useRef<HTMLDivElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  // an audio clip and canvas elements are never selected at the same time
  const setSelClip = useCallback((id: string | null) => {
    setSelClipState(id);
    if (id && useEditor.getState().selection.length) useEditor.getState().select([]);
  }, []);
  useEffect(() => {
    if (selection.length) setSelClipState(null);
  }, [selection]);

  // decode audio so clip lengths are exact
  useEffect(() => {
    let alive = true;
    for (const t of design.audio) {
      if (getAsset(t.assetId)?.audioBuffer !== undefined) continue;
      void getAudioBuffer(t.assetId).then(() => alive && setDecoded((n) => n + 1));
    }
    return () => {
      alive = false;
    };
  }, [design.audio]);

  // drop selection when the clip disappears
  useEffect(() => {
    if (selClip && !design.audio.some((a) => a.id === selClip)) setSelClipState(null);
  }, [design.audio, selClip]);

  const pages = design.pages;
  const visible = useMemo(() => {
    let acc = 0;
    const out: { page: Page; start: number; index: number }[] = [];
    pages.forEach((p, index) => {
      if (p.hidden) return;
      out.push({ page: p, start: acc, index });
      acc += p.duration;
    });
    return out;
  }, [pages]);
  const total = totalDuration(design);
  const boundaries = useMemo(() => [0, ...visible.map((v) => v.start + v.page.duration)], [visible]);

  const audioEnd = design.audio.reduce((m, t) => Math.max(m, t.start + trackLength(design, t)), 0);
  const laneCount = Math.max(1, design.audio.reduce((m, t) => Math.max(m, t.lane + 1), 0));
  const recording = useRecorder((s) => s.recording);
  const recLane = useRecorder((s) => s.lane);
  const recStart = useRecorder((s) => s.timelineStart);
  const recSecs = useRecorder((s) => Math.ceil(s.elapsed)); // coarse, for the scroll width only
  const dropLane = dropAt?.kind === 'audio' ? dropAt.lane + 1 : 0;
  const lanes = Math.max(laneCount, recording ? recLane + 1 : 0, dropLane);
  const activePage = pages.find((p) => p.id === activeId);
  const activeIndex = pages.findIndex((p) => p.id === activeId);
  const activeStart = activePage && !activePage.hidden ? pageStartTime(design, activePage.id) : 0;
  const selEls = useMemo(
    () => (activePage ? activePage.elements.filter((e) => selection.includes(e.id)) : []),
    [activePage, selection],
  );

  const [viewW, setViewW] = useState(800);
  useLayoutEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setViewW(el.clientWidth));
    ro.observe(el);
    setViewW(el.clientWidth);
    return () => ro.disconnect();
  }, []);
  const span = Math.max(total, audioEnd, recording ? recStart + recSecs : 0);
  const trackW = Math.max(viewW - HEAD_W, span * pps + 160);

  const zoomToFit = useCallback(() => {
    const el = scrollRef.current;
    const s = Math.max(1, span);
    setPps(((el?.clientWidth || 800) - HEAD_W - 48) / s);
    if (el) el.scrollLeft = 0;
  }, [span, setPps]);

  // ctrl/cmd + wheel zooms around the pointer
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      if (!(e.ctrlKey || e.metaKey)) {
        // vertical wheel scrolls horizontally when there's nothing to scroll vertically
        if (Math.abs(e.deltaY) > Math.abs(e.deltaX) && el.scrollHeight <= el.clientHeight + 1 && !e.shiftKey) {
          el.scrollLeft += e.deltaY;
          e.preventDefault();
        }
        return;
      }
      e.preventDefault();
      const r = el.getBoundingClientRect();
      const x = e.clientX - r.left - HEAD_W + el.scrollLeft;
      const cur = ppsRef.current;
      const t = x / cur;
      const next = clamp(cur * Math.exp(-e.deltaY * 0.002), PPS_MIN, PPS_MAX);
      setPps(next);
      requestAnimationFrame(() => (el.scrollLeft = t * next - (e.clientX - r.left - HEAD_W)));
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, [setPps]);

  // ------------------------------------------------------------------ snapping
  /** Every edit point a dragged edge can stick to (global seconds) */
  const snapTargets = useCallback(
    (exclude: Set<string>) => {
      const d = useEditor.getState().design || design;
      const ts = [...boundaries, useUI.getState().time];
      for (const t of d.audio) {
        if (exclude.has(t.id)) continue;
        ts.push(t.start, t.start + trackLength(d, t));
      }
      const page = d.pages.find((p) => p.id === useEditor.getState().activePageId);
      if (page && !page.hidden) {
        const p0 = pageStartTime(d, page.id);
        for (const e of page.elements) {
          if (exclude.has(e.id)) continue;
          const s = elementSpan(e, page.duration);
          ts.push(p0 + s.start, p0 + s.end);
          if (e.type === 'video') ts.push(p0 + videoMotionEnd(e, assetDuration(d, e.assetId), page.duration));
        }
      }
      return ts;
    },
    [boundaries, design],
  );

  const snap: SnapFn = useCallback(
    (v, exclude, len = 0) => {
      const tol = SNAP_PX / ppsRef.current;
      let best: number | null = null;
      let bestD = tol;
      for (const t of snapTargets(exclude)) {
        const d0 = Math.abs(v - t);
        if (d0 < bestD) {
          bestD = d0;
          best = t;
        }
        if (len) {
          const d1 = Math.abs(v + len - t);
          if (d1 < bestD) {
            bestD = d1;
            best = t - len;
          }
        }
      }
      // without a snap, land on whole frames
      if (best !== null) return best;
      const fps = design.fps || 30;
      return Math.round(v * fps) / fps;
    },
    [snapTargets, design.fps],
  );

  // ------------------------------------------------------------------ clip actions
  const selTrack = design.audio.find((a) => a.id === selClip) || null;

  const deleteClip = (id: string) => {
    useEditor.getState().deleteAudio(id);
    setSelClipState(null);
  };
  const duplicateClip = (t: AudioTrack) => {
    const len = trackLength(design, t);
    const c: AudioTrack = { ...t, id: uid(), start: round1(t.start + len), name: t.name };
    useEditor.getState().addAudio(c);
    setSelClip(c.id);
  };
  const splitClip = (t: AudioTrack) => {
    const T = useUI.getState().time;
    const len = trackLength(design, t);
    const at = T - t.start;
    const toast = useUI.getState().toast;
    if (at <= 0.05 || at >= len - 0.05) {
      toast('Move the playhead over the clip to split it there.', 'info');
      return;
    }
    const cut = t.trimStart + at;
    const second: AudioTrack = { ...t, id: uid(), start: T, trimStart: cut, fadeIn: 0 };
    useEditor.getState().update((d) => {
      const a = d.audio.find((x) => x.id === t.id);
      if (!a) return;
      a.trimEnd = cut;
      a.fadeOut = 0;
      d.audio.splice(d.audio.indexOf(a) + 1, 0, second);
    });
    setSelClip(second.id);
  };
  const audioMenu = (t: AudioTrack): MenuItem[] => [
    { label: 'Split at playhead', icon: <Scissors size={16} />, shortcut: 'S', onClick: () => splitClip(t) },
    { label: 'Duplicate', icon: <Copy size={16} />, onClick: () => duplicateClip(t) },
    {
      label: t.muted ? 'Unmute' : 'Mute',
      icon: t.muted ? <Volume2 size={16} /> : <VolumeX size={16} />,
      onClick: () => useEditor.getState().updateAudio(t.id, { muted: !t.muted }),
    },
    { sep: true },
    { label: 'Delete', icon: <Trash2 size={16} />, shortcut: 'Del', danger: true, onClick: () => deleteClip(t.id) },
  ];

  // ------------------------------------------------------------------ keyboard (when the timeline has focus)
  const onKeyDown = (e: React.KeyboardEvent) => {
    const tgt = e.target as HTMLElement;
    if (tgt.tagName === 'INPUT' || tgt.tagName === 'TEXTAREA' || tgt.tagName === 'SELECT') return;
    const handled = () => {
      e.preventDefault();
      e.stopPropagation();
    };
    if (selTrack && (e.key === 'Delete' || e.key === 'Backspace')) {
      handled();
      deleteClip(selTrack.id);
    } else if (e.key === ' ' && tgt.tagName !== 'BUTTON') {
      handled();
      useUI.getState().setPlaying(!useUI.getState().playing);
    } else if (e.key === 'Escape' && selClip) {
      e.stopPropagation();
      setSelClipState(null);
    } else if ((e.key === 'd' || e.key === 'D') && (e.ctrlKey || e.metaKey) && selTrack) {
      handled();
      duplicateClip(selTrack);
    } else if ((e.key === 's' || e.key === 'S') && !e.ctrlKey && !e.metaKey && !e.altKey && selTrack) {
      handled();
      splitClip(selTrack);
    } else if (!e.ctrlKey && !e.metaKey && !selection.length && !selTrack && (e.key === 'ArrowLeft' || e.key === 'ArrowRight')) {
      // with nothing selected, arrows step frames (Shift: one second) while the timeline has focus
      handled();
      const fps = design.fps || 30;
      stepFrames((e.key === 'ArrowLeft' ? -1 : 1) * (e.shiftKey ? fps : 1));
    }
  };

  // ------------------------------------------------------------------ ruler scrubbing
  const scrub = (e: React.PointerEvent) => {
    if (e.button !== 0) return;
    const track = e.currentTarget as HTMLElement;
    const at = (clientX: number) => {
      const r = track.getBoundingClientRect();
      return clamp((clientX - r.left) / ppsRef.current, 0, total);
    };
    seekTo(at(e.clientX));
    pointerDrag(e, (_dx, _dy, ev) => seekTo(at(ev.clientX)), undefined, 'ew-resize');
  };

  // ------------------------------------------------------------------ page duration drag
  const dragDuration = (e: React.PointerEvent, page: Page) => {
    e.stopPropagation();
    if (e.button !== 0) return;
    const d0 = page.duration;
    const start = pageStartTime(design, page.id);
    pointerDrag(
      e,
      (dx, _dy, ev) => {
        let v = Math.max(0.5, round1(d0 + dx / pps));
        // snap the page end onto the playhead
        if (!ev.altKey) {
          const ph = useUI.getState().time;
          if (Math.abs(start + v - ph) * pps < SNAP_PX && ph - start >= 0.5) v = round1(ph - start);
        }
        const cur = useEditor.getState().design?.pages.find((p) => p.id === page.id)?.duration;
        if (cur === v) return;
        useEditor.getState().updatePage(
          page.id,
          (p) => {
            p.duration = v;
          },
          'tl-page-dur:' + page.id,
        );
      },
      undefined,
      'ew-resize',
    );
  };

  // ------------------------------------------------------------------ page reorder drag
  /** Index in design.pages before which a page dropped at global time t lands */
  const insertIndexAt = (t: number) => {
    for (const v of visible) if (t < v.start + v.page.duration / 2) return v.index;
    return pages.length;
  };
  const dragPage = (e: React.PointerEvent, page: Page) => {
    if (e.button !== 0 || renaming) return;
    goToPage(page.id);
    const scroller = scrollRef.current;
    if (!scroller) return;
    const from = pages.findIndex((p) => p.id === page.id);
    let insert = from;
    let started = false;
    const tAt = (clientX: number) => (clientX - scroller.getBoundingClientRect().left - HEAD_W + scroller.scrollLeft) / ppsRef.current;
    pointerDrag(
      e,
      (dx, _dy, ev) => {
        if (!started) {
          if (Math.abs(dx) < 6) return;
          started = true;
        }
        const sr = scroller.getBoundingClientRect();
        if (ev.clientX < sr.left + HEAD_W + 24) scroller.scrollLeft -= 12;
        else if (ev.clientX > sr.right - 24) scroller.scrollLeft += 12;
        insert = insertIndexAt(tAt(ev.clientX));
        setPageDrag({ id: page.id, insert });
      },
      () => {
        setPageDrag(null);
        if (!started) return;
        const to = insert > from ? insert - 1 : insert;
        if (to === from) return;
        useEditor.getState().movePage(page.id, to);
        // keep the playhead on the page that was moved
        const d = useEditor.getState().design;
        if (d && !page.hidden) {
          useUI.getState().setPlaying(false);
          seekTo(pageStartTime(d, page.id));
        }
      },
      'grabbing',
    );
  };

  // ------------------------------------------------------------------ media dropped onto the timeline
  const timeAtClient = (clientX: number) => {
    const el = scrollRef.current;
    if (!el) return 0;
    return Math.max(0, (clientX - el.getBoundingClientRect().left - HEAD_W + el.scrollLeft) / ppsRef.current);
  };
  const acceptsDrop = (e: React.DragEvent) => e.dataTransfer.types.includes('application/x-kamva') || e.dataTransfer.types.includes('Files');
  const onDragOverPages = (e: React.DragEvent) => {
    if (!acceptsDrop(e)) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = 'copy';
    const insert = insertIndexAt(timeAtClient(e.clientX));
    if (dropAt?.kind !== 'pages' || dropAt.insert !== insert) setDropAt({ kind: 'pages', insert });
  };
  const onDragOverLane = (e: React.DragEvent, lane: number) => {
    if (!acceptsDrop(e)) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = 'copy';
    const t = snap(timeAtClient(e.clientX), new Set());
    if (dropAt?.kind !== 'audio' || dropAt.lane !== lane || Math.abs(dropAt.t - t) > 1e-3) setDropAt({ kind: 'audio', lane, t });
  };
  const onDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const target = dropAt;
    setDropAt(null);
    if (!target) return;
    const ids: string[] = [];
    const lib = e.dataTransfer.getData('application/x-kamva');
    if (lib) {
      const p = JSON.parse(lib) as LibraryPayload;
      if (p.type === 'upload' || p.type === 'asset' || p.type === 'background') {
        if (p.type === 'upload' && !getAsset(p.id)) {
          const rec = await idb.get<UploadRecord>('uploads', p.id);
          if (rec) await ensureUploadAsset(rec);
        }
        ids.push(p.id);
      }
    } else if (e.dataTransfer.files.length) {
      ids.push(...(await importFiles([...e.dataTransfer.files], { place: false })));
    }
    const toast = useUI.getState().toast;
    let placed = 0;
    ids.forEach((id, i) => {
      const ok =
        target.kind === 'pages'
          ? placeAssetOnTimeline(id, { pageIndex: target.insert + i })
          : placeAssetOnTimeline(id, { start: target.t, lane: target.lane });
      if (ok) placed++;
    });
    if (ids.length && !placed)
      toast(target.kind === 'pages' ? 'Drop photos or videos on the pages to add them as new pages.' : 'Drop sounds on an audio track.', 'info');
  };

  // ------------------------------------------------------------------ audio clip drags
  const dragClip = (e: React.PointerEvent, t: AudioTrack, mode: 'move' | 'left' | 'right') => {
    e.stopPropagation();
    if (e.button !== 0) return;
    setSelClip(t.id);
    rootRef.current?.focus({ preventScroll: true });
    const len0 = trackLength(design, t);
    const src = trackSourceDuration(design, t);
    const key = `tl-audio-${mode}:${t.id}`;
    const ex = new Set([t.id]);
    pointerDrag(
      e,
      (dx, dy, ev) => {
        const st = useEditor.getState();
        const cur = st.design?.audio.find((a) => a.id === t.id);
        if (!cur) return;
        const free = ev.altKey;
        let patch: Partial<AudioTrack> = {};
        if (mode === 'move') {
          let s = t.start + dx / pps;
          s = free ? Math.round(s * 100) / 100 : snap(s, ex, len0);
          s = Math.max(0, s);
          const lane = clamp(t.lane + Math.round(dy / LANE_H), 0, laneCount);
          patch = { start: s, lane };
        } else if (mode === 'left') {
          // move the clip's start edge; the audio stays anchored in time
          let s = t.start + dx / pps;
          s = free ? Math.round(s * 100) / 100 : snap(s, ex);
          const minS = Math.max(0, t.start - t.trimStart); // can't go before the source start
          const maxS = t.start + len0 - 0.1;
          s = clamp(s, minS, maxS);
          const delta = s - t.start;
          patch = { start: s, trimStart: Math.max(0, t.trimStart + delta) };
        } else {
          if (src <= 0) return;
          let endT = t.start + len0 + dx / pps;
          endT = free ? Math.round(endT * 100) / 100 : snap(endT, ex);
          let te = t.trimStart + (endT - t.start);
          te = clamp(te, t.trimStart + 0.1, src);
          patch = { trimEnd: Math.abs(te - src) < 0.005 ? null : Math.round(te * 1000) / 1000 };
        }
        const same = Object.entries(patch).every(([k, v]) => (cur as any)[k] === v);
        if (!same) st.updateAudio(t.id, patch, key);
      },
      undefined,
      mode === 'move' ? 'grabbing' : 'ew-resize',
    );
  };

  const addPageAtEnd = () => {
    const p = newPage();
    p.duration = usePrefs.getState().pageDurationDefault || 5;
    const last = pages[pages.length - 1];
    if (last && last.background.fill.type === 'solid' && !last.background.assetId) p.background.fill = { ...last.background.fill };
    useEditor.getState().addPage(last?.id, p);
  };

  const showLayers = !!activePage && !activePage.hidden;
  const layerRows = showLayers ? (layersCollapsed ? 0 : Math.max(1, activePage!.elements.length)) : 0;
  const layersH = showLayers ? LAYERS_HEAD_H + layerRows * LAYER_H : 0;
  const contentH = RULER_H + PAGE_H + layersH + lanes * LANE_H + 8;
  const focusTimeline = () => rootRef.current?.focus({ preventScroll: true });
  const pageDropX =
    dropAt?.kind === 'pages'
      ? (dropAt.insert >= pages.length ? total : visible.find((v) => v.index >= dropAt.insert)?.start ?? total) * pps
      : pageDrag
        ? (pageDrag.insert >= pages.length ? total : visible.find((v) => v.index >= pageDrag.insert)?.start ?? total) * pps
        : null;

  return (
    <div
      className="tl"
      ref={rootRef}
      tabIndex={-1}
      style={{ height }}
      onKeyDown={onKeyDown}
      onPointerDown={(e) => {
        const t = e.target as HTMLElement;
        if (!t.closest('input, textarea, select, button')) rootRef.current?.focus({ preventScroll: true });
      }}
      onDragLeave={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node)) setDropAt(null);
      }}
    >
      <Transport pps={pps} setPps={setPps} total={total} onFit={zoomToFit} onSplit={() => (selTrack ? splitClip(selTrack) : splitAtPlayhead())} />
      {selTrack ? (
        <ClipToolbar
          track={selTrack}
          design={design}
          onClose={() => setSelClipState(null)}
          onDelete={() => deleteClip(selTrack.id)}
          onDuplicate={() => duplicateClip(selTrack)}
          onSplit={() => splitClip(selTrack)}
        />
      ) : (
        activePage &&
        selEls.length > 0 && <ElementToolbar design={design} page={activePage} els={selEls} onClose={() => useEditor.getState().select([])} />
      )}
      <div className="tl-scroll" ref={scrollRef}>
        <div className="tl-content" style={{ width: HEAD_W + trackW, minHeight: contentH }}>
          {/* ruler */}
          <div className="tl-row tl-ruler-row" style={{ height: RULER_H }}>
            <div className="tl-head tl-corner" />
            <div className="tl-track tl-ruler" style={{ width: trackW }} onPointerDown={scrub}>
              <Ruler pps={pps} width={trackW} total={total} />
            </div>
          </div>

          {/* pages */}
          <div className="tl-row" style={{ height: PAGE_H }}>
            <div className="tl-head">
              <span>Pages</span>
            </div>
            <div className="tl-track tl-pages-track" style={{ width: trackW }} onDragOver={onDragOverPages} onDrop={(e) => void onDrop(e)}>
              {visible.map((v, i) => (
                <PageBlock
                  key={v.page.id}
                  design={design}
                  page={v.page}
                  index={v.index}
                  left={v.start * pps}
                  width={v.page.duration * pps}
                  active={v.page.id === activeId}
                  dragging={pageDrag?.id === v.page.id}
                  renaming={renaming === v.page.id}
                  onRenameDone={(name) => {
                    setRenaming(null);
                    if (name !== null)
                      useEditor.getState().updatePage(v.page.id, (p) => {
                        p.name = name.trim() || undefined;
                      });
                  }}
                  onPointerDown={dragPage}
                  onResize={dragDuration}
                  onMenu={(e) => {
                    e.preventDefault();
                    setMenu({ x: e.clientX, y: e.clientY, items: pageMenuItems(v.page.id, () => setRenaming(v.page.id)) });
                  }}
                  hasNext={i < visible.length - 1}
                  onTransition={(anchor) => setTrans({ id: v.page.id, anchor })}
                />
              ))}
              {pageDropX !== null && <div className="tl-insert" style={{ left: pageDropX - 2 }} />}
              <button className="tl-add-page" style={{ left: total * pps + 6 }} onClick={addPageAtEnd} data-tip="Add page" data-tip-side="top" aria-label="Add page">
                <Plus size={16} />
              </button>
            </div>
          </div>

          {/* layers of the active page */}
          {showLayers && (
            <LayerSection
              design={design}
              page={activePage!}
              pageIndex={activeIndex}
              pageStart={activeStart}
              pps={pps}
              trackW={trackW}
              snap={snap}
              collapsed={layersCollapsed}
              onToggle={() => {
                setLayersCollapsed((c) => {
                  writeNum(LAYERS_KEY, c ? 0 : 1);
                  return !c;
                });
              }}
              onFocusTimeline={focusTimeline}
            />
          )}

          {/* audio lanes */}
          {Array.from({ length: lanes }, (_, lane) => (
            <div className="tl-row tl-lane" key={lane} style={{ height: LANE_H }}>
              <div className="tl-head">
                <span>
                  <Music size={12} /> Audio {lanes > 1 ? lane + 1 : ''}
                </span>
              </div>
              <div
                className="tl-track"
                style={{ width: trackW }}
                onPointerDown={(e) => e.target === e.currentTarget && setSelClipState(null)}
                onDragOver={(e) => onDragOverLane(e, lane)}
                onDrop={(e) => void onDrop(e)}
              >
                {design.audio
                  .filter((t) => t.lane === lane)
                  .map((t) => (
                    <AudioClipView
                      key={t.id}
                      track={t}
                      design={design}
                      pps={pps}
                      selected={t.id === selClip}
                      onDrag={dragClip}
                      onMenu={(e) => {
                        e.preventDefault();
                        setSelClip(t.id);
                        setMenu({ x: e.clientX, y: e.clientY, items: audioMenu(t) });
                      }}
                    />
                  ))}
                {recording && recLane === lane && <RecClip pps={pps} />}
                {dropAt?.kind === 'audio' && dropAt.lane === lane && <div className="tl-insert" style={{ left: dropAt.t * pps - 2 }} />}
                {!design.audio.length && !recording && lane === 0 && !dropAt && (
                  <div className="tl-empty-lane" style={{ left: 8 }}>
                    Add audio or record a voice-over to hear it with your pages.
                  </div>
                )}
              </div>
            </div>
          ))}
          {/* an extra lane appears while dragging a sound below the last one */}
          {dropAt?.kind !== 'audio' && (
            <div className="tl-row tl-lane tl-lane-new" style={{ height: 8 }} onDragOver={(e) => onDragOverLane(e, lanes)} onDrop={(e) => void onDrop(e)}>
              <div className="tl-head" />
              <div className="tl-track" style={{ width: trackW }} />
            </div>
          )}

          {total < span && <div className="tl-overrun" style={{ left: HEAD_W + total * pps, top: RULER_H, width: (span - total) * pps + 160 }} />}
          <Playhead pps={pps} scrollRef={scrollRef} />
        </div>
      </div>

      {menu && <ContextMenu x={menu.x} y={menu.y} items={menu.items} onClose={() => setMenu(null)} />}
      {trans && <TransitionPopover pageId={trans.id} anchor={trans.anchor} onClose={() => setTrans(null)} />}
    </div>
  );
}

function RecClip({ pps }: { pps: number }) {
  const start = useRecorder((s) => s.timelineStart);
  const elapsed = useRecorder((s) => s.elapsed);
  return (
    <div className="tl-rec-clip" style={{ left: start * pps, width: Math.max(4, elapsed * pps) }}>
      <span className="tl-rec-dot" /> Recording
    </div>
  );
}

// ---------------------------------------------------------------------------

function Transport({ pps, setPps, total, onFit, onSplit }: { pps: number; setPps: (v: number) => void; total: number; onFit: () => void; onSplit: () => void }) {
  const playing = useUI((s) => s.playing);
  const recording = useRecorder((s) => s.recording);
  const fill = ((Math.log(pps) - Math.log(PPS_MIN)) / (Math.log(PPS_MAX) - Math.log(PPS_MIN))) * 100;
  return (
    <div className="tl-transport">
      <button className="icon-btn sm" onClick={() => seekEdge('start')} aria-label="Jump to start" data-tip="Jump to start (Home)">
        <SkipBack size={15} />
      </button>
      <button className="icon-btn sm" onClick={() => stepFrames(-1)} aria-label="Previous frame" data-tip="Previous frame (,)">
        <StepBack size={15} />
      </button>
      <button
        className="icon-btn sm tl-play"
        onClick={() => useUI.getState().setPlaying(!playing)}
        disabled={total <= 0}
        aria-label={playing ? 'Pause' : 'Play'}
        data-tip={playing ? 'Pause (Space)' : 'Play (Space)'}
      >
        {playing ? <Pause size={16} /> : <Play size={16} />}
      </button>
      <button className="icon-btn sm" onClick={() => stepFrames(1)} aria-label="Next frame" data-tip="Next frame (.)">
        <StepForward size={15} />
      </button>
      <button className="icon-btn sm" onClick={() => seekEdge('end')} aria-label="Jump to end" data-tip="Jump to end (End)">
        <SkipForward size={15} />
      </button>
      <TimeReadout total={total} />
      <div className="vdivider" />
      <button className="btn ghost sm" onClick={onSplit} title="Split the selected clip, or the page, at the playhead (S)">
        <Scissors size={14} /> Split
      </button>
      <button className="btn ghost sm" onClick={() => void importDialog('audio')}>
        <Music size={14} /> Add audio
      </button>
      {recording ? (
        <div className="tl-recording">
          <span className="tl-rec-dot" />
          <RecTime />
          <button className="btn sm" onClick={stopVoiceOver}>
            <Square size={11} fill="currentColor" /> Stop
          </button>
        </div>
      ) : (
        <button className="btn ghost sm" onClick={() => void startVoiceOver()}>
          <Mic size={14} /> Record voice-over
        </button>
      )}
      <div className="spacer" />
      <div className="tl-zoom">
        <button className="icon-btn sm" onClick={() => setPps(pps / 1.4)} aria-label="Zoom out" data-tip="Zoom out">
          <ZoomOut size={14} />
        </button>
        <input
          type="range"
          min={0}
          max={1000}
          value={Math.round(fill * 10)}
          style={{ ['--fill' as any]: `${fill}%` }}
          onChange={(e) => {
            const f = parseInt(e.target.value) / 1000;
            setPps(Math.exp(Math.log(PPS_MIN) + f * (Math.log(PPS_MAX) - Math.log(PPS_MIN))));
          }}
          aria-label="Timeline zoom"
          title={`${Math.round(pps)} px per second`}
        />
        <button className="icon-btn sm" onClick={() => setPps(pps * 1.4)} aria-label="Zoom in" data-tip="Zoom in">
          <ZoomIn size={14} />
        </button>
        <button className="icon-btn sm" onClick={onFit} aria-label="Fit timeline" data-tip="Fit the whole video">
          <Maximize2 size={14} />
        </button>
      </div>
      <button className="icon-btn sm" onClick={() => useUI.getState().setTimelineOpen(false)} aria-label="Hide timeline" data-tip="Hide timeline">
        <ChevronDown size={16} />
      </button>
    </div>
  );
}

function RecTime() {
  const elapsed = useRecorder((s) => s.elapsed);
  return <span className="tl-rec-time">{fmtTime(elapsed)}</span>;
}

/** Playhead time; click to type a time to jump to */
function TimeReadout({ total }: { total: number }) {
  const fps = useEditor((s) => s.design?.fps || 30);
  const frame = useUI((s) => Math.round(s.time * fps));
  const [editing, setEditing] = useState(false);
  const t = frame / fps;
  if (editing)
    return (
      <span className="tl-time tl-time-edit">
        <NumberField
          value={Math.round(t * 100) / 100}
          min={0}
          max={total}
          step={1 / fps}
          decimals={2}
          unit="s"
          onChange={(v) => {
            useUI.getState().setPlaying(false);
            seekTo(v);
          }}
        />
        <button className="icon-btn sm" onClick={() => setEditing(false)} aria-label="Done">
          <X size={12} />
        </button>
      </span>
    );
  return (
    <button className="tl-time" onClick={() => setEditing(true)} title="Click to type a time">
      <b>{fmtTime(t)}</b>
      <span className="tl-frame">f{frame % fps}</span> / {fmtTime(total)}
    </button>
  );
}

// ---------------------------------------------------------------------------

function niceStep(pps: number): { major: number; minor: number } {
  const steps = [0.1, 0.25, 0.5, 1, 2, 5, 10, 15, 30, 60, 120, 300, 600];
  const major = steps.find((s) => s * pps >= 56) ?? 1200;
  const minor = major <= 0.25 ? major / 5 : major <= 1 ? major / 5 : major <= 2 ? 0.5 : major <= 10 ? 1 : major / 5;
  return { major, minor };
}

function rulerLabel(t: number): string {
  if (t < 60) return Number.isInteger(t) ? `${t}s` : `${+t.toFixed(2)}s`;
  const m = Math.floor(t / 60);
  const s = Math.round(t % 60);
  return `${m}:${String(s).padStart(2, '0')}`;
}

const Ruler = memo(function Ruler({ pps, width, total }: { pps: number; width: number; total: number }) {
  const { major, minor } = niceStep(pps);
  const end = width / pps;
  const ticks: React.ReactNode[] = [];
  const n = Math.floor(end / minor);
  for (let i = 0; i <= n; i++) {
    const t = Math.round(i * minor * 1000) / 1000;
    const isMajor = Math.abs(t / major - Math.round(t / major)) < 1e-6;
    ticks.push(
      <div key={i} className={'tl-tick' + (isMajor ? ' major' : '') + (t > total + 1e-6 ? ' past' : '')} style={{ left: t * pps }}>
        {isMajor && <span>{rulerLabel(t)}</span>}
      </div>,
    );
  }
  return <>{ticks}</>;
});

// ---------------------------------------------------------------------------

function Playhead({ pps, scrollRef }: { pps: number; scrollRef: React.RefObject<HTMLDivElement | null> }) {
  const time = useUI((s) => s.time);
  const playing = useUI((s) => s.playing);
  const x = HEAD_W + time * pps;
  const [scrollX, setScrollX] = useState(0);
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const on = () => setScrollX(el.scrollLeft);
    el.addEventListener('scroll', on, { passive: true });
    return () => el.removeEventListener('scroll', on);
  }, [scrollRef]);
  useEffect(() => {
    const el = scrollRef.current;
    if (!el || !playing) return;
    const left = el.scrollLeft + HEAD_W + 8;
    const right = el.scrollLeft + el.clientWidth - 24;
    if (x > right) el.scrollLeft = x - HEAD_W - 24;
    else if (x < left) el.scrollLeft = Math.max(0, x - HEAD_W - 24);
  }, [x, playing, scrollRef]);
  return (
    <div className="tl-playhead" style={{ transform: `translateX(${x}px)`, visibility: x < scrollX + HEAD_W - 1 ? 'hidden' : undefined }}>
      <div
        className="tl-playhead-knob"
        title="Drag to scrub"
        onPointerDown={(e) => {
          if (e.button !== 0) return;
          e.stopPropagation();
          const el = scrollRef.current;
          if (!el) return;
          const at = (clientX: number) => (clientX - el.getBoundingClientRect().left - HEAD_W + el.scrollLeft) / pps;
          pointerDrag(e, (_dx, _dy, ev) => seekTo(at(ev.clientX)), undefined, 'ew-resize');
        }}
      />
    </div>
  );
}

// ---------------------------------------------------------------------------

const PageBlock = memo(function PageBlock(props: {
  design: Design;
  page: Page;
  index: number;
  left: number;
  width: number;
  active: boolean;
  dragging: boolean;
  renaming: boolean;
  hasNext: boolean;
  onRenameDone: (name: string | null) => void;
  onPointerDown: (e: React.PointerEvent, page: Page) => void;
  onResize: (e: React.PointerEvent, page: Page) => void;
  onMenu: (e: React.MouseEvent) => void;
  onTransition: (anchor: HTMLElement) => void;
}) {
  const { design, page, index, left, width, active, renaming, hasNext } = props;
  const [ref, inView] = useInView<HTMLDivElement>();
  const tileW = Math.max(16, (PAGE_H - 10) * (design.width / design.height));
  // pages that change over time get a film strip of frames across the page
  const moves = pageMoves(page);
  const frames = moves ? Math.max(1, Math.min(12, Math.round(width / tileW))) : 0;
  const thumb = usePageThumb(design, page, inView && !moves);
  const strip = usePageStrip(design, page, inView && moves, frames);
  const tr = page.transition;
  const hasVideo = page.elements.some((e) => e.type === 'video' && !!(e as VideoElement).assetId);
  return (
    <>
      <div
        ref={ref}
        className={'tl-page' + (active ? ' active' : '') + (props.dragging ? ' dragging' : '')}
        style={{ left, width: Math.max(4, width - 2) }}
        onPointerDown={(e) => props.onPointerDown(e, page)}
        onContextMenu={props.onMenu}
        title={`${page.name || `Page ${index + 1}`} · ${fmtDur(page.duration)}${hasVideo ? ' · has video' : ''} — drag to reorder`}
      >
        <div
          className="tl-film"
          style={
            moves
              ? strip
                ? { backgroundImage: `url(${strip})`, backgroundSize: '100% 100%', backgroundRepeat: 'no-repeat' }
                : undefined
              : thumb
                ? { backgroundImage: `url(${thumb})`, backgroundSize: `${tileW}px 100%` }
                : undefined
          }
        />
        <div className="tl-page-label">
          <span className="tl-page-num">{index + 1}</span>
          {renaming ? (
            <RenameInput initial={page.name || ''} placeholder={`Page ${index + 1}`} onDone={props.onRenameDone} />
          ) : (
            width > 90 && page.name && <span className="tl-page-name">{page.name}</span>
          )}
          {width > 44 && <span className="tl-page-dur">{fmtDur(page.duration)}</span>}
        </div>
        <div className="tl-page-resize" onPointerDown={(e) => props.onResize(e, page)} title="Drag to change the page duration" />
      </div>
      {hasNext && (
        <button
          className={'tl-trans' + (tr.type !== 'none' ? ' on' : '')}
          style={{ left: left + width - 11 }}
          onPointerDown={(e) => e.stopPropagation()}
          onClick={(e) => props.onTransition(e.currentTarget)}
          title={tr.type === 'none' ? 'Add transition' : `${TRANSITIONS.find((t) => t.id === tr.type)?.name} · ${fmtDur(tr.duration)}`}
          aria-label="Transition"
        >
          <ArrowRightLeft size={11} />
        </button>
      )}
    </>
  );
});

function TransitionPopover({ pageId, anchor, onClose }: { pageId: string; anchor: HTMLElement; onClose: () => void }) {
  const page = useEditor((s) => s.design?.pages.find((p) => p.id === pageId));
  if (!page) return null;
  const set = (patch: Partial<Page['transition']>, coalesce?: string) =>
    useEditor.getState().updatePage(
      pageId,
      (p) => {
        p.transition = { ...p.transition, ...patch };
      },
      coalesce,
    );
  return (
    <Popover anchor={anchor} onClose={onClose} width={264} placement="top">
      <div className="tl-pop">
        <div className="tl-pop-title">Transition</div>
        <div className="tl-trans-grid">
          {TRANSITIONS.map((t) => (
            <button key={t.id} className={'chip' + (page.transition.type === t.id ? ' active' : '')} onClick={() => set({ type: t.id as TransitionType })}>
              {t.name}
            </button>
          ))}
        </div>
        {page.transition.type !== 'none' && (
          <Slider
            label={
              <>
                <span>Duration</span>
              </>
            }
            value={page.transition.duration}
            min={0.2}
            max={Math.max(0.2, Math.min(2, page.duration))}
            step={0.1}
            suffix="s"
            onChange={(v) => set({ duration: round1(v) }, 'tl-trans-dur:' + pageId)}
          />
        )}
        <p className="tl-pop-note">Plays at the end of this page as it hands over to the next one.</p>
      </div>
    </Popover>
  );
}

// ---------------------------------------------------------------------------

const AudioClipView = memo(function AudioClipView(props: {
  track: AudioTrack;
  design: Design;
  pps: number;
  selected: boolean;
  onDrag: (e: React.PointerEvent, t: AudioTrack, mode: 'move' | 'left' | 'right') => void;
  onMenu: (e: React.MouseEvent) => void;
}) {
  const { track, design, pps, selected } = props;
  const len = trackLength(design, track);
  const src = trackSourceDuration(design, track);
  const w = Math.max(6, len * pps);
  return (
    <div
      className={'tl-clip' + (selected ? ' selected' : '') + (track.muted ? ' muted' : '')}
      style={{ left: track.start * pps, width: w }}
      onPointerDown={(e) => props.onDrag(e, track, 'move')}
      onContextMenu={props.onMenu}
      title={`${track.name} · ${fmtDur(len)}`}
    >
      <Waveform track={track} width={w} height={LANE_H - 8} sourceDuration={src} />
      <ClipLabel track={track} />
      <div className="tl-clip-edge left" onPointerDown={(e) => props.onDrag(e, track, 'left')} title="Drag to trim the start" />
      <div className="tl-clip-edge right" onPointerDown={(e) => props.onDrag(e, track, 'right')} title="Drag to trim the end" />
    </div>
  );
});

// ---------------------------------------------------------------------------

function ClipToolbar(props: { track: AudioTrack; design: Design; onClose: () => void; onDelete: () => void; onDuplicate: () => void; onSplit: () => void }) {
  const { track, design } = props;
  const len = trackLength(design, track);
  const up = (patch: Partial<AudioTrack>, key: string) => useEditor.getState().updateAudio(track.id, patch, `tl-${key}:${track.id}`);
  const vol = Math.round(track.volume * 100);
  return (
    <div className="tl-cliptools" onPointerDown={(e) => e.stopPropagation()}>
      <span className="tl-cliptools-name" title={track.name}>
        <Music size={13} /> {track.name.replace(/\.[a-z0-9]{2,5}$/i, '')}
      </span>
      <div className="vdivider" />
      <button
        className={'icon-btn sm' + (track.muted ? ' active' : '')}
        onClick={() => up({ muted: !track.muted }, 'mute')}
        aria-label={track.muted ? 'Unmute' : 'Mute'}
        data-tip={track.muted ? 'Unmute' : 'Mute'}
      >
        {track.muted ? <VolumeX size={15} /> : <Volume2 size={15} />}
      </button>
      <div className="tl-vol">
        <input
          type="range"
          min={0}
          max={150}
          value={vol}
          style={{ ['--fill' as any]: `${(vol / 150) * 100}%` }}
          onChange={(e) => up({ volume: parseInt(e.target.value) / 100 }, 'vol')}
          onDoubleClick={() => up({ volume: 1 }, 'vol')}
          aria-label="Volume"
          title="Volume (double-click to reset)"
        />
        <span className="tl-num">{vol}%</span>
      </div>
      <div className="tl-fade">
        <span>Fade in</span>
        <NumberField value={track.fadeIn} min={0} max={Math.max(0, len)} step={0.1} decimals={1} unit="s" onChange={(v) => up({ fadeIn: round1(v) }, 'fi')} />
      </div>
      <div className="tl-fade">
        <span>Fade out</span>
        <NumberField value={track.fadeOut} min={0} max={Math.max(0, len)} step={0.1} decimals={1} unit="s" onChange={(v) => up({ fadeOut: round1(v) }, 'fo')} />
      </div>
      <div className="vdivider" />
      <button className="icon-btn sm" onClick={props.onDuplicate} aria-label="Duplicate clip" data-tip="Duplicate">
        <Copy size={14} />
      </button>
      <button className="icon-btn sm tl-danger" onClick={props.onDelete} aria-label="Delete clip" data-tip="Delete (Del)">
        <Trash2 size={14} />
      </button>
      <div className="spacer" />
      <span className="tl-cliptools-meta">
        <MoveHorizontal size={12} /> {fmtTime(track.start)} · {fmtDur(len)}
      </span>
      <button className="icon-btn sm" onClick={props.onClose} aria-label="Deselect clip" data-tip="Done">
        <X size={14} />
      </button>
    </div>
  );
}

