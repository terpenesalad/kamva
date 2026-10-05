import { useEffect, useState } from 'react';
import { Play, Square, CopyCheck, ExternalLink, X } from 'lucide-react';
import type { DesignElement, DrawElement, ElementAnimation, LineElement, ShapeElement, Shadow, TextStyle } from '../../types';
import { useEditor, useActivePage, pageStartTime } from '../../store/editor';
import { useUI } from '../../store/ui';
import { NumberField, Seg, Slider, Toggle } from '../../components/ui';
import { ColorButton } from '../../components/ColorPicker';
import { FontPicker } from '../../components/FontPicker';
import { SHAPE_LIST } from '../../lib/shapes';
import { ANIMATIONS, LOOPS } from '../../lib/render/animation';
import { defaultAnimation, defaultShadow } from '../../lib/defaults';
import { fillPrimaryColor } from '../../lib/color';
import { platform } from '../../lib/platform';
import { BLEND_MODES, DASHES, Field, LINE_ENDS, LineEndIcon, NO_RADIUS, S, ShapeGridPicker, SubHead, ed, loadFontAndRefresh, patchEls } from './fields';

const pc = (f: Parameters<typeof fillPrimaryColor>[0]) => fillPrimaryColor(f);
const stop = (e: React.KeyboardEvent) => e.stopPropagation();

// ---------------------------------------------------------------------------
// Shape
// ---------------------------------------------------------------------------
export function ShapeSection({ el }: { el: ShapeElement }) {
  const ids = [el.id];
  const ts = el.textStyle || {};
  const setTs = (p: Partial<TextStyle>, key?: string) =>
    patchEls(
      ids,
      (e: ShapeElement) => {
        e.textStyle = { ...(e.textStyle || {}), ...p };
      },
      key,
    );
  const autoFs = Math.round(Math.max(14, Math.min(el.width, el.height) * 0.16));
  return (
    <S id="shape" title="Fill and border">
      <div className="row">
        <span className="field-label grow">Fill</span>
        <ColorButton value={el.fill} onChange={(f) => patchEls(ids, { fill: f }, 'shape-fill')} square size={28} title="Fill colour" />
      </div>
      <Field label="Shape">
        <ShapeGridPicker
          value={el.shape}
          options={SHAPE_LIST}
          onChange={(k) =>
            patchEls(ids, (e: ShapeElement) => {
              e.shape = k as ShapeElement['shape'];
              if (k === 'roundRect' && !e.cornerRadius) e.cornerRadius = Math.min(e.width, e.height) * 0.15;
            })
          }
        />
      </Field>
      {!NO_RADIUS.includes(el.shape) && (
        <Slider
          label="Corner rounding"
          value={el.cornerRadius}
          min={0}
          max={Math.round(Math.min(el.width, el.height) / 2)}
          onChange={(v) => patchEls(ids, { cornerRadius: v }, 'shape-radius')}
        />
      )}
      <SubHead>Border</SubHead>
      <div className="row">
        <ColorButton
          value={el.stroke}
          onChange={(f) =>
            patchEls(
              ids,
              (e: ShapeElement) => {
                e.stroke = pc(f);
                if (!e.strokeWidth) e.strokeWidth = 4;
              },
              'shape-stroke',
            )
          }
          allowGradient={false}
          square
          size={28}
          title="Border colour"
        />
        <div className="grow">
          <NumberField
            label="W"
            value={el.strokeWidth}
            min={0}
            max={400}
            onChange={(v) => patchEls(ids, { strokeWidth: v }, 'shape-sw')}
            title="Border weight"
          />
        </div>
      </div>
      <Seg
        value={el.strokeDash}
        options={DASHES}
        onChange={(v) =>
          patchEls(ids, (e: ShapeElement) => {
            e.strokeDash = v;
            if (!e.strokeWidth) e.strokeWidth = 4;
          })
        }
      />

      <SubHead>Text in shape</SubHead>
      <textarea
        className="input"
        rows={2}
        data-focus="shape-text"
        placeholder="Type text to show inside the shape"
        value={el.text || ''}
        onChange={(e) => patchEls(ids, { text: e.target.value || undefined }, 'shape-text')}
        onKeyDown={stop}
      />
      {!!el.text && (
        <>
          <div className="insp-font">
            <FontPicker
              value={ts.fontFamily ?? 'Inter'}
              onChange={(f) => {
                setTs({ fontFamily: f });
                loadFontAndRefresh(f, 'bold');
              }}
            />
          </div>
          <div className="insp-font-row">
            <div className="grow">
              <NumberField label="Size" value={ts.fontSize ?? autoFs} min={4} max={1000} onChange={(v) => setTs({ fontSize: v }, 'shape-fs')} />
            </div>
            <Seg
              value={ts.fontWeight ?? 'bold'}
              onChange={(v) => setTs({ fontWeight: v })}
              options={[
                { value: 'normal', label: 'Aa', title: 'Regular' },
                { value: 'bold', label: <b>Aa</b>, title: 'Bold' },
              ]}
            />
            <ColorButton
              value={ts.fill ?? '#ffffff'}
              onChange={(f) => setTs({ fill: { type: 'solid', color: pc(f) } }, 'shape-tc')}
              allowGradient={false}
              square
              size={28}
              title="Text colour"
            />
          </div>
        </>
      )}
    </S>
  );
}

// ---------------------------------------------------------------------------
// Line
// ---------------------------------------------------------------------------
export function LineEndSelect({ value, onChange, flip }: { value: LineElement['start']; onChange: (v: LineElement['start']) => void; flip?: boolean }) {
  return (
    <div className="end-grid">
      {LINE_ENDS.map((o) => (
        <button
          key={o.value}
          type="button"
          className={'end-cell' + (o.value === value ? ' active' : '')}
          onClick={() => onChange(o.value)}
          title={o.label}
          aria-label={o.label}
        >
          <LineEndIcon kind={o.value} flip={flip} />
        </button>
      ))}
    </div>
  );
}

export function LineSection({ el }: { el: LineElement }) {
  const ids = [el.id];
  return (
    <S id="line" title="Line">
      <div className="row">
        <ColorButton
          value={el.stroke}
          onChange={(f) => patchEls(ids, { stroke: pc(f) }, 'line-c')}
          allowGradient={false}
          square
          size={28}
          title="Line colour"
        />
        <div className="grow">
          <NumberField
            label="W"
            value={el.strokeWidth}
            min={0.5}
            max={200}
            decimals={1}
            onChange={(v) => patchEls(ids, { strokeWidth: v }, 'line-w')}
            title="Line weight"
          />
        </div>
      </div>
      <Field label="Style">
        <Seg value={el.strokeDash} options={DASHES} onChange={(v) => patchEls(ids, { strokeDash: v })} />
      </Field>
      <Field label="Line cap">
        <Seg
          value={el.lineCap}
          onChange={(v) => patchEls(ids, { lineCap: v })}
          options={[
            { value: 'butt', label: 'Flat' },
            { value: 'round', label: 'Round' },
            { value: 'square', label: 'Square' },
          ]}
        />
      </Field>
      <Field label="Start">
        <LineEndSelect value={el.start} onChange={(v) => patchEls(ids, { start: v })} flip />
      </Field>
      <Field label="End">
        <LineEndSelect value={el.end} onChange={(v) => patchEls(ids, { end: v })} />
      </Field>
      <Slider label="Curve" value={Math.round(el.curve * 100)} min={-100} max={100} onChange={(v) => patchEls(ids, { curve: v / 100 }, 'line-curve')} />
    </S>
  );
}

// ---------------------------------------------------------------------------
// Drawing
// ---------------------------------------------------------------------------
export function DrawSection({ el }: { el: DrawElement }) {
  const ids = [el.id];
  return (
    <S id="draw" title="Drawing">
      <div className="row">
        <ColorButton value={el.stroke} onChange={(f) => patchEls(ids, { stroke: pc(f) }, 'draw-c')} allowGradient={false} square size={28} title="Colour" />
        <div className="grow">
          <NumberField
            label="W"
            value={el.strokeWidth}
            min={0.5}
            max={300}
            decimals={1}
            onChange={(v) => patchEls(ids, { strokeWidth: v }, 'draw-w')}
            title="Brush size"
          />
        </div>
      </div>
      <Field label="Brush">
        <Seg
          value={el.brush}
          onChange={(v) => patchEls(ids, { brush: v })}
          options={[
            { value: 'pen', label: 'Pen' },
            { value: 'marker', label: 'Marker' },
            { value: 'highlighter', label: 'Highlighter' },
          ]}
        />
      </Field>
    </S>
  );
}

// ---------------------------------------------------------------------------
// Appearance (all)
// ---------------------------------------------------------------------------
export function AppearanceSection({ els }: { els: DesignElement[] }) {
  const el = els[0];
  const ids = els.map((e) => e.id);
  const sh = el.shadow || defaultShadow();
  const setSh = (p: Partial<Shadow>, key?: string) =>
    patchEls(
      ids,
      (e: DesignElement) => {
        e.shadow = { ...(e.shadow || defaultShadow()), ...p };
      },
      key,
    );
  return (
    <S id="appearance" title="Appearance" defaultOpen>
      <Slider
        label="Transparency"
        value={Math.round(el.opacity * 100)}
        min={0}
        max={100}
        suffix="%"
        onChange={(v) => patchEls(ids, { opacity: v / 100 }, 'opacity')}
      />
      <Field label="Blend mode">
        <select className="select" value={el.blendMode || 'source-over'} onChange={(e) => patchEls(ids, { blendMode: e.target.value as any })}>
          {BLEND_MODES.map((b) => (
            <option key={b.value} value={b.value}>
              {b.label}
            </option>
          ))}
        </select>
      </Field>
      <div className="row">
        <span className="field-label grow">Shadow</span>
        {sh.enabled && (
          <ColorButton
            value={sh.color}
            onChange={(f) => setSh({ color: pc(f) }, 'sh-c')}
            allowGradient={false}
            allowTransparent={false}
            square
            size={24}
            title="Shadow colour"
          />
        )}
        <Toggle value={sh.enabled} onChange={(v) => setSh({ enabled: v })} />
      </div>
      {sh.enabled && (
        <>
          <Slider label="Blur" value={sh.blur} min={0} max={200} onChange={(v) => setSh({ blur: v }, 'sh-blur')} />
          <div className="grid2">
            <NumberField label="X" value={sh.offsetX} min={-500} max={500} onChange={(v) => setSh({ offsetX: v }, 'sh-x')} title="Horizontal offset" />
            <NumberField label="Y" value={sh.offsetY} min={-500} max={500} onChange={(v) => setSh({ offsetY: v }, 'sh-y')} title="Vertical offset" />
          </div>
          <Slider
            label="Shadow opacity"
            value={Math.round(sh.opacity * 100)}
            min={0}
            max={100}
            suffix="%"
            onChange={(v) => setSh({ opacity: v / 100 }, 'sh-o')}
          />
        </>
      )}
    </S>
  );
}

// ---------------------------------------------------------------------------
// Animation (all)
// ---------------------------------------------------------------------------
let previewTimer = 0;
export function previewPageAnimation() {
  const st = useEditor.getState();
  const d = st.design;
  if (!d) return;
  const page = d.pages.find((p) => p.id === st.activePageId) || d.pages[0];
  const ui = useUI.getState();
  window.clearTimeout(previewTimer);
  const t0 = pageStartTime(d, page.id);
  st.setActivePage(page.id);
  ui.setPlaying(false);
  ui.setTime(t0);
  requestAnimationFrame(() => {
    useUI.getState().setPlaying(true);
    previewTimer = window.setTimeout(
      () => {
        if (useUI.getState().playing) {
          useUI.getState().setPlaying(false);
          useUI.getState().setTime(t0);
        }
      },
      page.duration * 1000 + 80,
    );
  });
}

function AnimTiles({ value, onChange }: { value: string; onChange: (v: any) => void }) {
  return (
    <div className="anim-grid">
      {ANIMATIONS.map((a) => (
        <button key={a.id} type="button" className={'anim-tile' + (a.id === value ? ' active' : '')} onClick={() => onChange(a.id)}>
          <span className={'anim-dot anim-' + a.id} />
          <span>{a.name}</span>
        </button>
      ))}
    </div>
  );
}

export function AnimationSection({ els }: { els: DesignElement[] }) {
  const el = els[0];
  const ids = els.map((e) => e.id);
  const page = useActivePage();
  const playing = useUI((s) => s.playing);
  const a = el.animation || defaultAnimation();
  const setA = (p: Partial<ElementAnimation>, key?: string) =>
    patchEls(
      ids,
      (e: DesignElement) => {
        e.animation = { ...(e.animation || defaultAnimation()), ...p };
      },
      key,
    );
  const dur = page?.duration ?? 5;
  const whole = !el.timing;
  const start = el.timing?.start ?? 0;
  const end = el.timing?.end ?? dur;
  const setTiming = (s: number, e: number | null) =>
    patchEls(
      ids,
      {
        timing: {
          start: Math.max(0, Math.round(s * 10) / 10),
          end: e === null ? null : Math.round(e * 10) / 10,
        },
      },
      'timing',
    );

  return (
    <S id="animation" title="Animation" defaultOpen={!!el.animation && (a.enter !== 'none' || a.exit !== 'none' || a.loop !== 'none')}>
      <Field label="Enter">
        <AnimTiles value={a.enter} onChange={(v) => setA({ enter: v })} />
      </Field>
      {a.enter !== 'none' && (
        <Slider
          label="Enter duration"
          value={a.enterDuration}
          min={0.1}
          max={5}
          step={0.1}
          suffix="s"
          onChange={(v) => setA({ enterDuration: v }, 'anim-ed')}
        />
      )}
      <Field label="Exit">
        <select className="select" value={a.exit} onChange={(e) => setA({ exit: e.target.value as any })}>
          {ANIMATIONS.map((x) => (
            <option key={x.id} value={x.id}>
              {x.name}
            </option>
          ))}
        </select>
      </Field>
      {a.exit !== 'none' && (
        <Slider label="Exit duration" value={a.exitDuration} min={0.1} max={5} step={0.1} suffix="s" onChange={(v) => setA({ exitDuration: v }, 'anim-xd')} />
      )}
      <Field label="Loop while visible">
        <select className="select" value={a.loop} onChange={(e) => setA({ loop: e.target.value as ElementAnimation['loop'] })}>
          {LOOPS.map((x) => (
            <option key={x.id} value={x.id}>
              {x.name}
            </option>
          ))}
        </select>
      </Field>

      <SubHead>Timing</SubHead>
      <Toggle
        label={<span className="field-label">Show for the whole page</span>}
        value={whole}
        onChange={(v) => patchEls(ids, { timing: v ? undefined : { start: 0, end: dur } })}
      />
      {!whole && (
        <div className="grid2">
          <NumberField
            label="From"
            value={start}
            min={0}
            max={Math.max(0, end - 0.1)}
            step={0.1}
            decimals={1}
            unit="s"
            onChange={(v) => setTiming(v, el.timing?.end ?? null)}
          />
          <NumberField
            label="To"
            value={end}
            min={start + 0.1}
            max={dur}
            step={0.1}
            decimals={1}
            unit="s"
            onChange={(v) => setTiming(start, v >= dur - 0.05 ? null : v)}
          />
        </div>
      )}

      <div className="grid2">
        <button
          type="button"
          className="btn sm"
          onClick={() => {
            if (playing) {
              window.clearTimeout(previewTimer);
              useUI.getState().setPlaying(false);
            } else previewPageAnimation();
          }}
        >
          {playing ? <Square size={13} /> : <Play size={14} />} {playing ? 'Stop' : 'Preview'}
        </button>
        <button
          type="button"
          className="btn sm"
          title="Use this animation for every element on the page"
          onClick={() => {
            if (!page) return;
            const anim = structuredClone(a);
            ed().updateElements(
              page.elements.map((e) => e.id),
              (e) => void (e.animation = structuredClone(anim)),
            );
            useUI.getState().toast(`Applied to ${page.elements.length} element${page.elements.length === 1 ? '' : 's'}`, 'success', 1800);
          }}
        >
          <CopyCheck size={14} /> Apply to all
        </button>
      </div>
    </S>
  );
}

// ---------------------------------------------------------------------------
// Link
// ---------------------------------------------------------------------------
export function LinkSection({ el }: { el: DesignElement }) {
  const [v, setV] = useState(el.link || '');
  useEffect(() => setV(el.link || ''), [el.id, el.link]);
  const commit = (s: string) => {
    let url = s.trim();
    if (url && !/^[a-z][a-z0-9+.-]*:/i.test(url)) url = (url.includes('@') && !url.includes('/') ? 'mailto:' : 'https://') + url;
    if ((el.link || '') !== url) patchEls([el.id], { link: url || undefined });
    setV(url);
  };
  return (
    <S id="link" title="Link" defaultOpen={!!el.link}>
      <div className="row" style={{ gap: 4 }}>
        <input
          className="input"
          data-focus="link"
          placeholder="Paste a web address or email"
          value={v}
          onChange={(e) => setV(e.target.value)}
          onBlur={(e) => commit(e.target.value)}
          onKeyDown={(e) => {
            e.stopPropagation();
            if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
          }}
        />
        {el.link && (
          <>
            <button type="button" className="icon-btn sm" onClick={() => void platform.openExternal(el.link!)} data-tip="Open link" aria-label="Open link">
              <ExternalLink size={14} />
            </button>
            <button
              type="button"
              className="icon-btn sm"
              onClick={() => patchEls([el.id], { link: undefined })}
              data-tip="Remove link"
              aria-label="Remove link"
            >
              <X size={14} />
            </button>
          </>
        )}
      </div>
    </S>
  );
}
