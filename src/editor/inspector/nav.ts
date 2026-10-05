import { create } from 'zustand';
import { useUI } from '../../store/ui';

/**
 * Programmatic navigation for the inspector: open a section, scroll to it and
 * optionally focus a control inside it (`data-focus="<name>"`).
 *
 * Other parts of the app can also fire
 *   window.dispatchEvent(new CustomEvent('kamva-inspector', { detail: { section: 'photo' } }))
 */
export type InspectorSection =
  | 'position'
  | 'text'
  | 'effects'
  | 'shape'
  | 'photo'
  | 'video'
  | 'colors'
  | 'chart'
  | 'table'
  | 'qr'
  | 'line'
  | 'draw'
  | 'appearance'
  | 'animation'
  | 'link'
  | 'page'
  | 'notes'
  | 'design';

interface NavState {
  req: { section: InspectorSection; focus?: string; n: number } | null;
  /** last request number per section; used as a key to force-open the Section */
  opened: Partial<Record<InspectorSection, number>>;
}

export const useInspectorNav = create<NavState>(() => ({
  req: null,
  opened: {},
}));

let counter = 0;

export function openInspectorSection(section: InspectorSection, focus?: string) {
  useUI.getState().setInspectorOpen(true);
  counter++;
  const n = counter;
  useInspectorNav.setState((s) => ({
    req: { section, focus, n },
    opened: { ...s.opened, [section]: n },
  }));
}

// Global listeners, installed once.
const FLAG = '__kamvaInspectorNav';
if (typeof window !== 'undefined' && !(window as any)[FLAG]) {
  (window as any)[FLAG] = true;
  window.addEventListener('kamva-inspector', (e) => {
    const d = (e as CustomEvent).detail as { section?: InspectorSection; focus?: string } | undefined;
    if (d?.section) openInspectorSection(d.section, d.focus);
  });
  window.addEventListener('kamva-edit-shape-text', () => openInspectorSection('shape', 'shape-text'));
  window.addEventListener('kamva-link', () => openInspectorSection('link', 'link'));
}
