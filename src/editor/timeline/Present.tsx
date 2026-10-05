import { useEffect, useRef, useState } from 'react';
import { ChevronLeft, ChevronRight, Pause, Play, X, LoaderCircle } from 'lucide-react';
import type { Design, Page, VideoElement } from '../../types';
import { useEditor } from '../../store/editor';
import { useUI } from '../../store/ui';
import { platform, isDesktop } from '../../lib/platform';
import { getAsset } from '../../lib/assets';
import { PageRenderer, preparePage } from '../../lib/render/renderPage';
import { applyAnimation, videoSourceTime } from '../../lib/render/builder';
import { drawTransition } from '../../lib/render/animation';
import { scheduleAudio } from './playback';
import { fmtTime } from './common';
import './timeline.css';

const VIDEO_KEY = 'present:';

interface Slot {
  page: Page;
  promise: Promise<PageRenderer | null>;
  r: PageRenderer | null;
  dead: boolean;
}

/** Videos (elements and background) that a renderer drew */
function rendererVideos(r: PageRenderer): { v: HTMLVideoElement; el: VideoElement | null }[] {
  const out: { v: HTMLVideoElement; el: VideoElement | null }[] = [];
  for (const el of r.ctx.page.elements) {
    if (el.type !== 'video') continue;
    const v = r.nodes.get(el.id)?.getAttr('video') as HTMLVideoElement | undefined;
    if (v) out.push({ v, el });
  }
  const bg = r.layer.findOne('.background');
  const bv = bg?.getAttr('video') as HTMLVideoElement | undefined;
  if (bv) out.push({ v: bv, el: null });
  return out;
}

/** Keep a renderer's videos in step with page time `t`. */
function syncVideos(r: PageRenderer, t: number, playing: boolean, open = false) {
  const pageDur = open ? Infinity : r.ctx.page.duration;
  for (const { v, el } of rendererVideos(r)) {
    if (!el) {
      v.muted = true;
      v.loop = true;
      const target = v.duration ? t % v.duration : 0;
      if (playing) {
        if (Math.abs(v.currentTime - target) > 0.5 && v.readyState >= 1) v.currentTime = target;
        if (v.paused) void v.play().catch(() => undefined);
      } else {
        if (!v.paused) v.pause();
        if (Math.abs(v.currentTime - target) > 0.04 && v.readyState >= 1) v.currentTime = target;
      }
      continue;
    }
    const dur = getAsset(el.assetId)?.meta.duration || v.duration || 0;
    const start = el.timing?.start ?? 0;
    const end = el.timing?.end ?? pageDur;
    const active = t >= start && t <= end;
    const target = videoSourceTime(el, Math.min(t, end), dur);
    v.muted = el.muted;
    v.volume = Math.max(0, Math.min(1, el.volume));
    v.playbackRate = el.speed || 1;
    v.loop = false;
    const clipEnd = (el.trimEnd ?? dur) - 0.04;
    if (playing && active && (el.loop || v.currentTime < clipEnd)) {
      if (Math.abs(v.currentTime - target) > 0.3 && v.readyState >= 1) v.currentTime = target;
      if (v.paused) void v.play().catch(() => undefined);
    } else {
      if (!v.paused) v.pause();
      if (Math.abs(v.currentTime - target) > 0.04 && v.readyState >= 1) v.currentTime = target;
    }
  }
}

function pauseVideos(r: PageRenderer) {
  for (const { v } of rendererVideos(r)) if (!v.paused) v.pause();
}

/**
 * Manual mode: entrance animations and loops run, but exit animations never
 * fire, so the page stays put while the presenter talks. Elements with an
 * explicit end time still leave when it passes.
 */
function applyHeld(r: PageRenderer, t: number) {
  const p = r.ctx.page;
  const { width, height } = r.ctx.design;
  const open = Math.max(p.duration, t) + 1e6;
  for (const el of p.elements) {
    const g = r.nodes.get(el.id);
    if (!g) continue;
    applyAnimation(g, el, t, el.timing?.end != null ? p.duration : open, width, height);
  }
}

export function Present() {
  const [design] = useState<Design | null>(() => useEditor.getState().design);
  const pages = design ? design.pages.filter((p) => !p.hidden) : [];
  const starts = useRef<number[]>([]);
  {
    let acc = 0;
    starts.current = pages.map((p) => {
      const s = acc;
      acc += p.duration;
      return s;
    });
  }
  const total = pages.reduce((a, p) => a + p.duration, 0);

  const [index, setIndex] = useState(() => {
    const st = useEditor.getState();
    const i = pages.findIndex((p) => p.id === st.activePageId);
    return Math.max(0, i);
  });
  const [autoplay, setAutoplay] = useState(false);
  const [chrome, setChrome] = useState(true);
  const [loading, setLoading] = useState(false);
  const [elapsed, setElapsed] = useState(0);

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const slots = useRef(new Map<string, Slot>());
  const fitRef = useRef(1);
  const [size, setSize] = useState(() => ({ w: window.innerWidth, h: window.innerHeight }));

  // mutable presenter state read by the frame loop
  const st = useRef({
    index,
    autoplay: false,
    arrivedAt: performance.now(), // manual mode: when the current page appeared
    T0: 0, // autoplay: global time at playStart
    playStart: 0,
    ended: false, // autoplay reached the end: hold the final frame
    trans: null as null | { from: PageRenderer; to: Slot; type: Page['transition']['type']; dur: number; at: number; toIndex: number },
    stopAudio: null as null | (() => void),
  });

  // ------------------------------------------------------------------ fullscreen & editor playback
  useEffect(() => {
    useUI.getState().setPlaying(false);
    platform.setFullscreen(true);
    let wasFull = false;
    const onFs = () => {
      if (document.fullscreenElement) wasFull = true;
      else if (wasFull) useUI.getState().setPresenting(false);
    };
    document.addEventListener('fullscreenchange', onFs);
    return () => {
      document.removeEventListener('fullscreenchange', onFs);
      if (isDesktop || document.fullscreenElement) platform.setFullscreen(false);
    };
  }, []);

  // ------------------------------------------------------------------ sizing
  useEffect(() => {
    const measure = () => setSize({ w: window.innerWidth, h: window.innerHeight });
    measure();
    window.addEventListener('resize', measure);
    return () => window.removeEventListener('resize', measure);
  }, []);

  const fit = design && size.w ? Math.min(size.w / design.width, size.h / design.height) : 1;
  const dpr = window.devicePixelRatio || 1;
  const cssW = design ? Math.max(1, Math.floor(design.width * fit)) : 1;
  const cssH = design ? Math.max(1, Math.floor(design.height * fit)) : 1;

  useEffect(() => {
    fitRef.current = fit;
    const c = canvasRef.current;
    if (c) {
      c.width = Math.round(cssW * dpr);
      c.height = Math.round(cssH * dpr);
    }
    for (const s of slots.current.values()) if (s.r) sizeRenderer(s.r, fit);
  }, [fit, cssW, cssH, dpr]);

  function sizeRenderer(r: PageRenderer, f: number) {
    if (!design) return;
    r.stage.size({ width: Math.max(1, Math.floor(design.width * f)), height: Math.max(1, Math.floor(design.height * f)) });
    r.stage.scale({ x: f, y: f });
  }

  // ------------------------------------------------------------------ renderer cache
  function slotFor(page: Page): Slot {
    let s = slots.current.get(page.id);
    if (s) return s;
    const slot: Slot = { page, r: null, dead: false, promise: Promise.resolve(null) };
    slot.promise = (async () => {
      if (!design) return null;
      await preparePage(design, page, VIDEO_KEY);
      if (slot.dead) return null;
      const r = new PageRenderer(design, page, { scale: fitRef.current, mode: 'play', videoKey: VIDEO_KEY });
      sizeRenderer(r, fitRef.current);
      // park at the first frame
      r.applyTime(0);
      syncVideos(r, 0, false);
      r.layer.draw();
      if (slot.dead) {
        pauseVideos(r);
        r.destroy();
        return null;
      }
      slot.r = r;
      return r;
    })().catch(() => null);
    slots.current.set(page.id, slot);
    return slot;
  }

  /** Keep renderers for the current page and its neighbours; destroy the rest. */
  function retain(i: number) {
    const keep = new Set<string>();
    for (const k of [i, i + 1, i - 1]) {
      const p = pages[k];
      if (p) {
        keep.add(p.id);
        slotFor(p);
      }
    }
    const tr = st.current.trans;
    if (tr) {
      keep.add(tr.to.page.id);
      keep.add(tr.from.ctx.page.id);
    }
    for (const [id, s] of slots.current) {
      if (keep.has(id)) continue;
      s.dead = true;
      if (s.r) {
        pauseVideos(s.r);
        s.r.destroy();
      }
      slots.current.delete(id);
    }
  }

  useEffect(
    () => () => {
      for (const s of slots.current.values()) {
        s.dead = true;
        if (s.r) {
          pauseVideos(s.r);
          s.r.destroy();
        }
      }
      slots.current.clear();
      st.current.stopAudio?.();
      // return to the editor on the page that was being presented
      const shown = pages[st.current.index];
      if (shown) useEditor.getState().setActivePage(shown.id);
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );

  // ------------------------------------------------------------------ navigation
  function arrive(i: number) {
    const s = st.current;
    const prev = pages[s.index];
    if (prev && prev.id !== pages[i]?.id) {
      const pr = slots.current.get(prev.id)?.r;
      if (pr) pauseVideos(pr);
    }
    s.index = i;
    s.arrivedAt = performance.now();
    s.ended = false;
    setIndex(i);
    retain(i);
  }

  function startAutoplayAt(T: number) {
    const s = st.current;
    s.stopAudio?.();
    s.T0 = T;
    s.playStart = performance.now();
    if (design) s.stopAudio = scheduleAudio(design, T);
  }

  function go(dir: 1 | -1) {
    const s = st.current;
    if (s.trans) {
      // finish the running transition instantly
      const toIndex = s.trans.toIndex;
      s.trans = null;
      arrive(toIndex);
      if (dir === 1) return;
    }
    const target = Math.max(0, Math.min(pages.length - 1, s.index + dir));
    if (target === s.index) return;
    if (s.autoplay) {
      arrive(target);
      startAutoplayAt(starts.current[target]);
      return;
    }
    const cur = pages[s.index];
    const fromR = slots.current.get(cur.id)?.r;
    if (dir === 1 && cur.transition.type !== 'none' && cur.transition.duration > 0 && fromR) {
      const to = slotFor(pages[target]);
      if (to.r) {
        pauseVideos(fromR);
        s.trans = { from: fromR, to, type: cur.transition.type, dur: Math.min(2, cur.transition.duration), at: performance.now(), toIndex: target };
        return;
      }
    }
    arrive(target);
  }

  function toggleAutoplay() {
    const s = st.current;
    if (s.autoplay) {
      s.autoplay = false;
      s.stopAudio?.();
      s.stopAudio = null;
      setAutoplay(false);
      // continue in manual mode from where the page is
      const T = s.T0 + (performance.now() - s.playStart) / 1000;
      const local = Math.max(0, T - starts.current[s.index]);
      s.arrivedAt = performance.now() - local * 1000;
      return;
    }
    if (s.trans) {
      const toIndex = s.trans.toIndex;
      s.trans = null;
      arrive(toIndex);
    }
    // play on from the start of the page on screen
    // after the end, autoplay starts over from the first page
    if (s.ended) arrive(0);
    s.autoplay = true;
    setAutoplay(true);
    s.arrivedAt = performance.now();
    startAutoplayAt(starts.current[s.index]);
  }

  function exit() {
    useUI.getState().setPresenting(false);
  }

  // ------------------------------------------------------------------ frame loop
  useEffect(() => {
    if (!design || !pages.length) return;
    retain(st.current.index);
    let raf = 0;
    let lastClock = 0;
    let spinnerTimer = 0;
    let showingLoader = false;

    const setLoader = (on: boolean) => {
      if (on === showingLoader) return;
      showingLoader = on;
      clearTimeout(spinnerTimer);
      if (on) spinnerTimer = window.setTimeout(() => setLoading(true), 300);
      else setLoading(false);
    };

    const draw = (src: HTMLCanvasElement) => {
      const c = canvasRef.current;
      const ctx = c?.getContext('2d');
      if (!c || !ctx) return;
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.clearRect(0, 0, c.width, c.height);
      ctx.drawImage(src, 0, 0, src.width, src.height, 0, 0, c.width, c.height);
    };

    const loop = (now: number) => {
      raf = requestAnimationFrame(loop);
      const s = st.current;
      const c = canvasRef.current;
      const ctx = c?.getContext('2d');
      if (!c || !ctx) return;

      // manual transition in progress
      if (s.trans) {
        const tr = s.trans;
        const p = Math.min(1, (now - tr.at) / 1000 / tr.dur);
        const to = tr.to.r;
        if (!to || p >= 1) {
          s.trans = null;
          arrive(tr.toIndex);
          return;
        }
        tr.from.layer.draw();
        to.applyTime(0);
        to.layer.draw();
        ctx.setTransform(1, 0, 0, 1, 0, 0);
        drawTransition(ctx, tr.type, p, tr.from.layer.getNativeCanvasElement(), to.layer.getNativeCanvasElement(), c.width, c.height);
        return;
      }

      if (s.ended) return;
      let i = s.index;
      let local: number;
      if (s.autoplay) {
        const T = s.T0 + (now - s.playStart) / 1000;
        if (T >= total) {
          // reached the end: hold the last frame
          s.autoplay = false;
          s.stopAudio?.();
          s.stopAudio = null;
          setAutoplay(false);
          setChrome(true);
          const last = pages.length - 1;
          if (s.index !== last) arrive(last);
          const lr = slots.current.get(pages[last].id)?.r;
          if (lr) {
            lr.applyTime(pages[last].duration);
            pauseVideos(lr);
            lr.layer.draw();
            draw(lr.layer.getNativeCanvasElement());
          }
          s.ended = true;
          return;
        }
        // page under T
        let k = 0;
        while (k < pages.length - 1 && T >= starts.current[k] + pages[k].duration) k++;
        if (k !== s.index) arrive(k);
        i = k;
        local = T - starts.current[k];
      } else {
        local = (now - s.arrivedAt) / 1000;
      }

      const page = pages[i];
      const slot = slots.current.get(page.id) || slotFor(page);
      const r = slot.r;
      if (!r) {
        setLoader(true);
        // keep the arrival clock from running while the page loads
        if (!s.autoplay) s.arrivedAt = now;
        return;
      }
      setLoader(false);

      if (s.autoplay) {
        r.applyTime(Math.min(local, page.duration));
        syncVideos(r, local, true);
      } else {
        applyHeld(r, local);
        syncVideos(r, local, true, true);
      }
      r.layer.draw();

      // autoplay transition into the next page during the last seconds of this one
      const next = pages[i + 1];
      const tr = page.transition;
      if (s.autoplay && next && tr.type !== 'none' && tr.duration > 0) {
        const d = Math.min(tr.duration, page.duration);
        const from = page.duration - d;
        if (local >= from) {
          const ns = slots.current.get(next.id) || slotFor(next);
          if (ns.r) {
            ns.r.applyTime(0);
            ns.r.layer.draw();
            ctx.setTransform(1, 0, 0, 1, 0, 0);
            drawTransition(ctx, tr.type, Math.min(1, (local - from) / d), r.layer.getNativeCanvasElement(), ns.r.layer.getNativeCanvasElement(), c.width, c.height);
            return;
          }
        }
      }
      draw(r.layer.getNativeCanvasElement());

      // update the clock readout ~4 times a second
      if (s.autoplay && now - lastClock > 250) {
        lastClock = now;
        setElapsed(s.T0 + (now - s.playStart) / 1000);
      }
    };
    raf = requestAnimationFrame(loop);
    return () => {
      cancelAnimationFrame(raf);
      clearTimeout(spinnerTimer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ------------------------------------------------------------------ keyboard
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const k = e.key;
      let handled = true;
      if (k === 'Escape') exit();
      else if (k === 'ArrowRight' || k === 'ArrowDown' || k === 'PageDown' || k === ' ' || k === 'Enter') go(1);
      else if (k === 'ArrowLeft' || k === 'ArrowUp' || k === 'PageUp' || k === 'Backspace') go(-1);
      else if (k === 'Home') {
        if (st.current.autoplay) startAutoplayAt(0);
        st.current.trans = null;
        arrive(0);
      } else if (k === 'End') {
        st.current.trans = null;
        arrive(pages.length - 1);
        if (st.current.autoplay) startAutoplayAt(starts.current[pages.length - 1]);
      } else if (k.toLowerCase() === 'p') toggleAutoplay();
      else handled = false;
      if (handled) {
        e.preventDefault();
      }
      // the presenter owns the keyboard
      e.stopPropagation();
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ------------------------------------------------------------------ hover chrome
  useEffect(() => {
    let timer = 0;
    const poke = () => {
      setChrome(true);
      clearTimeout(timer);
      timer = window.setTimeout(() => setChrome(false), 2200);
    };
    poke();
    window.addEventListener('pointermove', poke);
    return () => {
      clearTimeout(timer);
      window.removeEventListener('pointermove', poke);
    };
  }, []);

  if (!design || !pages.length) {
    return (
      <div className="present" onClick={exit}>
        <div className="present-empty">
          <p>All pages are hidden. Show a page to present it.</p>
          <button className="btn" onClick={exit}>
            Exit
          </button>
        </div>
      </div>
    );
  }

  const shownTime = autoplay ? `${fmtTime(elapsed)} / ${fmtTime(total)}` : null;

  return (
    <div
      className={'present' + (chrome ? '' : ' idle')}
      onClick={(e) => {
        if ((e.target as HTMLElement).closest('.present-bar')) return;
        go(1);
      }}
      onContextMenu={(e) => {
        e.preventDefault();
        go(-1);
      }}
    >
      <canvas ref={canvasRef} className="present-canvas" style={{ width: cssW, height: cssH }} />
      {loading && (
        <div className="present-loading">
          <LoaderCircle size={28} className="spin" />
        </div>
      )}
      <div className={'present-bar' + (chrome ? ' show' : '')} onClick={(e) => e.stopPropagation()}>
        <button className="present-btn" onClick={() => go(-1)} disabled={index === 0} aria-label="Previous page" title="Previous (Left arrow)">
          <ChevronLeft size={18} />
        </button>
        <span className="present-count">
          {index + 1} / {pages.length}
        </span>
        <button className="present-btn" onClick={() => go(1)} disabled={index === pages.length - 1} aria-label="Next page" title="Next (Right arrow)">
          <ChevronRight size={18} />
        </button>
        <span className="present-sep" />
        <button className={'present-btn wide' + (autoplay ? ' on' : '')} onClick={toggleAutoplay} title="Autoplay (P)">
          {autoplay ? <Pause size={15} /> : <Play size={15} />}
          <span>Autoplay</span>
        </button>
        {shownTime && <span className="present-time">{shownTime}</span>}
        <span className="present-sep" />
        <button className="present-btn wide" onClick={exit} title="Exit (Esc)">
          <X size={16} />
          <span>Exit</span>
        </button>
      </div>
    </div>
  );
}
