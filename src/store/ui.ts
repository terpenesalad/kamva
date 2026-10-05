import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { BrandKit, Unit } from '../types';
import { uid } from '../lib/defaults';

export type SidePanel =
  | 'templates'
  | 'elements'
  | 'text'
  | 'uploads'
  | 'draw'
  | 'brand'
  | 'layers'
  | 'background'
  | 'audio'
  | 'apps'
  | 'photo'
  | 'animate'
  | 'position';

export type Modal = null | 'export' | 'resize' | 'settings' | 'shortcuts' | 'about' | 'newDesign' | 'saveTemplate' | 'record';

export interface Toast {
  id: string;
  text: string;
  kind: 'info' | 'success' | 'error' | 'progress';
  progress?: number;
}

export interface DrawSettings {
  brush: 'pen' | 'marker' | 'highlighter' | 'eraser';
  color: string;
  size: number;
  opacity: number;
}

interface UIState {
  screen: 'home' | 'editor';
  panel: SidePanel | null;
  zoom: number;
  fit: boolean;
  tool: 'select' | 'draw' | 'hand';
  draw: DrawSettings;
  timelineOpen: boolean;
  playing: boolean;
  time: number; // global timeline time in seconds
  modal: Modal;
  presenting: boolean;
  toasts: Toast[];
  inspectorOpen: boolean;
  gridView: boolean;

  setScreen: (s: UIState['screen']) => void;
  setPanel: (p: SidePanel | null) => void;
  togglePanel: (p: SidePanel) => void;
  setZoom: (z: number, fit?: boolean) => void;
  setTool: (t: UIState['tool']) => void;
  setDraw: (d: Partial<DrawSettings>) => void;
  setTimelineOpen: (v: boolean) => void;
  setPlaying: (v: boolean) => void;
  setTime: (t: number) => void;
  openModal: (m: Modal) => void;
  setPresenting: (v: boolean) => void;
  toast: (text: string, kind?: Toast['kind'], ms?: number) => string;
  updateToast: (id: string, patch: Partial<Toast>) => void;
  dismissToast: (id: string) => void;
  setInspectorOpen: (v: boolean) => void;
  setGridView: (v: boolean) => void;
}

export const useUI = create<UIState>((set, get) => ({
  screen: 'home',
  panel: 'templates',
  zoom: 0.5,
  fit: true,
  tool: 'select',
  draw: { brush: 'pen', color: '#111827', size: 8, opacity: 1 },
  timelineOpen: false,
  playing: false,
  time: 0,
  modal: null,
  presenting: false,
  toasts: [],
  inspectorOpen: true,
  gridView: false,

  setScreen: (screen) => set({ screen }),
  setPanel: (panel) => set({ panel }),
  togglePanel: (p) => set({ panel: get().panel === p ? null : p }),
  setZoom: (zoom, fit = false) => set({ zoom: Math.max(0.05, Math.min(8, zoom)), fit }),
  setTool: (tool) => set({ tool }),
  setDraw: (d) => set({ draw: { ...get().draw, ...d } }),
  setTimelineOpen: (timelineOpen) => set({ timelineOpen }),
  setPlaying: (playing) => set({ playing }),
  setTime: (time) => set({ time: Math.max(0, time) }),
  openModal: (modal) => set({ modal }),
  setPresenting: (presenting) => set({ presenting }),
  toast: (text, kind = 'info', ms = 3200) => {
    const id = uid();
    set({ toasts: [...get().toasts, { id, text, kind }] });
    if (kind !== 'progress' && ms > 0) setTimeout(() => get().dismissToast(id), ms);
    return id;
  },
  updateToast: (id, patch) => set({ toasts: get().toasts.map((t) => (t.id === id ? { ...t, ...patch } : t)) }),
  dismissToast: (id) => set({ toasts: get().toasts.filter((t) => t.id !== id) }),
  setInspectorOpen: (inspectorOpen) => set({ inspectorOpen }),
  setGridView: (gridView) => set({ gridView }),
}));

// ---------------------------------------------------------------------------
// Persisted preferences & brand kits
// ---------------------------------------------------------------------------

export interface Prefs {
  theme: 'light' | 'dark' | 'system';
  accent: string;
  unit: Unit;
  autosave: boolean;
  autosaveSeconds: number;
  snapObjects: boolean;
  snapPage: boolean;
  snapGrid: boolean;
  gridSize: number;
  showGrid: boolean;
  showRulers: boolean;
  showMargins: boolean;
  showBleed: boolean;
  nudge: number;
  nudgeBig: number;
  exportFormat: string;
  exportScale: number;
  jpegQuality: number;
  uiScale: number;
  canvasBg: string;
  recentColors: string[];
  customSizes: { id: string; name: string; width: number; height: number; unit: Unit }[];
  brandKits: BrandKit[];
  activeBrandKit: string;
  showTips: boolean;
  confirmDelete: boolean;
  fpsDefault: number;
  pageDurationDefault: number;
}

const defaultKit = (): BrandKit => ({
  id: 'default',
  name: 'My Brand',
  colors: ['#5b3df5', '#ff6b6b', '#ffd166', '#06d6a0', '#118ab2', '#073b4c'],
  fonts: { heading: 'Montserrat', subheading: 'Poppins', body: 'Inter' },
  logos: [],
});

const defaults: Prefs = {
  theme: 'system',
  accent: '#7c5cff',
  unit: 'px',
  autosave: true,
  autosaveSeconds: 20,
  snapObjects: true,
  snapPage: true,
  snapGrid: false,
  gridSize: 40,
  showGrid: false,
  showRulers: false,
  showMargins: false,
  showBleed: false,
  nudge: 1,
  nudgeBig: 10,
  exportFormat: 'png',
  exportScale: 1,
  jpegQuality: 0.92,
  uiScale: 1,
  canvasBg: '',
  recentColors: [],
  customSizes: [],
  brandKits: [defaultKit()],
  activeBrandKit: 'default',
  showTips: true,
  confirmDelete: true,
  fpsDefault: 30,
  pageDurationDefault: 5,
};

interface PrefsState extends Prefs {
  set: (p: Partial<Prefs>) => void;
  reset: () => void;
  addRecentColor: (c: string) => void;
  updateKit: (id: string, patch: Partial<BrandKit>) => void;
  addKit: () => string;
  deleteKit: (id: string) => void;
}

export const usePrefs = create<PrefsState>()(
  persist(
    (set, get) => ({
      ...defaults,
      set: (p) => set(p),
      reset: () => set({ ...defaults, brandKits: get().brandKits, activeBrandKit: get().activeBrandKit, customSizes: get().customSizes }),
      addRecentColor: (c) => {
        const list = [c, ...get().recentColors.filter((x) => x.toLowerCase() !== c.toLowerCase())].slice(0, 14);
        set({ recentColors: list });
      },
      updateKit: (id, patch) => set({ brandKits: get().brandKits.map((k) => (k.id === id ? { ...k, ...patch } : k)) }),
      addKit: () => {
        const k = { ...defaultKit(), id: uid(), name: `Brand kit ${get().brandKits.length + 1}` };
        set({ brandKits: [...get().brandKits, k], activeBrandKit: k.id });
        return k.id;
      },
      deleteKit: (id) => {
        const kits = get().brandKits.filter((k) => k.id !== id);
        const list = kits.length ? kits : [defaultKit()];
        set({ brandKits: list, activeBrandKit: list[0].id });
      },
    }),
    { name: 'kamva-prefs', version: 1 },
  ),
);

export const useActiveKit = () =>
  usePrefs((s) => s.brandKits.find((k) => k.id === s.activeBrandKit) || s.brandKits[0]);
