import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Pipette, Plus, Trash2 } from 'lucide-react';
import type { Fill, GradientStop } from '../types';
import { DEFAULT_SWATCHES, PRESET_GRADIENTS, fillToCss, hexToRgb, rgbToHex, fillPrimaryColor } from '../lib/color';
import { Popover, Seg, NumberField } from './ui';
import { useActiveKit, usePrefs } from '../store/ui';
import { useEditor } from '../store/editor';

// ----------------------------------------------------------------- HSV helpers
function rgbToHsv(r: number, g: number, b: number) {
  r /= 255;
  g /= 255;
  b /= 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const d = max - min;
  let h = 0;
  if (d) {
    if (max === r) h = ((g - b) / d) % 6;
    else if (max === g) h = (b - r) / d + 2;
    else h = (r - g) / d + 4;
    h *= 60;
    if (h < 0) h += 360;
  }
  return { h, s: max ? d / max : 0, v: max };
}
function hsvToRgb(h: number, s: number, v: number) {
  const f = (n: number) => {
    const k = (n + h / 60) % 6;
    return v - v * s * Math.max(0, Math.min(k, 4 - k, 1));
  };
  return { r: f(5) * 255, g: f(3) * 255, b: f(1) * 255 };
}

/** Collect colours used in the current design */
function useDocumentColors(): string[] {
  const design = useEditor((s) => s.design);
  return useMemo(() => {
    const set = new Set<string>();
    if (!design) return [];
    const addFill = (f?: Fill) => {
      if (!f) return;
      if (f.type === 'solid') set.add(f.color.toLowerCase());
      else f.stops.forEach((s) => set.add(s.color.toLowerCase()));
    };
    for (const p of design.pages) {
      addFill(p.background.fill);
      for (const e of p.elements as any[]) {
        addFill(e.fill);
        if (e.stroke && e.strokeWidth) set.add(String(e.stroke).toLowerCase());
        if (e.type === 'svg') Object.values(e.colorMap || {}).forEach((c: any) => set.add(String(c).toLowerCase()));
      }
    }
    return [...set].filter((c) => c.startsWith('#')).slice(0, 18);
  }, [design]);
}

// ----------------------------------------------------------------- SV + hue + alpha
export function SolidPicker({ color, onChange }: { color: string; onChange: (c: string) => void }) {
  const rgb = hexToRgb(color);
  const [hsv, setHsv] = useState(() => rgbToHsv(rgb.r, rgb.g, rgb.b));
  const [alpha, setAlpha] = useState(rgb.a);
  const [hex, setHex] = useState(color);
  const svRef = useRef<HTMLDivElement>(null);
  const lastEmitted = useRef(color);

  useEffect(() => {
    if (color.toLowerCase() === lastEmitted.current.toLowerCase()) return;
    const c = hexToRgb(color);
    const n = rgbToHsv(c.r, c.g, c.b);
    setHsv((prev) => ({ h: n.s === 0 ? prev.h : n.h, s: n.s, v: n.v }));
    setAlpha(c.a);
    setHex(color);
  }, [color]);

  const emit = useCallback(
    (h: number, s: number, v: number, a: number) => {
      const { r, g, b } = hsvToRgb(h, s, v);
      const out = rgbToHex(r, g, b, a);
      lastEmitted.current = out;
      setHex(out);
      onChange(out);
    },
    [onChange],
  );

  const dragSV = (e: React.PointerEvent) => {
    const el = svRef.current!;
    el.setPointerCapture(e.pointerId);
    const move = (ev: PointerEvent | React.PointerEvent) => {
      const r = el.getBoundingClientRect();
      const s = Math.max(0, Math.min(1, (ev.clientX - r.left) / r.width));
      const v = Math.max(0, Math.min(1, 1 - (ev.clientY - r.top) / r.height));
      setHsv((p) => ({ ...p, s, v }));
      emit(hsv.h, s, v, alpha);
    };
    move(e);
    const up = () => {
      el.removeEventListener('pointermove', move as any);
      el.removeEventListener('pointerup', up);
    };
    el.addEventListener('pointermove', move as any);
    el.addEventListener('pointerup', up);
  };

  const pickScreen = async () => {
    const ED = (window as any).EyeDropper;
    if (!ED) return;
    try {
      const res = await new ED().open();
      const c = hexToRgb(res.sRGBHex);
      const n = rgbToHsv(c.r, c.g, c.b);
      setHsv(n);
      emit(n.h, n.s, n.v, alpha);
    } catch {
      /* cancelled */
    }
  };

  const hueColor = rgbToHex(...(Object.values(hsvToRgb(hsv.h, 1, 1)) as [number, number, number]));
  const solid = rgbToHex(...(Object.values(hsvToRgb(hsv.h, hsv.s, hsv.v)) as [number, number, number]));

  return (
    <div className="col" style={{ gap: 10 }}>
      <div
        ref={svRef}
        className="sv-box"
        style={{ background: `linear-gradient(to top, #000, transparent), linear-gradient(to right, #fff, ${hueColor})` }}
        onPointerDown={dragSV}
      >
        <div className="sv-dot" style={{ left: `${hsv.s * 100}%`, top: `${(1 - hsv.v) * 100}%`, background: solid }} />
      </div>
      <input
        type="range"
        className="hue-range"
        min={0}
        max={360}
        value={hsv.h}
        onChange={(e) => {
          const h = parseFloat(e.target.value);
          setHsv((p) => ({ ...p, h }));
          emit(h, hsv.s, hsv.v, alpha);
        }}
      />
      <div className="alpha-wrap checker">
        <input
          type="range"
          className="alpha-range"
          min={0}
          max={1}
          step={0.01}
          value={alpha}
          style={{ background: `linear-gradient(to right, transparent, ${solid})` }}
          onChange={(e) => {
            const a = parseFloat(e.target.value);
            setAlpha(a);
            emit(hsv.h, hsv.s, hsv.v, a);
          }}
        />
      </div>
      <div className="row">
        <div className="swatch sq checker" style={{ width: 32, height: 32 }}>
          <div style={{ position: 'absolute', inset: 0, background: hex, borderRadius: 5 }} />
        </div>
        <input
          className="input grow"
          value={hex}
          onChange={(e) => setHex(e.target.value)}
          onBlur={() => {
            if (/^#?[0-9a-f]{3,8}$/i.test(hex.trim())) {
              const v = hex.trim().startsWith('#') ? hex.trim() : '#' + hex.trim();
              const c = hexToRgb(v);
              const n = rgbToHsv(c.r, c.g, c.b);
              setHsv(n);
              setAlpha(c.a);
              emit(n.h, n.s, n.v, c.a);
            } else setHex(color);
          }}
          onKeyDown={(e) => {
            e.stopPropagation();
            if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
          }}
        />
        <NumberField value={Math.round(alpha * 100)} min={0} max={100} unit="%" onChange={(v) => {
          setAlpha(v / 100);
          emit(hsv.h, hsv.s, hsv.v, v / 100);
        }} />
        {'EyeDropper' in window && (
          <button className="icon-btn" title="Pick a colour from the screen" onClick={pickScreen}>
            <Pipette size={16} />
          </button>
        )}
      </div>
    </div>
  );
}

function SwatchRow({ title, colors, onPick, current }: { title: string; colors: string[]; onPick: (c: string) => void; current?: string }) {
  if (!colors.length) return null;
  return (
    <div className="col" style={{ gap: 6 }}>
      <div className="small muted">{title}</div>
      <div className="swatch-grid">
        {colors.map((c, i) => (
          <button
            key={c + i}
            className={'swatch' + (c === 'transparent' ? ' checker' : '') + (current?.toLowerCase() === c.toLowerCase() ? ' selected' : '')}
            style={{ background: c === 'transparent' ? undefined : c }}
            title={c}
            onClick={() => onPick(c)}
          />
        ))}
      </div>
    </div>
  );
}

// ----------------------------------------------------------------- Gradient editor
function GradientEditor({ fill, onChange }: { fill: Extract<Fill, { type: 'linear' | 'radial' }>; onChange: (f: Fill) => void }) {
  const [sel, setSel] = useState(0);
  const barRef = useRef<HTMLDivElement>(null);
  const stops = fill.stops;
  const setStops = (s: GradientStop[]) => onChange({ ...fill, stops: s } as Fill);
  const current = stops[Math.min(sel, stops.length - 1)];

  const dragStop = (i: number, e: React.PointerEvent) => {
    e.stopPropagation();
    setSel(i);
    const bar = barRef.current!;
    const move = (ev: PointerEvent) => {
      const r = bar.getBoundingClientRect();
      const off = Math.max(0, Math.min(1, (ev.clientX - r.left) / r.width));
      setStops(stops.map((s, j) => (j === i ? { ...s, offset: +off.toFixed(3) } : s)));
    };
    const up = () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  };

  return (
    <div className="col" style={{ gap: 10 }}>
      <Seg
        value={fill.type}
        options={[
          { value: 'linear', label: 'Linear' },
          { value: 'radial', label: 'Radial' },
        ]}
        onChange={(t) => onChange(t === 'linear' ? { type: 'linear', angle: (fill as any).angle ?? 90, stops } : { type: 'radial', stops })}
      />
      <div
        ref={barRef}
        className="grad-bar checker"
        onPointerDown={(e) => {
          const r = barRef.current!.getBoundingClientRect();
          const off = Math.max(0, Math.min(1, (e.clientX - r.left) / r.width));
          const ns = [...stops, { offset: +off.toFixed(3), color: current?.color || '#ffffff' }];
          setStops(ns);
          setSel(ns.length - 1);
        }}
      >
        <div style={{ position: 'absolute', inset: 0, borderRadius: 6, background: `linear-gradient(to right, ${[...stops].sort((a, b) => a.offset - b.offset).map((s) => `${s.color} ${s.offset * 100}%`).join(',')})` }} />
        {stops.map((s, i) => (
          <div
            key={i}
            className={'grad-stop' + (i === sel ? ' sel' : '')}
            style={{ left: `${s.offset * 100}%`, background: s.color }}
            onPointerDown={(e) => dragStop(i, e)}
          />
        ))}
      </div>
      <div className="row">
        {fill.type === 'linear' && (
          <div className="grow">
            <NumberField label="∠" value={fill.angle} unit="°" min={-360} max={360} onChange={(v) => onChange({ ...fill, angle: v })} />
          </div>
        )}
        <button className="btn sm" onClick={() => setStops([...stops].reverse().map((s) => ({ ...s, offset: 1 - s.offset })))}>
          Reverse
        </button>
        <button
          className="icon-btn sm"
          title="Remove stop"
          disabled={stops.length <= 2}
          onClick={() => {
            setStops(stops.filter((_, i) => i !== sel));
            setSel(0);
          }}
        >
          <Trash2 size={14} />
        </button>
      </div>
      {current && <SolidPicker color={current.color} onChange={(c) => setStops(stops.map((s, i) => (i === sel ? { ...s, color: c } : s)))} />}
    </div>
  );
}

// ----------------------------------------------------------------- Main panel
export function ColorPanel({ value, onChange, allowGradient = true, allowTransparent = true }: { value: Fill; onChange: (f: Fill) => void; allowGradient?: boolean; allowTransparent?: boolean }) {
  const kit = useActiveKit();
  const recent = usePrefs((s) => s.recentColors);
  const addRecent = usePrefs((s) => s.addRecentColor);
  const docColors = useDocumentColors();
  const [mode, setMode] = useState<'solid' | 'gradient'>(value.type === 'solid' ? 'solid' : 'gradient');
  const current = value.type === 'solid' ? value.color : '';

  const pick = (c: string) => {
    onChange({ type: 'solid', color: c });
    if (c !== 'transparent') addRecent(c);
    setMode('solid');
  };

  useEffect(() => {
    return () => {
      if (value.type === 'solid' && value.color !== 'transparent') addRecent(value.color);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="col color-panel" style={{ gap: 12 }}>
      {allowGradient && (
        <Seg
          value={mode}
          options={[
            { value: 'solid', label: 'Solid' },
            { value: 'gradient', label: 'Gradient' },
          ]}
          onChange={(m) => {
            setMode(m);
            if (m === 'gradient' && value.type === 'solid') {
              const c = value.color === 'transparent' ? '#7c5cff' : value.color;
              onChange({ type: 'linear', angle: 90, stops: [{ offset: 0, color: c }, { offset: 1, color: '#ffffff' }] });
            }
            if (m === 'solid' && value.type !== 'solid') onChange({ type: 'solid', color: fillPrimaryColor(value) });
          }}
        />
      )}
      {mode === 'solid' || value.type === 'solid' ? (
        <>
          <SolidPicker color={current === 'transparent' || !current ? '#ffffff' : current} onChange={(c) => onChange({ type: 'solid', color: c })} />
          <SwatchRow title="Document colours" colors={docColors} onPick={pick} current={current} />
          <SwatchRow title={kit.name} colors={kit.colors} onPick={pick} current={current} />
          <SwatchRow title="Recent" colors={recent} onPick={pick} current={current} />
          <SwatchRow title="Default colours" colors={allowTransparent ? ['transparent', ...DEFAULT_SWATCHES] : DEFAULT_SWATCHES} onPick={pick} current={current} />
        </>
      ) : (
        <>
          <GradientEditor fill={value as any} onChange={onChange} />
          <div className="col" style={{ gap: 6 }}>
            <div className="small muted">Preset gradients</div>
            <div className="swatch-grid">
              {PRESET_GRADIENTS.map((g, i) => (
                <button key={i} className="swatch" style={{ background: fillToCss(g) }} onClick={() => onChange(structuredClone(g))} />
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  );
}

/** A swatch button that opens the colour panel */
export function ColorButton({
  value,
  onChange,
  allowGradient = true,
  allowTransparent = true,
  title = 'Colour',
  size = 28,
  square,
  children,
}: {
  value: Fill | string;
  onChange: (f: Fill) => void;
  allowGradient?: boolean;
  allowTransparent?: boolean;
  title?: string;
  size?: number;
  square?: boolean;
  children?: React.ReactNode;
}) {
  const [anchor, setAnchor] = useState<HTMLElement | null>(null);
  const fill: Fill = typeof value === 'string' ? { type: 'solid', color: value } : value;
  const css = fillToCss(fill);
  return (
    <>
      <button
        className={'swatch' + (square ? ' sq' : '') + (css === 'transparent' ? ' checker' : '')}
        style={{ width: size, height: size, background: css === 'transparent' ? undefined : css }}
        title={title}
        onClick={(e) => setAnchor(anchor ? null : e.currentTarget)}
        data-tip={title}
      >
        {children}
      </button>
      {anchor && (
        <Popover anchor={anchor} onClose={() => setAnchor(null)} width={276}>
          <ColorPanel value={fill} onChange={onChange} allowGradient={allowGradient} allowTransparent={allowTransparent} />
        </Popover>
      )}
    </>
  );
}

export function AddSwatch({ onAdd }: { onAdd: (c: string) => void }) {
  const [anchor, setAnchor] = useState<HTMLElement | null>(null);
  const [c, setC] = useState('#7c5cff');
  return (
    <>
      <button className="swatch add-swatch" title="Add colour" onClick={(e) => setAnchor(e.currentTarget)}>
        <Plus size={14} />
      </button>
      {anchor && (
        <Popover
          anchor={anchor}
          onClose={() => {
            setAnchor(null);
          }}
          width={260}
        >
          <SolidPicker color={c} onChange={setC} />
          <button
            className="btn primary block"
            style={{ marginTop: 10 }}
            onClick={() => {
              onAdd(c);
              setAnchor(null);
            }}
          >
            Add colour
          </button>
        </Popover>
      )}
    </>
  );
}
