import { useEffect, useRef, useState } from 'react';
import { ChevronUp, EyeOff, Pause, Play, Plus } from 'lucide-react';
import type { Design, Page } from '../../types';
import { useEditor, totalDuration } from '../../store/editor';
import { useUI, usePrefs } from '../../store/ui';
import { newPage } from '../../lib/defaults';
import { ContextMenu } from '../../components/ui';
import { usePageThumb, useInView } from './thumbs';
import { fmtDur, goToPage, pageMenuItems, pointerDrag } from './common';

const THUMB_H = 64;

export function PagesStrip({ design }: { design: Design }) {
  const activeId = useEditor((s) => s.activePageId);
  const playing = useUI((s) => s.playing);
  const [menu, setMenu] = useState<{ x: number; y: number; id: string } | null>(null);
  const [renaming, setRenaming] = useState<string | null>(null);
  const [drag, setDrag] = useState<{ id: string; insert: number } | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const aspect = design.width / design.height;
  const cardW = Math.round(Math.max(36, Math.min(150, THUMB_H * aspect)));
  const total = totalDuration(design);

  // keep the active page in view
  useEffect(() => {
    const el = scrollRef.current?.querySelector<HTMLElement>(`[data-page="${activeId}"]`);
    el?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  }, [activeId]);

  const startDrag = (e: React.PointerEvent, page: Page) => {
    if (e.button !== 0 || renaming) return;
    const scroller = scrollRef.current;
    if (!scroller) return;
    const from = design.pages.findIndex((p) => p.id === page.id);
    let insert = from;
    let started = false;
    pointerDrag(
      e,
      (_dx, _dy, ev) => {
        if (!started) {
          if (Math.abs(_dx) < 5) return;
          started = true;
        }
        // auto-scroll near the edges
        const sr = scroller.getBoundingClientRect();
        if (ev.clientX < sr.left + 32) scroller.scrollLeft -= 10;
        else if (ev.clientX > sr.right - 32) scroller.scrollLeft += 10;
        const cards = [...scroller.querySelectorAll<HTMLElement>('.strip-card[data-page]')];
        insert = cards.length;
        for (let i = 0; i < cards.length; i++) {
          const r = cards[i].getBoundingClientRect();
          if (ev.clientX < r.left + r.width / 2) {
            insert = i;
            break;
          }
        }
        setDrag({ id: page.id, insert });
      },
      (moved) => {
        setDrag(null);
        if (!started || !moved) {
          goToPage(page.id);
          return;
        }
        const to = insert > from ? insert - 1 : insert;
        if (to !== from) useEditor.getState().movePage(page.id, to);
      },
      'grabbing',
    );
  };

  const addAtEnd = () => {
    const p = newPage();
    p.duration = usePrefs.getState().pageDurationDefault || 5;
    // continue the look of the last page's plain background colour
    const last = design.pages[design.pages.length - 1];
    if (last && last.background.fill.type === 'solid' && !last.background.assetId) p.background.fill = { ...last.background.fill };
    useEditor.getState().addPage(last?.id, p);
  };

  return (
    <div className="strip">
      <div className="strip-side">
        <button
          className="icon-btn sm"
          onClick={() => useUI.getState().setPlaying(!playing)}
          disabled={total <= 0}
          data-tip={playing ? 'Pause' : 'Play'}
          data-tip-side="right"
          aria-label={playing ? 'Pause' : 'Play'}
        >
          {playing ? <Pause size={15} /> : <Play size={15} />}
        </button>
        <button className="icon-btn sm" onClick={() => useUI.getState().setTimelineOpen(true)} data-tip="Show timeline" data-tip-side="right" aria-label="Show timeline">
          <ChevronUp size={16} />
        </button>
      </div>
      <div className="strip-scroll" ref={scrollRef}>
        {design.pages.map((p, i) => (
          <StripCard
            key={p.id}
            design={design}
            page={p}
            index={i}
            width={cardW}
            active={p.id === activeId}
            dragging={drag?.id === p.id}
            insertBefore={!!drag && drag.insert === i && drag.id !== p.id}
            renaming={renaming === p.id}
            onPointerDown={(e) => startDrag(e, p)}
            onContextMenu={(e) => {
              e.preventDefault();
              setMenu({ x: e.clientX, y: e.clientY, id: p.id });
            }}
            onRenameDone={(name) => {
              setRenaming(null);
              if (name !== null)
                useEditor.getState().updatePage(p.id, (pg) => {
                  pg.name = name.trim() || undefined;
                });
            }}
          />
        ))}
        {drag && drag.insert === design.pages.length && <div className="strip-insert end" />}
        <button className="strip-add" style={{ width: Math.max(44, Math.min(cardW, 64)) }} onClick={addAtEnd} data-tip="Add page" data-tip-side="top" aria-label="Add page">
          <Plus size={18} />
        </button>
      </div>
      {menu && (
        <ContextMenu
          x={menu.x}
          y={menu.y}
          items={pageMenuItems(menu.id, () => setRenaming(menu.id))}
          onClose={() => setMenu(null)}
        />
      )}
    </div>
  );
}

function StripCard(props: {
  design: Design;
  page: Page;
  index: number;
  width: number;
  active: boolean;
  dragging: boolean;
  insertBefore: boolean;
  renaming: boolean;
  onPointerDown: (e: React.PointerEvent) => void;
  onContextMenu: (e: React.MouseEvent) => void;
  onRenameDone: (name: string | null) => void;
}) {
  const { design, page, index, width, active, dragging, insertBefore, renaming } = props;
  const [ref, inView] = useInView<HTMLDivElement>();
  const thumb = usePageThumb(design, page, inView);
  return (
    <div
      ref={ref}
      data-page={page.id}
      className={'strip-card' + (active ? ' active' : '') + (page.hidden ? ' hidden-page' : '') + (dragging ? ' dragging' : '')}
      style={{ width }}
      onPointerDown={props.onPointerDown}
      onContextMenu={props.onContextMenu}
      onDoubleClick={() => useUI.getState().setTimelineOpen(true)}
      title={page.name || `Page ${index + 1}`}
    >
      {insertBefore && <div className="strip-insert" />}
      <div className="strip-thumb" style={{ height: THUMB_H }}>
        {thumb ? <img src={thumb} alt="" draggable={false} /> : <div className="strip-ph" />}
        <span className="strip-num">{index + 1}</span>
        {page.hidden && (
          <span className="strip-hidden" title="Hidden from playback and export">
            <EyeOff size={12} />
          </span>
        )}
        <span className="strip-dur">{fmtDur(page.duration)}</span>
      </div>
      {renaming ? (
        <RenameInput initial={page.name || ''} placeholder={`Page ${index + 1}`} onDone={props.onRenameDone} />
      ) : (
        <div className={'strip-name' + (page.name ? '' : ' empty')}>{page.name || `Page ${index + 1}`}</div>
      )}
    </div>
  );
}

export function RenameInput({ initial, placeholder, onDone }: { initial: string; placeholder?: string; onDone: (v: string | null) => void }) {
  const [v, setV] = useState(initial);
  const done = useRef(false);
  const finish = (val: string | null) => {
    if (done.current) return;
    done.current = true;
    onDone(val);
  };
  return (
    <input
      className="strip-rename"
      autoFocus
      value={v}
      placeholder={placeholder}
      onFocus={(e) => e.target.select()}
      onPointerDown={(e) => e.stopPropagation()}
      onChange={(e) => setV(e.target.value)}
      onBlur={() => finish(v)}
      onKeyDown={(e) => {
        e.stopPropagation();
        if (e.key === 'Enter') finish(v);
        if (e.key === 'Escape') finish(null);
      }}
    />
  );
}
