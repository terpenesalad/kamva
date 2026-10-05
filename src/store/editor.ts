import { create } from 'zustand';
import { useShallow } from 'zustand/react/shallow';
import { produce, enableMapSet, setAutoFreeze } from 'immer';
import type { Design, DesignElement, Page, AudioTrack } from '../types';
import { cloneElement, clonePage, newPage, uid } from '../lib/defaults';

enableMapSet();
setAutoFreeze(false);

const HISTORY_LIMIT = 150;

export type Tool = 'select' | 'draw' | 'hand';

export interface EditorState {
  design: Design | null;
  filePath: string | null;
  dirty: boolean;
  activePageId: string;
  selection: string[];
  editingTextId: string | null;
  cropId: string | null;
  past: Design[];
  future: Design[];
  lastCoalesce: { key: string; time: number } | null;
  clipboard: { elements: DesignElement[]; style?: Partial<DesignElement> } | null;
  styleClipboard: Partial<DesignElement> | null;

  setDesign: (d: Design | null, filePath?: string | null) => void;
  setFilePath: (p: string | null) => void;
  markSaved: () => void;
  update: (recipe: (d: Design) => void, opts?: { history?: boolean; coalesce?: string }) => void;
  undo: () => void;
  redo: () => void;

  setActivePage: (id: string) => void;
  select: (ids: string[], additive?: boolean) => void;
  setEditingText: (id: string | null) => void;
  setCrop: (id: string | null) => void;

  addElements: (els: DesignElement[], opts?: { select?: boolean; pageId?: string; index?: number }) => void;
  updateElements: (ids: string[], patch: Partial<DesignElement> | ((el: DesignElement) => void), coalesce?: string) => void;
  deleteElements: (ids: string[]) => void;
  duplicateElements: (ids: string[]) => void;
  reorder: (ids: string[], dir: 'up' | 'down' | 'top' | 'bottom') => void;
  moveElementTo: (id: string, index: number) => void;
  group: (ids: string[]) => void;
  ungroup: (ids: string[]) => void;
  copy: (ids: string[]) => void;
  cut: (ids: string[]) => void;
  paste: () => void;
  copyStyle: (id: string) => void;
  pasteStyle: (ids: string[]) => void;

  addPage: (afterId?: string, page?: Page) => void;
  duplicatePage: (id: string) => void;
  deletePage: (id: string) => void;
  movePage: (id: string, toIndex: number) => void;
  updatePage: (id: string, recipe: (p: Page) => void, coalesce?: string) => void;

  addAudio: (t: AudioTrack) => void;
  updateAudio: (id: string, patch: Partial<AudioTrack>, coalesce?: string) => void;
  deleteAudio: (id: string) => void;
}

export function findElement(d: Design | null, id: string): { page: Page; el: DesignElement; index: number } | null {
  if (!d) return null;
  for (const page of d.pages) {
    const index = page.elements.findIndex((e) => e.id === id);
    if (index >= 0) return { page, el: page.elements[index], index };
  }
  return null;
}

function pageOf(d: Design, id: string) {
  return d.pages.find((p) => p.id === id);
}

/** Expand a set of ids so selecting one member of a group selects the whole group */
export function expandGroups(page: Page | undefined, ids: string[]): string[] {
  if (!page) return ids;
  const groups = new Set(page.elements.filter((e) => ids.includes(e.id) && e.groupId).map((e) => e.groupId));
  if (!groups.size) return ids;
  const out = new Set(ids);
  for (const e of page.elements) if (e.groupId && groups.has(e.groupId)) out.add(e.id);
  return [...out];
}

export const useEditor = create<EditorState>((set, get) => {
  const commit = (recipe: (d: Design) => void, opts: { history?: boolean; coalesce?: string } = {}) => {
    const { design, past, lastCoalesce } = get();
    if (!design) return;
    const next = produce(design, (draft) => {
      recipe(draft);
      draft.updatedAt = Date.now();
    });
    if (next === design) return;
    const history = opts.history !== false;
    const now = Date.now();
    const coalesce = !!opts.coalesce && lastCoalesce?.key === opts.coalesce && now - lastCoalesce.time < 1200;
    set({
      design: next,
      dirty: true,
      past: history && !coalesce ? [...past, design].slice(-HISTORY_LIMIT) : past,
      future: history ? [] : get().future,
      lastCoalesce: opts.coalesce ? { key: opts.coalesce, time: now } : null,
    });
  };

  const activePage = () => {
    const { design, activePageId } = get();
    return design?.pages.find((p) => p.id === activePageId) || design?.pages[0];
  };

  return {
    design: null,
    filePath: null,
    dirty: false,
    activePageId: '',
    selection: [],
    editingTextId: null,
    cropId: null,
    past: [],
    future: [],
    lastCoalesce: null,
    clipboard: null,
    styleClipboard: null,

    setDesign: (d, filePath = null) =>
      set({
        design: d,
        filePath,
        dirty: false,
        activePageId: d?.pages[0]?.id || '',
        selection: [],
        editingTextId: null,
        cropId: null,
        past: [],
        future: [],
        lastCoalesce: null,
      }),
    setFilePath: (p) => set({ filePath: p }),
    markSaved: () => set({ dirty: false }),
    update: commit,

    undo: () => {
      const { past, design, future, activePageId } = get();
      if (!past.length || !design) return;
      const prev = past[past.length - 1];
      set({
        design: prev,
        past: past.slice(0, -1),
        future: [design, ...future].slice(0, HISTORY_LIMIT),
        dirty: true,
        selection: [],
        editingTextId: null,
        cropId: null,
        lastCoalesce: null,
        activePageId: prev.pages.some((p) => p.id === activePageId) ? activePageId : prev.pages[0].id,
      });
    },
    redo: () => {
      const { past, design, future, activePageId } = get();
      if (!future.length || !design) return;
      const next = future[0];
      set({
        design: next,
        past: [...past, design],
        future: future.slice(1),
        dirty: true,
        selection: [],
        editingTextId: null,
        cropId: null,
        lastCoalesce: null,
        activePageId: next.pages.some((p) => p.id === activePageId) ? activePageId : next.pages[0].id,
      });
    },

    setActivePage: (id) => {
      if (get().activePageId === id) return;
      set({ activePageId: id, selection: [], editingTextId: null, cropId: null });
    },
    select: (ids, additive = false) => {
      const page = activePage();
      let next = expandGroups(page, ids);
      if (additive) {
        const cur = new Set(get().selection);
        const allIn = next.every((i) => cur.has(i));
        if (allIn) next.forEach((i) => cur.delete(i));
        else next.forEach((i) => cur.add(i));
        next = [...cur];
      }
      set({ selection: next, editingTextId: null, cropId: get().cropId && next.includes(get().cropId!) ? get().cropId : null });
    },
    setEditingText: (id) => set({ editingTextId: id }),
    setCrop: (id) => set({ cropId: id, editingTextId: null }),

    addElements: (els, opts = {}) => {
      const pageId = opts.pageId || get().activePageId || get().design?.pages[0]?.id;
      commit((d) => {
        const p = pageOf(d, pageId!);
        if (!p) return;
        if (opts.index !== undefined) p.elements.splice(opts.index, 0, ...els);
        else p.elements.push(...els);
      });
      if (opts.select !== false) set({ selection: els.map((e) => e.id), activePageId: pageId! });
    },
    updateElements: (ids, patch, coalesce) => {
      if (!ids.length) return;
      commit(
        (d) => {
          for (const p of d.pages) {
            for (const el of p.elements) {
              if (!ids.includes(el.id)) continue;
              if (typeof patch === 'function') patch(el);
              else Object.assign(el, patch);
            }
          }
        },
        { coalesce },
      );
    },
    deleteElements: (ids) => {
      if (!ids.length) return;
      commit((d) => {
        for (const p of d.pages) p.elements = p.elements.filter((e) => !ids.includes(e.id) || e.locked);
      });
      set({ selection: [], editingTextId: null, cropId: null });
    },
    duplicateElements: (ids) => {
      const page = activePage();
      if (!page || !ids.length) return;
      const groupMap = new Map<string, string>();
      const clones = page.elements
        .filter((e) => ids.includes(e.id))
        .map((e) => {
          const c = cloneElement(e, 24, 24);
          c.locked = false;
          if (c.groupId) {
            if (!groupMap.has(c.groupId)) groupMap.set(c.groupId, uid());
            c.groupId = groupMap.get(c.groupId)!;
          }
          return c;
        });
      get().addElements(clones);
    },
    reorder: (ids, dir) => {
      const pageId = get().activePageId;
      commit((d) => {
        const p = pageOf(d, pageId);
        if (!p) return;
        const sel = p.elements.filter((e) => ids.includes(e.id));
        const rest = p.elements.filter((e) => !ids.includes(e.id));
        if (dir === 'top') p.elements = [...rest, ...sel];
        else if (dir === 'bottom') p.elements = [...sel, ...rest];
        else {
          const arr = [...p.elements];
          const idxs = arr.map((e, i) => (ids.includes(e.id) ? i : -1)).filter((i) => i >= 0);
          if (dir === 'up') {
            for (let k = idxs.length - 1; k >= 0; k--) {
              const i = idxs[k];
              if (i < arr.length - 1 && !ids.includes(arr[i + 1].id)) [arr[i], arr[i + 1]] = [arr[i + 1], arr[i]];
            }
          } else {
            for (const i of idxs) {
              if (i > 0 && !ids.includes(arr[i - 1].id)) [arr[i], arr[i - 1]] = [arr[i - 1], arr[i]];
            }
          }
          p.elements = arr;
        }
      });
    },
    moveElementTo: (id, index) => {
      const pageId = get().activePageId;
      commit((d) => {
        const p = pageOf(d, pageId);
        if (!p) return;
        const from = p.elements.findIndex((e) => e.id === id);
        if (from < 0) return;
        const [el] = p.elements.splice(from, 1);
        p.elements.splice(Math.max(0, Math.min(index, p.elements.length)), 0, el);
      });
    },
    group: (ids) => {
      if (ids.length < 2) return;
      const gid = uid();
      const pageId = get().activePageId;
      commit((d) => {
        const p = pageOf(d, pageId);
        if (!p) return;
        // keep grouped elements contiguous in z-order at the top-most member's position
        const members = p.elements.filter((e) => ids.includes(e.id));
        members.forEach((e) => (e.groupId = gid));
        const lastIdx = Math.max(...members.map((m) => p.elements.indexOf(m)));
        const rest = p.elements.filter((e) => !ids.includes(e.id));
        const insertAt = rest.filter((e) => p.elements.indexOf(e) < lastIdx).length;
        rest.splice(insertAt, 0, ...members);
        p.elements = rest;
      });
    },
    ungroup: (ids) => {
      get().updateElements(ids, (el) => {
        el.groupId = null;
      });
    },
    copy: (ids) => {
      const page = activePage();
      if (!page) return;
      const els = page.elements.filter((e) => ids.includes(e.id));
      if (els.length) set({ clipboard: { elements: structuredClone(els) } });
    },
    cut: (ids) => {
      get().copy(ids);
      get().deleteElements(ids);
    },
    paste: () => {
      const cb = get().clipboard;
      if (!cb?.elements.length) return;
      const groupMap = new Map<string, string>();
      const els = cb.elements.map((e) => {
        const c = cloneElement(e, 24, 24);
        if (c.groupId) {
          if (!groupMap.has(c.groupId)) groupMap.set(c.groupId, uid());
          c.groupId = groupMap.get(c.groupId)!;
        }
        return c;
      });
      // shift clipboard so repeated pastes cascade
      set({ clipboard: { elements: els.map((e) => structuredClone(e)) } });
      get().addElements(els);
    },
    copyStyle: (id) => {
      const f = findElement(get().design, id);
      if (!f) return;
      const el = f.el as any;
      const keys = [
        'fill', 'stroke', 'strokeWidth', 'strokeDash', 'opacity', 'shadow', 'blendMode', 'fontFamily', 'fontSize', 'fontWeight',
        'fontStyle', 'underline', 'strike', 'align', 'lineHeight', 'letterSpacing', 'transform', 'effect', 'adjust', 'filter',
        'filterIntensity', 'cornerRadius', 'borderColor', 'borderWidth', 'animation',
      ];
      const style: any = {};
      for (const k of keys) if (el[k] !== undefined) style[k] = structuredClone(el[k]);
      set({ styleClipboard: style });
    },
    pasteStyle: (ids) => {
      const style = get().styleClipboard as any;
      if (!style) return;
      get().updateElements(ids, (el: any) => {
        for (const k of Object.keys(style)) {
          if (k in el || ['shadow', 'blendMode', 'animation'].includes(k)) el[k] = structuredClone(style[k]);
        }
      });
    },

    addPage: (afterId, page) => {
      const p = page || newPage();
      const { design } = get();
      if (!design) return;
      // new blank pages inherit the size-neutral background colour of the current page
      commit((d) => {
        const idx = afterId ? d.pages.findIndex((x) => x.id === afterId) : d.pages.length - 1;
        d.pages.splice(idx + 1, 0, p);
      });
      set({ activePageId: p.id, selection: [] });
    },
    duplicatePage: (id) => {
      const d = get().design;
      const src = d?.pages.find((p) => p.id === id);
      if (!src) return;
      const c = clonePage(src);
      get().addPage(id, c);
    },
    deletePage: (id) => {
      const d = get().design;
      if (!d) return;
      if (d.pages.length <= 1) {
        // Clearing the last page instead of deleting it
        commit((dd) => {
          dd.pages[0].elements = [];
        });
        return;
      }
      const idx = d.pages.findIndex((p) => p.id === id);
      commit((dd) => {
        dd.pages = dd.pages.filter((p) => p.id !== id);
      });
      const nd = get().design!;
      set({ activePageId: nd.pages[Math.min(idx, nd.pages.length - 1)].id, selection: [] });
    },
    movePage: (id, toIndex) => {
      commit((d) => {
        const from = d.pages.findIndex((p) => p.id === id);
        if (from < 0) return;
        const [p] = d.pages.splice(from, 1);
        d.pages.splice(Math.max(0, Math.min(toIndex, d.pages.length)), 0, p);
      });
    },
    updatePage: (id, recipe, coalesce) => {
      commit(
        (d) => {
          const p = pageOf(d, id);
          if (p) recipe(p);
        },
        { coalesce },
      );
    },

    addAudio: (t) => commit((d) => void d.audio.push(t)),
    updateAudio: (id, patch, coalesce) =>
      commit(
        (d) => {
          const t = d.audio.find((a) => a.id === id);
          if (t) Object.assign(t, patch);
        },
        { coalesce },
      ),
    deleteAudio: (id) =>
      commit((d) => {
        d.audio = d.audio.filter((a) => a.id !== id);
      }),
  };
});

export const useActivePage = () =>
  useEditor((s) => s.design?.pages.find((p) => p.id === s.activePageId) || s.design?.pages[0]);

export const useSelectedElements = () =>
  useEditor(
    useShallow((s) => {
      const p = s.design?.pages.find((pp) => pp.id === s.activePageId);
      if (!p) return EMPTY;
      const sel = p.elements.filter((e) => s.selection.includes(e.id));
      return sel.length ? sel : EMPTY;
    }),
  );

const EMPTY: DesignElement[] = [];

export function pageStartTime(d: Design, pageId: string): number {
  let t = 0;
  for (const p of d.pages) {
    if (p.id === pageId) return t;
    if (!p.hidden) t += p.duration;
  }
  return t;
}

export function totalDuration(d: Design): number {
  return d.pages.filter((p) => !p.hidden).reduce((a, p) => a + p.duration, 0);
}
