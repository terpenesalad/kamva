// Lazy, cached thumbnail rendering for templates.
// Thumbnails render one at a time in an idle queue so scrolling a gallery never stalls the UI.
import { useEffect, useState } from 'react';
import type React from 'react';
import type { Template } from '../../types';
import { newDesign } from '../defaults';
import { pageThumbnail } from '../render/renderPage';

const cache = new Map<string, string>();
const listeners = new Map<string, Set<(url: string) => void>>();
const queue: { key: string; t: Template; size: number }[] = [];
let running = false;

const keyOf = (t: Template, size: number) => `${t.id}@${size}`;

function idle(): Promise<void> {
  return new Promise((resolve) => {
    const ric = (window as any).requestIdleCallback as ((cb: () => void, o?: { timeout: number }) => number) | undefined;
    if (ric) ric(() => resolve(), { timeout: 400 });
    else setTimeout(resolve, 16);
  });
}

async function render(t: Template, size: number): Promise<string> {
  const d = newDesign(t.width, t.height, t.name);
  d.pages = t.pages;
  d.assets = t.assets || {};
  // render at device pixel ratio for crisp tiles
  const px = Math.round(size * Math.min(2, window.devicePixelRatio || 1));
  const c = await pageThumbnail(d, t.pages[0], px);
  return c.toDataURL('image/png');
}

async function pump() {
  if (running) return;
  running = true;
  try {
    while (queue.length) {
      await idle();
      const job = queue.shift()!;
      if (cache.has(job.key)) continue;
      // nobody is waiting any more (tile unmounted): skip it
      if (!listeners.get(job.key)?.size) continue;
      try {
        const url = await render(job.t, job.size);
        cache.set(job.key, url);
        listeners.get(job.key)?.forEach((fn) => fn(url));
      } catch (e) {
        console.warn('Template thumbnail failed', job.t.id, e);
      }
    }
  } finally {
    running = false;
  }
}

/** Get a cached thumbnail synchronously, if one was rendered already */
export function cachedTemplateThumb(t: Template, size = 320): string | undefined {
  return t.thumb || cache.get(keyOf(t, size));
}

/** Request a thumbnail; resolves when rendered. */
export function requestTemplateThumb(t: Template, size = 320, onReady: (url: string) => void): () => void {
  if (t.thumb) {
    onReady(t.thumb);
    return () => undefined;
  }
  const key = keyOf(t, size);
  const hit = cache.get(key);
  if (hit) {
    onReady(hit);
    return () => undefined;
  }
  let set = listeners.get(key);
  if (!set) listeners.set(key, (set = new Set()));
  set.add(onReady);
  if (!queue.some((j) => j.key === key)) queue.push({ key, t, size });
  void pump();
  return () => {
    set!.delete(onReady);
  };
}

/**
 * React hook: data URL of the template's first page, or undefined while rendering.
 * Pass `enabled = false` to hold off (for example until the tile scrolls into view).
 */
export function useTemplateThumb(t: Template, size = 320, enabled = true): string | undefined {
  const [url, setUrl] = useState<string | undefined>(() => cachedTemplateThumb(t, size));
  useEffect(() => {
    const now = cachedTemplateThumb(t, size);
    setUrl(now);
    if (now || !enabled) return;
    return requestTemplateThumb(t, size, setUrl);
  }, [t, size, enabled]);
  return url;
}

/** React hook: becomes true once the element has been near the viewport */
export function useInView<T extends Element>(ref: React.RefObject<T | null>, margin = '300px'): boolean {
  const [seen, setSeen] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el || seen) return;
    if (typeof IntersectionObserver === 'undefined') {
      setSeen(true);
      return;
    }
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          setSeen(true);
          io.disconnect();
        }
      },
      { rootMargin: margin },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [ref, margin, seen]);
  return seen;
}
