import { useEffect } from 'react';
import { Eraser, Highlighter, Info, Pen, PenTool } from 'lucide-react';
import { useUI, useActiveKit } from '../../store/ui';
import type { DrawSettings } from '../../store/ui';
import { SolidPicker } from '../../components/ColorPicker';
import { Popover, Slider, usePopover } from '../../components/ui';
import { PanelHead, SectionHead } from './common';

const BRUSHES: { id: DrawSettings['brush']; label: string; icon: React.ReactNode; size: number; opacity: number }[] = [
  { id: 'pen', label: 'Pen', icon: <Pen size={20} />, size: 6, opacity: 1 },
  { id: 'marker', label: 'Marker', icon: <PenTool size={20} />, size: 16, opacity: 1 },
  { id: 'highlighter', label: 'Highlighter', icon: <Highlighter size={20} />, size: 28, opacity: 1 },
  { id: 'eraser', label: 'Eraser', icon: <Eraser size={20} />, size: 20, opacity: 1 },
];

const COLORS = ['#111827', '#ffffff', '#6b7280', '#ef4444', '#f97316', '#facc15', '#22c55e', '#14b8a6', '#3b82f6', '#6366f1', '#a855f7', '#ec4899'];

/** Rainbow swatch that opens a full colour picker */
export function CustomColor({ color, known, onPick }: { color: string; known: boolean; onPick: (c: string) => void }) {
  const pop = usePopover();
  return (
    <>
      <button className={'swatch rainbow-swatch' + (!known ? ' selected' : '')} onClick={pop.toggle} data-tip="Custom colour" aria-label="Custom colour" />
      {pop.open && (
        <Popover anchor={pop.anchor} onClose={pop.close} width={260}>
          <SolidPicker color={color} onChange={onPick} />
        </Popover>
      )}
    </>
  );
}

export function DrawPanel() {
  const draw = useUI((s) => s.draw);
  const setDraw = useUI((s) => s.setDraw);
  const kit = useActiveKit();

  useEffect(() => {
    if (useUI.getState().tool !== 'draw') useUI.getState().setTool('draw');
  }, []);

  const pickBrush = (b: (typeof BRUSHES)[number]) => {
    const patch: Partial<DrawSettings> = { brush: b.id };
    // switch to a sensible size the first time a brush is picked
    if (b.id !== draw.brush && (draw.size === BRUSHES.find((x) => x.id === draw.brush)?.size || b.id === 'highlighter')) patch.size = b.size;
    setDraw(patch);
    useUI.getState().setTool('draw');
  };
  const pickColor = (c: string) => {
    setDraw({ color: c, ...(draw.brush === 'eraser' ? { brush: 'pen' } : {}) });
    useUI.getState().setTool('draw');
  };
  const eraser = draw.brush === 'eraser';

  return (
    <>
      <PanelHead title="Draw" />
      <div className="panel-body">
        <div className="brush-row">
          {BRUSHES.map((b) => (
            <button key={b.id} className={'brush-btn' + (draw.brush === b.id ? ' active' : '')} onClick={() => pickBrush(b)} aria-pressed={draw.brush === b.id}>
              <span className={'brush-icon ' + b.id} style={b.id !== 'eraser' ? { color: draw.color } : undefined}>
                {b.icon}
              </span>
              <span>{b.label}</span>
            </button>
          ))}
        </div>

        {eraser ? (
          <div className="panel-note">
            <Info size={15} />
            <span>The eraser removes whole strokes. Click or drag across a drawing to delete it.</span>
          </div>
        ) : (
          <>
            <SectionHead title="Colour" />
            <div className="swatch-wrap">
              {COLORS.map((c) => (
                <button key={c} className={'swatch' + (draw.color.toLowerCase() === c ? ' selected' : '')} style={{ background: c }} onClick={() => pickColor(c)} data-tip={c} aria-label={c} />
              ))}
              <CustomColor color={draw.color} known={COLORS.includes(draw.color.toLowerCase()) || kit.colors.some((c) => c.toLowerCase() === draw.color.toLowerCase())} onPick={pickColor} />
            </div>
            {kit.colors.length > 0 && (
              <>
                <div className="field-label sub-label">{kit.name}</div>
                <div className="swatch-wrap">
                  {kit.colors.map((c, i) => (
                    <button key={c + i} className={'swatch' + (draw.color.toLowerCase() === c.toLowerCase() ? ' selected' : '')} style={{ background: c }} onClick={() => pickColor(c)} data-tip={c} aria-label={c} />
                  ))}
                </div>
              </>
            )}
          </>
        )}

        <SectionHead title="Settings" />
        <div className="col" style={{ gap: 14 }}>
          <Slider label={eraser ? 'Eraser size' : 'Brush size'} value={draw.size} min={1} max={120} onChange={(v) => setDraw({ size: v })} suffix="px" />
          {!eraser && <Slider label="Transparency" value={Math.round(draw.opacity * 100)} min={5} max={100} onChange={(v) => setDraw({ opacity: v / 100 })} suffix="%" />}
          {!eraser && (
            <div className="brush-preview">
              <svg viewBox="0 0 200 60" width="100%" height="60" preserveAspectRatio="none">
                <path
                  d="M10,40 C40,10 70,10 100,30 S160,50 190,20"
                  fill="none"
                  stroke={draw.color}
                  strokeWidth={Math.min(40, draw.size)}
                  strokeLinecap={draw.brush === 'highlighter' ? 'square' : 'round'}
                  strokeLinejoin="round"
                  opacity={draw.brush === 'highlighter' ? 0.4 * draw.opacity : draw.opacity}
                />
              </svg>
            </div>
          )}
        </div>

        <button
          className="btn block done-drawing"
          onClick={() => {
            useUI.getState().setTool('select');
            useUI.getState().setPanel(null);
          }}
        >
          Done drawing
        </button>
        <p className="panel-hint">Tip: hold Space to pan while drawing. Each stroke becomes its own element you can move, recolour or delete.</p>
      </div>
    </>
  );
}
