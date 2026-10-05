import { useEffect, useRef } from 'react';
import { useView } from './controller';
import { useEditor } from '../../store/editor';
import { usePrefs } from '../../store/ui';
import { uid } from '../../lib/defaults';
import { fromPx, UNIT_LABEL } from '../../lib/units';

const SIZE = 20;

function niceStep(pxPerUnit: number) {
  // choose a major tick step (in units) so ticks are ~80px apart
  const raw = 80 / pxPerUnit;
  const pow = Math.pow(10, Math.floor(Math.log10(raw)));
  for (const m of [1, 2, 5, 10]) if (raw <= m * pow) return m * pow;
  return 10 * pow;
}

function draw(canvas: HTMLCanvasElement, axis: 'x' | 'y', zoom: number, pan: number, length: number, unitPx: number, pageLen: number) {
  const dpr = window.devicePixelRatio || 1;
  const w = axis === 'x' ? length : SIZE;
  const h = axis === 'x' ? SIZE : length;
  canvas.width = w * dpr;
  canvas.height = h * dpr;
  canvas.style.width = w + 'px';
  canvas.style.height = h + 'px';
  const ctx = canvas.getContext('2d')!;
  ctx.scale(dpr, dpr);
  const css = getComputedStyle(document.documentElement);
  ctx.fillStyle = css.getPropertyValue('--panel');
  ctx.fillRect(0, 0, w, h);
  // page extent highlight
  ctx.fillStyle = css.getPropertyValue('--raised');
  if (axis === 'x') ctx.fillRect(pan, 0, pageLen * zoom, SIZE);
  else ctx.fillRect(0, pan, SIZE, pageLen * zoom);
  ctx.strokeStyle = css.getPropertyValue('--faint');
  ctx.fillStyle = css.getPropertyValue('--muted');
  ctx.font = '10px Inter, sans-serif';
  ctx.lineWidth = 1;
  const pxPerUnit = zoom * unitPx;
  const major = niceStep(pxPerUnit);
  const minor = major / 5;
  const startU = Math.floor(-pan / pxPerUnit / major) * major;
  const endU = (length - pan) / pxPerUnit;
  ctx.beginPath();
  for (let u = startU; u <= endU; u += minor) {
    const p = Math.round(pan + u * pxPerUnit) + 0.5;
    const isMajor = Math.abs(u / major - Math.round(u / major)) < 1e-6;
    const len = isMajor ? 9 : 4;
    if (axis === 'x') {
      ctx.moveTo(p, SIZE);
      ctx.lineTo(p, SIZE - len);
      if (isMajor) ctx.fillText(String(+u.toFixed(2)), p + 3, 10);
    } else {
      ctx.moveTo(SIZE, p);
      ctx.lineTo(SIZE - len, p);
      if (isMajor) {
        ctx.save();
        ctx.translate(10, p + 3);
        ctx.rotate(-Math.PI / 2);
        ctx.fillText(String(+u.toFixed(2)), 0, 0);
        ctx.restore();
      }
    }
  }
  ctx.stroke();
  ctx.strokeStyle = css.getPropertyValue('--line');
  ctx.beginPath();
  if (axis === 'x') {
    ctx.moveTo(0, SIZE - 0.5);
    ctx.lineTo(w, SIZE - 0.5);
  } else {
    ctx.moveTo(SIZE - 0.5, 0);
    ctx.lineTo(SIZE - 0.5, h);
  }
  ctx.stroke();
}

export function Rulers() {
  const top = useRef<HTMLCanvasElement>(null);
  const left = useRef<HTMLCanvasElement>(null);
  const v = useView();
  const design = useEditor((s) => s.design);
  const unit = design?.unit || 'px';
  const dpi = design?.dpi || 96;
  const unitPx = fromPx(1, unit, dpi) ? 1 / fromPx(1, unit, dpi) : 1;

  useEffect(() => {
    if (!design || !top.current || !left.current) return;
    draw(top.current, 'x', v.zoom, v.panX, v.vw, unitPx, design.width);
    draw(left.current, 'y', v.zoom, v.panY, v.vh, unitPx, design.height);
  }, [v.zoom, v.panX, v.panY, v.vw, v.vh, design?.width, design?.height, unitPx, usePrefs((s) => s.theme)]);

  const startGuide = (axis: 'x' | 'y') => (e: React.PointerEvent) => {
    const host = (e.currentTarget.parentElement as HTMLElement).querySelector('.canvas-host') as HTMLElement;
    const r = host.getBoundingClientRect();
    const line = document.createElement('div');
    line.className = 'guide-preview ' + axis;
    host.appendChild(line);
    const move = (ev: PointerEvent) => {
      if (axis === 'x') line.style.left = ev.clientX - r.left + 'px';
      else line.style.top = ev.clientY - r.top + 'px';
    };
    const up = (ev: PointerEvent) => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      line.remove();
      const { zoom, panX, panY } = useView.getState();
      const pos = axis === 'x' ? (ev.clientX - r.left - panX) / zoom : (ev.clientY - r.top - panY) / zoom;
      const st = useEditor.getState();
      const d = st.design;
      if (!d) return;
      const inside = axis === 'x' ? ev.clientY > r.top && pos >= 0 && pos <= d.width : ev.clientX > r.left && pos >= 0 && pos <= d.height;
      if (inside) st.updatePage(st.activePageId, (p) => void (p.guides = [...(p.guides || []), { id: uid(), axis, pos: Math.round(pos) }]));
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  };

  return (
    <>
      <div className="ruler-corner" title={`Units: ${UNIT_LABEL[unit]}`}>{unit}</div>
      <canvas ref={top} className="ruler top" onPointerDown={startGuide('y')} title="Drag down to add a guide" />
      <canvas ref={left} className="ruler left" onPointerDown={startGuide('x')} title="Drag right to add a guide" />
    </>
  );
}
