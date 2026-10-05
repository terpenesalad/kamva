import { memo, useEffect, useState } from 'react';
import { Search, X, ChevronLeft } from 'lucide-react';
import type { DesignElement } from '../../types';
import { useEditor } from '../../store/editor';
import { dragData } from '../dnd';
import { idb, UploadRecord } from '../../lib/idb';
import { ensureUploadAsset } from '../../lib/actions';
import './panels.css';

// ---------------------------------------------------------------------------
// Shared building blocks for the left side panels
// ---------------------------------------------------------------------------

/** Page size of the open design, read at call time (no subscription). */
export function pageDims(): { W: number; H: number; S: number } | null {
  const d = useEditor.getState().design;
  if (!d) return null;
  return { W: d.width, H: d.height, S: Math.min(d.width, d.height) };
}

/** Top-left corner that centres a w×h box on the page */
export function centreXY(w: number, h: number) {
  const d = pageDims();
  return { x: ((d?.W ?? w) - w) / 2, y: ((d?.H ?? h) - h) / 2 };
}

export function addToPage(els: DesignElement | DesignElement[] | null | undefined) {
  if (!els) return;
  useEditor.getState().addElements(Array.isArray(els) ? els : [els]);
}

export type Maker = () => DesignElement | DesignElement[] | null;

/** A library tile: click adds at the page centre, drag drops at the pointer. */
export const LibTile = memo(function LibTile({
  make,
  tip,
  className,
  children,
  style,
}: {
  make: Maker;
  tip: string;
  className?: string;
  children: React.ReactNode;
  style?: React.CSSProperties;
}) {
  return (
    <button
      type="button"
      className={'tile lib-tile' + (className ? ' ' + className : '')}
      data-tip={tip}
      aria-label={tip}
      style={style}
      draggable
      onClick={() => addToPage(make())}
      onDragStart={(e) => {
        const r = make();
        if (!r) {
          e.preventDefault();
          return;
        }
        dragData(e, Array.isArray(r) ? { type: 'elements', elements: r } : { type: 'element', element: r });
      }}
    >
      <span className="lib-tile-inner">{children}</span>
    </button>
  );
});

export function PanelHead({ title, children, right }: { title: React.ReactNode; children?: React.ReactNode; right?: React.ReactNode }) {
  return (
    <div className="panel-head">
      <div className="row" style={{ justifyContent: 'space-between', minHeight: 24 }}>
        <h3>{title}</h3>
        {right}
      </div>
      {children}
    </div>
  );
}

export function SearchBox({ value, onChange, placeholder }: { value: string; onChange: (v: string) => void; placeholder: string }) {
  return (
    <div className="search panel-search">
      <Search size={15} />
      <input
        className="input"
        value={value}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Escape') onChange('');
          e.stopPropagation();
        }}
        spellCheck={false}
      />
      {value && (
        <button className="icon-btn sm clear" onClick={() => onChange('')} aria-label="Clear search">
          <X size={14} />
        </button>
      )}
    </div>
  );
}

/** Section header with an optional "See all" link */
export function SectionHead({ title, onSeeAll, count }: { title: React.ReactNode; onSeeAll?: () => void; count?: number }) {
  return (
    <div className="panel-section">
      <h4>
        {title}
        {count !== undefined && <span className="faint lib-count"> {count}</span>}
      </h4>
      {onSeeAll && <button onClick={onSeeAll}>See all</button>}
    </div>
  );
}

export function BackHead({ title, onBack }: { title: string; onBack: () => void }) {
  return (
    <div className="panel-back">
      <button className="icon-btn sm" onClick={onBack} aria-label="Back">
        <ChevronLeft size={16} />
      </button>
      <h4>{title}</h4>
    </div>
  );
}

export function EmptyState({ icon, title, children }: { icon: React.ReactNode; title: string; children?: React.ReactNode }) {
  return (
    <div className="panel-empty">
      <div className="panel-empty-icon">{icon}</div>
      <div className="panel-empty-title">{title}</div>
      {children && <div className="panel-empty-text">{children}</div>}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Uploads library (IndexedDB) shared by the Uploads and Background panels
// ---------------------------------------------------------------------------
export const UPLOADS_EVENT = 'kamva-uploads-changed';

export function useUploads(): UploadRecord[] | null {
  const [list, setList] = useState<UploadRecord[] | null>(null);
  useEffect(() => {
    let alive = true;
    const load = () =>
      idb
        .all<UploadRecord>('uploads')
        .then((all) => alive && setList(all.sort((a, b) => b.created - a.created)))
        .catch(() => alive && setList([]));
    void load();
    window.addEventListener(UPLOADS_EVENT, load);
    return () => {
      alive = false;
      window.removeEventListener(UPLOADS_EVENT, load);
    };
  }, []);
  return list;
}

const ensuring = new Map<string, ReturnType<typeof ensureUploadAsset>>();
/** ensureUploadAsset, deduplicated so overlapping calls for one record share the work */
export function ensureUpload(rec: UploadRecord) {
  let p = ensuring.get(rec.id);
  if (!p) {
    p = ensureUploadAsset(rec).finally(() => ensuring.delete(rec.id));
    ensuring.set(rec.id, p);
  }
  return p;
}

export function fmtDuration(sec?: number) {
  if (!sec || !isFinite(sec)) return '';
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${String(s).padStart(2, '0')}`;
}

/** "arrow-right" → "Arrow right" */
export function prettify(name: string) {
  const s = name.replace(/[-_]+/g, ' ').trim();
  return s.charAt(0).toUpperCase() + s.slice(1);
}
