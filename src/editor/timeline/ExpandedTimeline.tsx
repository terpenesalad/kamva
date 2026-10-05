import React, { memo, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowRightLeft, ChevronDown, Copy, Film, Mic, Music, Pause, Play, Plus, Scissors, SkipBack, Square, Trash2, Volume2, VolumeX, X,
  ZoomIn, ZoomOut, MoveHorizontal,
} from 'lucide-react';
import type { AudioTrack, Design, Page, TransitionType, VideoElement } from '../../types';
import { useEditor, pageStartTime, totalDuration } from '../../store/editor';
import { useUI, usePrefs } from '../../store/ui';
import { getAsset, getAudioBuffer } from '../../lib/assets';
import { importDialog } from '../../lib/actions';
import { newPage, uid } from '../../lib/defaults';
import { TRANSITIONS } from '../../lib/render/animation';
import { ContextMenu, NumberField, Popover, Slider } from '../../components/ui';
import { usePageThumb, useInView } from './thumbs';
import { seekTo, trackLength, trackSourceDuration } from './playback';
import { fmtDur, fmtTime, goToPage, pageMenuItems, pointerDrag, readNum, writeNum } from './common';
import { ClipLabel, Waveform } from './AudioClip';
import { RenameInput } from './PagesStrip';
import { startVoiceOver, stopVoiceOver, useRecorder } from './recorder';

const HEAD_W = 84;
const RULER_H = 24;
const PAGE_H = 52;
const LANE_H = 40;
const VIDEO_BAR_H = 12;
const SNAP_PX = 6;
const PPS_MIN = 8;
const PPS_MAX = 240;
const PPS_KEY = 'kamva.timeline.pps';

const round1 = (v: number) => Math.round(v * 10) / 10;
const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));

interface VideoBar {
  el: VideoElement;
  start: number; // global
  shown: number; // seconds visible on the timeline
  srcLen: number; // trimmed source length at playback speed
  overflow: number; // seconds cut off by the page / element end
}

function videoBars(d: Design, page: Page | undefined): VideoBar[] {
  if (!page || page.hidden) return [];
  const p0 = pageStartTime(d, page.id);
  const out: VideoBar[] = [];
  for (const el of page.elements) {
    if (el.type !== 'video' || !el.assetId) continue;
    const dur = getAsset(el.assetId)?.meta.duration || d.assets[el.assetId]?.duration || 0;
    const srcLen = Math.max(0, (el.trimEnd ?? dur) - el.trimStart) / (el.speed || 1);
    const s = el.timing?.start ?? 0;
    const e = Math.min(page.duration, el.timing?.end ?? page.duration);
    const room = Math.max(0, e - s);
    const shown = el.loop ? room : Math.min(srcLen, room);
    out.push({ el, start: p0 + s, shown, srcLen, overflow: el.loop ? 0 : Math.max(0, srcLen - room) });
  }
  return out;
}

export function ExpandedTimeline({ design, height }: { design: Design; height: number }) {
  const activeId = useEditor((s) => s.activePageId);
  const [pps, setPpsState] = useState(() => clamp(readNum(PPS_KEY, 48), PPS_MIN, PPS_MAX));
  const ppsRef = useRef(pps);
  ppsRef.current = pps;
  const setPps = useCallback((v: number) => {
    const n = clamp(v, PPS_MIN, PPS_MAX);
    ppsRef.current = n;
    setPpsState(n);
    writeNum(PPS_KEY, n);
  }, []);
  const [selClip, setSelClip] = useState<string | null>(null);
  const [menu, setMenu] = useState<{ x: number; y: number; id: string } | null>(null);
  const [renaming, setRenaming] = useState<string | null>(null);
  const [trans, setTrans] = useState<{ id: string; anchor: HTMLElement } | null>(null);
  const [, setDecoded] = useState(0);
  const rootRef = useRef<HTMLDivElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

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
    if (selClip && !design.audio.some((a) => a.id === selClip)) setSelClip(null);
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
  const lanes = Math.max(laneCount, recording ? recLane + 1 : 0);
  const activePage = pages.find((p) => p.id === activeId);
  const vids = useMemo(() => videoBars(design, activePage), [design, activePage]);

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

  const snapTargets = useCallback(
    (excludeId?: string) => {
      const ts = [...boundaries, useUI.getState().time];
      for (const t of useEditor.getState().design?.audio || []) {
        if (t.id === excludeId) continue;
        ts.push(t.start, t.start + trackLength(design, t));
      }
      return ts;
    },
    [boundaries, design],
  );

  const snap = useCallback(
    (v: number, excludeId?: string, len = 0): number => {
      const tol = SNAP_PX / pps;
      let best: number | null = null;
      let bestD = tol;
      for (const t of snapTargets(excludeId)) {
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
      return best ?? round1(v);
    },
    [pps, snapTargets],
  );

  // ------------------------------------------------------------------ clip actions
  const selTrack = design.audio.find((a) => a.id === selClip) || null;

  const deleteClip = (id: string) => {
    useEditor.getState().deleteAudio(id);
    setSelClip(null);
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

  // ------------------------------------------------------------------ keyboard
  const onKeyDown = (e: React.KeyboardEvent) => {
    const tgt = e.target as HTMLElement;
    if (tgt.tagName === 'INPUT' || tgt.tagName === 'TEXTAREA') return;
    if ((e.key === 'Delete' || e.key === 'Backspace') && selClip) {
      e.preventDefault();
      e.stopPropagation();
      deleteClip(selClip);
    } else if (e.key === ' ' && tgt.tagName !== 'BUTTON') {
      e.preventDefault();
      e.stopPropagation();
      useUI.getState().setPlaying(!useUI.getState().playing);
    } else if (e.key === 'Escape' && selClip) {
      e.stopPropagation();
      setSelClip(null);
    } else if ((e.key === 'd' || e.key === 'D') && (e.ctrlKey || e.metaKey) && selTrack) {
      e.preventDefault();
      e.stopPropagation();
      duplicateClip(selTrack);
    }
  };

  // ------------------------------------------------------------------ ruler scrubbing
  const scrub = (e: React.PointerEvent) => {
    if (e.button !== 0) return;
    const track = e.currentTarget as HTMLElement;
    const at = (clientX: number) => {
      const r = track.getBoundingClientRect();
      return clamp((clientX - r.left) / pps, 0, total);
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

  // ------------------------------------------------------------------ clip drags
  const dragClip = (e: React.PointerEvent, t: AudioTrack, mode: 'move' | 'left' | 'right') => {
    e.stopPropagation();
    if (e.button !== 0) return;
    setSelClip(t.id);
    rootRef.current?.focus({ preventScroll: true });
    const len0 = trackLength(design, t);
    const src = trackSourceDuration(design, t);
    const key = `tl-audio-${mode}:${t.id}`;
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
          s = free ? Math.round(s * 100) / 100 : snap(s, t.id, len0);
          s = Math.max(0, s);
          const lane = clamp(t.lane + Math.round(dy / LANE_H), 0, laneCount);
          patch = { start: s, lane };
        } else if (mode === 'left') {
          // move the clip's start edge; the audio stays anchored in time
          let s = t.start + dx / pps;
          s = free ? Math.round(s * 100) / 100 : snap(s, t.id);
          const minS = Math.max(0, t.start - t.trimStart); // can't go before the source start
          const maxS = t.start + len0 - 0.1;
          s = clamp(s, minS, maxS);
          const delta = s - t.start;
          patch = { start: s, trimStart: Math.max(0, t.trimStart + delta) };
        } else {
          if (src <= 0) return;
          let endT = t.start + len0 + dx / pps;
          endT = free ? Math.round(endT * 100) / 100 : snap(endT, t.id);
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

  // ------------------------------------------------------------------ helpers
  const fitPageToVideo = () => {
    if (!activePage) return;
    const need = Math.max(
      0.5,
      ...activePage.elements
        .filter((e): e is VideoElement => e.type === 'video' && !!e.assetId)
        .map((el) => {
          const dur = getAsset(el.assetId)?.meta.duration || design.assets[el.assetId!]?.duration || 0;
          return (el.timing?.start ?? 0) + Math.max(0, (el.trimEnd ?? dur) - el.trimStart) / (el.speed || 1);
        }),
    );
    const v = Math.ceil(need * 10 - 1e-6) / 10;
    if (v !== activePage.duration)
      useEditor.getState().updatePage(activePage.id, (p) => {
        p.duration = v;
      });
  };

  const addPageAtEnd = () => {
    const p = newPage();
    p.duration = usePrefs.getState().pageDurationDefault || 5;
    const last = pages[pages.length - 1];
    if (last && last.background.fill.type === 'solid' && !last.background.assetId) p.background.fill = { ...last.background.fill };
    useEditor.getState().addPage(last?.id, p);
  };

  const videoLaneH = vids.length ? Math.max(40, vids.length * (VIDEO_BAR_H + 4) + 8) : 0;
  const contentH = RULER_H + PAGE_H + videoLaneH + lanes * LANE_H + 8;

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
    >
      <Transport pps={pps} setPps={setPps} total={total} />
      {selTrack && (
        <ClipToolbar
          track={selTrack}
          design={design}
          onClose={() => setSelClip(null)}
          onDelete={() => deleteClip(selTrack.id)}
          onDuplicate={() => duplicateClip(selTrack)}
          onSplit={() => splitClip(selTrack)}
        />
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
            <div className="tl-track" style={{ width: trackW }}>
              {visible.map((v, i) => (
                <PageBlock
                  key={v.page.id}
                  design={design}
                  page={v.page}
                  index={v.index}
                  left={v.start * pps}
                  width={v.page.duration * pps}
                  active={v.page.id === activeId}
                  renaming={renaming === v.page.id}
                  onRenameDone={(name) => {
                    setRenaming(null);
                    if (name !== null)
                      useEditor.getState().updatePage(v.page.id, (p) => {
                        p.name = name.trim() || undefined;
                      });
                  }}
                  onResize={dragDuration}
                  onMenu={(e) => {
                    e.preventDefault();
                    setMenu({ x: e.clientX, y: e.clientY, id: v.page.id });
                  }}
                  hasNext={i < visible.length - 1}
                  onTransition={(anchor) => setTrans({ id: v.page.id, anchor })}
                />
              ))}
              <button className="tl-add-page" style={{ left: total * pps + 6 }} onClick={addPageAtEnd} data-tip="Add page" data-tip-side="top" aria-label="Add page">
                <Plus size={16} />
              </button>
            </div>
          </div>

          {/* active page videos (read-only) */}
          {vids.length > 0 && (
            <div className="tl-row" style={{ height: videoLaneH }}>
              <div className="tl-head tl-head-video">
                <span>
                  <Film size={12} /> Video
                </span>
                <button className="tl-mini-btn" onClick={fitPageToVideo} title="Set the page duration to the length of its videos">
                  Fit page
                </button>
              </div>
              <div className="tl-track tl-video-lane" style={{ width: trackW }}>
                {vids.map((b, i) => (
                  <VideoBarView key={b.el.id} bar={b} pps={pps} top={Math.max(6, (videoLaneH - vids.length * (VIDEO_BAR_H + 4) + 4) / 2) + i * (VIDEO_BAR_H + 4)} design={design} />
                ))}
              </div>
            </div>
          )}

          {/* audio lanes */}
          {Array.from({ length: lanes }, (_, lane) => (
            <div className="tl-row tl-lane" key={lane} style={{ height: LANE_H }}>
              <div className="tl-head">
                <span>
                  <Music size={12} /> Audio {lanes > 1 ? lane + 1 : ''}
                </span>
              </div>
              <div className="tl-track" style={{ width: trackW }} onPointerDown={(e) => e.target === e.currentTarget && setSelClip(null)}>
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
                      }}
                    />
                  ))}
                {recording && recLane === lane && <RecClip pps={pps} />}
                {!design.audio.length && !recording && lane === 0 && (
                  <div className="tl-empty-lane" style={{ left: 8 }}>
                    Add audio or record a voice-over to hear it with your pages.
                  </div>
                )}
              </div>
            </div>
          ))}

          {total < span && <div className="tl-overrun" style={{ left: HEAD_W + total * pps, top: RULER_H, width: (span - total) * pps + 160 }} />}
          <Playhead pps={pps} scrollRef={scrollRef} />
        </div>
      </div>

      {menu && <ContextMenu x={menu.x} y={menu.y} items={pageMenuItems(menu.id, () => setRenaming(menu.id))} onClose={() => setMenu(null)} />}
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

function Transport({ pps, setPps, total }: { pps: number; setPps: (v: number) => void; total: number }) {
  const playing = useUI((s) => s.playing);
  const recording = useRecorder((s) => s.recording);
  const fill = ((Math.log(pps) - Math.log(PPS_MIN)) / (Math.log(PPS_MAX) - Math.log(PPS_MIN))) * 100;
  return (
    <div className="tl-transport">
      <button
        className="icon-btn sm tl-play"
        onClick={() => useUI.getState().setPlaying(!playing)}
        disabled={total <= 0}
        aria-label={playing ? 'Pause' : 'Play'}
        data-tip={playing ? 'Pause (Space)' : 'Play (Space)'}
      >
        {playing ? <Pause size={16} /> : <Play size={16} />}
      </button>
      <button className="icon-btn sm" onClick={() => seekTo(0)} aria-label="Jump to start" data-tip="Jump to start">
        <SkipBack size={15} />
      </button>
      <TimeReadout total={total} />
      <div className="vdivider" />
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

function TimeReadout({ total }: { total: number }) {
  const time = useUI((s) => Math.round(s.time * 10));
  return (
    <span className="tl-time">
      <b>{fmtTime(time / 10)}</b> / {fmtTime(total)}
    </span>
  );
}

// ---------------------------------------------------------------------------

function niceStep(pps: number): { major: number; minor: number } {
  const steps = [0.5, 1, 2, 5, 10, 15, 30, 60, 120, 300];
  const major = steps.find((s) => s * pps >= 56) ?? 600;
  const minor = major <= 1 ? major / 5 : major <= 2 ? 0.5 : major <= 10 ? 1 : major / 5;
  return { major, minor };
}

function rulerLabel(t: number): string {
  if (t < 60) return Number.isInteger(t) ? `${t}s` : `${t.toFixed(1)}s`;
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
  renaming: boolean;
  hasNext: boolean;
  onRenameDone: (name: string | null) => void;
  onResize: (e: React.PointerEvent, page: Page) => void;
  onMenu: (e: React.MouseEvent) => void;
  onTransition: (anchor: HTMLElement) => void;
}) {
  const { design, page, index, left, width, active, renaming, hasNext } = props;
  const [ref, inView] = useInView<HTMLDivElement>();
  const thumb = usePageThumb(design, page, inView);
  const tileW = Math.max(16, (PAGE_H - 8) * (design.width / design.height));
  const tr = page.transition;
  return (
    <>
      <div
        ref={ref}
        className={'tl-page' + (active ? ' active' : '')}
        style={{ left, width: Math.max(4, width - 2) }}
        onPointerDown={(e) => {
          if (e.button === 0) goToPage(page.id);
        }}
        onContextMenu={props.onMenu}
        title={`${page.name || `Page ${index + 1}`} · ${fmtDur(page.duration)}`}
      >
        <div
          className="tl-film"
          style={thumb ? { backgroundImage: `url(${thumb})`, backgroundSize: `${tileW}px 100%` } : undefined}
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
            max={2}
            step={0.1}
            suffix="s"
            onChange={(v) => set({ duration: round1(v) }, 'tl-trans-dur:' + pageId)}
          />
        )}
        <p className="tl-pop-note">Plays when this page hands over to the next one.</p>
      </div>
    </Popover>
  );
}

// ---------------------------------------------------------------------------

function VideoBarView({ bar, pps, top, design }: { bar: VideoBar; pps: number; top: number; design: Design }) {
  const { el } = bar;
  const name = el.name || getAsset(el.assetId)?.meta.name || design.assets[el.assetId!]?.name || 'Video';
  const dur = getAsset(el.assetId)?.meta.duration || design.assets[el.assetId!]?.duration || 0;
  const trimmed = el.trimStart > 0.01 || (el.trimEnd !== null && el.trimEnd < dur - 0.01);
  const info = `${name} · ${fmtDur(bar.srcLen)}${trimmed ? ` · trimmed ${el.trimStart.toFixed(1)}–${(el.trimEnd ?? dur).toFixed(1)}s` : ''}${el.loop ? ' · loops' : ''}${
    bar.overflow > 0.05 ? ` · ${fmtDur(bar.overflow)} cut off by the page end` : ''
  }`;
  return (
    <>
      <div
        className="tl-vbar"
        style={{ left: bar.start * pps, width: Math.max(3, bar.shown * pps), top, height: VIDEO_BAR_H }}
        title={info}
        onPointerDown={(e) => {
          e.stopPropagation();
          useEditor.getState().select([el.id]);
        }}
      >
        <span>{bar.shown * pps > 70 ? info : ''}</span>
      </div>
      {bar.overflow > 0.05 && (
        <div className="tl-vbar-over" style={{ left: (bar.start + bar.shown) * pps, width: bar.overflow * pps, top, height: VIDEO_BAR_H }} title={info} />
      )}
    </>
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
      <button className="btn ghost sm" onClick={props.onSplit} title="Split at playhead">
        <Scissors size={14} /> Split
      </button>
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
