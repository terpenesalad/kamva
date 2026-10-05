import { memo, useCallback, useMemo, useRef, useState } from 'react';
import { Eye, EyeOff, Group, Layers, Lock, LockOpen, Trash2, Ungroup, Minus, PenLine, Shapes, Type, Film, Image as ImageIcon, BarChart3, QrCode, Table2, Smile } from 'lucide-react';
import type { DesignElement } from '../../types';
import { useEditor } from '../../store/editor';
import { useShallow } from 'zustand/react/shallow';
import { getAsset } from '../../lib/assets';
import { shapePath } from '../../lib/shapes';
import { fillToCss } from '../../lib/color';
import { toggleHidden, groupSelection, ungroupSelection, deleteSelection } from '../elementActions';
import { EmptyState, PanelHead } from './common';

// a stable colour per group id
function groupColor(gid: string) {
  let h = 0;
  for (let i = 0; i < gid.length; i++) h = (h * 31 + gid.charCodeAt(i)) >>> 0;
  return `hsl(${h % 360} 70% 55%)`;
}

export function defaultName(el: DesignElement): string {
  if (el.name) return el.name;
  switch (el.type) {
    case 'text': {
      const words = el.text.replace(/\s+/g, ' ').trim().split(' ').slice(0, 6).join(' ');
      return words || 'Text';
    }
    case 'shape':
      return el.shape.replace(/([A-Z])/g, ' $1').replace(/^./, (c) => c.toUpperCase());
    case 'line':
      return el.end !== 'none' || el.start !== 'none' ? 'Arrow' : 'Line';
    case 'image':
      return el.assetId ? getAsset(el.assetId)?.meta.name || 'Image' : 'Frame';
    case 'video':
      return getAsset(el.assetId)?.meta.name || 'Video';
    case 'svg':
      return el.meta?.kind === 'qr' ? 'QR code' : el.meta?.kind === 'chart' ? 'Chart' : el.meta?.kind === 'table' ? 'Table' : el.meta?.icon || 'Graphic';
    case 'draw':
      return el.brush === 'highlighter' ? 'Highlight' : 'Drawing';
  }
}

const Thumb = memo(function Thumb({ el }: { el: DesignElement }) {
  switch (el.type) {
    case 'text': {
      const f = el.fill;
      return (
        <span className="layer-thumb text" style={{ fontFamily: `"${el.fontFamily}"`, fontWeight: el.fontWeight === 'bold' ? 700 : 400 }}>
          <span style={{ color: f.type === 'solid' ? f.color : undefined, background: f.type !== 'solid' ? fillToCss(f) : undefined, WebkitBackgroundClip: f.type !== 'solid' ? 'text' : undefined, WebkitTextFillColor: f.type !== 'solid' ? 'transparent' : undefined }}>
            {el.fontFamily === 'Segoe UI Emoji' ? el.text.slice(0, 2) : 'Aa'}
          </span>
        </span>
      );
    }
    case 'shape': {
      const r = Math.max(el.width, el.height);
      const w = (24 * el.width) / r;
      const h = (24 * el.height) / r;
      const id = `lg-${el.id}`;
      const f = el.fill;
      return (
        <span className="layer-thumb">
          <svg viewBox="-1 -1 26 26" width="24" height="24">
            {f.type !== 'solid' && (
              <defs>
                <linearGradient id={id}>
                  {f.stops.map((s, i) => (
                    <stop key={i} offset={s.offset} stopColor={s.color} />
                  ))}
                </linearGradient>
              </defs>
            )}
            <path
              transform={`translate(${(24 - w) / 2} ${(24 - h) / 2})`}
              d={shapePath(el.shape, w, h, (el.cornerRadius * 24) / r)}
              fill={f.type === 'solid' ? f.color : `url(#${id})`}
              stroke="var(--line-strong)"
              strokeWidth={0.75}
            />
          </svg>
        </span>
      );
    }
    case 'image':
    case 'video': {
      const a = getAsset(el.assetId);
      if (el.type === 'image' && a?.url && a.meta.kind === 'image')
        return (
          <span className="layer-thumb media">
            <img src={a.url} alt="" draggable={false} loading="lazy" />
          </span>
        );
      return <span className="layer-thumb">{el.type === 'video' ? <Film size={15} /> : <ImageIcon size={15} />}</span>;
    }
    case 'line':
      return (
        <span className="layer-thumb" style={{ color: el.stroke }}>
          <Minus size={16} strokeWidth={3} />
        </span>
      );
    case 'draw':
      return (
        <span className="layer-thumb" style={{ color: el.stroke }}>
          <PenLine size={15} />
        </span>
      );
    case 'svg': {
      const k = el.meta?.kind;
      return (
        <span className="layer-thumb">
          {k === 'qr' ? <QrCode size={15} /> : k === 'chart' ? <BarChart3 size={15} /> : k === 'table' ? <Table2 size={15} /> : k === 'icon' ? <Smile size={15} /> : <Shapes size={15} />}
        </span>
      );
    }
  }
  return (
    <span className="layer-thumb">
      <Type size={15} />
    </span>
  );
});

interface RowProps {
  el: DesignElement;
  index: number; // index in displayed (top-first) list
  selected: boolean;
  dropMark: 'above' | 'below' | null;
  onDragStart: (index: number) => void;
  onDragOverRow: (index: number, pos: 'above' | 'below') => void;
  onDrop: () => void;
}

const LayerRow = memo(function LayerRow({ el, index, selected, dropMark, onDragStart, onDragOverRow, onDrop }: RowProps) {
  const [editing, setEditing] = useState<string | null>(null);
  const name = defaultName(el);
  const commit = () => {
    if (editing !== null) {
      const n = editing.trim();
      useEditor.getState().updateElements([el.id], { name: n || undefined });
    }
    setEditing(null);
  };
  return (
    <div
      className={'layer-row' + (selected ? ' selected' : '') + (el.hidden ? ' is-hidden' : '') + (dropMark ? ' drop-' + dropMark : '')}
      draggable={editing === null}
      onDragStart={(e) => {
        e.dataTransfer.effectAllowed = 'move';
        e.dataTransfer.setData('text/x-kamva-layer', el.id);
        onDragStart(index);
      }}
      onDragOver={(e) => {
        if (!e.dataTransfer.types.includes('text/x-kamva-layer')) return;
        e.preventDefault();
        const r = e.currentTarget.getBoundingClientRect();
        onDragOverRow(index, e.clientY < r.top + r.height / 2 ? 'above' : 'below');
      }}
      onDrop={(e) => {
        e.preventDefault();
        onDrop();
      }}
      onClick={(e) => {
        if (editing !== null) return;
        useEditor.getState().select([el.id], e.shiftKey || e.ctrlKey || e.metaKey);
      }}
      onDoubleClick={() => setEditing(name)}
      title={el.locked ? `${name} (locked)` : name}
    >
      <span className="layer-group" style={el.groupId ? { background: groupColor(el.groupId) } : undefined} />
      <Thumb el={el} />
      {editing !== null ? (
        <input
          className="input layer-name-input"
          autoFocus
          value={editing}
          onChange={(e) => setEditing(e.target.value)}
          onBlur={commit}
          onClick={(e) => e.stopPropagation()}
          onKeyDown={(e) => {
            e.stopPropagation();
            if (e.key === 'Enter') commit();
            if (e.key === 'Escape') setEditing(null);
          }}
          onFocus={(e) => e.target.select()}
          aria-label="Layer name"
        />
      ) : (
        <span className="layer-name">{name}</span>
      )}
      <span className="layer-actions">
        <button
          className={'icon-btn sm' + (el.locked ? ' on' : '')}
          onClick={(e) => {
            e.stopPropagation();
            useEditor.getState().updateElements([el.id], { locked: !el.locked });
          }}
          aria-label={el.locked ? 'Unlock' : 'Lock'}
          data-tip={el.locked ? 'Unlock' : 'Lock'}
        >
          {el.locked ? <Lock size={14} /> : <LockOpen size={14} />}
        </button>
        <button
          className={'icon-btn sm' + (el.hidden ? ' on' : '')}
          onClick={(e) => {
            e.stopPropagation();
            toggleHidden(el.id);
          }}
          aria-label={el.hidden ? 'Show' : 'Hide'}
          data-tip={el.hidden ? 'Show' : 'Hide'}
        >
          {el.hidden ? <EyeOff size={14} /> : <Eye size={14} />}
        </button>
      </span>
    </div>
  );
});

export function LayersPanel() {
  const elements = useEditor((s) => (s.design?.pages.find((p) => p.id === s.activePageId) || s.design?.pages[0])?.elements);
  const selection = useEditor(useShallow((s) => s.selection));
  const selSet = useMemo(() => new Set(selection), [selection]);
  const list = useMemo(() => (elements ? [...elements].reverse() : []), [elements]);
  const dragFrom = useRef<number | null>(null);
  const [over, setOver] = useState<{ index: number; pos: 'above' | 'below' } | null>(null);

  const selEls = list.filter((e) => selSet.has(e.id));
  const canGroup = selEls.length > 1 && !(selEls.every((e) => e.groupId && e.groupId === selEls[0].groupId));
  const canUngroup = selEls.some((e) => e.groupId);

  const overRef = useRef(over);
  overRef.current = over;
  const listRef = useRef(list);
  listRef.current = list;

  const onDragStartRow = useCallback((idx: number) => {
    dragFrom.current = idx;
  }, []);
  const onDragOverRow = useCallback((idx: number, pos: 'above' | 'below') => {
    setOver((o) => (o && o.index === idx && o.pos === pos ? o : { index: idx, pos }));
  }, []);
  const onDrop = useCallback(() => {
    const from = dragFrom.current;
    const o = overRef.current;
    const list = listRef.current;
    dragFrom.current = null;
    setOver(null);
    if (from === null || !o) return;
    const n = list.length;
    // displayed index → target displayed position after removal
    let to = o.index + (o.pos === 'below' ? 1 : 0);
    if (from < to) to -= 1;
    if (to === from) return;
    // displayed index d (top-most first) is array index n-1-d in the final list
    const arrayIndex = n - 1 - to;
    useEditor.getState().moveElementTo(list[from].id, arrayIndex);
  }, []);

  return (
    <>
      <PanelHead title="Layers" right={<span className="faint small">{list.length ? `${list.length} ${list.length === 1 ? 'layer' : 'layers'}` : ''}</span>} />
      <div
        className="panel-body layers-body"
        onDragLeave={(e) => {
          if (!e.currentTarget.contains(e.relatedTarget as Node)) setOver(null);
        }}
        onClick={(e) => {
          if (e.target === e.currentTarget) useEditor.getState().select([]);
        }}
      >
        {!list.length ? (
          <EmptyState icon={<Layers size={28} />} title="This page is empty">
            Elements you add to the page appear here, top-most first.
          </EmptyState>
        ) : (
          list.map((el, i) => (
            <LayerRow
              key={el.id}
              el={el}
              index={i}
              selected={selSet.has(el.id)}
              dropMark={over && over.index === i ? over.pos : null}
              onDragStart={onDragStartRow}
              onDragOverRow={onDragOverRow}
              onDrop={onDrop}
            />
          ))
        )}
      </div>
      <div className="panel-foot">
        <button className="btn sm ghost" disabled={!canGroup} onClick={groupSelection} data-tip="Group" data-tip-side="top">
          <Group size={15} /> Group
        </button>
        <button className="btn sm ghost" disabled={!canUngroup} onClick={ungroupSelection} data-tip="Ungroup" data-tip-side="top">
          <Ungroup size={15} /> Ungroup
        </button>
        <span className="spacer" />
        <button className="icon-btn sm" disabled={!selection.length} onClick={deleteSelection} aria-label="Delete selection" data-tip="Delete" data-tip-side="top">
          <Trash2 size={15} />
        </button>
      </div>
    </>
  );
}
