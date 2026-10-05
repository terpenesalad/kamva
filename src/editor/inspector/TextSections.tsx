import {
  Bold,
  Italic,
  Underline,
  Strikethrough,
  TextAlignStart,
  TextAlignCenter,
  TextAlignEnd,
  TextAlignJustify,
  List,
  ListOrdered,
  AlignVerticalJustifyStart,
  AlignVerticalJustifyCenter,
  AlignVerticalJustifyEnd,
  Minus,
  Plus,
} from 'lucide-react';
import type { TextElement, TextEffect } from '../../types';
import { NumberField, Seg, Slider, Toggle } from '../../components/ui';
import { ColorButton } from '../../components/ColorPicker';
import { FontPicker } from '../../components/FontPicker';
import { fontSupports } from '../../lib/fonts';
import { fillPrimaryColor, fillToCss } from '../../lib/color';
import { Field, S, patchEls, loadFontAndRefresh } from './fields';

export const FONT_SIZES = [8, 10, 12, 14, 16, 18, 20, 24, 28, 32, 36, 40, 48, 56, 64, 72, 80, 96, 120, 144, 180, 240];

export function stepFontSize(cur: number, dir: 1 | -1) {
  if (dir > 0) return FONT_SIZES.find((s) => s > cur + 0.01) ?? Math.round(cur * 1.25);
  return [...FONT_SIZES].reverse().find((s) => s < cur - 0.01) ?? Math.max(1, Math.round(cur * 0.8));
}

/** Apply a font family to text elements, dropping bold/italic when the font lacks them. */
export function setFont(ids: string[], family: string) {
  const sup = fontSupports(family);
  patchEls(ids, (el: TextElement) => {
    el.fontFamily = family;
    if (!sup.bold) el.fontWeight = 'normal';
    if (!sup.italic) el.fontStyle = 'normal';
  });
  loadFontAndRefresh(family, 'bold');
}

export function TextSection({ els }: { els: TextElement[] }) {
  const el = els[0];
  const ids = els.map((e) => e.id);
  const sup = fontSupports(el.fontFamily);
  const set = (p: Partial<TextElement>, key?: string) => patchEls(ids, p, key);
  return (
    <S id="text" title={els.length > 1 ? `Text (${els.length})` : 'Text'}>
      <div className="insp-font">
        <FontPicker value={el.fontFamily} onChange={(f) => setFont(ids, f)} />
      </div>
      <div className="insp-font-row">
        <div className="size-stepper">
          <button type="button" className="icon-btn sm" onClick={() => set({ fontSize: stepFontSize(el.fontSize, -1) })} aria-label="Smaller">
            <Minus size={14} />
          </button>
          <NumberField value={el.fontSize} min={1} max={2000} decimals={1} onChange={(v) => set({ fontSize: v }, 'fs')} title="Font size" />
          <button type="button" className="icon-btn sm" onClick={() => set({ fontSize: stepFontSize(el.fontSize, 1) })} aria-label="Larger">
            <Plus size={14} />
          </button>
        </div>
        <ColorButton value={el.fill} onChange={(f) => set({ fill: f }, 'text-fill')} title="Text colour" size={30} square />
      </div>
      <div className="insp-toggles">
        <button
          type="button"
          className={'icon-btn sm' + (el.fontWeight === 'bold' ? ' active' : '')}
          disabled={!sup.bold}
          onClick={() => {
            set({ fontWeight: el.fontWeight === 'bold' ? 'normal' : 'bold' });
            loadFontAndRefresh(el.fontFamily, 'bold');
          }}
          data-tip="Bold"
          aria-label="Bold"
        >
          <Bold size={16} />
        </button>
        <button
          type="button"
          className={'icon-btn sm' + (el.fontStyle === 'italic' ? ' active' : '')}
          disabled={!sup.italic}
          onClick={() => {
            set({ fontStyle: el.fontStyle === 'italic' ? 'normal' : 'italic' });
            loadFontAndRefresh(el.fontFamily, el.fontWeight, 'italic');
          }}
          data-tip="Italic"
          aria-label="Italic"
        >
          <Italic size={16} />
        </button>
        <button
          type="button"
          className={'icon-btn sm' + (el.underline ? ' active' : '')}
          onClick={() => set({ underline: !el.underline })}
          data-tip="Underline"
          aria-label="Underline"
        >
          <Underline size={16} />
        </button>
        <button
          type="button"
          className={'icon-btn sm' + (el.strike ? ' active' : '')}
          onClick={() => set({ strike: !el.strike })}
          data-tip="Strikethrough"
          aria-label="Strikethrough"
        >
          <Strikethrough size={16} />
        </button>
        <span className="vdivider" />
        <Seg
          value={el.list}
          onChange={(v) => set({ list: v })}
          options={[
            { value: 'none', label: '—', title: 'No list' },
            {
              value: 'bullet',
              label: <List size={15} />,
              title: 'Bulleted list',
            },
            {
              value: 'number',
              label: <ListOrdered size={15} />,
              title: 'Numbered list',
            },
          ]}
        />
      </div>
      <Field label="Alignment">
        <Seg
          value={el.align}
          onChange={(v) => set({ align: v })}
          options={[
            {
              value: 'left',
              label: <TextAlignStart size={15} />,
              title: 'Left',
            },
            {
              value: 'center',
              label: <TextAlignCenter size={15} />,
              title: 'Centre',
            },
            {
              value: 'right',
              label: <TextAlignEnd size={15} />,
              title: 'Right',
            },
            {
              value: 'justify',
              label: <TextAlignJustify size={15} />,
              title: 'Justify',
            },
          ]}
        />
      </Field>
      <Toggle label={<span className="field-label">Auto height</span>} value={el.autoHeight} onChange={(v) => set({ autoHeight: v })} />
      {!el.autoHeight && (
        <Field label="Vertical alignment">
          <Seg
            value={el.verticalAlign}
            onChange={(v) => set({ verticalAlign: v })}
            options={[
              {
                value: 'top',
                label: <AlignVerticalJustifyStart size={15} />,
                title: 'Top',
              },
              {
                value: 'middle',
                label: <AlignVerticalJustifyCenter size={15} />,
                title: 'Middle',
              },
              {
                value: 'bottom',
                label: <AlignVerticalJustifyEnd size={15} />,
                title: 'Bottom',
              },
            ]}
          />
        </Field>
      )}
      <Field label="Case">
        <Seg
          value={el.transform}
          onChange={(v) => set({ transform: v })}
          options={[
            { value: 'none', label: 'Aa', title: 'As typed' },
            { value: 'uppercase', label: 'AA', title: 'Uppercase' },
            { value: 'lowercase', label: 'aa', title: 'Lowercase' },
            { value: 'capitalize', label: 'Ab', title: 'Capitalise each word' },
          ]}
        />
      </Field>
      <Slider label="Letter spacing" value={el.letterSpacing} min={-20} max={100} step={0.5} onChange={(v) => set({ letterSpacing: v }, 'ls')} />
      <Slider label="Line height" value={el.lineHeight} min={0.5} max={3} step={0.05} onChange={(v) => set({ lineHeight: v }, 'lh')} />
      <Slider label="Curve" value={el.curve} min={-100} max={100} onChange={(v) => set({ curve: v }, 'curve')} />
      <Field label="Text style role">
        <select className="select" value={el.role || ''} onChange={(e) => set({ role: (e.target.value || undefined) as TextElement['role'] })}>
          <option value="">None</option>
          <option value="heading">Heading</option>
          <option value="subheading">Subheading</option>
          <option value="body">Body</option>
        </select>
      </Field>
    </S>
  );
}

// ---------------------------------------------------------------------------
// Effects
// ---------------------------------------------------------------------------
const EFFECTS: { type: TextEffect['type']; name: string }[] = [
  { type: 'none', name: 'None' },
  { type: 'outline', name: 'Outline' },
  { type: 'hollow', name: 'Hollow' },
  { type: 'highlight', name: 'Highlight' },
  { type: 'glow', name: 'Glow' },
  { type: 'lift', name: 'Lift' },
  { type: 'echo', name: 'Echo' },
  { type: 'neon', name: 'Neon' },
  { type: 'splice', name: 'Splice' },
];

/** Sensible starting colours/sizes when an effect is picked */
function effectDefaults(t: TextEffect['type'], el: TextElement, cur: TextEffect): TextEffect {
  const fs = el.fontSize;
  const main = fillPrimaryColor(el.fill);
  switch (t) {
    case 'outline':
      return {
        type: t,
        color: cur.type === t ? cur.color : '#111827',
        size: Math.max(1, Math.round(fs * 0.04)),
        offset: cur.offset,
      };
    case 'hollow':
      return {
        type: t,
        color: cur.color,
        size: Math.max(2, Math.round(fs * 0.05)),
        offset: cur.offset,
      };
    case 'highlight':
      return {
        type: t,
        color: cur.type === t ? cur.color : '#ffd166',
        size: Math.max(1, Math.round(fs * 0.06)),
        offset: Math.round(fs * 0.15),
      };
    case 'glow':
      return {
        type: t,
        color: cur.type === t ? cur.color : main,
        size: Math.max(2, Math.round(fs * 0.12)),
        offset: 0,
      };
    case 'neon':
      return {
        type: t,
        color: cur.type === t ? cur.color : main,
        size: Math.max(2, Math.round(fs * 0.1)),
        offset: 0,
      };
    case 'lift':
      return {
        type: t,
        color: '#000000',
        size: Math.max(2, Math.round(fs * 0.12)),
        offset: 0,
      };
    case 'echo':
      return {
        type: t,
        color: cur.type === t ? cur.color : main,
        size: cur.size,
        offset: Math.max(2, Math.round(fs * 0.06)),
      };
    case 'splice':
      return {
        type: t,
        color: cur.type === t ? cur.color : '#7dd3fc',
        size: Math.max(2, Math.round(fs * 0.05)),
        offset: Math.max(2, Math.round(fs * 0.08)),
      };
    default:
      return { ...cur, type: 'none' };
  }
}

function EffectPreview({ type, color }: { type: TextEffect['type']; color: string }) {
  const base: React.CSSProperties = {
    fontFamily: 'var(--display)',
    fontWeight: 700,
    fontSize: 22,
    lineHeight: 1,
    color,
  };
  const style: React.CSSProperties = { ...base };
  switch (type) {
    case 'outline':
      style.WebkitTextStroke = '1.5px var(--text)';
      style.paintOrder = 'stroke fill';
      break;
    case 'hollow':
      style.color = 'transparent';
      style.WebkitTextStroke = `1.2px ${color}`;
      break;
    case 'highlight':
      style.background = '#ffd166';
      style.color = '#1b1a22';
      style.padding = '0 4px';
      style.borderRadius = 3;
      break;
    case 'glow':
      style.textShadow = `0 0 6px ${color}, 0 0 10px ${color}`;
      break;
    case 'lift':
      style.textShadow = '0 3px 5px rgba(0,0,0,.45)';
      break;
    case 'echo':
      style.textShadow = `3px 3px 0 color-mix(in srgb, ${color} 45%, transparent), 6px 6px 0 color-mix(in srgb, ${color} 22%, transparent)`;
      break;
    case 'neon':
      style.color = '#fff';
      style.textShadow = `0 0 3px #fff, 0 0 7px var(--accent), 0 0 12px var(--accent)`;
      break;
    case 'splice':
      style.color = 'transparent';
      style.WebkitTextStroke = `1.2px ${color}`;
      style.textShadow = '3px 3px 0 #7dd3fc';
      break;
  }
  return <span style={style}>Ag</span>;
}

export function EffectsSection({ els }: { els: TextElement[] }) {
  const el = els[0];
  const ids = els.map((e) => e.id);
  const fx = el.effect;
  const setFx = (p: Partial<TextEffect>, key?: string) =>
    patchEls(
      ids,
      (e: TextElement) => {
        e.effect = { ...e.effect, ...p };
      },
      key,
    );
  const previewColor = (() => {
    const c = fillToCss(el.fill);
    return el.fill.type === 'solid' && c !== 'transparent' ? c : 'var(--text)';
  })();
  const usesColor = fx.type !== 'none' && fx.type !== 'lift' && fx.type !== 'hollow';
  const sizeLabel: Record<string, string> = {
    outline: 'Thickness',
    hollow: 'Thickness',
    highlight: 'Padding',
    glow: 'Spread',
    neon: 'Intensity',
    lift: 'Intensity',
    splice: 'Thickness',
    echo: 'Size',
  };
  const usesSize = fx.type !== 'none' && fx.type !== 'echo';
  const usesOffset = fx.type === 'echo' || fx.type === 'splice' || fx.type === 'highlight';
  return (
    <S id="effects" title="Effects" defaultOpen={fx.type !== 'none'}>
      <div className="fx-grid">
        {EFFECTS.map((e) => (
          <button
            key={e.type}
            type="button"
            className={'fx-tile' + (fx.type === e.type ? ' active' : '')}
            onClick={() => patchEls(ids, (x: TextElement) => void (x.effect = effectDefaults(e.type, x, x.effect)))}
          >
            <span className="fx-prev">
              {e.type === 'none' ? (
                <span
                  style={{
                    fontFamily: 'var(--display)',
                    fontWeight: 700,
                    fontSize: 22,
                    color: previewColor,
                  }}
                >
                  Ag
                </span>
              ) : (
                <EffectPreview type={e.type} color={previewColor} />
              )}
            </span>
            <span className="fx-name">{e.name}</span>
          </button>
        ))}
      </div>
      {usesColor && (
        <div className="row">
          <span className="field-label grow">Effect colour</span>
          <ColorButton
            value={fx.color}
            onChange={(f) => setFx({ color: fillPrimaryColor(f) }, 'fx-color')}
            allowGradient={false}
            square
            size={26}
            title="Effect colour"
          />
        </div>
      )}
      {usesSize && (
        <Slider
          label={sizeLabel[fx.type] || 'Size'}
          value={fx.size}
          min={0}
          max={Math.max(40, Math.round(el.fontSize * 0.5))}
          step={0.5}
          onChange={(v) => setFx({ size: v }, 'fx-size')}
        />
      )}
      {usesOffset && (
        <Slider
          label={fx.type === 'highlight' ? 'Corner roundness' : 'Offset'}
          value={fx.offset}
          min={0}
          max={Math.max(40, Math.round(el.fontSize * 0.5))}
          step={0.5}
          onChange={(v) => setFx({ offset: v }, 'fx-offset')}
        />
      )}
    </S>
  );
}
