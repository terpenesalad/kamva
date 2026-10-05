import { useEffect, useMemo, useState } from 'react';
import { ArrowLeft, BarChart3, Eraser, Mic, QrCode, Smile, Type } from 'lucide-react';
import type { SvgElement } from '../../types';
import { useEditor, useSelectedElements } from '../../store/editor';
import { useUI } from '../../store/ui';
import { makeSvg } from '../../lib/defaults';
import { qrSvg } from '../../lib/render/svgUtil';
import { removeBackground } from '../../lib/bgremove';
import { importFontFiles } from '../../lib/actions';
import { fillPrimaryColor } from '../../lib/color';
import { ColorButton } from '../../components/ColorPicker';
import { Slider } from '../../components/ui';
import { PanelHead, SearchBox, SectionHead, centreXY, pageDims } from './common';
import { ChartGrid, EmojiGrid, TableGrid, searchEmoji } from './library';

type App = 'qr' | 'charts' | 'emoji' | 'bgremove' | null;

function QrApp() {
  const sel = useSelectedElements();
  const qrSel = sel.length === 1 && sel[0].type === 'svg' && sel[0].meta?.kind === 'qr' ? (sel[0] as SvgElement) : null;
  const [value, setValue] = useState('https://');
  const [fg, setFg] = useState('#111827');
  const [bg, setBg] = useState('#ffffff');
  const [margin, setMargin] = useState(2);
  const [preview, setPreview] = useState('');
  const [busy, setBusy] = useState(false);

  // load the selected QR's settings
  const selId = qrSel?.id;
  useEffect(() => {
    const q = qrSel?.meta?.qr;
    if (!q) return;
    setValue(q.value);
    setFg(q.fg);
    setBg(q.bg);
    setMargin(q.margin);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selId]);

  useEffect(() => {
    let alive = true;
    const t = setTimeout(() => {
      qrSvg(value, fg, bg, margin)
        .then((s) => alive && setPreview('data:image/svg+xml;charset=utf-8,' + encodeURIComponent(s)))
        .catch(() => alive && setPreview(''));
    }, 120);
    return () => {
      alive = false;
      clearTimeout(t);
    };
  }, [value, fg, bg, margin]);

  const valid = value.trim().length > 0 && value.trim() !== 'https://';

  const add = async () => {
    const d = pageDims();
    if (!d || !valid) return;
    setBusy(true);
    try {
      const svg = await qrSvg(value.trim(), fg, bg, margin);
      const s = d.S * 0.3;
      const { x, y } = centreXY(s, s);
      useEditor.getState().addElements([makeSvg(svg, x, y, s, s, { name: 'QR code', meta: { kind: 'qr', qr: { value: value.trim(), fg, bg, margin } } })]);
    } catch (e) {
      useUI.getState().toast(`Couldn't make the QR code: ${e instanceof Error ? e.message : e}. Try shorter text.`, 'error');
    } finally {
      setBusy(false);
    }
  };

  const update = async () => {
    if (!qrSel || !valid) return;
    setBusy(true);
    try {
      const svg = await qrSvg(value.trim(), fg, bg, margin);
      useEditor.getState().updateElements([qrSel.id], { svg, colorMap: {}, meta: { kind: 'qr', qr: { value: value.trim(), fg, bg, margin } } } as Partial<SvgElement>);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="col app-body" style={{ gap: 12 }}>
      <label className="col" style={{ gap: 6 }}>
        <span className="field-label">Website or text</span>
        <textarea
          className="input"
          rows={3}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => e.stopPropagation()}
          placeholder="https://example.com"
          spellCheck={false}
        />
      </label>
      <div className="qr-preview checker">{preview && <img src={preview} alt="QR code preview" />}</div>
      <div className="row" style={{ justifyContent: 'space-between' }}>
        <span className="field-label">Foreground</span>
        <ColorButton value={fg} onChange={(f) => setFg(fillPrimaryColor(f))} allowGradient={false} allowTransparent={false} title="Foreground colour" />
      </div>
      <div className="row" style={{ justifyContent: 'space-between' }}>
        <span className="field-label">Background</span>
        <ColorButton value={bg} onChange={(f) => setBg(fillPrimaryColor(f))} allowGradient={false} title="Background colour" />
      </div>
      <Slider label="Margin" value={margin} min={0} max={8} onChange={setMargin} />
      {qrSel ? (
        <div className="grid2">
          <button className="btn primary" disabled={!valid || busy} onClick={() => void update()}>
            Update selected
          </button>
          <button className="btn" disabled={!valid || busy} onClick={() => void add()}>
            Add new
          </button>
        </div>
      ) : (
        <button className="btn primary block" disabled={!valid || busy} onClick={() => void add()}>
          Add QR code
        </button>
      )}
      {!valid && <p className="panel-hint">Enter a link or some text to encode.</p>}
    </div>
  );
}

function BgRemoveApp() {
  const sel = useSelectedElements();
  const img = sel.length === 1 && sel[0].type === 'image' && sel[0].assetId ? sel[0] : null;
  const [busy, setBusy] = useState(false);
  return (
    <div className="col app-body" style={{ gap: 12 }}>
      <p className="muted small" style={{ margin: 0 }}>
        Removes plain or evenly lit backgrounds from photos, logos and product shots. It works best when the subject stands out clearly from the
        background.
      </p>
      <ol className="app-steps">
        <li>Select a photo on the page.</li>
        <li>Click Remove background.</li>
        <li>Fine-tune or restore the original from the Photo panel.</li>
      </ol>
      <button
        className="btn primary block"
        disabled={!img || busy}
        onClick={async () => {
          if (!img) return;
          setBusy(true);
          try {
            await removeBackground(img.id);
          } finally {
            setBusy(false);
          }
        }}
      >
        <Eraser size={15} /> {busy ? 'Removing background…' : 'Remove background'}
      </button>
      {!img && <p className="panel-hint">Select an image to enable this.</p>}
    </div>
  );
}

function EmojiApp() {
  const [q, setQ] = useState('');
  const list = useMemo(() => searchEmoji(q), [q]);
  return (
    <div className="col app-body" style={{ gap: 10 }}>
      <SearchBox value={q} onChange={setQ} placeholder="Search emoji" />
      {list.length ? <EmojiGrid items={list} /> : <p className="panel-hint">No emoji match “{q}”.</p>}
    </div>
  );
}

const APPS: { id: Exclude<App, null> | 'font' | 'voice'; title: string; desc: string; icon: React.ReactNode; tone: string }[] = [
  { id: 'qr', title: 'QR code', desc: 'Turn a link into a scannable code', icon: <QrCode size={20} />, tone: 'violet' },
  { id: 'charts', title: 'Charts and tables', desc: 'Bar, line, pie, progress and tables', icon: <BarChart3 size={20} />, tone: 'blue' },
  { id: 'emoji', title: 'Emoji', desc: 'Colourful emoji stickers', icon: <Smile size={20} />, tone: 'amber' },
  { id: 'bgremove', title: 'Remove background', desc: 'Cut out the subject of a photo', icon: <Eraser size={20} />, tone: 'green' },
  { id: 'font', title: 'Upload a font', desc: 'Add TTF, OTF or WOFF fonts', icon: <Type size={20} />, tone: 'rose' },
  { id: 'voice', title: 'Record voice-over', desc: 'Narrate over your design', icon: <Mic size={20} />, tone: 'slate' },
];

export function AppsPanel() {
  const [app, setApp] = useState<App>(null);

  if (app) {
    const meta = APPS.find((a) => a.id === app)!;
    return (
      <>
        <PanelHead
          title={
            <span className="row" style={{ gap: 6 }}>
              <button className="icon-btn sm" onClick={() => setApp(null)} aria-label="Back to apps">
                <ArrowLeft size={16} />
              </button>
              {meta.title}
            </span>
          }
        />
        <div className="panel-body">
          {app === 'qr' && <QrApp />}
          {app === 'bgremove' && <BgRemoveApp />}
          {app === 'emoji' && <EmojiApp />}
          {app === 'charts' && (
            <>
              <SectionHead title="Charts" />
              <ChartGrid />
              <SectionHead title="Tables" />
              <TableGrid />
              <p className="panel-hint">Select a chart or table to edit its data in the inspector.</p>
            </>
          )}
        </div>
      </>
    );
  }

  return (
    <>
      <PanelHead title="Apps" />
      <div className="panel-body">
        <div className="col app-list">
          {APPS.map((a) => (
            <button
              key={a.id}
              className="app-card"
              onClick={() => {
                if (a.id === 'font') void importFontFiles();
                else if (a.id === 'voice') {
                  useUI.getState().setTimelineOpen(true);
                  useUI.getState().toast('Use the microphone button in the timeline to record a voice-over', 'info', 5000);
                } else setApp(a.id);
              }}
            >
              <span className={'app-icon ' + a.tone}>{a.icon}</span>
              <span className="col" style={{ gap: 2, minWidth: 0 }}>
                <span className="app-title">{a.title}</span>
                <span className="app-desc">{a.desc}</span>
              </span>
            </button>
          ))}
        </div>
        <SectionHead title="Quick add" />
        <ChartGrid limit={3} />
      </div>
    </>
  );
}

