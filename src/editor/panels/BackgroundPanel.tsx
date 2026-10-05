import { memo, useState } from 'react';
import { Copy, ImageMinus, ImageUp, Layers2, Upload } from 'lucide-react';
import type { Fill, ImageAdjust, PageBackground } from '../../types';
import { useEditor } from '../../store/editor';
import { useUI } from '../../store/ui';
import { DEFAULT_SWATCHES, PRESET_GRADIENTS, fillToCss } from '../../lib/color';
import { FILTERS } from '../../lib/render/media';
import { defaultAdjust } from '../../lib/defaults';
import { importDialog, setPageBackgroundAsset, errorMessage } from '../../lib/actions';
import { getAsset } from '../../lib/assets';
import type { UploadRecord } from '../../lib/idb';
import { ColorButton, ColorPanel } from '../../components/ColorPicker';
import { Slider } from '../../components/ui';
import { detachBackground } from '../elementActions';
import { dragData } from '../dnd';
import { PanelHead, SectionHead, fmtDuration, useUploads, ensureUpload } from './common';

const SOLIDS = ['#ffffff', '#f8f5f0', '#f3f4f6', '#111827', '#000000', ...DEFAULT_SWATCHES.slice(6)];

function useBg(): { pageId: string; bg: PageBackground } | null {
  const pageId = useEditor((s) => s.activePageId);
  const bg = useEditor((s) => (s.design?.pages.find((p) => p.id === s.activePageId) || s.design?.pages[0])?.background);
  return bg ? { pageId, bg } : null;
}

const upd = (pageId: string, fn: (b: PageBackground) => void, coalesce?: string) =>
  useEditor.getState().updatePage(pageId, (p) => fn(p.background), coalesce);

const BgUploadTile = memo(function BgUploadTile({ rec, active }: { rec: UploadRecord; active: boolean }) {
  return (
    <button
      className={'tile upload-tile' + (active ? ' active' : '')}
      draggable
      // register the asset early so a drop onto the canvas can use it straight away
      onPointerDown={() => void ensureUpload(rec).catch(() => undefined)}
      onDragStart={(e) => dragData(e, { type: 'background', id: rec.id })}
      onClick={async () => {
        try {
          await ensureUpload(rec);
          setPageBackgroundAsset(useEditor.getState().activePageId, rec.id);
        } catch (e) {
          useUI.getState().toast(`Couldn't use ${rec.name}: ${errorMessage(e)}`, 'error');
        }
      }}
      title={rec.name}
    >
      {rec.thumb ? <img src={rec.thumb} alt="" draggable={false} loading="lazy" /> : <span className="upload-ph">{rec.kind}</span>}
      {rec.kind === 'video' && <span className="dur-badge">{fmtDuration(rec.duration) || 'Video'}</span>}
    </button>
  );
});

function applyToAll() {
  const st = useEditor.getState();
  const src = st.design?.pages.find((p) => p.id === st.activePageId);
  if (!src || !st.design || st.design.pages.length < 2) return;
  const bg = src.background;
  st.update((d) => {
    for (const p of d.pages) if (p.id !== src.id) p.background = structuredClone(bg);
  });
  useUI.getState().toast(`Background applied to all ${st.design.pages.length} pages`, 'success');
}

export function BackgroundPanel() {
  const cur = useBg();
  const uploads = useUploads();
  const pageCount = useEditor((s) => s.design?.pages.length ?? 0);
  const [showAll, setShowAll] = useState(false);
  const [more, setMore] = useState(false);
  if (!cur) return null;
  const { pageId, bg } = cur;
  const media = (uploads || []).filter((u) => u.kind === 'image' || u.kind === 'video');
  const shown = showAll ? media : media.slice(0, 6);
  const bgAsset = bg.assetId ? getAsset(bg.assetId) : undefined;
  const adjust: ImageAdjust = { ...defaultAdjust(), ...(bg.adjust || {}) };
  const isSolid = (c: string) => bg.fill.type === 'solid' && bg.fill.color.toLowerCase() === c.toLowerCase();

  const setFill = (f: Fill, coalesce?: string) =>
    upd(
      pageId,
      (b) => {
        b.fill = structuredClone(f);
      },
      coalesce,
    );
  const setAdjust = (k: keyof ImageAdjust, v: number) =>
    upd(
      pageId,
      (b) => {
        b.adjust = { ...defaultAdjust(), ...(b.adjust || {}), [k]: v };
      },
      `bg-adjust-${k}`,
    );

  return (
    <>
      <PanelHead title="Background" />
      <div className="panel-body">
        <SectionHead title="Colour" />
        <div className="swatch-wrap">
          {SOLIDS.map((c) => (
            <button
              key={c}
              className={'swatch' + (isSolid(c) ? ' selected' : '')}
              style={{ background: c }}
              onClick={() => setFill({ type: 'solid', color: c })}
              data-tip={c}
              aria-label={`Background ${c}`}
            />
          ))}
          <span className="rainbow-wrap">
            <ColorButton value={bg.fill} onChange={(f) => setFill(f, 'bg-fill')} title="Custom colour" />
          </span>
        </div>

        <div className="bg-color-panel">
          <button className="link-btn" onClick={() => setMore(!more)} aria-expanded={more}>
            {more ? 'Hide colour options' : 'More colour options'}
          </button>
          {more && <ColorPanel value={bg.fill} onChange={(f) => setFill(f, 'bg-fill')} />}
        </div>

        <SectionHead title="Gradients" />
        <div className="swatch-wrap">
          {PRESET_GRADIENTS.map((g, i) => (
            <button
              key={i}
              className={'swatch sq' + (JSON.stringify(g) === JSON.stringify(bg.fill) ? ' selected' : '')}
              style={{ background: fillToCss(g) }}
              onClick={() => setFill(g)}
              aria-label={`Gradient ${i + 1}`}
            />
          ))}
        </div>

        <SectionHead title="Photo or video" onSeeAll={!showAll && media.length > 6 ? () => setShowAll(true) : undefined} />
        {bg.assetId && (
          <div className="bg-current">
            <div className="bg-current-thumb checker">
              {bgAsset?.meta.kind === 'image' ? <img src={bgAsset.url} alt="" /> : bgAsset ? <video src={bgAsset.url} muted preload="metadata" /> : null}
            </div>
            <div className="col" style={{ gap: 6, flex: 1, minWidth: 0 }}>
              <span className="small upload-row-name">{bgAsset?.meta.name || 'Background media'}</span>
              <div className="row" style={{ gap: 6 }}>
                <button className="btn sm" onClick={() => setPageBackgroundAsset(pageId, null)} data-tip="Remove background image">
                  <ImageMinus size={14} /> Remove
                </button>
                <button className="btn sm" onClick={() => detachBackground()} data-tip="Turn into a movable image">
                  <Layers2 size={14} /> Detach
                </button>
              </div>
            </div>
          </div>
        )}
        <div className="tile-grid cols-3">
          {shown.map((r) => (
            <BgUploadTile key={r.id} rec={r} active={bg.assetId === r.id} />
          ))}
          <button className="tile add-tile" onClick={() => void importDialog('images', false)} data-tip="Upload an image" aria-label="Upload an image">
            <Upload size={18} />
          </button>
        </div>
        {uploads && !media.length && <p className="panel-hint">Upload a photo or video, then click it to fill the page.</p>}

        {bg.assetId && (
          <>
            <SectionHead title="Filter" />
            <div className="chip-wrap">
              {FILTERS.map((f) => (
                <button
                  key={f.id}
                  className={'chip' + ((bg.filter || 'none') === f.id ? ' active' : '')}
                  onClick={() =>
                    upd(pageId, (b) => {
                      b.filter = f.id;
                      b.filterIntensity ??= 1;
                    })
                  }
                >
                  {f.name}
                </button>
              ))}
            </div>
            {(bg.filter || 'none') !== 'none' && (
              <div style={{ marginTop: 10 }}>
                <Slider
                  label="Filter strength"
                  value={Math.round((bg.filterIntensity ?? 1) * 100)}
                  min={0}
                  max={100}
                  suffix="%"
                  onChange={(v) =>
                    upd(
                      pageId,
                      (b) => {
                        b.filterIntensity = v / 100;
                      },
                      'bg-filter-int',
                    )
                  }
                />
              </div>
            )}
            <SectionHead title="Adjust" />
            <div className="col" style={{ gap: 12 }}>
              <Slider label="Brightness" value={adjust.brightness} min={-100} max={100} onChange={(v) => setAdjust('brightness', v)} />
              <Slider label="Contrast" value={adjust.contrast} min={-100} max={100} onChange={(v) => setAdjust('contrast', v)} />
              <Slider label="Saturation" value={adjust.saturation} min={-100} max={100} onChange={(v) => setAdjust('saturation', v)} />
              <Slider label="Blur" value={adjust.blur} min={0} max={100} onChange={(v) => setAdjust('blur', v)} />
              <button
                className="btn sm ghost"
                style={{ alignSelf: 'flex-start' }}
                onClick={() =>
                  upd(pageId, (b) => {
                    b.adjust = defaultAdjust();
                    b.filter = 'none';
                  })
                }
              >
                Reset adjustments
              </button>
            </div>
          </>
        )}

        {pageCount > 1 && (
          <button className="btn block apply-all" onClick={applyToAll}>
            <Copy size={15} /> Apply to all pages
          </button>
        )}
        {!bg.assetId && (
          <p className="panel-hint">
            <ImageUp size={13} style={{ verticalAlign: -2 }} /> Tip: drag a photo from here onto the page, or right-click an image on the page and choose Set as
            background.
          </p>
        )}
      </div>
    </>
  );
}
