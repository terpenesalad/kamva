import { useState } from 'react';
import {
  Menu as MenuIcon, Undo2, Redo2, Download, Play, Pause, MonitorPlay, Home, FilePlus2, FolderOpen, Save, Upload, Ruler,
  LayoutTemplate, Settings, Scaling, Cloud, CloudOff, PanelRight, Keyboard, Info,
} from 'lucide-react';
import { useEditor, totalDuration } from '../store/editor';
import { useUI, usePrefs } from '../store/ui';
import { ContextMenu, MenuItem, MOD } from '../components/ui';
import { goHome, importDialog, openDesignDialog, saveDesign } from '../lib/actions';
import { formatSize } from '../lib/units';
import { Logo } from '../components/Logo';

export function TopBar() {
  const design = useEditor((s) => s.design);
  const canUndo = useEditor((s) => s.past.length > 0);
  const canRedo = useEditor((s) => s.future.length > 0);
  const dirty = useEditor((s) => s.dirty);
  const filePath = useEditor((s) => s.filePath);
  const playing = useUI((s) => s.playing);
  const inspectorOpen = useUI((s) => s.inspectorOpen);
  const [menu, setMenu] = useState<{ x: number; y: number } | null>(null);
  const [editingName, setEditingName] = useState(false);
  if (!design) return null;
  const ui = useUI.getState();
  const animated = totalDuration(design) > 0 && (design.pages.length > 1 || design.audio.length > 0 || design.pages.some((p) => p.elements.some((e) => e.type === 'video' || (e.animation && (e.animation.enter !== 'none' || e.animation.loop !== 'none')))));

  const fileItems: MenuItem[] = [
    { label: 'Home', icon: <Home size={16} />, onClick: () => void goHome() },
    { sep: true },
    { label: 'New design…', icon: <FilePlus2 size={16} />, shortcut: `${MOD}+N`, onClick: () => ui.openModal('newDesign') },
    { label: 'Open…', icon: <FolderOpen size={16} />, shortcut: `${MOD}+O`, onClick: () => void openDesignDialog() },
    { label: 'Import files…', icon: <Upload size={16} />, shortcut: `${MOD}+I`, onClick: () => void importDialog('all') },
    { sep: true },
    { label: 'Save', icon: <Save size={16} />, shortcut: `${MOD}+S`, onClick: () => void saveDesign(false) },
    { label: 'Save as…', icon: <Save size={16} />, shortcut: `${MOD}+Shift+S`, onClick: () => void saveDesign(true) },
    { label: 'Save as template…', icon: <LayoutTemplate size={16} />, onClick: () => ui.openModal('saveTemplate') },
    { sep: true },
    { label: 'Resize design…', icon: <Scaling size={16} />, shortcut: `${MOD}+R`, onClick: () => ui.openModal('resize') },
    { label: 'Export…', icon: <Download size={16} />, shortcut: `${MOD}+E`, onClick: () => ui.openModal('export') },
    { sep: true },
    { label: usePrefs.getState().showRulers ? 'Hide rulers' : 'Show rulers', icon: <Ruler size={16} />, onClick: () => usePrefs.getState().set({ showRulers: !usePrefs.getState().showRulers }) },
    { label: 'Settings…', icon: <Settings size={16} />, shortcut: `${MOD}+,`, onClick: () => ui.openModal('settings') },
    { label: 'Keyboard shortcuts', icon: <Keyboard size={16} />, shortcut: `${MOD}+/`, onClick: () => ui.openModal('shortcuts') },
    { label: 'About Kamva', icon: <Info size={16} />, onClick: () => ui.openModal('about') },
  ];

  return (
    <header className="topbar">
      <button className="topbar-logo" onClick={() => void goHome()} title="Home">
        <Logo size={26} />
      </button>
      <button className="btn ghost" onClick={(e) => setMenu({ x: e.currentTarget.getBoundingClientRect().left, y: e.currentTarget.getBoundingClientRect().bottom + 4 })}>
        <MenuIcon size={16} /> File
      </button>
      <button className="btn ghost" onClick={() => ui.openModal('resize')} title="Resize design">
        <Scaling size={16} /> Resize
      </button>
      <div className="vdivider" />
      <button className="icon-btn" disabled={!canUndo} onClick={() => useEditor.getState().undo()} data-tip={`Undo (${MOD}+Z)`}>
        <Undo2 size={18} />
      </button>
      <button className="icon-btn" disabled={!canRedo} onClick={() => useEditor.getState().redo()} data-tip={`Redo (${MOD}+Shift+Z)`}>
        <Redo2 size={18} />
      </button>
      <span className="save-state" title={filePath || 'Kept in your designs on this computer'}>
        {dirty ? <CloudOff size={15} /> : <Cloud size={15} />}
        {dirty ? 'Unsaved changes' : filePath ? 'Saved' : 'In your designs'}
      </span>

      <div className="topbar-center">
        {editingName ? (
          <input
            className="input name-input"
            autoFocus
            defaultValue={design.name}
            onBlur={(e) => {
              const v = e.target.value.trim() || 'Untitled design';
              useEditor.getState().update((d) => void (d.name = v));
              setEditingName(false);
            }}
            onKeyDown={(e) => {
              e.stopPropagation();
              if (e.key === 'Enter' || e.key === 'Escape') (e.target as HTMLInputElement).blur();
            }}
          />
        ) : (
          <button className="design-name" onClick={() => setEditingName(true)} title="Rename">
            {design.name}
          </button>
        )}
        <span className="design-size">{formatSize(design.width, design.height, design.unit, design.dpi)}</span>
      </div>

      <div className="topbar-right">
        {animated && (
          <button className="btn ghost" onClick={() => ui.setPlaying(!playing)} title="Play (Space)">
            {playing ? <Pause size={16} /> : <Play size={16} />} {playing ? 'Pause' : 'Play'}
          </button>
        )}
        <button className="btn" onClick={() => ui.setPresenting(true)}>
          <MonitorPlay size={16} /> Present
        </button>
        <button className="btn primary" onClick={() => ui.openModal('export')}>
          <Download size={16} /> Export
        </button>
        <button className={'icon-btn' + (inspectorOpen ? ' active' : '')} onClick={() => ui.setInspectorOpen(!inspectorOpen)} data-tip="Properties panel">
          <PanelRight size={18} />
        </button>
      </div>
      {menu && <ContextMenu x={menu.x} y={menu.y} items={fileItems} onClose={() => setMenu(null)} />}
    </header>
  );
}
