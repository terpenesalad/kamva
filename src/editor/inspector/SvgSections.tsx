import { useEffect, useRef, useState } from 'react';
import { Plus, Trash2, RotateCcw, X } from 'lucide-react';
import type { ChartSpec, SvgElement, TableSpec } from '../../types';
import { NumberField, Slider, Toggle } from '../../components/ui';
import { ColorButton } from '../../components/ColorPicker';
import { FontPicker } from '../../components/FontPicker';
import { svgColors, qrSvg, defaultChart, defaultTable } from '../../lib/render/svgUtil';
import { fillPrimaryColor } from '../../lib/color';
import { Field, S, SubHead, patchEls, loadFontAndRefresh } from './fields';

const pc = (f: Parameters<typeof fillPrimaryColor>[0]) => fillPrimaryColor(f);
const stop = (e: React.KeyboardEvent) => e.stopPropagation();

// ---------------------------------------------------------------------------
// Recolour (svg / icon)
// ---------------------------------------------------------------------------
export function SvgRecolor({ el, size = 26 }: { el: SvgElement; size?: number }) {
  const colors = svgColors(el.svg);
  return (
    <>
      {colors.map((c) => (
        <ColorButton
          key={c}
          value={el.colorMap[c] || (c === 'currentColor' ? '#000000' : c)}
          onChange={(f) =>
            patchEls(
              [el.id],
              (e: SvgElement) => {
                e.colorMap = { ...e.colorMap, [c]: pc(f) };
              },
              'svg-color-' + c,
            )
          }
          allowGradient={false}
          size={size}
          title="Recolour"
        />
      ))}
    </>
  );
}

export function ColorsSection({ el }: { el: SvgElement }) {
  const ids = [el.id];
  const isIcon = el.meta?.kind === 'icon';
  const changed = Object.keys(el.colorMap || {}).length > 0;
  return (
    <S id="colors" title="Colours">
      <div className="swatch-wrap">
        <SvgRecolor el={el} size={30} />
      </div>
      {changed && (
        <button type="button" className="btn sm ghost" style={{ alignSelf: 'flex-start' }} onClick={() => patchEls(ids, { colorMap: {} })}>
          <RotateCcw size={13} /> Restore original colours
        </button>
      )}
      {isIcon && (
        <Slider
          label="Stroke width"
          value={el.strokeWidth ?? 2}
          min={0.25}
          max={6}
          step={0.25}
          onChange={(v) => patchEls(ids, { strokeWidth: v }, 'icon-sw')}
        />
      )}
      <Toggle
        label={<span className="field-label">Keep proportions when resizing</span>}
        value={el.keepRatio !== false}
        onChange={(v) => patchEls(ids, { keepRatio: v })}
      />
    </S>
  );
}

// ---------------------------------------------------------------------------
// Chart
// ---------------------------------------------------------------------------
const CHART_TYPES: { value: ChartSpec['type']; label: string }[] = [
  { value: 'column', label: 'Column' },
  { value: 'bar', label: 'Bar' },
  { value: 'line', label: 'Line' },
  { value: 'area', label: 'Area' },
  { value: 'pie', label: 'Pie' },
  { value: 'donut', label: 'Donut' },
  { value: 'progress', label: 'Progress ring' },
];

export function ChartSection({ el }: { el: SvgElement }) {
  const ids = [el.id];
  const c = el.meta?.chart || defaultChart('column');
  const setC = (fn: (c: ChartSpec) => void, key?: string) =>
    patchEls(
      ids,
      (e: SvgElement) => {
        const next = structuredClone(e.meta?.chart || defaultChart('column'));
        fn(next);
        e.meta = {
          ...(e.meta || { kind: 'chart' }),
          kind: 'chart',
          chart: next,
        };
      },
      key,
    );
  const isProgress = c.type === 'progress';
  return (
    <S id="chart" title="Chart">
      <Field label="Chart type">
        <select
          className="select"
          value={c.type}
          onChange={(e) => {
            const t = e.target.value as ChartSpec['type'];
            setC((x) => {
              if (t === 'progress' && x.type !== 'progress') {
                const d = defaultChart('progress');
                x.labels = d.labels;
                x.values = d.values;
                x.colors = d.colors;
              } else if (t !== 'progress' && x.type === 'progress') {
                const d = defaultChart(t);
                x.labels = d.labels;
                x.values = d.values;
                x.colors = d.colors;
              }
              x.type = t;
            });
          }}
        >
          {CHART_TYPES.map((t) => (
            <option key={t.value} value={t.value}>
              {t.label}
            </option>
          ))}
        </select>
      </Field>
      <SubHead>Data</SubHead>
      {isProgress ? (
        <div className="row">
          <span className="field-label grow">Progress</span>
          <div style={{ width: 96 }}>
            <NumberField value={c.values[0] ?? 0} min={0} max={100} unit="%" onChange={(v) => setC((x) => void (x.values[0] = v), 'chart-val')} />
          </div>
          <ColorButton
            value={c.colors[0] || '#7c5cff'}
            onChange={(f) => setC((x) => void (x.colors[0] = pc(f)), 'chart-col0')}
            allowGradient={false}
            size={24}
            title="Bar colour"
          />
          <ColorButton
            value={c.colors[1] || '#e5e7eb'}
            onChange={(f) => setC((x) => void (x.colors[1] = pc(f)), 'chart-col1')}
            allowGradient={false}
            size={24}
            title="Track colour"
          />
        </div>
      ) : (
        <div className="data-table">
          {c.labels.map((label, i) => (
            <div className="data-row" key={i}>
              <ColorButton
                value={c.colors[i % Math.max(1, c.colors.length)] || '#7c5cff'}
                onChange={(f) =>
                  setC((x) => {
                    while (x.colors.length <= i) x.colors.push(x.colors[x.colors.length % Math.max(1, x.colors.length)] || '#7c5cff');
                    x.colors[i] = pc(f);
                  }, 'chart-c' + i)
                }
                allowGradient={false}
                size={20}
                title="Series colour"
              />
              <input
                className="input sm"
                value={label}
                onChange={(e) => setC((x) => void (x.labels[i] = e.target.value), 'chart-l' + i)}
                onKeyDown={stop}
                aria-label="Label"
              />
              <input
                className="input sm num"
                type="number"
                value={c.values[i] ?? 0}
                onChange={(e) => setC((x) => void (x.values[i] = parseFloat(e.target.value) || 0), 'chart-v' + i)}
                onKeyDown={stop}
                aria-label="Value"
              />
              <button
                type="button"
                className="icon-btn sm"
                disabled={c.labels.length <= 1}
                onClick={() =>
                  setC((x) => {
                    x.labels.splice(i, 1);
                    x.values.splice(i, 1);
                    if (x.colors.length > i && x.colors.length > 1) x.colors.splice(i, 1);
                  })
                }
                aria-label="Remove row"
              >
                <X size={14} />
              </button>
            </div>
          ))}
          <button
            type="button"
            className="btn sm ghost"
            onClick={() =>
              setC((x) => {
                x.labels.push(`Item ${x.labels.length + 1}`);
                x.values.push(10);
              })
            }
          >
            <Plus size={14} /> Add row
          </button>
        </div>
      )}
      <SubHead>Style</SubHead>
      <div className="grid2">
        <Toggle label={<span className="field-label">Labels</span>} value={c.showLabels} onChange={(v) => setC((x) => void (x.showLabels = v))} />
        <Toggle label={<span className="field-label">Values</span>} value={c.showValues} onChange={(v) => setC((x) => void (x.showValues = v))} />
      </div>
      <div className="row">
        <span className="field-label grow">Text</span>
        <ColorButton
          value={c.textColor}
          onChange={(f) => setC((x) => void (x.textColor = pc(f)), 'chart-text')}
          allowGradient={false}
          square
          size={26}
          title="Text colour"
        />
      </div>
      <div className="insp-font">
        <FontPicker
          value={c.fontFamily}
          onChange={(f) => {
            setC((x) => void (x.fontFamily = f));
            loadFontAndRefresh(f, 'bold');
          }}
        />
      </div>
    </S>
  );
}

// ---------------------------------------------------------------------------
// Table
// ---------------------------------------------------------------------------
export function TableSection({ el }: { el: SvgElement }) {
  const ids = [el.id];
  const t = el.meta?.table || defaultTable();
  const cols = Math.max(1, ...t.rows.map((r) => r.length));
  const setT = (fn: (t: TableSpec) => void, key?: string) =>
    patchEls(
      ids,
      (e: SvgElement) => {
        const next = structuredClone(e.meta?.table || defaultTable());
        fn(next);
        e.meta = {
          ...(e.meta || { kind: 'table' }),
          kind: 'table',
          table: next,
        };
      },
      key,
    );
  const colorRow = (label: string, k: keyof TableSpec) => (
    <div className="row" key={k}>
      <span className="field-label grow">{label}</span>
      <ColorButton
        value={t[k] as string}
        onChange={(f) => setT((x) => void ((x as any)[k] = pc(f)), 'tbl-' + k)}
        allowGradient={false}
        square
        size={24}
        title={label}
      />
    </div>
  );
  return (
    <S id="table" title="Table">
      <div
        className="tbl-edit"
        style={{
          gridTemplateColumns: `repeat(${cols}, minmax(54px, 1fr)) 26px`,
        }}
      >
        {t.rows.map((r, ri) => (
          <TableRow key={ri} r={r} ri={ri} cols={cols} canDelete={t.rows.length > 1} setT={setT} />
        ))}
        {Array.from({ length: cols }, (_, ci) => (
          <button
            key={'dc' + ci}
            type="button"
            className="icon-btn sm tbl-delcol"
            disabled={cols <= 1}
            onClick={() => setT((x) => x.rows.forEach((row) => row.splice(ci, 1)))}
            aria-label="Remove column"
            title="Remove column"
          >
            <X size={12} />
          </button>
        ))}
      </div>
      <div className="grid2">
        <button type="button" className="btn sm" onClick={() => setT((x) => void x.rows.push(Array.from({ length: cols }, () => '')))}>
          <Plus size={14} /> Row
        </button>
        <button type="button" className="btn sm" onClick={() => setT((x) => x.rows.forEach((row, i) => row.push(i === 0 ? `Column ${cols + 1}` : '')))}>
          <Plus size={14} /> Column
        </button>
      </div>
      <SubHead>Style</SubHead>
      <div className="grid2 tbl-colors">
        {colorRow('Header fill', 'headerFill')}
        {colorRow('Header text', 'headerColor')}
        {colorRow('Cell fill', 'cellFill')}
        {colorRow('Alternate fill', 'altFill')}
        {colorRow('Text', 'textColor')}
        {colorRow('Borders', 'borderColor')}
      </div>
      <div className="insp-font-row">
        <div className="grow" style={{ minWidth: 0 }}>
          <FontPicker
            value={t.fontFamily}
            onChange={(f) => {
              setT((x) => void (x.fontFamily = f));
              loadFontAndRefresh(f, 'bold');
            }}
          />
        </div>
        <div style={{ width: 76 }}>
          <NumberField value={t.fontSize} min={4} max={400} onChange={(v) => setT((x) => void (x.fontSize = v), 'tbl-fs')} title="Font size" />
        </div>
      </div>
    </S>
  );
}

function TableRow({
  r,
  ri,
  cols,
  canDelete,
  setT,
}: {
  r: string[];
  ri: number;
  cols: number;
  canDelete: boolean;
  setT: (fn: (t: TableSpec) => void, key?: string) => void;
}) {
  return (
    <>
      {Array.from({ length: cols }, (_, ci) => (
        <input
          key={ci}
          className={'input sm' + (ri === 0 ? ' head' : '')}
          value={r[ci] ?? ''}
          onChange={(e) =>
            setT((x) => {
              while (x.rows[ri].length <= ci) x.rows[ri].push('');
              x.rows[ri][ci] = e.target.value;
            }, `tbl-cell-${ri}-${ci}`)
          }
          onKeyDown={stop}
          aria-label={`Row ${ri + 1}, column ${ci + 1}`}
        />
      ))}
      <button
        type="button"
        className="icon-btn sm"
        disabled={!canDelete}
        onClick={() => setT((x) => void x.rows.splice(ri, 1))}
        aria-label="Remove row"
        title="Remove row"
      >
        <Trash2 size={13} />
      </button>
    </>
  );
}

// ---------------------------------------------------------------------------
// QR code
// ---------------------------------------------------------------------------
export function QrSection({ el }: { el: SvgElement }) {
  const q = el.meta?.qr || {
    value: 'https://',
    fg: '#111827',
    bg: '#ffffff',
    margin: 2,
  };
  const [value, setValue] = useState(q.value);
  const seq = useRef(0);
  useEffect(() => setValue(q.value), [el.id]);

  const regen = async (next: typeof q, key?: string) => {
    const n = ++seq.current;
    const svg = await qrSvg(next.value, next.fg, next.bg, next.margin);
    if (n !== seq.current) return;
    patchEls(
      [el.id],
      {
        svg,
        colorMap: {},
        meta: { ...(el.meta || { kind: 'qr' }), kind: 'qr', qr: next },
      } as any,
      key,
    );
  };

  return (
    <S id="qr" title="QR code">
      <Field label="Link or text">
        <textarea
          className="input"
          rows={2}
          value={value}
          onChange={(e) => {
            setValue(e.target.value);
            void regen({ ...q, value: e.target.value }, 'qr-value');
          }}
          onKeyDown={stop}
        />
      </Field>
      <div className="grid2">
        <div className="row">
          <span className="field-label grow">Code</span>
          <ColorButton
            value={q.fg}
            onChange={(f) => void regen({ ...q, value, fg: pc(f) }, 'qr-fg')}
            allowGradient={false}
            allowTransparent={false}
            square
            size={26}
            title="Code colour"
          />
        </div>
        <div className="row">
          <span className="field-label grow">Background</span>
          <ColorButton
            value={q.bg}
            onChange={(f) =>
              void regen(
                {
                  ...q,
                  value,
                  bg: pc(f) === 'transparent' ? '#00000000' : pc(f),
                },
                'qr-bg',
              )
            }
            allowGradient={false}
            square
            size={26}
            title="Background colour"
          />
        </div>
      </div>
      <Slider label="Margin" value={q.margin} min={0} max={8} onChange={(v) => void regen({ ...q, value, margin: v }, 'qr-margin')} />
    </S>
  );
}
