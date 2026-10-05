import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';

// ---------------------------------------------------------------- Slider
export function Slider(props: {
  label?: React.ReactNode;
  value: number;
  min: number;
  max: number;
  step?: number;
  onChange: (v: number) => void;
  onCommit?: () => void;
  suffix?: string;
  hideValue?: boolean;
}) {
  const { label, value, min, max, step = 1, onChange, suffix, hideValue } = props;
  const [text, setText] = useState<string | null>(null);
  const pct = ((value - min) / (max - min)) * 100;
  const shown = Number.isInteger(step) ? Math.round(value) : +value.toFixed(2);
  return (
    <div className="slider-row" style={hideValue ? { gridTemplateColumns: '1fr' } : undefined}>
      {label && <div className="label">{label}</div>}
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        style={{ ['--fill' as any]: `${Math.max(0, Math.min(100, pct))}%` }}
        onChange={(e) => onChange(parseFloat(e.target.value))}
        onPointerUp={props.onCommit}
        onDoubleClick={() => onChange(min < 0 && max > 0 ? 0 : min)}
      />
      {!hideValue && (
        <input
          className="val"
          value={text ?? `${shown}${suffix ?? ''}`}
          onFocus={(e) => {
            setText(String(shown));
            setTimeout(() => e.target.select());
          }}
          onChange={(e) => setText(e.target.value)}
          onBlur={() => {
            const v = parseFloat(text ?? '');
            if (!isNaN(v)) onChange(Math.max(min, Math.min(max, v)));
            setText(null);
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
            e.stopPropagation();
          }}
        />
      )}
    </div>
  );
}

// ---------------------------------------------------------------- NumberField (drag label to scrub)
export function NumberField(props: {
  label?: React.ReactNode;
  value: number;
  onChange: (v: number) => void;
  min?: number;
  max?: number;
  step?: number;
  unit?: string;
  decimals?: number;
  title?: string;
}) {
  const { label, value, onChange, min = -Infinity, max = Infinity, step = 1, unit, decimals = 0, title } = props;
  const [text, setText] = useState<string | null>(null);
  const clamp = (v: number) => Math.max(min, Math.min(max, v));
  const fmt = (v: number) => (decimals ? v.toFixed(decimals).replace(/\.?0+$/, '') : String(Math.round(v)));
  const drag = useRef<{ x: number; v: number } | null>(null);
  return (
    <div className="num-input" title={title}>
      {label !== undefined && (
        <label
          onPointerDown={(e) => {
            drag.current = { x: e.clientX, v: value };
            (e.target as HTMLElement).setPointerCapture(e.pointerId);
          }}
          onPointerMove={(e) => {
            if (!drag.current) return;
            const dx = e.clientX - drag.current.x;
            onChange(clamp(drag.current.v + Math.round(dx / 2) * step));
          }}
          onPointerUp={() => (drag.current = null)}
        >
          {label}
        </label>
      )}
      <input
        value={text ?? fmt(value)}
        onFocus={(e) => {
          setText(fmt(value));
          setTimeout(() => e.target.select());
        }}
        onChange={(e) => setText(e.target.value)}
        onBlur={() => {
          if (text !== null) {
            let v: number;
            try {
              // allow simple arithmetic like 100*2
              v = /^[\d\s+\-*/.()]+$/.test(text) ? Function(`return (${text})`)() : parseFloat(text);
            } catch {
              v = NaN;
            }
            if (!isNaN(v)) onChange(clamp(v));
          }
          setText(null);
        }}
        onKeyDown={(e) => {
          e.stopPropagation();
          if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
          if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
            e.preventDefault();
            const d = (e.key === 'ArrowUp' ? 1 : -1) * step * (e.shiftKey ? 10 : 1);
            const nv = clamp(value + d);
            onChange(nv);
            setText(fmt(nv));
          }
        }}
      />
      {unit && <span className="unit">{unit}</span>}
    </div>
  );
}

// ---------------------------------------------------------------- Toggle
export function Toggle({ value, onChange, label }: { value: boolean; onChange: (v: boolean) => void; label?: React.ReactNode }) {
  const t = <button type="button" className={'toggle' + (value ? ' on' : '')} onClick={() => onChange(!value)} aria-pressed={value} />;
  if (!label) return t;
  return (
    <label className="row" style={{ justifyContent: 'space-between', cursor: 'pointer' }}>
      <span>{label}</span>
      {t}
    </label>
  );
}

// ---------------------------------------------------------------- Segmented
export function Seg<T extends string>({ value, options, onChange }: { value: T; options: { value: T; label: React.ReactNode; title?: string }[]; onChange: (v: T) => void }) {
  return (
    <div className="seg">
      {options.map((o) => (
        <button key={o.value} className={o.value === value ? 'active' : ''} onClick={() => onChange(o.value)} title={o.title} type="button">
          {o.label}
        </button>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------- Section (collapsible)
export function Section({ title, children, defaultOpen = true, right }: { title: React.ReactNode; children: React.ReactNode; defaultOpen?: boolean; right?: React.ReactNode }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <section className={'insp-section' + (open ? ' open' : '')}>
      <header onClick={() => setOpen(!open)}>
        <span className="chev">›</span>
        <h4>{title}</h4>
        {right && (
          <span onClick={(e) => e.stopPropagation()} className="right">
            {right}
          </span>
        )}
      </header>
      {open && <div className="content">{children}</div>}
    </section>
  );
}

// ---------------------------------------------------------------- Modal
export function Modal({ title, onClose, children, footer, wide, className }: { title: React.ReactNode; onClose: () => void; children: React.ReactNode; footer?: React.ReactNode; wide?: boolean; className?: string }) {
  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [onClose]);
  return createPortal(
    <div className="modal-backdrop" onPointerDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className={'modal' + (wide ? ' wide' : '') + (className ? ' ' + className : '')} role="dialog" aria-modal="true" onKeyDown={(e) => e.stopPropagation()}>
        <header>
          <h2>{title}</h2>
          <button className="icon-btn" onClick={onClose} aria-label="Close">
            <X size={18} />
          </button>
        </header>
        <div className="body">{children}</div>
        {footer && <footer>{footer}</footer>}
      </div>
    </div>,
    document.body,
  );
}

// ---------------------------------------------------------------- Popover
export function Popover({ anchor, onClose, children, width = 280, placement = 'bottom' }: { anchor: HTMLElement | null; onClose: () => void; children: React.ReactNode; width?: number; placement?: 'bottom' | 'right' | 'top' }) {
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ left: number; top: number } | null>(null);
  useLayoutEffect(() => {
    if (!anchor || !ref.current) return;
    const r = anchor.getBoundingClientRect();
    const h = ref.current.offsetHeight;
    let left = placement === 'right' ? r.right + 8 : r.left;
    let top = placement === 'right' ? r.top : placement === 'top' ? r.top - h - 8 : r.bottom + 8;
    left = Math.max(8, Math.min(left, window.innerWidth - width - 8));
    if (top + h > window.innerHeight - 8) top = Math.max(8, placement === 'bottom' ? r.top - h - 8 : window.innerHeight - h - 8);
    setPos({ left, top });
  }, [anchor, width, placement, children]);
  useEffect(() => {
    const down = (e: PointerEvent) => {
      const t = e.target as Node;
      if (ref.current?.contains(t) || anchor?.contains(t)) return;
      // ignore clicks inside nested popovers/menus
      if ((t as HTMLElement).closest?.('.popover, .menu')) return;
      onClose();
    };
    const key = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    setTimeout(() => window.addEventListener('pointerdown', down), 0);
    window.addEventListener('keydown', key);
    return () => {
      window.removeEventListener('pointerdown', down);
      window.removeEventListener('keydown', key);
    };
  }, [anchor, onClose]);
  return createPortal(
    <div ref={ref} className="popover" style={{ width, left: pos?.left ?? -9999, top: pos?.top ?? -9999 }} onKeyDown={(e) => e.stopPropagation()}>
      {children}
    </div>,
    document.body,
  );
}

/** Hook: a button that toggles a popover */
export function usePopover() {
  const [anchor, setAnchor] = useState<HTMLElement | null>(null);
  return {
    anchor,
    open: !!anchor,
    toggle: (e: React.MouseEvent<HTMLElement>) => setAnchor(anchor ? null : e.currentTarget),
    close: () => setAnchor(null),
  };
}

// ---------------------------------------------------------------- Context menu
export interface MenuItem {
  label?: string;
  icon?: React.ReactNode;
  shortcut?: string;
  onClick?: () => void;
  disabled?: boolean;
  danger?: boolean;
  sep?: boolean;
}

export function ContextMenu({ x, y, items, onClose }: { x: number; y: number; items: MenuItem[]; onClose: () => void }) {
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState({ left: x, top: y });
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    setPos({ left: Math.min(x, window.innerWidth - el.offsetWidth - 8), top: Math.min(y, window.innerHeight - el.offsetHeight - 8) });
  }, [x, y]);
  useEffect(() => {
    const down = (e: PointerEvent) => !ref.current?.contains(e.target as Node) && onClose();
    const key = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    setTimeout(() => window.addEventListener('pointerdown', down), 0);
    window.addEventListener('keydown', key);
    window.addEventListener('blur', onClose);
    return () => {
      window.removeEventListener('pointerdown', down);
      window.removeEventListener('keydown', key);
      window.removeEventListener('blur', onClose);
    };
  }, [onClose]);
  return createPortal(
    <div ref={ref} className="menu" style={pos} onContextMenu={(e) => e.preventDefault()}>
      {items.map((it, i) =>
        it.sep ? (
          <div key={i} className="sep" />
        ) : (
          <button
            key={i}
            disabled={it.disabled}
            className={it.danger ? 'danger' : ''}
            onClick={() => {
              onClose();
              it.onClick?.();
            }}
          >
            {it.icon}
            <span>{it.label}</span>
            {it.shortcut && <span className="sc">{it.shortcut}</span>}
          </button>
        ),
      )}
    </div>,
    document.body,
  );
}

export const isMac = navigator.platform.toLowerCase().includes('mac');
export const MOD = isMac ? '⌘' : 'Ctrl';
