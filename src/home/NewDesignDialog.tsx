import { useDeferredValue, useMemo, useState } from 'react';
import { ArrowLeftRight, Bookmark, Search, X } from 'lucide-react';
import type { Unit } from '../types';
import { Modal } from '../components/ui';
import { usePrefs, useUI } from '../store/ui';
import { confirmDiscard, createDesign as createDesignNow } from '../lib/actions';
import { DESIGN_PRESETS, PRESET_CATEGORIES, DesignPreset } from '../lib/presets';
import { formatSize, fromPx, toPx, UNIT_LABEL } from '../lib/units';
import { uid } from '../lib/defaults';
import { AspectGlyph } from './Home';
import './home.css';

const UNITS: Unit[] = ['px', 'in', 'mm', 'cm'];
const MAX_PX = 16000;

/** Keep a copy of any open design (via library autosave) before replacing it */
function createDesign(...args: Parameters<typeof createDesignNow>) {
  void confirmDiscard().then((ok) => ok && createDesignNow(...args));
}

const round = (v: number, unit: Unit) => (unit === 'px' ? Math.round(v) : +v.toFixed(unit === 'mm' ? 1 : 2));

export function NewDesignDialog({ onClose }: { onClose: () => void }) {
  const [q, setQ] = useState('');
  const dq = useDeferredValue(q.trim().toLowerCase());
  const defaultUnit = usePrefs((s) => s.unit);
  const customSizes = usePrefs((s) => s.customSizes);
  const setPrefs = usePrefs((s) => s.set);
  const [unit, setUnit] = useState<Unit>(defaultUnit || 'px');
  const [w, setW] = useState<string>(() => String(round(fromPx(1920, defaultUnit || 'px'), defaultUnit || 'px')));
  const [h, setH] = useState<string>(() => String(round(fromPx(1080, defaultUnit || 'px'), defaultUnit || 'px')));
  const [name, setName] = useState('');
  const [selected, setSelected] = useState<string | null>(null);

  const groups = useMemo(() => {
    const hits = DESIGN_PRESETS.filter((p) => !dq || `${p.name} ${p.category} ${p.description || ''}`.toLowerCase().includes(dq));
    return PRESET_CATEGORIES.map((c) => ({ cat: c as string, items: hits.filter((p) => p.category === c) })).filter((g) => g.items.length);
  }, [dq]);
  const savedHits = useMemo(() => customSizes.filter((s) => !dq || s.name.toLowerCase().includes(dq)), [customSizes, dq]);

  const wn = parseFloat(w);
  const hn = parseFloat(h);
  const wPx = toPx(wn, unit);
  const hPx = toPx(hn, unit);
  const valid = wn > 0 && hn > 0 && wPx >= 1 && hPx >= 1 && wPx <= MAX_PX && hPx <= MAX_PX;
  const error = !(wn > 0 && hn > 0)
    ? 'Enter a width and height greater than zero.'
    : wPx > MAX_PX || hPx > MAX_PX
      ? `That's larger than ${MAX_PX.toLocaleString()} px on a side. Try a smaller size or switch units.`
      : null;

  const pick = (p: { id: string; width: number; height: number; unit: Unit; name: string }) => {
    setSelected(p.id);
    setUnit(p.unit);
    setW(String(round(fromPx(p.width, p.unit), p.unit)));
    setH(String(round(fromPx(p.height, p.unit), p.unit)));
    setName(p.name);
  };

  const create = (p?: DesignPreset) => {
    if (p) {
      createDesign(p.width, p.height, p.name, p.unit, p.category);
    } else {
      if (!valid) return;
      const preset = DESIGN_PRESETS.find((x) => x.id === selected);
      createDesign(wPx, hPx, name.trim() || preset?.name || 'Untitled design', unit, preset?.category);
    }
    onClose();
  };

  const changeUnit = (u: Unit) => {
    if (wn > 0) setW(String(round(fromPx(toPx(wn, unit), u), u)));
    if (hn > 0) setH(String(round(fromPx(toPx(hn, unit), u), u)));
    setUnit(u);
  };

  const saveSize = () => {
    if (!valid) return;
    const label = name.trim() || `${round(wn, unit)} × ${round(hn, unit)} ${unit}`;
    const exists = customSizes.some((s) => s.width === Math.round(wPx) && s.height === Math.round(hPx) && s.unit === unit);
    if (exists) {
      useUI.getState().toast('This size is already saved', 'info', 2000);
      return;
    }
    setPrefs({ customSizes: [...customSizes, { id: uid(), name: label, width: Math.round(wPx), height: Math.round(hPx), unit }] });
    useUI.getState().toast(`Saved “${label}” to your sizes`, 'success', 2200);
  };

  return (
    <Modal title="Create a design" onClose={onClose} wide className="newdesign-modal">
      <div className="nd">
        <div className="nd-list">
          <div className="search">
            <Search size={15} />
            <input className="input" autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search sizes" aria-label="Search sizes" onKeyDown={(e) => e.key === 'Escape' && q && (e.stopPropagation(), setQ(''))} />
          </div>
          <div className="nd-scroll">
            {savedHits.length > 0 && (
              <div className="nd-group">
                <div className="nd-cat">Your sizes</div>
                {savedHits.map((s) => (
                  <div key={s.id} className={'nd-item' + (selected === s.id ? ' active' : '')}>
                    <button className="nd-item-hit" onClick={() => pick(s)} onDoubleClick={() => createDesignFromSaved(s, onClose)}>
                      <AspectGlyph w={s.width} h={s.height} box={26} />
                      <span className="nd-name">{s.name}</span>
                      <span className="nd-size">{formatSize(s.width, s.height, s.unit)}</span>
                    </button>
                    <button
                      className="icon-btn sm nd-remove"
                      aria-label={`Remove ${s.name}`}
                      data-tip="Remove"
                      onClick={() => setPrefs({ customSizes: customSizes.filter((x) => x.id !== s.id) })}
                    >
                      <X size={13} />
                    </button>
                  </div>
                ))}
              </div>
            )}
            {groups.map((g) => (
              <div key={g.cat} className="nd-group">
                <div className="nd-cat">{g.cat}</div>
                {g.items.map((p) => (
                  <div key={p.id} className={'nd-item' + (selected === p.id ? ' active' : '')}>
                    <button className="nd-item-hit" onClick={() => pick(p)} onDoubleClick={() => create(p)} title={p.description}>
                      <AspectGlyph w={p.width} h={p.height} box={26} />
                      <span className="nd-name">{p.name}</span>
                      <span className="nd-size">{formatSize(p.width, p.height, p.unit)}</span>
                    </button>
                  </div>
                ))}
              </div>
            ))}
            {!groups.length && !savedHits.length && <p className="nd-none">No sizes match “{q.trim()}”. Enter your own size on the right.</p>}
          </div>
        </div>

        <div className="nd-form">
          <div className="nd-preview" aria-hidden="true">
            <AspectGlyph w={valid ? wPx : 1} h={valid ? hPx : 1} box={132} />
            <span className="nd-preview-size">{valid ? `${Math.round(wPx)} × ${Math.round(hPx)} px` : '—'}</span>
          </div>
          <label className="col nd-field">
            <span className="field-label">Name</span>
            <input className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder="Untitled design" onKeyDown={(e) => e.key === 'Enter' && create()} />
          </label>
          <div className="nd-dims">
            <label className="col nd-field">
              <span className="field-label">Width</span>
              <input
                className="input"
                inputMode="decimal"
                value={w}
                onChange={(e) => {
                  setW(e.target.value);
                  setSelected(null);
                }}
                onKeyDown={(e) => e.key === 'Enter' && create()}
              />
            </label>
            <button
              className="icon-btn nd-swap"
              aria-label="Swap width and height"
              data-tip="Swap"
              onClick={() => {
                setW(h);
                setH(w);
                setSelected(null);
              }}
            >
              <ArrowLeftRight size={15} />
            </button>
            <label className="col nd-field">
              <span className="field-label">Height</span>
              <input
                className="input"
                inputMode="decimal"
                value={h}
                onChange={(e) => {
                  setH(e.target.value);
                  setSelected(null);
                }}
                onKeyDown={(e) => e.key === 'Enter' && create()}
              />
            </label>
            <label className="col nd-field nd-unit">
              <span className="field-label">Unit</span>
              <select className="select" value={unit} onChange={(e) => changeUnit(e.target.value as Unit)} aria-label="Unit">
                {UNITS.map((u) => (
                  <option key={u} value={u}>
                    {u} · {UNIT_LABEL[u]}
                  </option>
                ))}
              </select>
            </label>
          </div>
          {error ? <p className="nd-error">{error}</p> : unit !== 'px' ? <p className="nd-hint">Print sizes use 96 pixels per inch on the canvas. Export at 2× or more for sharp prints.</p> : <p className="nd-hint">&nbsp;</p>}
          <div className="spacer" />
          <div className="row nd-actions">
            <button className="btn ghost" onClick={saveSize} disabled={!valid}>
              <Bookmark size={15} /> Save this size
            </button>
            <div className="spacer" />
            <button className="btn primary lg" onClick={() => create()} disabled={!valid}>
              Create design
            </button>
          </div>
        </div>
      </div>
    </Modal>
  );
}

function createDesignFromSaved(s: { width: number; height: number; unit: Unit; name: string }, onClose: () => void) {
  createDesign(s.width, s.height, s.name, s.unit);
  onClose();
}
