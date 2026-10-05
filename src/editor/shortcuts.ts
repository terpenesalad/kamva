import { useEffect } from 'react';
import { useEditor } from '../store/editor';
import { useUI, usePrefs } from '../store/ui';
import { platform } from '../lib/platform';
import { goHome, importDialog, openDesignDialog, saveDesign } from '../lib/actions';
import { activeCanvas } from './canvas/controller';
import { makeLine } from '../lib/defaults';
import {
  align, deleteSelection, groupSelection, nudge, selectAll, toggleLock, ungroupSelection, addText, addShapeCentered,
} from './elementActions';

function typing(): boolean {
  const a = document.activeElement as HTMLElement | null;
  return !!a && (a.tagName === 'INPUT' || a.tagName === 'TEXTAREA' || a.tagName === 'SELECT' || a.isContentEditable);
}

const ZOOM_STEPS = [0.1, 0.25, 0.33, 0.5, 0.67, 0.75, 1, 1.25, 1.5, 2, 3, 4, 6, 8];
export function zoomStep(dir: 1 | -1) {
  const z = useUI.getState().zoom;
  const next = dir > 0 ? ZOOM_STEPS.find((s) => s > z + 0.001) ?? 8 : [...ZOOM_STEPS].reverse().find((s) => s < z - 0.001) ?? 0.1;
  useUI.getState().setZoom(next);
}

const lastRun = new Map<string, number>();

/** Run a named command (from the native menu or keyboard). Dedupes double fires. */
export function runCommand(cmd: string) {
  const now = performance.now();
  if (now - (lastRun.get(cmd) || 0) < 120) return;
  lastRun.set(cmd, now);
  const st = useEditor.getState();
  const ui = useUI.getState();
  const inEditor = ui.screen === 'editor' && !!st.design;
  switch (cmd) {
    case 'new':
      ui.openModal('newDesign');
      break;
    case 'home':
      void goHome();
      break;
    case 'open':
      void openDesignDialog();
      break;
    case 'import':
      if (inEditor) void importDialog('all');
      else void openDesignDialog();
      break;
    case 'save':
      if (inEditor) void saveDesign(false);
      break;
    case 'saveAs':
      if (inEditor) void saveDesign(true);
      break;
    case 'saveTemplate':
      if (inEditor) ui.openModal('saveTemplate');
      break;
    case 'export':
      if (inEditor) ui.openModal('export');
      break;
    case 'resize':
      if (inEditor) ui.openModal('resize');
      break;
    case 'settings':
      ui.openModal('settings');
      break;
    case 'shortcuts':
      ui.openModal('shortcuts');
      break;
    case 'about':
      ui.openModal('about');
      break;
    case 'undo':
      if (typing()) document.execCommand('undo');
      else if (inEditor) st.undo();
      break;
    case 'redo':
      if (typing()) document.execCommand('redo');
      else if (inEditor) st.redo();
      break;
    case 'duplicate':
      if (inEditor && !typing()) st.duplicateElements(st.selection);
      break;
    case 'selectAll':
      if (typing()) document.execCommand('selectAll');
      else if (inEditor) selectAll();
      break;
    case 'group':
      if (inEditor) groupSelection();
      break;
    case 'ungroup':
      if (inEditor) ungroupSelection();
      break;
    case 'zoomIn':
      zoomStep(1);
      break;
    case 'zoomOut':
      zoomStep(-1);
      break;
    case 'zoomFit':
      useUI.setState({ fit: true, zoom: useUI.getState().zoom + 1e-6 });
      break;
    case 'zoom100':
      ui.setZoom(1);
      break;
    case 'toggleRulers':
      usePrefs.getState().set({ showRulers: !usePrefs.getState().showRulers });
      break;
    case 'toggleGrid':
      usePrefs.getState().set({ showGrid: !usePrefs.getState().showGrid });
      break;
    case 'toggleTimeline':
      ui.setTimelineOpen(!ui.timelineOpen);
      break;
    case 'present':
      if (inEditor) ui.setPresenting(true);
      break;
  }
}

export function useMenuCommands() {
  useEffect(() => platform.onMenu(runCommand), []);
}

export function useShortcuts() {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (useUI.getState().modal || useUI.getState().presenting) return;
      const mod = e.ctrlKey || e.metaKey;
      const st = useEditor.getState();
      const k = e.key.toLowerCase();

      if (mod) {
        const map: Record<string, string> = {
          z: e.shiftKey ? 'redo' : 'undo',
          y: 'redo',
          s: e.shiftKey ? 'saveAs' : 'save',
          o: 'open',
          n: 'new',
          e: 'export',
          d: 'duplicate',
          a: 'selectAll',
          g: e.shiftKey ? 'ungroup' : 'group',
          '=': 'zoomIn',
          '+': 'zoomIn',
          '-': 'zoomOut',
          '0': 'zoomFit',
          '1': 'zoom100',
          i: 'import',
          r: 'resize',
          ',': 'settings',
          '/': 'shortcuts',
        };
        if (k in map && !(typing() && ['a', 'z', 'y'].includes(k))) {
          e.preventDefault();
          runCommand(map[k]);
          return;
        }
        if (typing()) return;
        if (e.altKey && k === 'c' && st.selection[0]) {
          e.preventDefault();
          st.copyStyle(st.selection[0]);
          return;
        }
        if (e.altKey && k === 'v') {
          e.preventDefault();
          st.pasteStyle(st.selection);
          return;
        }
        if (e.shiftKey && k === 'l') {
          e.preventDefault();
          toggleLock();
          return;
        }
        if (e.key === ']') {
          e.preventDefault();
          st.reorder(st.selection, e.altKey ? 'top' : 'up');
          return;
        }
        if (e.key === '[') {
          e.preventDefault();
          st.reorder(st.selection, e.altKey ? 'bottom' : 'down');
          return;
        }
        if (k === 'enter') {
          e.preventDefault();
          st.addPage(st.activePageId);
          return;
        }
        // bold / italic / underline for selected text
        if (['b', 'u'].includes(k) || (k === 'i' && e.shiftKey)) {
          const ids = st.design?.pages.flatMap((p) => p.elements).filter((x) => st.selection.includes(x.id) && x.type === 'text') || [];
          if (ids.length) {
            e.preventDefault();
            st.updateElements(
              ids.map((x) => x.id),
              (el: any) => {
                if (k === 'b') el.fontWeight = el.fontWeight === 'bold' ? 'normal' : 'bold';
                if (k === 'u') el.underline = !el.underline;
                if (k === 'i') el.fontStyle = el.fontStyle === 'italic' ? 'normal' : 'italic';
              },
            );
          }
        }
        return;
      }

      if (typing()) return;
      if (useUI.getState().screen !== 'editor') return;
      const big = e.shiftKey;
      const step = big ? usePrefs.getState().nudgeBig : usePrefs.getState().nudge;
      switch (e.key) {
        case 'Delete':
        case 'Backspace':
          e.preventDefault();
          deleteSelection();
          return;
        case 'Escape':
          if (st.cropId) activeCanvas?.commitCrop();
          else if (st.editingTextId) st.setEditingText(null);
          else if (useUI.getState().tool !== 'select') useUI.getState().setTool('select');
          else st.select([]);
          return;
        case 'ArrowLeft':
          e.preventDefault();
          if (st.selection.length) nudge(-step, 0);
          else prevPage(-1);
          return;
        case 'ArrowRight':
          e.preventDefault();
          if (st.selection.length) nudge(step, 0);
          else prevPage(1);
          return;
        case 'ArrowUp':
          e.preventDefault();
          if (st.selection.length) nudge(0, -step);
          else prevPage(-1);
          return;
        case 'ArrowDown':
          e.preventDefault();
          if (st.selection.length) nudge(0, step);
          else prevPage(1);
          return;
        case 'Enter': {
          const el = st.design?.pages.flatMap((p) => p.elements).find((x) => x.id === st.selection[0]);
          if (el?.type === 'text' && st.selection.length === 1) {
            e.preventDefault();
            st.setEditingText(el.id);
          }
          return;
        }
        case ' ':
          return;
      }
      if (e.altKey) return;
      switch (k) {
        case 't':
          addText('body');
          break;
        case 'r':
          addShapeCentered('rect');
          break;
        case 'c':
          addShapeCentered('ellipse');
          break;
        case 'l': {
          const d = st.design;
          if (!d) break;
          const len = Math.min(d.width, d.height) * 0.4;
          st.addElements([makeLine((d.width - len) / 2, d.height / 2 - 12, len)]);
          break;
        }
        case 'd':
          useUI.getState().setTool(useUI.getState().tool === 'draw' ? 'select' : 'draw');
          if (useUI.getState().tool === 'draw') useUI.setState({ panel: 'draw' });
          break;
        case 'h':
          useUI.getState().setTool(useUI.getState().tool === 'hand' ? 'select' : 'hand');
          break;
        case 'v':
          useUI.getState().setTool('select');
          break;
        case 'k':
          useUI.getState().setPlaying(!useUI.getState().playing);
          break;
        case 'p':
          if (e.shiftKey) useUI.getState().setPresenting(true);
          break;
        case 'a':
          if (e.shiftKey) align('center', true);
          break;
      }
    };
    const onCopy = (e: ClipboardEvent) => {
      if (typing() || useUI.getState().screen !== 'editor') return;
      const st = useEditor.getState();
      if (!st.selection.length) return;
      e.preventDefault();
      st.copy(st.selection);
      e.clipboardData?.setData('text/plain', 'kamva-elements');
    };
    const onCut = (e: ClipboardEvent) => {
      if (typing() || useUI.getState().screen !== 'editor') return;
      const st = useEditor.getState();
      if (!st.selection.length) return;
      e.preventDefault();
      st.cut(st.selection);
      e.clipboardData?.setData('text/plain', 'kamva-elements');
    };
    window.addEventListener('keydown', onKey);
    window.addEventListener('copy', onCopy);
    window.addEventListener('cut', onCut);
    return () => {
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('copy', onCopy);
      window.removeEventListener('cut', onCut);
    };
  }, []);
}

function prevPage(dir: 1 | -1) {
  const st = useEditor.getState();
  const d = st.design;
  if (!d) return;
  const i = d.pages.findIndex((p) => p.id === st.activePageId);
  const n = d.pages[i + dir];
  if (n) st.setActivePage(n.id);
}
