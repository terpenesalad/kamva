import { useDeferredValue, useMemo, useState } from 'react';
import { SearchX } from 'lucide-react';
import { EMOJI } from './emoji';
import { BackHead, EmptyState, PanelHead, SearchBox, SectionHead } from './common';
import {
  ChartGrid,
  EmojiGrid,
  FRAME_LIST,
  FrameGrid,
  GradientGrid,
  IconGrid,
  LINE_PRESETS,
  LineGrid,
  PRESET_GRADIENTS,
  SHAPE_LIST,
  ShapeGrid,
  TableGrid,
  searchEmoji,
  searchIcons,
  useIcons,
} from './library';

type Sec = 'shapes' | 'lines' | 'frames' | 'gradients' | 'icons' | 'stickers' | 'charts' | 'tables';

const TITLES: Record<Sec, string> = {
  shapes: 'Shapes',
  lines: 'Lines and arrows',
  frames: 'Frames',
  gradients: 'Gradients',
  icons: 'Icons',
  stickers: 'Stickers',
  charts: 'Charts',
  tables: 'Tables',
};

export function ElementsPanel() {
  const [q, setQ] = useState('');
  const [open, setOpen] = useState<Sec | null>(null);
  const dq = useDeferredValue(q.trim().toLowerCase());
  const icons = useIcons();

  const shapes = useMemo(() => (dq ? SHAPE_LIST.filter((s) => s.label.toLowerCase().includes(dq) || s.kind.toLowerCase().includes(dq)) : SHAPE_LIST), [dq]);
  const frames = useMemo(() => (dq ? FRAME_LIST.filter((s) => s.label.toLowerCase().includes(dq) || 'frame'.includes(dq)) : FRAME_LIST), [dq]);
  const lines = useMemo(() => (dq ? LINE_PRESETS.filter((l) => l.label.toLowerCase().includes(dq) || 'line arrow'.includes(dq)) : LINE_PRESETS), [dq]);
  const iconHits = useMemo(() => (icons ? searchIcons(icons, dq) : []), [icons, dq]);
  const emoji = useMemo(() => searchEmoji(dq), [dq]);

  const content = () => {
    if (open) {
      return (
        <>
          <BackHead title={TITLES[open]} onBack={() => setOpen(null)} />
          {open === 'shapes' && <ShapeGrid items={shapes} />}
          {open === 'lines' && <LineGrid items={lines} />}
          {open === 'frames' && (
            <>
              <p className="panel-hint">Drop a photo onto a frame to fill it.</p>
              <FrameGrid items={frames} />
            </>
          )}
          {open === 'gradients' && <GradientGrid items={PRESET_GRADIENTS} />}
          {open === 'icons' && (icons ? <IconGrid items={iconHits} /> : <div className="panel-loading">Loading icons…</div>)}
          {open === 'stickers' && <EmojiGrid items={emoji} />}
          {open === 'charts' && <ChartGrid />}
          {open === 'tables' && <TableGrid />}
        </>
      );
    }

    if (dq) {
      const any = shapes.length + frames.length + lines.length + iconHits.length + emoji.length;
      if (!any && icons) {
        return (
          <EmptyState icon={<SearchX size={28} />} title={`No elements match “${q.trim()}”`}>
            Try a simpler word like “arrow”, “star” or “heart”.
          </EmptyState>
        );
      }
      return (
        <>
          {shapes.length > 0 && (
            <>
              <SectionHead title="Shapes" count={shapes.length} onSeeAll={shapes.length > 8 ? () => setOpen('shapes') : undefined} />
              <ShapeGrid items={shapes.slice(0, 8)} />
            </>
          )}
          {lines.length > 0 && (
            <>
              <SectionHead title="Lines and arrows" count={lines.length} onSeeAll={lines.length > 4 ? () => setOpen('lines') : undefined} />
              <LineGrid items={lines.slice(0, 4)} />
            </>
          )}
          {frames.length > 0 && (
            <>
              <SectionHead title="Frames" count={frames.length} onSeeAll={frames.length > 4 ? () => setOpen('frames') : undefined} />
              <FrameGrid items={frames.slice(0, 4)} />
            </>
          )}
          {emoji.length > 0 && (
            <>
              <SectionHead title="Stickers" count={emoji.length} onSeeAll={emoji.length > 12 ? () => setOpen('stickers') : undefined} />
              <EmojiGrid items={emoji} limit={12} />
            </>
          )}
          <SectionHead title="Icons" count={icons ? iconHits.length : undefined} />
          {!icons ? <div className="panel-loading">Loading icons…</div> : iconHits.length ? <IconGrid items={iconHits} /> : <p className="panel-hint">No icons match.</p>}
        </>
      );
    }

    return (
      <>
        <SectionHead title="Shapes" onSeeAll={() => setOpen('shapes')} />
        <ShapeGrid items={SHAPE_LIST.slice(0, 8)} />
        <SectionHead title="Lines and arrows" onSeeAll={() => setOpen('lines')} />
        <LineGrid items={LINE_PRESETS.slice(0, 4)} />
        <SectionHead title="Frames" onSeeAll={() => setOpen('frames')} />
        <FrameGrid items={FRAME_LIST.slice(0, 4)} />
        <SectionHead title="Gradients" onSeeAll={() => setOpen('gradients')} />
        <GradientGrid items={PRESET_GRADIENTS.slice(0, 4)} />
        <SectionHead title="Icons" onSeeAll={() => setOpen('icons')} />
        {icons ? <IconGrid items={iconHits} limit={10} /> : <div className="panel-loading">Loading icons…</div>}
        <SectionHead title="Stickers" onSeeAll={() => setOpen('stickers')} />
        <EmojiGrid items={EMOJI} limit={12} />
        <SectionHead title="Charts" onSeeAll={() => setOpen('charts')} />
        <ChartGrid limit={3} />
        <SectionHead title="Tables" />
        <TableGrid />
      </>
    );
  };

  return (
    <>
      <PanelHead title="Elements">
        <SearchBox
          value={q}
          onChange={setQ}
          placeholder="Search shapes, icons and stickers"
        />
      </PanelHead>
      <div className="panel-body">{content()}</div>
    </>
  );
}
