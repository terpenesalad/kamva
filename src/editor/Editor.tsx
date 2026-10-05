import { useEffect } from 'react';
import { useUI } from '../store/ui';
import { useEditor } from '../store/editor';
import { TopBar } from './TopBar';
import { SideRail } from './SideRail';
import { SidePanel } from './panels/SidePanel';
import { CanvasView } from './canvas/CanvasView';
import { ContextToolbar } from './inspector/ContextToolbar';
import { Inspector } from './inspector/Inspector';
import { Timeline } from './timeline/Timeline';
import { ZoomBar } from './ZoomBar';
import { Present } from './timeline/Present';
import { usePlaybackEngine } from './timeline/playback';
import { useShortcuts } from './shortcuts';
import { Dialogs } from './dialogs/Dialogs';
import { autosave, pasteFromClipboardEvent } from '../lib/actions';
import { usePrefs } from '../store/ui';
import { platform } from '../lib/platform';

export function Editor() {
  const panel = useUI((s) => s.panel);
  const presenting = useUI((s) => s.presenting);
  const inspectorOpen = useUI((s) => s.inspectorOpen);
  const name = useEditor((s) => s.design?.name);
  const dirty = useEditor((s) => s.dirty);
  usePlaybackEngine();
  useShortcuts();

  // window title
  useEffect(() => {
    platform.setTitle(`${dirty ? '• ' : ''}${name || 'Untitled design'} — Kamva`);
  }, [name, dirty]);

  // autosave to the design library
  useEffect(() => {
    const id = setInterval(() => {
      const p = usePrefs.getState();
      if (p.autosave) void autosave();
    }, Math.max(5, usePrefs.getState().autosaveSeconds) * 1000);
    return () => clearInterval(id);
  }, []);

  // paste images/svg from the system clipboard
  useEffect(() => {
    const h = (e: ClipboardEvent) => {
      const t = e.target as HTMLElement;
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA')) return;
      void pasteFromClipboardEvent(e).then((handled) => {
        if (!handled) useEditor.getState().paste();
      });
    };
    window.addEventListener('paste', h);
    return () => window.removeEventListener('paste', h);
  }, []);

  return (
    <div className="editor">
      <TopBar />
      <div className="editor-main">
        <SideRail />
        {panel && (
          <aside className="side-panel">
            <SidePanel panel={panel} />
          </aside>
        )}
        <div className="workspace">
          <ContextToolbar />
          <CanvasView />
          <ZoomBar />
        </div>
        {inspectorOpen && <Inspector />}
      </div>
      <div className="editor-bottom">
        <Timeline />
      </div>
      <Dialogs />
      {presenting && <Present />}
    </div>
  );
}
