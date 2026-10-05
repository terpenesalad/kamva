import { Minus, Plus, Maximize, Hand, MousePointer2, LayoutGrid, Clapperboard } from 'lucide-react';
import { useUI } from '../store/ui';
import { zoomStep } from './shortcuts';
import { useEditor } from '../store/editor';

export function ZoomBar() {
  const zoom = useUI((s) => s.zoom);
  const fit = useUI((s) => s.fit);
  const tool = useUI((s) => s.tool);
  const timelineOpen = useUI((s) => s.timelineOpen);
  const pages = useEditor((s) => s.design?.pages.length || 0);
  const active = useEditor((s) => (s.design ? s.design.pages.findIndex((p) => p.id === s.activePageId) + 1 : 0));
  const ui = useUI.getState();
  return (
    <div className="zoom-bar">
      <button className={'icon-btn sm' + (tool === 'select' ? ' active' : '')} onClick={() => ui.setTool('select')} data-tip="Select (V)" data-tip-side="top">
        <MousePointer2 size={15} />
      </button>
      <button className={'icon-btn sm' + (tool === 'hand' ? ' active' : '')} onClick={() => ui.setTool(tool === 'hand' ? 'select' : 'hand')} data-tip="Hand (H or hold Space)" data-tip-side="top">
        <Hand size={15} />
      </button>
      <div className="vdivider" />
      <button className="icon-btn sm" onClick={() => zoomStep(-1)} data-tip="Zoom out" data-tip-side="top">
        <Minus size={15} />
      </button>
      <input
        type="range"
        min={10}
        max={400}
        value={Math.round(zoom * 100)}
        style={{ width: 110, ['--fill' as any]: `${((zoom * 100 - 10) / 390) * 100}%` }}
        onChange={(e) => ui.setZoom(parseInt(e.target.value) / 100)}
        aria-label="Zoom"
      />
      <button className="icon-btn sm" onClick={() => zoomStep(1)} data-tip="Zoom in" data-tip-side="top">
        <Plus size={15} />
      </button>
      <button className="zoom-pct" onClick={() => ui.setZoom(1)} title="Actual size">
        {Math.round(zoom * 100)}%
      </button>
      <button className={'icon-btn sm' + (fit ? ' active' : '')} onClick={() => useUI.setState({ fit: true, zoom: zoom + 1e-6 })} data-tip="Fit to screen" data-tip-side="top">
        <Maximize size={15} />
      </button>
      <div className="vdivider" />
      <span className="page-count">
        Page {active} / {pages}
      </span>
      <button className={'icon-btn sm' + (timelineOpen ? ' active' : '')} onClick={() => ui.setTimelineOpen(!timelineOpen)} data-tip="Timeline" data-tip-side="top">
        <Clapperboard size={15} />
      </button>
      <button className="icon-btn sm" onClick={() => ui.setGridView(!useUI.getState().gridView)} data-tip="Page grid" data-tip-side="top">
        <LayoutGrid size={15} />
      </button>
    </div>
  );
}
