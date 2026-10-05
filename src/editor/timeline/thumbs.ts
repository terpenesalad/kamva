import { useEffect, useRef, useState } from 'react';
import type { Design, Page } from '../../types';
import { pageThumbnail } from '../../lib/render/renderPage';
import { getAsset, onAssetsChanged } from '../../lib/assets';

// ---------------------------------------------------------------------------
// Page thumbnails for the pages strip and the timeline's page track.
// Cached by page object identity (immer keeps unchanged pages identical), rendered
// lazily (only when visible) and one at a time so 20+ pages stay smooth.
// ---------------------------------------------------------------------------

const THUMB_SIZE = 160;

interface Entry {
  url: string;
  w: number;
  h: number;
  missing: boolean; // rendered while some assets were not loaded yet
}

const cache = new WeakMap<Page, Entry>();

function pageMissingAssets(page: Page): boolean {
  if (page.background.assetId && !getAsset(page.background.assetId)) return true;
  for (const el of page.elements) {
    if ((el.type === 'image' || el.type === 'video') && el.assetId && !getAsset(el.assetId)) return true;
  }
  return false;
}

// serial render queue
let chain: Promise<unknown> = Promise.resolve();
function enqueue<T>(job: () => Promise<T>): Promise<T> {
  const p = chain.then(job, job);
  chain = p.catch(() => undefined);
  return p;
}

function render(design: Design, page: Page, alive: () => boolean): Promise<Entry | null> {
  return enqueue(async () => {
    if (!alive()) return null;
    const hit = cache.get(page);
    if (hit && hit.w === design.width && hit.h === design.height && !(hit.missing && !pageMissingAssets(page))) return hit;
    const missing = pageMissingAssets(page);
    const c = await pageThumbnail(design, page, THUMB_SIZE);
    const entry: Entry = { url: c.toDataURL('image/png'), w: design.width, h: design.height, missing };
    cache.set(page, entry);
    // give the UI thread a breather between renders
    await new Promise((r) => setTimeout(r, 0));
    return entry;
  });
}

/** Returns a data URL thumbnail of `page`, rendering it when `visible`. */
export function usePageThumb(design: Design, page: Page, visible: boolean): string | null {
  const designRef = useRef(design);
  designRef.current = design;
  const [url, setUrl] = useState<string | null>(() => cache.get(page)?.url ?? null);
  const [assetTick, setAssetTick] = useState(0);
  const urlRef = useRef(url);
  urlRef.current = url;

  // re-render pages that were drawn before their media finished loading
  useEffect(() => {
    const off = onAssetsChanged(() => {
      const e = cache.get(page);
      if (e?.missing) setAssetTick((n) => n + 1);
    });
    return () => {
      off();
    };
  }, [page]);

  const w = design.width;
  const h = design.height;
  useEffect(() => {
    const e = cache.get(page);
    const fresh = e && e.w === w && e.h === h && !(e.missing && !pageMissingAssets(page));
    if (fresh) {
      if (e.url !== urlRef.current) setUrl(e.url);
      return;
    }
    if (!visible) return;
    let alive = true;
    // first render is immediate; re-renders while editing are debounced
    const delay = urlRef.current ? 400 : 0;
    const timer = setTimeout(() => {
      void render(designRef.current, page, () => alive)
        .then((r) => {
          if (alive && r) setUrl(r.url);
        })
        .catch(() => undefined);
    }, delay);
    return () => {
      alive = false;
      clearTimeout(timer);
    };
  }, [page, visible, w, h, assetTick]);

  return url;
}

/** Visibility of an element within the viewport (with a margin) */
export function useInView<T extends HTMLElement>(): [React.RefObject<T | null>, boolean] {
  const ref = useRef<T>(null);
  const [inView, setInView] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (typeof IntersectionObserver === 'undefined') {
      setInView(true);
      return;
    }
    const io = new IntersectionObserver((entries) => setInView(entries.some((e) => e.isIntersecting)), { rootMargin: '200px' });
    io.observe(el);
    return () => io.disconnect();
  }, []);
  return [ref, inView];
}
