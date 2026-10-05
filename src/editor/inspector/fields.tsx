import React, { useRef } from 'react';
import {
  AlignStartVertical,
  AlignCenterVertical,
  AlignEndVertical,
  AlignStartHorizontal,
  AlignCenterHorizontal,
  AlignEndHorizontal,
  ChevronsUp,
  ArrowUp,
  ArrowDown,
  ChevronsDown,
  Check,
} from 'lucide-react';
import type { BlendMode, DesignElement, LineEnd, ShapeKind, Unit } from '../../types';
import { useEditor } from '../../store/editor';
import { Popover, usePopover, Section } from '../../components/ui';
import { useInspectorNav, InspectorSection } from './nav';
import { shapePath, shapeUsesEvenOdd } from '../../lib/shapes';
import { align, AlignMode } from '../elementActions';
import { activeCanvas } from '../canvas/controller';
import { ensureFont } from '../../lib/fonts';

// ---------------------------------------------------------------------------
// Store helpers
// ---------------------------------------------------------------------------
export const ed = () => useEditor.getState();

/** Update a set of elements. Pass a coalesce key for continuous edits (sliders, typing). */
export function patchEls(ids: string[], patch: Partial<DesignElement> | Record<string, unknown> | ((el: any) => void), key?: string) {
  ed().updateElements(ids, patch as any, key ? `${key}:${ids.join(',')}` : undefined);
}

/** Load a font face then rebuild the canvas so text re-measures with the real glyphs. */
export function loadFontAndRefresh(family: string, weight: 'normal' | 'bold' = 'normal', style: 'normal' | 'italic' = 'normal') {
  void Promise.all([ensureFont(family, weight, style), ensureFont(family, 'normal', 'normal')]).then(() => activeCanvas?.requestRebuild());
}

// ---------------------------------------------------------------------------
// Unit helpers
// ---------------------------------------------------------------------------
export const UNIT_DECIMALS: Record<Unit, number> = {
  px: 0,
  in: 2,
  mm: 1,
  cm: 2,
};
export const UNIT_STEP: Record<Unit, number> = {
  px: 1,
  in: 0.01,
  mm: 1,
  cm: 0.1,
};

// ---------------------------------------------------------------------------
// Option lists
// ---------------------------------------------------------------------------
export const BLEND_MODES: { value: BlendMode; label: string }[] = [
  { value: 'source-over', label: 'Normal' },
  { value: 'multiply', label: 'Multiply' },
  { value: 'screen', label: 'Screen' },
  { value: 'overlay', label: 'Overlay' },
  { value: 'darken', label: 'Darken' },
  { value: 'lighten', label: 'Lighten' },
  { value: 'color-dodge', label: 'Colour dodge' },
  { value: 'color-burn', label: 'Colour burn' },
  { value: 'hard-light', label: 'Hard light' },
  { value: 'soft-light', label: 'Soft light' },
  { value: 'difference', label: 'Difference' },
  { value: 'exclusion', label: 'Exclusion' },
  { value: 'hue', label: 'Hue' },
  { value: 'saturation', label: 'Saturation' },
  { value: 'color', label: 'Colour' },
  { value: 'luminosity', label: 'Luminosity' },
];

export const LINE_ENDS: { value: LineEnd; label: string }[] = [
  { value: 'none', label: 'None' },
  { value: 'arrow', label: 'Arrow' },
  { value: 'triangle', label: 'Triangle' },
  { value: 'circle', label: 'Circle' },
  { value: 'square', label: 'Square' },
  { value: 'bar', label: 'Bar' },
];

export const DASHES: {
  value: 'solid' | 'dashed' | 'dotted';
  label: React.ReactNode;
  title: string;
}[] = [
  { value: 'solid', label: <DashIcon kind="solid" />, title: 'Solid' },
  { value: 'dashed', label: <DashIcon kind="dashed" />, title: 'Dashed' },
  { value: 'dotted', label: <DashIcon kind="dotted" />, title: 'Dotted' },
];

/** Shapes whose outline is curved, so corner rounding has no effect */
export const NO_RADIUS: ShapeKind[] = [
  'ellipse',
  'ring',
  'heart',
  'cloud',
  'blob1',
  'blob2',
  'blob3',
  'moon',
  'drop',
  'arch',
  'semicircle',
  'speech',
  'shield',
];

// ---------------------------------------------------------------------------
// Sections
// ---------------------------------------------------------------------------
/** A collapsible inspector section that the toolbar can open and scroll to (see nav.ts). */
export function S({
  id,
  title,
  defaultOpen = true,
  right,
  children,
}: {
  id: InspectorSection;
  title: React.ReactNode;
  defaultOpen?: boolean;
  right?: React.ReactNode;
  children: React.ReactNode;
}) {
  const n = useInspectorNav((s) => s.opened[id]);
  return (
    <div data-section={id}>
      <Section key={n ?? 0} title={title} defaultOpen={n ? true : defaultOpen} right={right}>
        {children}
      </Section>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Small presentational bits
// ---------------------------------------------------------------------------
export function Field({ label, children, right }: { label: React.ReactNode; children: React.ReactNode; right?: React.ReactNode }) {
  return (
    <div className="insp-field">
      <div className="insp-field-head">
        <span className="field-label">{label}</span>
        {right}
      </div>
      {children}
    </div>
  );
}

export function SubHead({ children }: { children: React.ReactNode }) {
  return <div className="insp-subhead">{children}</div>;
}

export function DashIcon({ kind }: { kind: 'solid' | 'dashed' | 'dotted' }) {
  const dash = kind === 'dashed' ? '5 3' : kind === 'dotted' ? '0.1 4' : undefined;
  return (
    <svg width="26" height="10" viewBox="0 0 26 10" aria-hidden="true">
      <line x1="2" y1="5" x2="24" y2="5" stroke="currentColor" strokeWidth="2" strokeLinecap={kind === 'dotted' ? 'round' : 'butt'} strokeDasharray={dash} />
    </svg>
  );
}

export function ShapeIcon({ kind, size = 18 }: { kind: ShapeKind | 'none'; size?: number }) {
  if (kind === 'none') {
    return (
      <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true">
        <rect x="3" y="3" width="18" height="18" rx="2" fill="none" stroke="currentColor" strokeWidth="1.6" strokeDasharray="3 2.5" />
      </svg>
    );
  }
  const w = kind === 'semicircle' ? 20 : 20;
  const h = kind === 'semicircle' ? 10 : 20;
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true">
      <path
        d={shapePath(kind, w, h, 0)}
        transform={`translate(2 ${(24 - h) / 2})`}
        fill="currentColor"
        fillRule={shapeUsesEvenOdd(kind) ? 'evenodd' : 'nonzero'}
      />
    </svg>
  );
}

export function LineEndIcon({ kind, flip }: { kind: LineEnd; flip?: boolean }) {
  const head = (() => {
    switch (kind) {
      case 'arrow':
        return <path d="M17 5 L22 10 L17 15" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />;
      case 'triangle':
        return <path d="M16 5 L23 10 L16 15 Z" fill="currentColor" />;
      case 'circle':
        return <circle cx="19" cy="10" r="4" fill="currentColor" />;
      case 'square':
        return <rect x="15.5" y="6.5" width="7" height="7" fill="currentColor" />;
      case 'bar':
        return <line x1="22" y1="4" x2="22" y2="16" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />;
      default:
        return null;
    }
  })();
  return (
    <svg width="26" height="20" viewBox="0 0 26 20" aria-hidden="true" style={flip ? { transform: 'scaleX(-1)' } : undefined}>
      <line x1="3" y1="10" x2={kind === 'none' ? 23 : 18} y2="10" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      {head}
    </svg>
  );
}

/** A labelled button that opens a popover */
export function PopButton({
  icon,
  label,
  tip,
  width = 260,
  children,
  className = 'tb-btn',
  active,
  disabled,
}: {
  icon?: React.ReactNode;
  label?: React.ReactNode;
  tip?: string;
  width?: number;
  children: React.ReactNode | ((close: () => void) => React.ReactNode);
  className?: string;
  active?: boolean;
  disabled?: boolean;
}) {
  const pop = usePopover();
  return (
    <>
      <button
        type="button"
        className={className + (pop.open || active ? ' active' : '')}
        onClick={pop.toggle}
        data-tip={tip}
        aria-label={tip}
        disabled={disabled}
      >
        {icon}
        {label && <span className="tb-label">{label}</span>}
      </button>
      {pop.open && (
        <Popover anchor={pop.anchor} onClose={pop.close} width={width}>
          {typeof children === 'function' ? children(pop.close) : children}
        </Popover>
      )}
    </>
  );
}

/** Grid of tiny shape icons to choose a shape kind (used for shape swap and photo frames) */
export function ShapeGridPicker({
  value,
  options,
  onChange,
  allowNone,
}: {
  value: ShapeKind | 'none';
  options: { kind: ShapeKind; label: string }[];
  onChange: (k: ShapeKind | 'none') => void;
  allowNone?: boolean;
}) {
  const pop = usePopover();
  const all: { kind: ShapeKind | 'none'; label: string }[] = [...(allowNone ? [{ kind: 'none' as const, label: 'No frame' }] : []), ...options];
  const cur = all.find((o) => o.kind === value);
  return (
    <>
      <button type="button" className="insp-picker" onClick={pop.toggle}>
        <ShapeIcon kind={value} />
        <span className="grow">{cur?.label ?? value}</span>
      </button>
      {pop.open && (
        <Popover anchor={pop.anchor} onClose={pop.close} width={252}>
          <div className="shape-grid">
            {all.map((o) => (
              <button
                key={o.kind}
                type="button"
                className={'shape-cell' + (o.kind === value ? ' active' : '')}
                title={o.label}
                onClick={() => {
                  onChange(o.kind);
                  pop.close();
                }}
              >
                <ShapeIcon kind={o.kind} size={22} />
              </button>
            ))}
          </div>
        </Popover>
      )}
    </>
  );
}

/** Six align-to-page buttons */
export function AlignPageButtons({ toPage = true }: { toPage?: boolean }) {
  const items: { m: AlignMode; icon: React.ReactNode; t: string }[] = [
    { m: 'left', icon: <AlignStartVertical size={16} />, t: 'Align left' },
    { m: 'center', icon: <AlignCenterVertical size={16} />, t: 'Align centre' },
    { m: 'right', icon: <AlignEndVertical size={16} />, t: 'Align right' },
    { m: 'top', icon: <AlignStartHorizontal size={16} />, t: 'Align top' },
    {
      m: 'middle',
      icon: <AlignCenterHorizontal size={16} />,
      t: 'Align middle',
    },
    { m: 'bottom', icon: <AlignEndHorizontal size={16} />, t: 'Align bottom' },
  ];
  return (
    <div className="btn-grid6">
      {items.map((it) => (
        <button key={it.m} type="button" className="icon-btn sm" onClick={() => align(it.m, toPage)} data-tip={it.t} aria-label={it.t}>
          {it.icon}
        </button>
      ))}
    </div>
  );
}

export function LayerButtons({ ids }: { ids: string[] }) {
  const items: {
    d: 'top' | 'up' | 'down' | 'bottom';
    icon: React.ReactNode;
    t: string;
  }[] = [
    { d: 'top', icon: <ChevronsUp size={16} />, t: 'Bring to front' },
    { d: 'up', icon: <ArrowUp size={16} />, t: 'Bring forward' },
    { d: 'down', icon: <ArrowDown size={16} />, t: 'Send backward' },
    { d: 'bottom', icon: <ChevronsDown size={16} />, t: 'Send to back' },
  ];
  return (
    <div className="btn-row4">
      {items.map((it) => (
        <button key={it.d} type="button" className="btn sm" onClick={() => ed().reorder(ids, it.d)} data-tip={it.t} aria-label={it.t}>
          {it.icon}
        </button>
      ))}
    </div>
  );
}

/** Dual-handle range for trimming */
export function DualRange({
  min = 0,
  max,
  a,
  b,
  step = 0.1,
  onChange,
}: {
  min?: number;
  max: number;
  a: number;
  b: number;
  step?: number;
  onChange: (a: number, b: number) => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const span = Math.max(0.0001, max - min);
  const pa = ((a - min) / span) * 100;
  const pb = ((b - min) / span) * 100;
  const start = (which: 'a' | 'b') => (e: React.PointerEvent) => {
    e.preventDefault();
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    const move = (ev: PointerEvent) => {
      const r = ref.current!.getBoundingClientRect();
      let v = min + ((ev.clientX - r.left) / r.width) * span;
      v = Math.round(v / step) * step;
      v = Math.max(min, Math.min(max, v));
      if (which === 'a') onChange(Math.min(v, b - step), b);
      else onChange(a, Math.max(v, a + step));
    };
    const up = () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  };
  return (
    <div className="dual-range" ref={ref}>
      <div className="dr-track" />
      <div className="dr-fill" style={{ left: `${pa}%`, width: `${Math.max(0, pb - pa)}%` }} />
      <button type="button" className="dr-thumb" style={{ left: `${pa}%` }} onPointerDown={start('a')} aria-label="Trim start" />
      <button type="button" className="dr-thumb" style={{ left: `${pb}%` }} onPointerDown={start('b')} aria-label="Trim end" />
    </div>
  );
}

export function CheckMark({ on }: { on: boolean }) {
  return on ? <Check size={14} /> : <span style={{ width: 14, display: 'inline-block' }} />;
}

export const fmtSec = (s: number) => `${(Math.round(s * 10) / 10).toFixed(1)}s`;
