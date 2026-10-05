import { useEffect, useRef } from 'react';
import { X, Scaling, Eraser } from 'lucide-react';
import type { DesignElement, Page, Unit } from '../../types';
import { useEditor, useActivePage, useSelectedElements } from '../../store/editor';
import { useUI } from '../../store/ui';
import { NumberField } from '../../components/ui';
import { ColorButton } from '../../components/ColorPicker';
import { TRANSITIONS } from '../../lib/render/animation';
import { fromPx, toPx } from '../../lib/units';
import { useInspectorNav } from './nav';
import { Field, S, UNIT_DECIMALS, UNIT_STEP } from './fields';
import { PositionSection } from './PositionSection';
import { TextSection, EffectsSection } from './TextSections';
import { PhotoSection, VideoSection } from './MediaSections';
import { ColorsSection, ChartSection, TableSection, QrSection } from './SvgSections';
import { ShapeSection, LineSection, DrawSection, AppearanceSection, AnimationSection, LinkSection } from './MiscSections';
import './inspector.css';

let handled = 0;

export function Inspector() {
  const els = useSelectedElements();
  const page = useActivePage();
  const design = useEditor((s) => s.design);
  const req = useInspectorNav((s) => s.req);
  const scroller = useRef<HTMLDivElement>(null);

  // Scroll to / focus a requested section
  useEffect(() => {
    if (!req || req.n === handled) return;
    let tries = 0;
    const run = () => {
      const root = scroller.current;
      const sec = root?.querySelector(`[data-section="${req.section}"]`) as HTMLElement | null;
      if (!sec) {
        if (tries++ < 6) requestAnimationFrame(run);
        else handled = req.n;
        return;
      }
      handled = req.n;
      sec.scrollIntoView({ block: 'start', behavior: 'smooth' });
      if (req.focus) {
        const f = root!.querySelector(`[data-focus="${req.focus}"]`) as HTMLElement | null;
        if (f) {
          f.focus({ preventScroll: true });
          if (f instanceof HTMLInputElement || f instanceof HTMLTextAreaElement) f.select();
        }
      }
    };
    requestAnimationFrame(run);
  }, [req, els]);

  if (!design || !page) return <aside className="inspector" />;

  return (
    <aside className="inspector">
      <div className="insp-head">
        <h3>{els.length ? selectionTitle(els) : page.name || `Page ${design.pages.findIndex((p) => p.id === page.id) + 1}`}</h3>
        <button className="icon-btn sm" onClick={() => useUI.getState().setInspectorOpen(false)} aria-label="Close properties" data-tip="Close">
          <X size={16} />
        </button>
      </div>
      <div className="insp-scroll" ref={scroller}>
        {els.length ? <ElementProps els={els} /> : <PageProps page={page} />}
      </div>
    </aside>
  );
}

function selectionTitle(els: DesignElement[]): string {
  if (els.length > 1) {
    const g = els[0].groupId;
    if (g && els.every((e) => e.groupId === g)) return `Group of ${els.length}`;
    return `${els.length} elements`;
  }
  const el = els[0];
  if (el.name) return el.name;
  switch (el.type) {
    case 'text':
      return 'Text';
    case 'shape':
      return 'Shape';
    case 'image':
      return el.assetId ? 'Photo' : 'Frame';
    case 'video':
      return 'Video';
    case 'line':
      return 'Line';
    case 'draw':
      return 'Drawing';
    case 'svg':
      return {
        icon: 'Icon',
        qr: 'QR code',
        chart: 'Chart',
        table: 'Table',
        svg: 'Graphic',
      }[el.meta?.kind || 'svg'];
  }
}

// ---------------------------------------------------------------------------
// Element properties
// ---------------------------------------------------------------------------
function ElementProps({ els }: { els: DesignElement[] }) {
  const single = els.length === 1 ? els[0] : null;
  const allText = els.every((e) => e.type === 'text');
  const kind = single?.type === 'svg' ? single.meta?.kind || 'svg' : null;
  return (
    <>
      {allText && <TextSection els={els as any} />}
      {allText && <EffectsSection els={els as any} />}
      {single?.type === 'shape' && <ShapeSection el={single} />}
      {single && (single.type === 'image' || single.type === 'video') && <PhotoSection el={single} />}
      {single?.type === 'video' && <VideoSection el={single} />}
      {single?.type === 'svg' && (kind === 'svg' || kind === 'icon') && <ColorsSection el={single} />}
      {single?.type === 'svg' && kind === 'chart' && <ChartSection el={single} />}
      {single?.type === 'svg' && kind === 'table' && <TableSection el={single} />}
      {single?.type === 'svg' && kind === 'qr' && <QrSection el={single} />}
      {single?.type === 'line' && <LineSection el={single} />}
      {single?.type === 'draw' && <DrawSection el={single} />}
      <PositionSection els={els} />
      <AppearanceSection els={els} />
      <AnimationSection els={els} />
      {single && <LinkSection el={single} />}
    </>
  );
}

// ---------------------------------------------------------------------------
// Page & design properties (nothing selected)
// ---------------------------------------------------------------------------
const UNITS: { value: Unit; label: string }[] = [
  { value: 'px', label: 'px' },
  { value: 'in', label: 'in' },
  { value: 'mm', label: 'mm' },
  { value: 'cm', label: 'cm' },
];

function PageProps({ page }: { page: Page }) {
  const design = useEditor((s) => s.design)!;
  const st = useEditor.getState();
  const u = design.unit;
  const dpi = design.dpi || 96;
  // whole millimetres for page sizes, matching formatSize (A4 at 96 dpi is 793.7 px)
  const dec = u === 'mm' ? 0 : UNIT_DECIMALS[u];
  const upd = (fn: (p: Page) => void, key?: string) => st.updatePage(page.id, fn, key ? `${key}:${page.id}` : undefined);
  // Page size edits keep elements where they are (use Resize… to scale content)
  const setSize = (w: number, h: number) => {
    const W = Math.max(1, Math.min(20000, Math.round(toPx(w, u, dpi))));
    const H = Math.max(1, Math.min(20000, Math.round(toPx(h, u, dpi))));
    if (W === design.width && H === design.height) return;
    st.update(
      (d) => {
        d.width = W;
        d.height = H;
      },
      { coalesce: 'design-size' },
    );
    useUI.setState({ fit: true, zoom: useUI.getState().zoom + 1e-6 });
  };

  return (
    <>
      <S id="design" title="Design">
        <Field label="Name">
          <input
            className="input"
            key={design.id + design.name}
            defaultValue={design.name}
            onBlur={(e) => {
              const v = e.target.value.trim() || 'Untitled design';
              if (v !== design.name) st.update((d) => void (d.name = v));
            }}
            onKeyDown={(e) => {
              e.stopPropagation();
              if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
            }}
          />
        </Field>
        <Field label="Size">
          <div className="insp-size-row">
            <NumberField
              label="W"
              value={fromPx(design.width, u, dpi)}
              decimals={dec}
              step={UNIT_STEP[u]}
              min={UNIT_STEP[u]}
              onChange={(v) => setSize(v, fromPx(design.height, u, dpi))}
            />
            <NumberField
              label="H"
              value={fromPx(design.height, u, dpi)}
              decimals={dec}
              step={UNIT_STEP[u]}
              min={UNIT_STEP[u]}
              onChange={(v) => setSize(fromPx(design.width, u, dpi), v)}
            />
            <select className="select" value={u} onChange={(e) => st.update((d) => void (d.unit = e.target.value as Unit))} aria-label="Unit">
              {UNITS.map((x) => (
                <option key={x.value} value={x.value}>
                  {x.label}
                </option>
              ))}
            </select>
          </div>
        </Field>
        <div className="grid2">
          <Field label="Resolution">
            <NumberField
              value={dpi}
              min={36}
              max={1200}
              unit="dpi"
              onChange={(v) =>
                st.update((d) => void (d.dpi = Math.round(v)), {
                  coalesce: 'dpi',
                })
              }
            />
          </Field>
          <Field label="Frame rate">
            <select className="select" value={design.fps} onChange={(e) => st.update((d) => void (d.fps = +e.target.value))}>
              {[24, 25, 30, 60].map((f) => (
                <option key={f} value={f}>
                  {f} fps
                </option>
              ))}
            </select>
          </Field>
        </div>
        <button className="btn block" onClick={() => useUI.getState().openModal('resize')}>
          <Scaling size={15} /> Resize…
        </button>
      </S>

      <S id="page" title="Page">
        <Field label="Page name">
          <input
            className="input"
            key={page.id}
            defaultValue={page.name || ''}
            placeholder={`Page ${design.pages.findIndex((p) => p.id === page.id) + 1}`}
            onChange={(e) => upd((p) => void (p.name = e.target.value || undefined), 'page-name')}
            onKeyDown={(e) => e.stopPropagation()}
          />
        </Field>
        <Field label="Background">
          <div className="row">
            <ColorButton
              value={page.background.fill}
              onChange={(f) => upd((p) => void (p.background.fill = f), 'page-bg')}
              square
              size={30}
              title="Background colour"
            />
            <span className="small muted grow">{page.background.assetId ? 'Photo background over this colour' : 'Colour or gradient'}</span>
            {page.background.assetId && (
              <button className="btn sm ghost" onClick={() => upd((p) => void (p.background.assetId = null))}>
                Remove photo
              </button>
            )}
          </div>
        </Field>
        <div className="grid2">
          <Field label="Duration">
            <NumberField
              value={page.duration}
              min={0.5}
              max={3600}
              step={0.5}
              decimals={1}
              unit="s"
              onChange={(v) => upd((p) => void (p.duration = Math.round(v * 10) / 10), 'page-dur')}
            />
          </Field>
          <Field label="Transition length">
            <NumberField
              value={page.transition.duration}
              min={0.1}
              max={3}
              step={0.1}
              decimals={1}
              unit="s"
              onChange={(v) => upd((p) => void (p.transition.duration = Math.round(v * 10) / 10), 'page-tr')}
            />
          </Field>
        </div>
        <Field label="Transition into the next page">
          <select className="select" value={page.transition.type} onChange={(e) => upd((p) => void (p.transition.type = e.target.value as any))}>
            {TRANSITIONS.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </select>
        </Field>
        {!!page.guides?.length && (
          <button className="btn block" onClick={() => upd((p) => void (p.guides = []))}>
            <Eraser size={15} /> Clear {page.guides.length} guide
            {page.guides.length > 1 ? 's' : ''}
          </button>
        )}
      </S>

      <S id="notes" title="Notes" defaultOpen={!!page.notes}>
        <textarea
          className="input"
          key={page.id}
          rows={5}
          placeholder="Add presenter notes for this page"
          defaultValue={page.notes || ''}
          onChange={(e) => upd((p) => void (p.notes = e.target.value || undefined), 'page-notes')}
          onKeyDown={(e) => e.stopPropagation()}
        />
      </S>

      <div className="insp-hint">Select an element on the page to edit it. Double-click empty canvas to change the background.</div>
    </>
  );
}
