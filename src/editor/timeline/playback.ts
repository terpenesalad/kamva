import { useEffect } from 'react';
import type { AudioTrack, Design, Page } from '../../types';
import { useEditor, pageStartTime, totalDuration } from '../../store/editor';
import { useUI } from '../../store/ui';
import { getAsset, getAudioBuffer, sharedAudioContext } from '../../lib/assets';

// ---------------------------------------------------------------------------
// Timeline helpers shared by the timeline UI, the playback engine and the
// presenter.
// ---------------------------------------------------------------------------

export function visiblePages(d: Design): Page[] {
  return d.pages.filter((p) => !p.hidden);
}

/** The non-hidden page playing at global time `t` (the last page when t is at/after the end). */
export function pageAtTime(d: Design, t: number): { page: Page; start: number } | null {
  let start = 0;
  let last: { page: Page; start: number } | null = null;
  for (const p of d.pages) {
    if (p.hidden) continue;
    if (t < start + p.duration - 1e-6) return { page: p, start };
    last = { page: p, start };
    start += p.duration;
  }
  return last;
}

/** Source length of an audio track on the timeline, in seconds */
export function trackLength(d: Design | null, t: AudioTrack): number {
  const full = trackSourceDuration(d, t);
  const end = Math.min(full || Infinity, t.trimEnd ?? full);
  return Math.max(0, end - t.trimStart);
}

/** Full length of the source media behind a track (decoded buffer when available) */
export function trackSourceDuration(d: Design | null, t: AudioTrack): number {
  const a = getAsset(t.assetId);
  const v = a?.audioBuffer?.duration || a?.meta.duration || d?.assets[t.assetId]?.duration || 0;
  return isFinite(v) ? v : 0;
}

/** Move the playhead and show the page under it. */
export function seekTo(t: number) {
  const d = useEditor.getState().design;
  if (!d) return;
  const total = totalDuration(d);
  const time = Math.max(0, Math.min(total, t));
  useUI.getState().setTime(time);
  const hit = pageAtTime(d, time);
  if (hit && hit.page.id !== useEditor.getState().activePageId) useEditor.getState().setActivePage(hit.page.id);
}

/**
 * Schedule every audio track of `design` to play from global time `fromTime`
 * (relative to "now" on the shared AudioContext). Returns a stop function.
 * Buffers that are still decoding are scheduled as soon as they're ready,
 * aligned to where the timeline will be by then.
 */
export function scheduleAudio(design: Design, fromTime: number, opts: { endAt?: number } = {}): () => void {
  const ctx = sharedAudioContext();
  // the timeline clock is wall time (like the rAF loop), so audio lines up even
  // if the context takes a moment to resume
  const base = performance.now();
  const endAt = opts.endAt ?? totalDuration(design);
  const running = ctx.state === 'running';
  const ready: Promise<unknown> = running ? Promise.resolve() : ctx.resume().catch(() => undefined);
  let stopped = false;
  const nodes: { src: AudioBufferSourceNode; gain: GainNode }[] = [];

  const scheduleTrack = (t: AudioTrack, buf: AudioBuffer) => {
    if (stopped) return;
    const now = ctx.currentTime;
    const T = fromTime + (performance.now() - base) / 1000; // where the timeline is right now
    const trimEnd = Math.min(buf.duration, t.trimEnd ?? buf.duration);
    const trimStart = Math.max(0, Math.min(t.trimStart, trimEnd));
    let len = trimEnd - trimStart;
    // never play past the end of the design
    len = Math.min(len, Math.max(0, endAt - t.start));
    if (len <= 0.01) return;
    const clipEnd = t.start + len;
    if (T >= clipEnd - 0.01) return;

    let when: number;
    let l0: number; // seconds into the clip where playback begins
    if (T < t.start) {
      when = now + (t.start - T);
      l0 = 0;
    } else {
      when = now;
      l0 = T - t.start;
    }
    const dur = len - l0;
    if (dur <= 0.01) return;

    const vol = Math.max(0, Math.min(1.5, t.volume));
    let fi = Math.max(0, t.fadeIn || 0);
    let fo = Math.max(0, t.fadeOut || 0);
    if (fi + fo > len) {
      const k = len / (fi + fo);
      fi *= k;
      fo *= k;
    }
    const gainAt = (l: number) => {
      let g = vol;
      if (fi > 0 && l < fi) g *= l / fi;
      if (fo > 0 && l > len - fo) g *= Math.max(0, (len - l) / fo);
      return g;
    };

    const src = ctx.createBufferSource();
    src.buffer = buf;
    const gain = ctx.createGain();
    const g = gain.gain;
    g.setValueAtTime(gainAt(l0), when);
    if (fi > 0 && l0 < fi) g.linearRampToValueAtTime(gainAt(fi), when + (fi - l0));
    if (fo > 0) {
      const foStart = len - fo;
      if (l0 < foStart) g.setValueAtTime(gainAt(foStart), when + (foStart - l0));
      g.linearRampToValueAtTime(0, when + dur);
    }
    src.connect(gain).connect(ctx.destination);
    src.start(when, trimStart + l0, dur);
    const rec = { src, gain };
    nodes.push(rec);
    src.onended = () => {
      try {
        gain.disconnect();
      } catch {
        /* already disconnected */
      }
      const i = nodes.indexOf(rec);
      if (i >= 0) nodes.splice(i, 1);
    };
  };

  for (const t of design.audio) {
    if (t.muted || t.volume <= 0) continue;
    const cached = getAsset(t.assetId)?.audioBuffer;
    if (cached && running) scheduleTrack(t, cached);
    else
      void Promise.all([getAudioBuffer(t.assetId), ready]).then(([buf]) => {
        if (buf) scheduleTrack(t, buf);
      });
  }

  return () => {
    stopped = true;
    for (const { src, gain } of nodes.splice(0)) {
      try {
        src.onended = null;
        src.stop();
      } catch {
        /* not started */
      }
      try {
        gain.disconnect();
      } catch {
        /* ignore */
      }
    }
  };
}

// ---------------------------------------------------------------------------
// Playback engine: mounted once by the editor. Drives useUI.time while playing,
// switches the active page and plays the design's audio tracks.
// ---------------------------------------------------------------------------

export function usePlaybackEngine() {
  useEffect(() => {
    let raf = 0;
    let lastNow = 0;
    let lastSet = 0; // the time value this engine last wrote
    let stopAudio: (() => void) | null = null;
    let rescheduleTimer = 0;

    const startAudio = (t: number) => {
      stopAudio?.();
      stopAudio = null;
      const d = useEditor.getState().design;
      if (d && d.audio.length) stopAudio = scheduleAudio(d, t);
    };
    const haltAudio = () => {
      clearTimeout(rescheduleTimer);
      stopAudio?.();
      stopAudio = null;
    };

    const switchPage = (d: Design, t: number) => {
      const hit = pageAtTime(d, t);
      if (hit && hit.page.id !== useEditor.getState().activePageId) useEditor.getState().setActivePage(hit.page.id);
    };

    const tick = (now: number) => {
      raf = 0;
      const ui = useUI.getState();
      if (!ui.playing) return;
      const d = useEditor.getState().design;
      if (!d) {
        ui.setPlaying(false);
        return;
      }
      const total = totalDuration(d);
      const dt = Math.max(0, (now - lastNow) / 1000);
      lastNow = now;
      const cur = ui.time;
      if (Math.abs(cur - lastSet) > 0.25) {
        // the user seeked while playing
        startAudio(cur);
      }
      const t = cur + dt;
      if (t >= total) {
        lastSet = total;
        ui.setTime(total);
        switchPage(d, total);
        ui.setPlaying(false);
        return;
      }
      lastSet = t;
      ui.setTime(t);
      switchPage(d, t);
      raf = requestAnimationFrame(tick);
    };

    const play = () => {
      const d = useEditor.getState().design;
      if (!d) {
        useUI.getState().setPlaying(false);
        return;
      }
      const total = totalDuration(d);
      if (total <= 0) {
        useUI.getState().setPlaying(false);
        return;
      }
      let t = useUI.getState().time;
      if (t >= total - 0.01) {
        t = 0;
        lastSet = 0;
        useUI.getState().setTime(0);
      }
      switchPage(d, t);
      const ctx = sharedAudioContext();
      if (ctx.state === 'suspended') void ctx.resume().catch(() => undefined);
      lastSet = t;
      startAudio(t);
      lastNow = performance.now();
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(tick);
    };

    const pause = () => {
      cancelAnimationFrame(raf);
      raf = 0;
      haltAudio();
    };

    const unsubUI = useUI.subscribe((s, prev) => {
      if (s.playing !== prev.playing) {
        if (s.playing) play();
        else pause();
      } else if (s.playing && s.time !== prev.time && Math.abs(s.time - lastSet) > 0.25) {
        // seek while playing: reschedule straight away rather than on the next frame
        lastSet = s.time;
        startAudio(s.time);
        const d = useEditor.getState().design;
        if (d) switchPage(d, s.time);
      }
    });

    const unsubEditor = useEditor.subscribe((s, prev) => {
      const playing = useUI.getState().playing;
      if (!s.design) {
        if (playing) useUI.getState().setPlaying(false);
        return;
      }
      if (s.design.id !== prev.design?.id) {
        // a different design was opened
        if (playing) useUI.getState().setPlaying(false);
        useUI.getState().setTime(pageStartTime(s.design, s.activePageId));
        return;
      }
      if (playing) {
        if (s.design.audio !== prev.design?.audio) {
          clearTimeout(rescheduleTimer);
          rescheduleTimer = window.setTimeout(() => {
            if (useUI.getState().playing) startAudio(useUI.getState().time);
          }, 90);
        }
        return;
      }
      // paused: selecting another page moves the playhead to it
      if (s.activePageId !== prev.activePageId) {
        const page = s.design.pages.find((p) => p.id === s.activePageId);
        if (!page) return;
        const start = pageStartTime(s.design, page.id);
        const t = useUI.getState().time;
        const inside = !page.hidden && t >= start - 1e-6 && t <= start + page.duration + 1e-6;
        if (!inside) useUI.getState().setTime(start);
      }
    });

    if (useUI.getState().playing) play();

    return () => {
      unsubUI();
      unsubEditor();
      pause();
    };
  }, []);
}
