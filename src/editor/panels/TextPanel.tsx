import { memo, useMemo, useState } from 'react';
import { Plus, SearchX } from 'lucide-react';
import type { DesignElement, TextElement } from '../../types';
import { makeText, uid } from '../../lib/defaults';
import { FONT_COMBOS } from '../../lib/fonts';
import { useActiveKit } from '../../store/ui';
import { addText } from '../elementActions';
import { dragData } from '../dnd';
import { EmptyState, LibTile, PanelHead, SearchBox, SectionHead, pageDims } from './common';

type Kind = 'heading' | 'subheading' | 'body';
const KIND_TEXT: Record<Kind, string> = { heading: 'Add a heading', subheading: 'Add a subheading', body: 'Add a little bit of body text' };

/** Same sizing as addText, but returns the element without adding it (used for drag and drop) */
function makeKindText(kind: Kind, fontFamily?: string): TextElement | null {
  const d = pageDims();
  if (!d) return null;
  const size = kind === 'heading' ? d.S * 0.085 : kind === 'subheading' ? d.S * 0.05 : d.S * 0.032;
  const text = KIND_TEXT[kind];
  const w = Math.min(d.W * 0.8, Math.max(size * text.length * 0.55, size * 4));
  return makeText(text, (d.W - w) / 2, d.H / 2 - size * 0.65, w, {
    fontSize: Math.round(size),
    fontWeight: kind === 'body' ? 'normal' : 'bold',
    fontFamily: fontFamily || (kind === 'body' ? 'Inter' : 'Montserrat'),
    role: kind,
    name: kind === 'heading' ? 'Heading' : kind === 'subheading' ? 'Subheading' : 'Body text',
  });
}

function KindButton({ kind, font, className, label }: { kind: Kind; font?: string; className: string; label?: string }) {
  return (
    <button
      className={'text-add ' + className}
      style={font ? { fontFamily: `"${font}"` } : undefined}
      draggable
      onClick={() => addText(kind, font)}
      onDragStart={(e) => {
        const el = makeKindText(kind, font);
        if (el) dragData(e, { type: 'element', element: el });
      }}
    >
      {label ?? KIND_TEXT[kind]}
    </button>
  );
}

// ---------------------------------------------------------------- font combinations
function makeCombo(c: (typeof FONT_COMBOS)[number]): DesignElement[] | null {
  const d = pageDims();
  if (!d) return null;
  const hs = Math.round(d.S * 0.08);
  const bs = Math.round(d.S * 0.03);
  const w = Math.min(d.W * 0.8, d.S * 0.75);
  const gap = hs * 0.35;
  const total = hs * 1.25 + gap + bs * 1.4 * 2;
  const y0 = (d.H - total) / 2;
  const x = (d.W - w) / 2;
  const groupId = uid();
  const head = makeText(c.name, x, y0, w, {
    fontFamily: c.heading,
    fontSize: hs,
    fontWeight: c.headingWeight ?? 'normal',
    lineHeight: 1.15,
    role: 'heading',
    name: `${c.name} heading`,
    groupId,
  });
  const body = makeText('Pair a striking heading with easy-to-read body text.', x, y0 + hs * 1.25 + gap, w, {
    fontFamily: c.body,
    fontSize: bs,
    lineHeight: 1.4,
    fill: { type: 'solid', color: '#4b5563' },
    role: 'body',
    name: `${c.name} body`,
    groupId,
  });
  return [head, body];
}

const ComboCard = memo(function ComboCard({ c }: { c: (typeof FONT_COMBOS)[number] }) {
  return (
    <LibTile make={() => makeCombo(c)} tip={`${c.heading} and ${c.body}`} className="text-card combo-card">
      <span className="combo-head" style={{ fontFamily: `"${c.heading}"`, fontWeight: c.headingWeight === 'bold' ? 700 : 400 }}>
        {c.name}
      </span>
      <span className="combo-body" style={{ fontFamily: `"${c.body}"` }}>
        {c.heading} · {c.body}
      </span>
    </LibTile>
  );
});

// ---------------------------------------------------------------- styled text presets
interface StylePreset {
  id: string;
  label: string;
  text: string;
  preview: React.CSSProperties;
  dark?: boolean;
  curved?: boolean;
  make: (fs: number) => Partial<TextElement>;
}

const STYLES: StylePreset[] = [
  {
    id: 'outline',
    label: 'Outlined',
    text: 'OUTLINE',
    preview: { fontFamily: '"Anton"', color: '#ffffff', WebkitTextStroke: '1.5px #111827', paintOrder: 'stroke fill', letterSpacing: 1 },
    make: (fs) => ({
      fontFamily: 'Anton',
      fill: { type: 'solid', color: '#ffffff' },
      effect: { type: 'outline', color: '#111827', size: Math.max(2, fs * 0.06), offset: 0 },
      letterSpacing: fs * 0.02,
    }),
  },
  {
    id: 'neon',
    label: 'Neon',
    text: 'Neon',
    dark: true,
    preview: { fontFamily: '"Pacifico"', color: '#fff2fd', textShadow: '0 0 4px #ff2bd6, 0 0 10px #ff2bd6, 0 0 18px #ff2bd6' },
    make: (fs) => ({ fontFamily: 'Pacifico', fill: { type: 'solid', color: '#fff2fd' }, effect: { type: 'neon', color: '#ff2bd6', size: Math.max(3, fs * 0.08), offset: 0 } }),
  },
  {
    id: 'highlight',
    label: 'Highlighted',
    text: 'Highlight',
    preview: { fontFamily: '"Poppins"', fontWeight: 700, color: '#111827', background: '#ffd166', padding: '0 6px', borderRadius: 4 },
    make: (fs) => ({
      fontFamily: 'Poppins',
      fontWeight: 'bold',
      fill: { type: 'solid', color: '#111827' },
      effect: { type: 'highlight', color: '#ffd166', size: Math.max(2, fs * 0.08), offset: fs * 0.12 },
    }),
  },
  {
    id: 'curved',
    label: 'Curved',
    text: 'Curved text here',
    curved: true,
    preview: { fontFamily: '"Montserrat"', fontWeight: 700 },
    make: () => ({ fontFamily: 'Montserrat', fontWeight: 'bold', curve: 55, fill: { type: 'solid', color: '#1f2937' } }),
  },
  {
    id: 'gradient',
    label: 'Gradient',
    text: 'Gradient',
    preview: {
      fontFamily: '"Archivo Black"',
      background: 'linear-gradient(90deg, #7c5cff, #ff6b6b)',
      WebkitBackgroundClip: 'text',
      backgroundClip: 'text',
      color: 'transparent',
    },
    make: () => ({
      fontFamily: 'Archivo Black',
      fill: { type: 'linear', angle: 0, stops: [{ offset: 0, color: '#7c5cff' }, { offset: 1, color: '#ff6b6b' }] },
    }),
  },
  {
    id: 'echo',
    label: 'Echo',
    text: 'Echo',
    preview: { fontFamily: '"Bebas Neue"', color: '#1f2937', textShadow: '3px 3px 0 rgba(255,107,107,0.6), 6px 6px 0 rgba(255,107,107,0.3)', letterSpacing: 1 },
    make: (fs) => ({ fontFamily: 'Bebas Neue', fill: { type: 'solid', color: '#1f2937' }, effect: { type: 'echo', color: '#ff6b6b', size: 4, offset: fs * 0.08 } }),
  },
  {
    id: 'lift',
    label: 'Lifted',
    text: 'Lifted',
    preview: { fontFamily: '"DM Serif Display"', color: '#1f2937', textShadow: '0 4px 8px rgba(0,0,0,0.35)' },
    make: (fs) => ({ fontFamily: 'DM Serif Display', fill: { type: 'solid', color: '#1f2937' }, effect: { type: 'lift', color: '#000000', size: Math.max(2, fs * 0.08), offset: 0 } }),
  },
  {
    id: 'splice',
    label: 'Retro splice',
    text: 'Retro',
    preview: { fontFamily: '"Righteous"', color: 'transparent', WebkitTextStroke: '1.2px #e63946', textShadow: '3px 3px 0 #ffb703' },
    make: (fs) => ({ fontFamily: 'Righteous', fill: { type: 'solid', color: '#e63946' }, effect: { type: 'splice', color: '#ffb703', size: Math.max(2, fs * 0.05), offset: fs * 0.1 } }),
  },
];

function makeStyled(p: StylePreset): TextElement | null {
  const d = pageDims();
  if (!d) return null;
  const fs = Math.round(d.S * (p.curved ? 0.06 : 0.11));
  const w = Math.min(d.W * 0.85, Math.max(fs * p.text.length * 0.62, fs * 3));
  const el = makeText(p.text, 0, 0, w, { fontSize: fs, name: `${p.label} text`, role: 'heading', ...p.make(fs) });
  el.x = (d.W - w) / 2;
  el.y = (d.H - el.height) / 2;
  return el;
}

const StyleCard = memo(function StyleCard({ p }: { p: StylePreset }) {
  return (
    <LibTile make={() => makeStyled(p)} tip={p.label} className={'text-card style-card' + (p.dark ? ' dark' : '')}>
      {p.curved ? (
        <svg viewBox="0 0 120 60" width="100%" height="100%" className="curve-preview">
          <path id={`tp-${p.id}`} d="M12,48 Q60,4 108,48" fill="none" />
          <text style={p.preview as React.CSSProperties} fontSize="13" textAnchor="middle">
            <textPath href={`#tp-${p.id}`} startOffset="50%">
              {p.text}
            </textPath>
          </text>
        </svg>
      ) : (
        <span className="style-sample" style={p.preview}>
          {p.text}
        </span>
      )}
    </LibTile>
  );
});

// ---------------------------------------------------------------- panel
export function TextPanel() {
  const kit = useActiveKit();
  const [q, setQ] = useState('');
  const t = q.trim().toLowerCase();
  const combos = useMemo(
    () => (t ? FONT_COMBOS.filter((c) => [c.name, c.heading, c.body].some((s) => s.toLowerCase().includes(t))) : FONT_COMBOS),
    [t],
  );
  const styles = useMemo(() => (t ? STYLES.filter((s) => s.label.toLowerCase().includes(t)) : STYLES), [t]);

  return (
    <>
      <PanelHead title="Text">
        <SearchBox value={q} onChange={setQ} placeholder="Search fonts and combinations" />
      </PanelHead>
      <div className="panel-body">
        {!t && (
          <>
            <button
              className="btn primary block text-box-btn"
              onClick={() => addText('body', undefined, { text: 'Your text here', name: 'Text box' } as any)}
            >
              <Plus size={16} /> Add a text box
            </button>
            <div className="col text-adds">
              <KindButton kind="heading" className="h" />
              <KindButton kind="subheading" className="s" />
              <KindButton kind="body" className="b" />
            </div>

            <SectionHead title="Brand fonts" />
            <div className="col text-adds brand">
              <KindButton kind="heading" font={kit.fonts.heading} className="h sm" label={kit.fonts.heading} />
              <KindButton kind="subheading" font={kit.fonts.subheading} className="s sm" label={kit.fonts.subheading} />
              <KindButton kind="body" font={kit.fonts.body} className="b sm" label={kit.fonts.body} />
            </div>
          </>
        )}

        {styles.length > 0 && (
          <>
            <SectionHead title="Text styles" />
            <div className="tile-grid cols-2">
              {styles.map((p) => (
                <StyleCard key={p.id} p={p} />
              ))}
            </div>
          </>
        )}

        {combos.length > 0 && (
          <>
            <SectionHead title="Font combinations" />
            <div className="tile-grid cols-2">
              {combos.map((c) => (
                <ComboCard key={c.name} c={c} />
              ))}
            </div>
          </>
        )}

        {t && !combos.length && !styles.length && (
          <EmptyState icon={<SearchX size={28} />} title={`Nothing matches “${q.trim()}”`}>
            Try a font name like “Montserrat” or a style like “neon”.
          </EmptyState>
        )}
      </div>
    </>
  );
}
