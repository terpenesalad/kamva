// ---------------------------------------------------------------------------
// Element timing on the video timeline: visible spans, trimming, splitting.
// Pure functions (no DOM, no stores) so the timeline, shortcuts, playback and
// exporters all agree on the same maths.
//
// Model recap
//   - An element's `timing` is { start, end } in seconds from its page start.
//     No `timing` = the whole page; `end: null` = until the page ends.
//   - A video element plays its source from `trimStart` at `speed`, starting at
//     its timing start. Without `loop`, once the source reaches `trimEnd` the
//     last frame is held until the element's end ("freeze tail").
// ---------------------------------------------------------------------------
import type { AudioTrack, DesignElement, Page, VideoElement } from '../types';
import { uid } from './defaults';

/** Shortest span an element or page piece can have, in seconds */
export const MIN_LEN = 0.1;

const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));
const r3 = (v: number) => Math.round(v * 1000) / 1000;

export interface Span {
  start: number;
  end: number;
}

/** Visible span of an element inside its page, clamped to the page. */
export function elementSpan(el: DesignElement, pageDur: number): Span {
  const start = clamp(el.timing?.start ?? 0, 0, Math.max(0, pageDur));
  const end = clamp(el.timing?.end ?? pageDur, start, Math.max(0, pageDur));
  return { start, end };
}

/** Is the element on screen at `t` seconds into its page? */
export function activeAt(el: DesignElement, t: number, pageDur: number): boolean {
  const start = el.timing?.start ?? 0;
  const end = el.timing?.end ?? pageDur;
  return t >= start - 1e-6 && t <= end + 1e-6;
}

/**
 * Write a span back to an element (works on immer drafts and plain objects).
 * A span that covers the whole page clears `timing`; an end at the page end is
 * stored as `null` so the element keeps following the page length.
 */
export function setSpan(el: DesignElement, start: number, end: number, pageDur: number) {
  start = Math.max(0, r3(start));
  end = r3(Math.max(start, end));
  const toEnd = end >= pageDur - 0.005;
  if (start < 0.005 && toEnd) {
    delete el.timing;
    return;
  }
  el.timing = { start: start < 0.005 ? 0 : start, end: toEnd ? null : end };
}

// ---------------------------------------------------------------------------
// Video
// ---------------------------------------------------------------------------
const speedOf = (el: VideoElement) => (el.speed > 0 ? el.speed : 1);

/** Source time for a video element at page time t (the frame that's shown). */
export function videoSourceTime(el: VideoElement, t: number, assetDuration: number): number {
  const start = el.timing?.start ?? 0;
  const local = Math.max(0, t - start) * speedOf(el);
  const end = el.trimEnd ?? assetDuration;
  const len = Math.max(0.05, end - el.trimStart);
  const off = el.loop ? local % len : Math.min(local, len - 0.04);
  return el.trimStart + off;
}

/** Length of the trimmed source on the timeline (after speed), in seconds. */
export function videoClipLength(el: VideoElement, assetDuration: number): number {
  const end = el.trimEnd ?? assetDuration;
  return Math.max(0, end - el.trimStart) / speedOf(el);
}

/**
 * Where, in page seconds, the video stops moving: the end of the trimmed clip,
 * or the element end when it loops (or when the source length is unknown).
 */
export function videoMotionEnd(el: VideoElement, assetDuration: number, pageDur: number): number {
  const span = elementSpan(el, pageDur);
  if (el.loop || !(assetDuration > 0)) return span.end;
  return Math.min(span.end, span.start + videoClipLength(el, assetDuration));
}

/**
 * Sound gain multiplier (0..1) of a video element at page time t: the fade in
 * starts at the element start, the fade out ends where the sound ends.
 */
export function videoFadeGain(el: VideoElement, t: number, assetDuration: number, pageDur: number): number {
  const span = elementSpan(el, pageDur);
  const soundEnd = videoMotionEnd(el, assetDuration, pageDur);
  const len = Math.max(0, soundEnd - span.start);
  if (len <= 0) return 0;
  let fi = Math.max(0, el.fadeIn || 0);
  let fo = Math.max(0, el.fadeOut || 0);
  if (fi + fo > len) {
    const k = len / (fi + fo);
    fi *= k;
    fo *= k;
  }
  const l = t - span.start;
  let g = 1;
  if (fi > 0 && l < fi) g *= Math.max(0, l / fi);
  if (fo > 0 && l > len - fo) g *= Math.max(0, (len - l) / fo);
  return clamp(g, 0, 1);
}

/** Drag the start edge of a video: the picture stays put in time, the source is trimmed. */
export function trimVideoStart(el: VideoElement, newStart: number, pageDur: number, assetDuration: number) {
  const sp = speedOf(el);
  const { start, end } = elementSpan(el, pageDur);
  const srcEnd = el.trimEnd ?? (assetDuration || Infinity);
  const minStart = Math.max(0, start - el.trimStart / sp); // can't reveal before the source starts
  // keep at least MIN_LEN of picture and of source
  const maxStart = Math.min(end - MIN_LEN, start + (srcEnd - el.trimStart) / sp - MIN_LEN);
  const ns = clamp(newStart, minStart, Math.max(minStart, maxStart));
  el.trimStart = r3(Math.max(0, el.trimStart + (ns - start) * sp));
  setSpan(el, ns, end, pageDur);
}

/**
 * Drag the end edge of a video: shortening trims the source; lengthening plays
 * more of the source until it runs out, then holds the last frame (or loops).
 */
export function trimVideoEnd(el: VideoElement, newEnd: number, pageDur: number, assetDuration: number) {
  const sp = speedOf(el);
  const { start } = elementSpan(el, pageDur);
  const ne = clamp(newEnd, start + MIN_LEN, pageDur);
  if (!el.loop && assetDuration > 0) {
    const srcRunsOut = start + (assetDuration - el.trimStart) / sp;
    if (ne <= srcRunsOut + 0.005) {
      const te = el.trimStart + (ne - start) * sp;
      el.trimEnd = te >= assetDuration - 0.01 ? null : r3(te);
    } else el.trimEnd = null;
  }
  setSpan(el, start, ne, pageDur);
}

/** Move a span in time, keeping its length and staying inside the page. */
export function moveSpan(el: DesignElement, newStart: number, pageDur: number) {
  const { start, end } = elementSpan(el, pageDur);
  const len = end - start;
  const ns = clamp(newStart, 0, Math.max(0, pageDur - len));
  setSpan(el, ns, ns + len, pageDur);
}

/** Change a (non-video) element's start or end edge. */
export function trimSpan(el: DesignElement, edge: 'start' | 'end', t: number, pageDur: number) {
  const { start, end } = elementSpan(el, pageDur);
  if (edge === 'start') setSpan(el, clamp(t, 0, end - MIN_LEN), end, pageDur);
  else setSpan(el, start, clamp(t, start + MIN_LEN, pageDur), pageDur);
}

/** Source time at which a non-looping video should be cut for page time t (null when it loops). */
function videoCutPoint(el: VideoElement, t: number, assetDuration: number): number | null {
  if (el.loop) return null;
  const start = el.timing?.start ?? 0;
  const src = el.trimStart + Math.max(0, t - start) * speedOf(el);
  return src;
}

function cutParts<T extends DesignElement>(el: T, t: number, assetDuration: number): { left: T; right: T } {
  const left = structuredClone(el) as T;
  const right = structuredClone(el) as T;
  right.id = uid();
  if (left.animation) left.animation = { ...left.animation, exit: 'none' };
  if (right.animation) right.animation = { ...right.animation, enter: 'none' };
  if (el.type === 'video') {
    const l = left as unknown as VideoElement;
    const r = right as unknown as VideoElement;
    const src = videoCutPoint(el, t, assetDuration);
    if (src !== null) {
      const srcEnd = el.trimEnd ?? (assetDuration || Infinity);
      if (src < srcEnd - 0.02) {
        l.trimEnd = assetDuration > 0 && src >= assetDuration - 0.01 ? null : r3(src);
        r.trimStart = r3(src);
      } else if (isFinite(srcEnd)) {
        // cut inside the freeze tail: the right part keeps showing the last frame
        r.trimStart = r3(Math.max(el.trimStart, srcEnd - 0.05));
      }
    }
    l.fadeOut = 0;
    r.fadeIn = 0;
  }
  return { left, right };
}

/**
 * Split an element at page time t into two elements (left keeps the id).
 * Returns null when t isn't at least MIN_LEN inside the element.
 */
export function splitElement<T extends DesignElement>(el: T, t: number, pageDur: number, assetDuration: number): { left: T; right: T } | null {
  const { start, end } = elementSpan(el, pageDur);
  if (t < start + MIN_LEN - 1e-6 || t > end - MIN_LEN + 1e-6) return null;
  const { left, right } = cutParts(el, t, assetDuration);
  setSpan(left, start, t, pageDur);
  setSpan(right, t, end, pageDur);
  return { left, right };
}

/**
 * Split a page at t seconds into it. The first part keeps the page id; the
 * second gets new ids for itself and every element. Elements that cross the
 * cut continue seamlessly (videos pick up where they were cut). The original
 * transition moves to the second part; the cut itself is a hard cut.
 */
export function splitPage(page: Page, t: number, assetDuration: (el: DesignElement) => number): [Page, Page] | null {
  const dur = page.duration;
  if (!(t >= MIN_LEN - 1e-6 && t <= dur - MIN_LEN + 1e-6)) return null;
  t = r3(t);
  const a: Page = structuredClone(page);
  const b: Page = structuredClone(page);
  a.duration = t;
  b.duration = r3(dur - t);
  a.transition = { type: 'none', duration: page.transition?.duration ?? 0.6 };
  b.id = uid();
  if (page.name) b.name = page.name + ' (cont.)';
  a.elements = [];
  b.elements = [];
  const groups = new Map<string, string>();
  const regroup = (el: DesignElement) => {
    if (!el.groupId) return;
    if (!groups.has(el.groupId)) groups.set(el.groupId, uid());
    el.groupId = groups.get(el.groupId)!;
  };
  for (const el of page.elements) {
    const { start, end } = elementSpan(el, dur);
    if (end <= t + 1e-6 || end - start < 1e-6) {
      const c = structuredClone(el);
      setSpan(c, start, end, t);
      a.elements.push(c);
    } else if (start >= t - 1e-6) {
      const c = structuredClone(el);
      c.id = uid();
      regroup(c);
      setSpan(c, start - t, end - t, b.duration);
      b.elements.push(c);
    } else {
      const { left, right } = cutParts(el, t, assetDuration(el));
      setSpan(left, start, t, t);
      right.id = uid();
      regroup(right);
      setSpan(right, 0, end - t, b.duration);
      a.elements.push(left);
      b.elements.push(right);
    }
  }
  return [a, b];
}

// ---------------------------------------------------------------------------
// Audio
// ---------------------------------------------------------------------------

/** Lowest audio lane with nothing playing between `from` and `to` (global seconds). */
export function freeLane(audio: AudioTrack[], from: number, to: number, lengthOf: (t: AudioTrack) => number): number {
  for (let lane = 0; lane < 64; lane++) {
    const busy = audio.some((t) => t.lane === lane && t.start < to - 1e-3 && t.start + lengthOf(t) > from + 1e-3);
    if (!busy) return lane;
  }
  return audio.reduce((m, t) => Math.max(m, t.lane + 1), 0);
}

/**
 * The sound of a video element as an audio clip on the design timeline
 * (`pageStart` is where the element's page begins). Speed must be 1×.
 */
export function videoAudioClip(el: VideoElement, pageStart: number, pageDur: number, assetDuration: number, name: string): Omit<AudioTrack, 'id' | 'lane'> {
  const span = elementSpan(el, pageDur);
  const soundEnd = videoMotionEnd(el, assetDuration, pageDur);
  const srcEnd = el.trimEnd ?? assetDuration;
  const te = Math.min(srcEnd, el.trimStart + (soundEnd - span.start));
  return {
    assetId: el.assetId!,
    name,
    start: r3(pageStart + span.start),
    trimStart: el.trimStart,
    trimEnd: assetDuration > 0 && te >= assetDuration - 0.01 ? null : r3(te),
    volume: el.volume,
    fadeIn: el.fadeIn || 0,
    fadeOut: el.fadeOut || 0,
    muted: false,
  };
}
