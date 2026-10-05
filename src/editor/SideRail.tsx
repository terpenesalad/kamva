import { LayoutTemplate, Shapes, Type, CloudUpload, PenTool, Palette, Layers, PaintBucket, Grid2x2Plus } from 'lucide-react';
import { useUI, SidePanel as PanelId } from '../store/ui';

const ITEMS: { id: PanelId; label: string; icon: React.ReactNode }[] = [
  { id: 'templates', label: 'Design', icon: <LayoutTemplate size={22} /> },
  { id: 'elements', label: 'Elements', icon: <Shapes size={22} /> },
  { id: 'text', label: 'Text', icon: <Type size={22} /> },
  { id: 'uploads', label: 'Uploads', icon: <CloudUpload size={22} /> },
  { id: 'draw', label: 'Draw', icon: <PenTool size={22} /> },
  { id: 'brand', label: 'Brand', icon: <Palette size={22} /> },
  { id: 'apps', label: 'Apps', icon: <Grid2x2Plus size={22} /> },
  { id: 'background', label: 'Background', icon: <PaintBucket size={22} /> },
  { id: 'layers', label: 'Layers', icon: <Layers size={22} /> },
];

export function SideRail() {
  const panel = useUI((s) => s.panel);
  const toggle = useUI((s) => s.togglePanel);
  return (
    <nav className="side-rail" aria-label="Panels">
      {ITEMS.map((it) => (
        <button
          key={it.id}
          className={'rail-item' + (panel === it.id ? ' active' : '')}
          onClick={() => {
            toggle(it.id);
            if (it.id === 'draw') useUI.getState().setTool(panel === 'draw' ? 'select' : 'draw');
            else if (useUI.getState().tool === 'draw') useUI.getState().setTool('select');
          }}
        >
          {it.icon}
          <span>{it.label}</span>
        </button>
      ))}
    </nav>
  );
}
