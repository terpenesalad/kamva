// Timeline editing commands shared by the timeline UI, the inspector and the
// keyboard: split, detach audio, fit page, frame stepping.
import type { Design, DesignElement, Page, VideoElement } from '../../types';
import { useEditor, pageStartTime, totalDuration } from '../../store/editor';
import { useUI } from '../../store/ui';
import { getAsset } from '../../lib/assets';
import { uid } from '../../lib/defaults';
import { activeAt, elementSpan, freeLane, splitElement, splitPage, videoAudioClip, videoClipLength } from '../../lib/timing';
import { seekTo, trackLength } from './playback';

export function assetDuration(d: Design | null | undefined, assetId: string | null | undefined): number {
  if (!assetId) return 0;
  const v = getAsset(assetId)?.meta.duration || d?.assets[assetId]?.duration || 0;
  return isFinite(v) ? v : 0;
}

export const elDuration = (d: Design | null | undefined, el: DesignElement) => (el.type === 'video' ? assetDuration(d, el.assetId) : 0);

/** The visible page under the playhead and the playhead's time inside it */
export function playheadInPage(): { page: Page; local: number; start: number } | null {
  const st = useEditor.getState();
  const d = st.design;
  if (!d) return null;
  const page = d.pages.find((p) => p.id === st.activePageId);
  if (!page || page.hidden) return null;
  const start = pageStartTime(d, page.id);
  const local = useUI.getState().time - start;
  if (local < -1e-6 || local > page.duration + 1e-6) return null;
  return { page, local: Math.max(0, Math.min(page.duration, local)), start };
}

/** Split the given elements of the active page at the playhead. Returns how many were split. */
export function splitElementsAtPlayhead(ids: string[]): number {
  const st = useEditor.getState();
  const d = st.design;
  const at = playheadInPage();
  if (!d || !at) return 0;
  const results = new Map<string, { left: DesignElement; right: DesignElement }>();
  const groups = new Map<string, string>();
  for (const el of at.page.elements) {
    if (!ids.includes(el.id) || el.locked) continue;
    const parts = splitElement(el, at.local, at.page.duration, elDuration(d, el));
    if (!parts) continue;
    if (parts.right.groupId) {
      if (!groups.has(parts.right.groupId)) groups.set(parts.right.groupId, uid());
      parts.right.groupId = groups.get(parts.right.groupId)!;
    }
    results.set(el.id, parts);
  }
  if (!results.size) return 0;
  st.update((dd) => {
    const p = dd.pages.find((x) => x.id === at.page.id);
    if (!p) return;
    const out: DesignElement[] = [];
    for (const el of p.elements) {
      const r = results.get(el.id);
      if (r) out.push(r.left, r.right);
      else out.push(el);
    }
    p.elements = out;
  });
  useEditor.setState({ selection: [...results.values()].map((r) => r.right.id) });
  return results.size;
}

/** Split the page under the playhead into two pages. */
export function splitPageAtPlayhead(): boolean {
  const st = useEditor.getState();
  const d = st.design;
  const at = playheadInPage();
  if (!d || !at) return false;
  const res = splitPage(at.page, at.local, (el) => elDuration(d, el));
  if (!res) return false;
  const [a, b] = res;
  st.update((dd) => {
    const i = dd.pages.findIndex((p) => p.id === at.page.id);
    if (i < 0) return;
    dd.pages.splice(i, 1, a, b);
  });
  useEditor.setState({ activePageId: b.id, selection: [], editingTextId: null, cropId: null });
  return true;
}

/**
 * The "S" command: split the selected elements under the playhead, or the
 * whole page when nothing selected is under it.
 */
export function splitAtPlayhead() {
  const st = useEditor.getState();
  const toast = useUI.getState().toast;
  const at = playheadInPage();
  if (!at) {
    toast('Move the playhead onto the page you want to split.', 'info');
    return;
  }
  const sel = at.page.elements.filter((e) => st.selection.includes(e.id));
  if (sel.length) {
    const under = sel.filter((e) => activeAt(e, at.local, at.page.duration));
    const n = splitElementsAtPlayhead(under.map((e) => e.id));
    if (!n) toast('Move the playhead inside the selected clip to split it there.', 'info');
    return;
  }
  if (!splitPageAtPlayhead()) toast('Move the playhead inside the page (not at its edge) to split it.', 'info');
}

/** Move a video's sound onto its own audio clip, and mute the video. */
export function detachAudio(elId: string) {
  const st = useEditor.getState();
  const d = st.design;
  const toast = useUI.getState().toast;
  if (!d) return;
  const page = d.pages.find((p) => p.elements.some((e) => e.id === elId));
  const el = page?.elements.find((e) => e.id === elId) as VideoElement | undefined;
  if (!page || !el || el.type !== 'video' || !el.assetId) return;
  if (Math.abs((el.speed || 1) - 1) > 0.001) {
    toast('Set the speed back to 1× to detach the audio.', 'info');
    return;
  }
  if (el.loop) {
    toast('Turn off Loop to detach the audio.', 'info');
    return;
  }
  const dur = assetDuration(d, el.assetId);
  const name = (el.name || getAsset(el.assetId)?.meta.name || 'Video').replace(/\.[a-z0-9]{2,5}$/i, '') + ' (audio)';
  const clip = videoAudioClip(el, pageStartTime(d, page.id), page.duration, dur, name);
  const len = Math.max(0, (clip.trimEnd ?? dur) - clip.trimStart);
  const lane = freeLane(d.audio, clip.start, clip.start + len, (t) => trackLength(d, t));
  st.update((dd) => {
    dd.audio.push({ ...clip, id: uid(), lane });
    for (const p of dd.pages) for (const e of p.elements) if (e.id === elId && e.type === 'video') e.muted = true;
  });
  toast('Audio detached to its own track', 'success');
}

/** Set a page's duration to fit the videos on it */
export function fitPageToVideos(pageId: string) {
  const st = useEditor.getState();
  const d = st.design;
  const page = d?.pages.find((p) => p.id === pageId);
  if (!d || !page) return;
  const vids = page.elements.filter((e): e is VideoElement => e.type === 'video' && !!e.assetId && !e.loop);
  if (!vids.length) return;
  const need = Math.max(0.5, ...vids.map((el) => (el.timing?.start ?? 0) + videoClipLength(el, assetDuration(d, el.assetId))));
  const v = Math.ceil(need * 10 - 1e-6) / 10;
  if (v === page.duration) return;
  st.update((dd) => {
    const p = dd.pages.find((x) => x.id === pageId);
    if (!p) return;
    p.duration = v;
    // elements that ran to the old page end keep doing so; explicit ends past the page are clamped
    for (const e of p.elements) if (e.timing?.end != null && e.timing.end > v) e.timing.end = null;
  });
}

/** Step the playhead by whole frames (design fps) */
export function stepFrames(n: number) {
  const d = useEditor.getState().design;
  if (!d) return;
  const fps = d.fps || 30;
  const ui = useUI.getState();
  if (ui.playing) ui.setPlaying(false);
  const f = Math.round(ui.time * fps) + n;
  seekTo(f / fps);
}

export function seekEdge(where: 'start' | 'end') {
  const d = useEditor.getState().design;
  if (!d) return;
  useUI.getState().setPlaying(false);
  seekTo(where === 'start' ? 0 : totalDuration(d));
}

/** Previous / next edit point (page and element boundaries, clip edges) */
export function seekEditPoint(dir: 1 | -1) {
  const d = useEditor.getState().design;
  if (!d) return;
  const pts = new Set<number>([0]);
  let acc = 0;
  for (const p of d.pages) {
    if (p.hidden) continue;
    for (const e of p.elements) {
      const s = elementSpan(e, p.duration);
      pts.add(acc + s.start);
      pts.add(acc + s.end);
    }
    acc += p.duration;
    pts.add(acc);
  }
  for (const t of d.audio) {
    pts.add(t.start);
    pts.add(t.start + trackLength(d, t));
  }
  const now = useUI.getState().time;
  const sorted = [...pts].map((x) => Math.round(x * 1000) / 1000).sort((a, b) => a - b);
  const next = dir > 0 ? sorted.find((x) => x > now + 0.01) : [...sorted].reverse().find((x) => x < now - 0.01);
  if (next !== undefined) {
    useUI.getState().setPlaying(false);
    seekTo(Math.min(next, totalDuration(d)));
  }
}
