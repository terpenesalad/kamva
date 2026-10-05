import { useEffect, useRef, useState } from 'react';
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
  CaseUpper,
  Minus,
  Plus,
  Sparkles,
  LetterText,
  SquareDashed,
  SquareRoundCorner,
  SlidersHorizontal,
  Crop,
  FlipHorizontal2,
  FlipVertical2,
  Palette,
  Scissors,
  Volume2,
  VolumeX,
  Blend,
  Layers,
  Clapperboard,
  Lock,
  LockOpen,
  CopyPlus,
  Trash2,
  Ellipsis,
  Paintbrush,
  ClipboardPaste,
  Group,
  Ungroup,
  Image as ImageIcon,
  Link2,
  Wand,
  AlignHorizontalDistributeCenter,
  AlignVerticalDistributeCenter,
  ChartColumn,
  Table,
  QrCode,
  AlignCenterVertical,
} from 'lucide-react';
import type { DesignElement, ImageElement, LineElement, ShapeElement, SvgElement, TextElement, VideoElement, DrawElement } from '../../types';
import { useEditor, useSelectedElements } from '../../store/editor';
import { useUI, usePrefs } from '../../store/ui';
import { ContextMenu, MenuItem, MOD, NumberField, Seg, Slider, Toggle } from '../../components/ui';
import { ColorButton, ColorPanel } from '../../components/ColorPicker';
import { FontPicker } from '../../components/FontPicker';
import { fontSupports } from '../../lib/fonts';
import { fillToCss, fillPrimaryColor } from '../../lib/color';
import { FILTERS } from '../../lib/render/media';
import { getAsset } from '../../lib/assets';
import { removeBackground } from '../../lib/bgremove';
import { deleteSelection, distribute, flip, groupSelection, setAsBackground, toggleLock, ungroupSelection } from '../elementActions';
import { openInspectorSection } from './nav';
import { AlignPageButtons, DASHES, DualRange, LayerButtons, LineEndIcon, PopButton, ed, patchEls, loadFontAndRefresh } from './fields';
import { setFont, stepFontSize } from './TextSections';
import { SvgRecolor } from './SvgSections';
import { LineEndSelect } from './MiscSections';
import './inspector.css';

const pc = (f: Parameters<typeof fillPrimaryColor>[0]) => fillPrimaryColor(f);

export function ContextToolbar() {
  const els = useSelectedElements();
  const playing = useUI((s) => s.playing);
  const presenting = useUI((s) => s.presenting);
  const cropId = useEditor((s) => s.cropId);
  const editingTextId = useEditor((s) => s.editingTextId);
  const rulers = usePrefs((s) => s.showRulers);
  const width = useWorkspaceWidth();
  if (!els.length || playing || presenting || cropId || editingTextId) return null;

  const ids = els.map((e) => e.id);
  const single = els.length === 1 ? els[0] : null;
  const allText = els.every((e) => e.type === 'text');
  const allLocked = els.every((e) => e.locked);

  if (allLocked) {
    return (
      <div
        className={'ctx-bar' + (rulers ? ' below-rulers' : '') + (width < 620 ? ' compact tiny' : width < 980 ? ' compact' : width < 1180 ? ' mid' : '')}
        onContextMenu={(e) => e.preventDefault()}
      >
        <span className="small muted" style={{ padding: '0 8px' }}>
          {single ? 'This element is locked' : 'These elements are locked'}
        </span>
        <button type="button" className="tb-btn active" onClick={toggleLock} data-tip={`Unlock (${MOD}+Shift+L)`}>
          <Lock size={16} />
          <span className="tb-label">Unlock</span>
        </button>
        <button type="button" className="tb-btn" onClick={() => ed().duplicateElements(ids)} data-tip={`Duplicate (${MOD}+D)`} aria-label="Duplicate">
          <CopyPlus size={17} />
        </button>
      </div>
    );
  }

  return (
    <div
      className={'ctx-bar' + (rulers ? ' below-rulers' : '') + (width < 620 ? ' compact tiny' : width < 980 ? ' compact' : width < 1180 ? ' mid' : '')}
      onContextMenu={(e) => e.preventDefault()}
    >
      {allText && <TextControls els={els as TextElement[]} />}
      {single?.type === 'shape' && <ShapeControls el={single} />}
      {single?.type === 'image' && <ImageControls el={single} />}
      {single?.type === 'video' && <VideoControls el={single} />}
      {single?.type === 'svg' && <SvgControls el={single} />}
      {single?.type === 'line' && <LineControls el={single} />}
      {single?.type === 'draw' && <DrawControls el={single} />}
      {els.length > 1 && <MultiControls els={els} />}
      <span className="vdivider" />
      <CommonControls els={els} />
    </div>
  );
}

/** Width of the workspace, so the bar can drop its labels when space is tight */
function useWorkspaceWidth() {
  const [w, setW] = useState(1600);
  useEffect(() => {
    const ws = document.querySelector('.workspace');
    if (!ws) return;
    const ro = new ResizeObserver(() => setW(ws.clientWidth));
    ro.observe(ws);
    setW(ws.clientWidth);
    return () => ro.disconnect();
  }, []);
  return w;
}

// ---------------------------------------------------------------------------
// Text
// ---------------------------------------------------------------------------
const ALIGN_ORDER: TextElement['align'][] = ['left', 'center', 'right', 'justify'];
const ALIGN_ICON = {
  left: TextAlignStart,
  center: TextAlignCenter,
  right: TextAlignEnd,
  justify: TextAlignJustify,
};
const ALIGN_NAME = {
  left: 'Left',
  center: 'Centre',
  right: 'Right',
  justify: 'Justified',
};

function TextColorButton({ value, onChange, tip = 'Text colour' }: { value: TextElement['fill']; onChange: (f: TextElement['fill']) => void; tip?: string }) {
  const css = fillToCss(value);
  return (
    <PopButton
      tip={tip}
      width={276}
      icon={
        <span className="tb-color-a">
          A
          <i className={css === 'transparent' ? 'checker' : ''} style={{ background: css === 'transparent' ? undefined : css }} />
        </span>
      }
    >
      <ColorPanel value={value} onChange={onChange} />
    </PopButton>
  );
}

function TextControls({ els }: { els: TextElement[] }) {
  const el = els[0];
  const ids = els.map((e) => e.id);
  const sup = fontSupports(el.fontFamily);
  const set = (p: Partial<TextElement>, key?: string) => patchEls(ids, p, key);
  const AlignIcon = ALIGN_ICON[el.align];
  const nextAlign = ALIGN_ORDER[(ALIGN_ORDER.indexOf(el.align) + 1) % ALIGN_ORDER.length];
  const nextList = el.list === 'none' ? 'bullet' : el.list === 'bullet' ? 'number' : 'none';
  return (
    <>
      <div className="ctx-group">
        <FontPicker value={el.fontFamily} onChange={(f) => setFont(ids, f)} width={150} />
        <div className="tb-size" title="Font size">
          <button type="button" onClick={() => set({ fontSize: stepFontSize(el.fontSize, -1) })} aria-label="Decrease font size">
            <Minus size={14} />
          </button>
          <NumberField value={el.fontSize} min={1} max={2000} decimals={1} onChange={(v) => set({ fontSize: v }, 'fs')} />
          <button type="button" onClick={() => set({ fontSize: stepFontSize(el.fontSize, 1) })} aria-label="Increase font size">
            <Plus size={14} />
          </button>
        </div>
        <TextColorButton value={el.fill} onChange={(f) => set({ fill: f }, 'text-fill')} />
      </div>
      <span className="vdivider" />
      <div className="ctx-group">
        <button
          type="button"
          className={'tb-btn' + (el.fontWeight === 'bold' ? ' active' : '')}
          disabled={!sup.bold}
          onClick={() => {
            set({ fontWeight: el.fontWeight === 'bold' ? 'normal' : 'bold' });
            loadFontAndRefresh(el.fontFamily, 'bold', el.fontStyle);
          }}
          data-tip={sup.bold ? `Bold (${MOD}+B)` : 'This font has no bold style'}
          aria-label="Bold"
        >
          <Bold size={16} />
        </button>
        <button
          type="button"
          className={'tb-btn' + (el.fontStyle === 'italic' ? ' active' : '')}
          disabled={!sup.italic}
          onClick={() => {
            set({ fontStyle: el.fontStyle === 'italic' ? 'normal' : 'italic' });
            loadFontAndRefresh(el.fontFamily, el.fontWeight, 'italic');
          }}
          data-tip={sup.italic ? 'Italic' : 'This font has no italic style'}
          aria-label="Italic"
        >
          <Italic size={16} />
        </button>
        <button
          type="button"
          className={'tb-btn' + (el.underline ? ' active' : '')}
          onClick={() => set({ underline: !el.underline })}
          data-tip={`Underline (${MOD}+U)`}
          aria-label="Underline"
        >
          <Underline size={16} />
        </button>
        <button
          type="button"
          className={'tb-btn' + (el.strike ? ' active' : '')}
          onClick={() => set({ strike: !el.strike })}
          data-tip="Strikethrough"
          aria-label="Strikethrough"
        >
          <Strikethrough size={16} />
        </button>
        <button
          type="button"
          className={'tb-btn' + (el.transform === 'uppercase' ? ' active' : '')}
          onClick={() =>
            set({
              transform: el.transform === 'uppercase' ? 'none' : 'uppercase',
            })
          }
          data-tip="Uppercase"
          aria-label="Uppercase"
        >
          <CaseUpper size={17} />
        </button>
      </div>
      <span className="vdivider" />
      <div className="ctx-group">
        <button
          type="button"
          className="tb-btn"
          onClick={() => set({ align: nextAlign })}
          data-tip={`Alignment: ${ALIGN_NAME[el.align]}`}
          aria-label="Alignment"
        >
          <AlignIcon size={16} />
        </button>
        <button
          type="button"
          className={'tb-btn' + (el.list !== 'none' ? ' active' : '')}
          onClick={() => set({ list: nextList })}
          data-tip={el.list === 'none' ? 'Bulleted list' : el.list === 'bullet' ? 'Numbered list' : 'No list'}
          aria-label="List"
        >
          {el.list === 'number' ? <ListOrdered size={16} /> : <List size={16} />}
        </button>
        <PopButton icon={<LetterText size={16} />} tip="Spacing" width={260}>
          <div className="pop-col">
            <Slider label="Letter spacing" value={el.letterSpacing} min={-20} max={100} step={0.5} onChange={(v) => set({ letterSpacing: v }, 'ls')} />
            <Slider label="Line height" value={el.lineHeight} min={0.5} max={3} step={0.05} onChange={(v) => set({ lineHeight: v }, 'lh')} />
            <Slider label="Curve" value={el.curve} min={-100} max={100} onChange={(v) => set({ curve: v }, 'curve')} />
          </div>
        </PopButton>
        <button
          type="button"
          className={'tb-btn' + (el.effect.type !== 'none' ? ' active' : '')}
          onClick={() => openInspectorSection('effects')}
          data-tip="Text effects"
        >
          <Sparkles size={16} />
          <span className="tb-label">Effects</span>
        </button>
      </div>
    </>
  );
}

// ---------------------------------------------------------------------------
// Shape
// ---------------------------------------------------------------------------
function BorderPopover({
  ids,
  color,
  width,
  dash,
  setDefaultWidth = true,
}: {
  ids: string[];
  color: string;
  width: number;
  dash: 'solid' | 'dashed' | 'dotted';
  setDefaultWidth?: boolean;
}) {
  return (
    <PopButton icon={<SquareDashed size={17} />} tip="Border" width={260} active={width > 0}>
      <div className="pop-col">
        <div className="pop-title">Border</div>
        <Seg
          value={width > 0 ? dash : ('none' as any)}
          options={[{ value: 'none' as any, label: 'None', title: 'No border' }, ...DASHES]}
          onChange={(v: any) =>
            patchEls(ids, (e: ShapeElement) => {
              if (v === 'none') e.strokeWidth = 0;
              else {
                e.strokeDash = v;
                if (!e.strokeWidth && setDefaultWidth) e.strokeWidth = 4;
              }
            })
          }
        />
        <Slider label="Weight" value={width} min={0} max={100} onChange={(v) => patchEls(ids, { strokeWidth: v }, 'stroke-w')} />
        <div className="row">
          <span className="field-label grow">Colour</span>
          <ColorButton
            value={color}
            onChange={(f) =>
              patchEls(
                ids,
                (e: ShapeElement) => {
                  e.stroke = pc(f);
                  if (!e.strokeWidth) e.strokeWidth = 4;
                },
                'stroke-c',
              )
            }
            allowGradient={false}
            square
            size={26}
            title="Border colour"
          />
        </div>
      </div>
    </PopButton>
  );
}

function ShapeControls({ el }: { el: ShapeElement }) {
  const ids = [el.id];
  return (
    <div className="ctx-group">
      <ColorButton value={el.fill} onChange={(f) => patchEls(ids, { fill: f }, 'shape-fill')} title="Fill colour" size={26} />
      <BorderPopover ids={ids} color={el.stroke} width={el.strokeWidth} dash={el.strokeDash} />
      {(el.shape === 'rect' || el.shape === 'roundRect') && (
        <PopButton icon={<SquareRoundCorner size={17} />} tip="Corner rounding" width={240} active={el.cornerRadius > 0}>
          <Slider
            label="Corner rounding"
            value={el.cornerRadius}
            min={0}
            max={Math.round(Math.min(el.width, el.height) / 2)}
            onChange={(v) => patchEls(ids, { cornerRadius: v }, 'shape-radius')}
          />
        </PopButton>
      )}
      {el.text && (
        <TextColorButton
          value={el.textStyle?.fill ?? { type: 'solid', color: '#ffffff' }}
          onChange={(f) => patchEls(ids, (e: ShapeElement) => void (e.textStyle = { ...(e.textStyle || {}), fill: f }), 'shape-tc')}
        />
      )}
      <button type="button" className="tb-btn" onClick={() => openInspectorSection('shape', 'shape-text')} data-tip="Add or edit text inside the shape">
        <LetterText size={16} />
        <span className="tb-label collapsible">{el.text ? 'Edit text' : 'Add text'}</span>
      </button>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Image / video
// ---------------------------------------------------------------------------
function FlipPopover() {
  return (
    <PopButton icon={<FlipHorizontal2 size={16} />} label="Flip" tip="Flip" width={200}>
      {(close) => (
        <div className="pop-col" style={{ gap: 4 }}>
          <button
            type="button"
            className="btn ghost"
            style={{ justifyContent: 'flex-start' }}
            onClick={() => {
              flip('x');
              close();
            }}
          >
            <FlipHorizontal2 size={16} /> Flip horizontal
          </button>
          <button
            type="button"
            className="btn ghost"
            style={{ justifyContent: 'flex-start' }}
            onClick={() => {
              flip('y');
              close();
            }}
          >
            <FlipVertical2 size={16} /> Flip vertical
          </button>
        </div>
      )}
    </PopButton>
  );
}

function FilterPopover({ el }: { el: ImageElement | VideoElement }) {
  const ids = [el.id];
  return (
    <PopButton icon={<Palette size={16} />} label="Filter" tip="Filters" width={300} active={!!el.filter && el.filter !== 'none'}>
      <div className="pop-col">
        <div className="pop-chips">
          {FILTERS.map((f) => (
            <button
              key={f.id}
              type="button"
              className={'chip' + ((el.filter || 'none') === f.id ? ' active' : '')}
              onClick={() =>
                patchEls(ids, {
                  filter: f.id,
                  filterIntensity: el.filter === f.id ? el.filterIntensity : 1,
                })
              }
            >
              {f.name}
            </button>
          ))}
        </div>
        {el.filter && el.filter !== 'none' && (
          <Slider
            label="Intensity"
            value={Math.round(el.filterIntensity * 100)}
            min={0}
            max={100}
            suffix="%"
            onChange={(v) => patchEls(ids, { filterIntensity: v / 100 }, 'flt-int')}
          />
        )}
        <button type="button" className="btn sm" onClick={() => openInspectorSection('photo')}>
          <SlidersHorizontal size={14} /> More adjustments
        </button>
      </div>
    </PopButton>
  );
}

function ImageControls({ el }: { el: ImageElement }) {
  return (
    <div className="ctx-group">
      <button type="button" className="tb-btn" onClick={() => openInspectorSection('photo')} data-tip="Filters, adjustments and background remover">
        <SlidersHorizontal size={16} />
        <span className="tb-label keep">Edit photo</span>
      </button>
      {el.assetId && (
        <button type="button" className="tb-btn" onClick={() => useEditor.getState().setCrop(el.id)} data-tip="Crop (double-click)">
          <Crop size={16} />
          <span className="tb-label collapsible">Crop</span>
        </button>
      )}
      <FlipPopover />
      {el.assetId && <FilterPopover el={el} />}
    </div>
  );
}

function VideoControls({ el }: { el: VideoElement }) {
  const ids = [el.id];
  const dur = getAsset(el.assetId)?.meta.duration || 0;
  const end = el.trimEnd ?? dur;
  const r1 = (v: number) => Math.round(v * 10) / 10;
  return (
    <div className="ctx-group">
      <button type="button" className="tb-btn" onClick={() => openInspectorSection('photo')} data-tip="Filters and adjustments">
        <SlidersHorizontal size={16} />
        <span className="tb-label collapsible">Edit</span>
      </button>
      <button type="button" className="tb-btn" onClick={() => useEditor.getState().setCrop(el.id)} data-tip="Crop">
        <Crop size={16} />
        <span className="tb-label collapsible">Crop</span>
      </button>
      <PopButton icon={<Scissors size={16} />} label="Trim" tip="Trim" width={280}>
        <div className="pop-col">
          <div className="row">
            <span className="pop-title grow">Trim</span>
            <span className="small faint">{Math.max(0, (end - el.trimStart) / (el.speed || 1)).toFixed(1)}s</span>
          </div>
          {dur > 0 && (
            <DualRange
              max={dur}
              a={el.trimStart}
              b={end}
              onChange={(a, b) => patchEls(ids, { trimStart: r1(a), trimEnd: b >= dur - 0.05 ? null : r1(b) }, 'trim')}
            />
          )}
          <div className="grid2">
            <NumberField
              label="In"
              value={el.trimStart}
              decimals={1}
              step={0.1}
              min={0}
              max={Math.max(0, end - 0.1)}
              unit="s"
              onChange={(v) => patchEls(ids, { trimStart: r1(v) }, 'trim-s')}
            />
            <NumberField
              label="Out"
              value={end}
              decimals={1}
              step={0.1}
              min={el.trimStart + 0.1}
              max={dur || 3600}
              unit="s"
              onChange={(v) => patchEls(ids, { trimEnd: dur && v >= dur - 0.05 ? null : r1(v) }, 'trim-e')}
            />
          </div>
          <Slider label="Speed" value={el.speed} min={0.25} max={4} step={0.05} suffix="×" onChange={(v) => patchEls(ids, { speed: v }, 'speed')} />
        </div>
      </PopButton>
      <PopButton icon={el.muted || el.volume === 0 ? <VolumeX size={16} /> : <Volume2 size={16} />} tip="Volume" width={240}>
        <div className="pop-col">
          <Slider
            label="Volume"
            value={Math.round(el.volume * 100)}
            min={0}
            max={100}
            suffix="%"
            onChange={(v) => patchEls(ids, { volume: v / 100, muted: false }, 'vol')}
          />
          <Toggle label={<span className="field-label">Mute</span>} value={el.muted} onChange={(v) => patchEls(ids, { muted: v })} />
          <Toggle label={<span className="field-label">Loop</span>} value={el.loop} onChange={(v) => patchEls(ids, { loop: v })} />
        </div>
      </PopButton>
      <FlipPopover />
    </div>
  );
}

// ---------------------------------------------------------------------------
// SVG / icon / chart / table / QR
// ---------------------------------------------------------------------------
function SvgControls({ el }: { el: SvgElement }) {
  const kind = el.meta?.kind || 'svg';
  if (kind === 'chart' || kind === 'table' || kind === 'qr') {
    const map = {
      chart: { icon: <ChartColumn size={16} />, label: 'Edit chart' },
      table: { icon: <Table size={16} />, label: 'Edit table' },
      qr: { icon: <QrCode size={16} />, label: 'Edit QR code' },
    } as const;
    return (
      <div className="ctx-group">
        <button type="button" className="tb-btn" onClick={() => openInspectorSection(kind)}>
          {map[kind].icon}
          <span className="tb-label">{map[kind].label}</span>
        </button>
      </div>
    );
  }
  return (
    <div className="ctx-group">
      <SvgRecolor el={el} size={24} />
      {kind === 'icon' && (
        <PopButton icon={<Paintbrush size={16} />} tip="Stroke width" width={240}>
          <Slider
            label="Stroke width"
            value={el.strokeWidth ?? 2}
            min={0.25}
            max={6}
            step={0.25}
            onChange={(v) => patchEls([el.id], { strokeWidth: v }, 'icon-sw')}
          />
        </PopButton>
      )}
      <FlipPopover />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Line / draw
// ---------------------------------------------------------------------------
function LineControls({ el }: { el: LineElement }) {
  const ids = [el.id];
  return (
    <div className="ctx-group">
      <ColorButton value={el.stroke} onChange={(f) => patchEls(ids, { stroke: pc(f) }, 'line-c')} allowGradient={false} title="Line colour" size={26} />
      <PopButton icon={<SquareDashed size={17} />} tip="Line style" width={250}>
        <div className="pop-col">
          <Slider label="Weight" value={el.strokeWidth} min={1} max={60} onChange={(v) => patchEls(ids, { strokeWidth: v }, 'line-w')} />
          <Seg value={el.strokeDash} options={DASHES} onChange={(v) => patchEls(ids, { strokeDash: v })} />
          <Seg
            value={el.lineCap}
            onChange={(v) => patchEls(ids, { lineCap: v })}
            options={[
              { value: 'butt', label: 'Flat' },
              { value: 'round', label: 'Round' },
              { value: 'square', label: 'Square' },
            ]}
          />
          <Slider label="Curve" value={Math.round(el.curve * 100)} min={-100} max={100} onChange={(v) => patchEls(ids, { curve: v / 100 }, 'line-curve')} />
        </div>
      </PopButton>
      <PopButton icon={<LineEndIcon kind={el.start} flip />} tip="Line start" width={240}>
        <div className="pop-col">
          <div className="pop-title">Line start</div>
          <LineEndSelect value={el.start} onChange={(v) => patchEls(ids, { start: v })} flip />
        </div>
      </PopButton>
      <PopButton icon={<LineEndIcon kind={el.end} />} tip="Line end" width={240}>
        <div className="pop-col">
          <div className="pop-title">Line end</div>
          <LineEndSelect value={el.end} onChange={(v) => patchEls(ids, { end: v })} />
        </div>
      </PopButton>
    </div>
  );
}

function DrawControls({ el }: { el: DrawElement }) {
  const ids = [el.id];
  return (
    <div className="ctx-group">
      <ColorButton value={el.stroke} onChange={(f) => patchEls(ids, { stroke: pc(f) }, 'draw-c')} allowGradient={false} title="Colour" size={26} />
      <PopButton icon={<Paintbrush size={16} />} tip="Brush" width={250}>
        <div className="pop-col">
          <Slider label="Weight" value={el.strokeWidth} min={1} max={120} onChange={(v) => patchEls(ids, { strokeWidth: v }, 'draw-w')} />
          <Seg
            value={el.brush}
            onChange={(v) => patchEls(ids, { brush: v })}
            options={[
              { value: 'pen', label: 'Pen' },
              { value: 'marker', label: 'Marker' },
              { value: 'highlighter', label: 'Highlighter' },
            ]}
          />
        </div>
      </PopButton>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Multi-select
// ---------------------------------------------------------------------------
function MultiControls({ els }: { els: DesignElement[] }) {
  const grouped = !!els[0].groupId && els.every((e) => e.groupId === els[0].groupId);
  const allText = els.every((e) => e.type === 'text');
  return (
    <>
      {allText && <span className="vdivider" />}
      <div className="ctx-group">
        <PopButton icon={<AlignCenterVertical size={16} />} label="Align" tip="Align elements" width={240}>
          <div className="pop-col">
            <div className="pop-title">Align to each other</div>
            <AlignPageButtons toPage={false} />
            <div className="pop-title">Align to page</div>
            <AlignPageButtons />
            {els.length >= 3 && (
              <>
                <div className="pop-title">Distribute</div>
                <div className="grid2">
                  <button type="button" className="btn sm" onClick={() => distribute('h')}>
                    <AlignHorizontalDistributeCenter size={15} /> Horizontally
                  </button>
                  <button type="button" className="btn sm" onClick={() => distribute('v')}>
                    <AlignVerticalDistributeCenter size={15} /> Vertically
                  </button>
                </div>
              </>
            )}
          </div>
        </PopButton>
        {grouped ? (
          <button type="button" className="tb-btn" onClick={ungroupSelection} data-tip={`Ungroup (${MOD}+Shift+G)`}>
            <Ungroup size={16} />
            <span className="tb-label">Ungroup</span>
          </button>
        ) : (
          <button type="button" className="tb-btn" onClick={groupSelection} data-tip={`Group (${MOD}+G)`}>
            <Group size={16} />
            <span className="tb-label">Group</span>
          </button>
        )}
      </div>
    </>
  );
}

// ---------------------------------------------------------------------------
// Common (right side)
// ---------------------------------------------------------------------------
function CommonControls({ els }: { els: DesignElement[] }) {
  const ids = els.map((e) => e.id);
  const single = els.length === 1 ? els[0] : null;
  const [menu, setMenu] = useState<{ x: number; y: number } | null>(null);
  const closedAt = useRef(0);
  const hasStyle = useEditor((s) => !!s.styleClipboard);
  const opacity = els[0].opacity;
  const anyAnim = els.some((e) => e.animation && (e.animation.enter !== 'none' || e.animation.exit !== 'none' || e.animation.loop !== 'none'));
  const grouped = els.length > 1 && !!els[0].groupId && els.every((e) => e.groupId === els[0].groupId);
  const media = single && (single.type === 'image' || single.type === 'video') && single.assetId ? single : null;

  const items: MenuItem[] = [
    {
      label: 'Copy style',
      icon: <Paintbrush size={16} />,
      shortcut: `${MOD}+Alt+C`,
      onClick: () => ed().copyStyle(ids[0]),
    },
    {
      label: 'Paste style',
      icon: <ClipboardPaste size={16} />,
      shortcut: `${MOD}+Alt+V`,
      disabled: !hasStyle,
      onClick: () => ed().pasteStyle(ids),
    },
    { sep: true },
    els.length > 1
      ? grouped
        ? {
            label: 'Ungroup',
            icon: <Ungroup size={16} />,
            shortcut: `${MOD}+Shift+G`,
            onClick: ungroupSelection,
          }
        : {
            label: 'Group',
            icon: <Group size={16} />,
            shortcut: `${MOD}+G`,
            onClick: groupSelection,
          }
      : { label: 'Ungroup', icon: <Ungroup size={16} />, disabled: true },
    ...(media
      ? ([
          {
            label: 'Set as background',
            icon: <ImageIcon size={16} />,
            onClick: setAsBackground,
          },
          ...(media.type === 'image' && !(media as any).originalAssetId
            ? [
                {
                  label: 'Remove background',
                  icon: <Wand size={16} />,
                  onClick: () => void removeBackground(media.id),
                },
              ]
            : []),
        ] as MenuItem[])
      : []),
    { sep: true },
    {
      label: single?.link ? 'Edit link' : 'Add link',
      icon: <Link2 size={16} />,
      disabled: !single,
      onClick: () => single && window.dispatchEvent(new CustomEvent('kamva-link', { detail: single.id })),
    },
  ];

  return (
    <div className="ctx-group">
      <PopButton icon={<Blend size={16} />} tip="Transparency" width={240} active={opacity < 1}>
        <Slider
          label="Transparency"
          value={Math.round(opacity * 100)}
          min={0}
          max={100}
          suffix="%"
          onChange={(v) => patchEls(ids, { opacity: v / 100 }, 'opacity')}
        />
      </PopButton>
      <PopButton icon={<Layers size={16} />} label="Position" tip="Align and arrange" width={240}>
        <div className="pop-col">
          <div className="pop-title">Align to page</div>
          <AlignPageButtons />
          <div className="pop-title">Layer order</div>
          <LayerButtons ids={ids} />
          <button type="button" className="btn sm ghost" onClick={() => openInspectorSection('position')}>
            Exact position and size
          </button>
        </div>
      </PopButton>
      <button type="button" className={'tb-btn' + (anyAnim ? ' active' : '')} onClick={() => openInspectorSection('animation')} data-tip="Animate">
        <Clapperboard size={16} />
        <span className="tb-label">Animate</span>
      </button>
      <span className="vdivider" />
      <button type="button" className="tb-btn" onClick={toggleLock} data-tip={`Lock (${MOD}+Shift+L)`} aria-label="Lock">
        <LockOpen size={16} />
      </button>
      <button type="button" className="tb-btn" onClick={() => ed().duplicateElements(ids)} data-tip={`Duplicate (${MOD}+D)`} aria-label="Duplicate">
        <CopyPlus size={16} />
      </button>
      <button type="button" className="tb-btn danger" onClick={deleteSelection} data-tip="Delete (Del)" aria-label="Delete">
        <Trash2 size={16} />
      </button>
      <button
        type="button"
        className={'tb-btn' + (menu ? ' active' : '')}
        onClick={(e) => {
          if (performance.now() - closedAt.current < 250) return;
          const r = e.currentTarget.getBoundingClientRect();
          setMenu({ x: r.right - 220, y: r.bottom + 6 });
        }}
        data-tip="More"
        aria-label="More"
      >
        <Ellipsis size={16} />
      </button>
      {menu && (
        <ContextMenu
          x={menu.x}
          y={menu.y}
          items={items}
          onClose={() => {
            closedAt.current = performance.now();
            setMenu(null);
          }}
        />
      )}
    </div>
  );
}
