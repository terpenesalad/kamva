import { useEffect, useRef, useState } from 'react';
import { Crop, ImageUp, Undo2, Wand, RotateCcw, Image as ImageIcon, Clock } from 'lucide-react';
import type { ImageAdjust, ImageElement, VideoElement } from '../../types';
import { useEditor, useActivePage } from '../../store/editor';
import { useUI } from '../../store/ui';
import { NumberField, Slider, Toggle } from '../../components/ui';
import { ColorButton } from '../../components/ColorPicker';
import { FILTERS, processImage, effectiveAdjust, coverCrop } from '../../lib/render/media';
import { FRAME_LIST } from '../../lib/shapes';
import { getAsset, getImageAsync, allAssets, onAssetsChanged } from '../../lib/assets';
import { defaultAdjust } from '../../lib/defaults';
import { removeBackground, restoreBackground } from '../../lib/bgremove';
import { importFiles, replaceMedia } from '../../lib/actions';
import { platform, FILTERS as FILE_FILTERS } from '../../lib/platform';
import { fillPrimaryColor } from '../../lib/color';
import { setAsBackground } from '../elementActions';
import { DualRange, Field, S, ShapeGridPicker, SubHead, patchEls, ed } from './fields';

// ---------------------------------------------------------------------------
// Filter previews
// ---------------------------------------------------------------------------
const PREVIEW = 72;
const smallSources = new Map<string, HTMLCanvasElement>();
const previewCache = new Map<string, string>();

async function smallSource(assetId: string | null): Promise<{ key: string; canvas: HTMLCanvasElement } | null> {
  const key = assetId ? `insp-thumb:${assetId}` : 'insp-thumb:placeholder';
  const hit = smallSources.get(key);
  if (hit) return { key, canvas: hit };
  const c = document.createElement('canvas');
  if (assetId && getAsset(assetId)?.meta.kind === 'image') {
    const img = await getImageAsync(assetId);
    if (!img) return null;
    const s = (PREVIEW * 2) / Math.min(img.naturalWidth, img.naturalHeight);
    c.width = Math.max(1, Math.round(img.naturalWidth * Math.min(1, s)));
    c.height = Math.max(1, Math.round(img.naturalHeight * Math.min(1, s)));
    c.getContext('2d')!.drawImage(img, 0, 0, c.width, c.height);
  } else {
    // neutral placeholder scene: sky, sun and hills, so the filters read clearly
    c.width = c.height = PREVIEW * 2;
    const x = c.getContext('2d')!;
    const sky = x.createLinearGradient(0, 0, 0, c.height);
    sky.addColorStop(0, '#5aa7e0');
    sky.addColorStop(0.6, '#f6c48b');
    sky.addColorStop(1, '#e98a5b');
    x.fillStyle = sky;
    x.fillRect(0, 0, c.width, c.height);
    x.fillStyle = '#ffe08a';
    x.beginPath();
    x.arc(c.width * 0.68, c.height * 0.42, c.width * 0.13, 0, Math.PI * 2);
    x.fill();
    x.fillStyle = '#3f7d4e';
    x.beginPath();
    x.moveTo(0, c.height * 0.78);
    x.quadraticCurveTo(c.width * 0.3, c.height * 0.55, c.width * 0.6, c.height * 0.75);
    x.quadraticCurveTo(c.width * 0.85, c.height * 0.9, c.width, c.height * 0.7);
    x.lineTo(c.width, c.height);
    x.lineTo(0, c.height);
    x.fill();
    x.fillStyle = '#2b5a39';
    x.fillRect(0, c.height * 0.9, c.width, c.height * 0.1);
  }
  smallSources.set(key, c);
  return { key, canvas: c };
}

function FilterThumb({ assetId, filter }: { assetId: string | null; filter: string }) {
  const [url, setUrl] = useState<string | null>(() => previewCache.get(`${assetId}|${filter}`) || null);
  useEffect(() => {
    const ck = `${assetId}|${filter}`;
    if (previewCache.has(ck)) {
      setUrl(previewCache.get(ck)!);
      return;
    }
    let alive = true;
    void smallSource(assetId).then((src) => {
      if (!src || !alive) return;
      // stagger work so the panel opens instantly
      setTimeout(() => {
        if (!alive) return;
        const crop = coverCrop(src.canvas.width, src.canvas.height, 1, 1);
        const out = processImage(src.canvas, src.key, crop, effectiveAdjust(defaultAdjust(), filter, 1), PREVIEW, PREVIEW);
        const u = out.toDataURL('image/jpeg', 0.82);
        previewCache.set(ck, u);
        setUrl(u);
      }, 0);
    });
    return () => {
      alive = false;
    };
  }, [assetId, filter]);
  return url ? <img src={url} alt="" draggable={false} /> : <span className="flt-loading" />;
}

// ---------------------------------------------------------------------------
// Photo section (image and video)
// ---------------------------------------------------------------------------
const ADJ_GROUPS: {
  title: string;
  keys: { k: keyof ImageAdjust; label: string; min: number; max: number }[];
}[] = [
  {
    title: 'Light',
    keys: [
      { k: 'brightness', label: 'Brightness', min: -100, max: 100 },
      { k: 'contrast', label: 'Contrast', min: -100, max: 100 },
      { k: 'highlights', label: 'Highlights', min: -100, max: 100 },
      { k: 'shadows', label: 'Shadows', min: -100, max: 100 },
    ],
  },
  {
    title: 'Colour',
    keys: [
      { k: 'saturation', label: 'Saturation', min: -100, max: 100 },
      { k: 'temperature', label: 'Temperature', min: -100, max: 100 },
      { k: 'tint', label: 'Tint', min: -100, max: 100 },
      { k: 'hue', label: 'Hue', min: -180, max: 180 },
    ],
  },
  {
    title: 'Texture',
    keys: [
      { k: 'sharpen', label: 'Sharpen', min: 0, max: 100 },
      { k: 'blur', label: 'Blur', min: 0, max: 100 },
      { k: 'grain', label: 'Grain', min: 0, max: 100 },
      { k: 'vignette', label: 'Vignette', min: 0, max: 100 },
    ],
  },
  {
    title: 'Effects',
    keys: [
      { k: 'sepia', label: 'Sepia', min: 0, max: 100 },
      { k: 'grayscale', label: 'Greyscale', min: 0, max: 100 },
      { k: 'invert', label: 'Invert', min: 0, max: 100 },
    ],
  },
];

export async function replaceMediaDialog(elId: string) {
  const files = await platform.openFiles({
    filters: [...FILE_FILTERS.images, ...FILE_FILTERS.video],
    title: 'Replace media',
  });
  if (!files.length) return;
  const before = new Set(allAssets().map((a) => a.meta.id));
  await importFiles([files[0]], { place: false });
  const fresh = allAssets().find((a) => !before.has(a.meta.id) && (a.meta.kind === 'image' || a.meta.kind === 'video'));
  if (fresh) await replaceMedia(elId, fresh.meta.id);
  else useUI.getState().toast('Choose a photo or video file (PNG, JPG, WebP, MP4 or WebM) to replace this media.', 'error', 5000);
}

export function PhotoSection({ el }: { el: ImageElement | VideoElement }) {
  const ids = [el.id];
  const isImage = el.type === 'image';
  const original = (el as any).originalAssetId as string | undefined;
  const adjusted = Object.entries(el.adjust).some(([, v]) => Math.abs(v as number) > 0.001);
  const [bgBusy, setBgBusy] = useState(false);
  const [tol, setTol] = useState<number>((el as any).bgTolerance ?? 34);
  const tolTimer = useRef<number>(0);
  useEffect(() => setTol((el as any).bgTolerance ?? 34), [el.id]);
  const [, force] = useState(0);
  useEffect(() => onAssetsChanged(() => force((n) => n + 1)) as () => void, []);

  const runBg = async (t: number) => {
    setBgBusy(true);
    try {
      await removeBackground(el.id, t);
    } finally {
      setBgBusy(false);
    }
  };

  const setAdj = (k: keyof ImageAdjust, v: number) =>
    patchEls(
      ids,
      (e: ImageElement) => {
        e.adjust = { ...e.adjust, [k]: v };
      },
      'adj-' + k,
    );

  return (
    <S id="photo" title={isImage ? 'Photo' : 'Filters and adjustments'}>
      {el.assetId && (
        <div className="grid2">
          <button type="button" className="btn sm" onClick={() => useEditor.getState().setCrop(el.id)}>
            <Crop size={15} /> Crop
          </button>
          <button type="button" className="btn sm" onClick={() => void replaceMediaDialog(el.id)}>
            <ImageUp size={15} /> Replace
          </button>
          <button type="button" className="btn sm" style={{ gridColumn: '1 / -1' }} onClick={setAsBackground}>
            <ImageIcon size={15} /> Set as page background
          </button>
        </div>
      )}
      {!el.assetId && (
        <button type="button" className="btn block" onClick={() => void replaceMediaDialog(el.id)}>
          <ImageUp size={15} /> Add a photo to this frame
        </button>
      )}

      <SubHead>Filters</SubHead>
      <div className="flt-grid">
        {FILTERS.map((f) => (
          <button
            key={f.id}
            type="button"
            className={'flt-tile' + ((el.filter || 'none') === f.id ? ' active' : '')}
            onClick={() =>
              patchEls(ids, {
                filter: f.id,
                filterIntensity: el.filter === f.id ? el.filterIntensity : 1,
              })
            }
            title={f.name}
          >
            <span className="flt-img">
              <FilterThumb assetId={isImage ? el.assetId : null} filter={f.id} />
            </span>
            <span className="flt-name">{f.name}</span>
          </button>
        ))}
      </div>
      {el.filter && el.filter !== 'none' && (
        <Slider
          label="Filter intensity"
          value={Math.round(el.filterIntensity * 100)}
          min={0}
          max={100}
          suffix="%"
          onChange={(v) => patchEls(ids, { filterIntensity: v / 100 }, 'flt-int')}
        />
      )}

      <div className="row" style={{ marginTop: 4 }}>
        <SubHead>Adjust</SubHead>
        <span className="spacer" />
        <button type="button" className="btn sm ghost" disabled={!adjusted} onClick={() => patchEls(ids, { adjust: defaultAdjust() })}>
          <RotateCcw size={13} /> Reset adjustments
        </button>
      </div>
      {ADJ_GROUPS.map((g) => (
        <div key={g.title} className="adj-group">
          <div className="adj-title">{g.title}</div>
          {g.keys.map(({ k, label, min, max }) => (
            <Slider key={k} label={label} value={el.adjust[k] ?? 0} min={min} max={max} onChange={(v) => setAdj(k, v)} />
          ))}
        </div>
      ))}

      <SubHead>Frame and border</SubHead>
      <Field label="Frame shape">
        <ShapeGridPicker value={el.mask} options={FRAME_LIST} allowNone onChange={(k) => patchEls(ids, { mask: k as any })} />
      </Field>
      {(el.mask === 'none' || el.mask === 'rect' || el.mask === 'roundRect') && (
        <Slider
          label="Corner rounding"
          value={el.cornerRadius}
          min={0}
          max={Math.round(Math.min(el.width, el.height) / 2)}
          onChange={(v) => patchEls(ids, { cornerRadius: v }, 'media-radius')}
        />
      )}
      <div className="row">
        <span className="field-label grow">Border</span>
        <ColorButton
          value={el.borderColor}
          onChange={(f) => patchEls(ids, { borderColor: fillPrimaryColor(f) }, 'media-border-c')}
          allowGradient={false}
          square
          size={26}
          title="Border colour"
        />
        <div style={{ width: 92 }}>
          <NumberField
            value={el.borderWidth}
            min={0}
            max={500}
            unit="px"
            onChange={(v) => patchEls(ids, { borderWidth: v }, 'media-border-w')}
            title="Border width"
          />
        </div>
      </div>

      {isImage && el.assetId && (
        <>
          <SubHead>Background remover</SubHead>
          <div className="small muted">Works best on photos with a plain, even background.</div>
          {!original ? (
            <button type="button" className="btn block" disabled={bgBusy} onClick={() => void runBg(tol)}>
              <Wand size={15} /> {bgBusy ? 'Removing background…' : 'Remove background'}
            </button>
          ) : (
            <>
              <Slider
                label="Tolerance"
                value={tol}
                min={4}
                max={120}
                onChange={(v) => {
                  setTol(v);
                  window.clearTimeout(tolTimer.current);
                  tolTimer.current = window.setTimeout(() => void runBg(v), 450);
                }}
              />
              <button type="button" className="btn block" onClick={() => restoreBackground(el.id)}>
                <Undo2 size={15} /> Restore original
              </button>
            </>
          )}
        </>
      )}
    </S>
  );
}

// ---------------------------------------------------------------------------
// Video
// ---------------------------------------------------------------------------
export function VideoSection({ el }: { el: VideoElement }) {
  const ids = [el.id];
  const page = useActivePage();
  const dur = getAsset(el.assetId)?.meta.duration || 0;
  const end = el.trimEnd ?? dur;
  const clipLen = Math.max(0, (end - el.trimStart) / (el.speed || 1));
  const max = dur || Math.max(end, el.trimStart + 1);
  const r1 = (v: number) => Math.round(v * 10) / 10;
  return (
    <S id="video" title="Video">
      <Field label="Trim" right={<span className="small faint">{clipLen.toFixed(1)}s clip</span>}>
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
            max={max}
            unit="s"
            onChange={(v) => patchEls(ids, { trimEnd: dur && v >= dur - 0.05 ? null : r1(v) }, 'trim-e')}
          />
        </div>
      </Field>
      <Slider label="Volume" value={Math.round(el.volume * 100)} min={0} max={100} suffix="%" onChange={(v) => patchEls(ids, { volume: v / 100 }, 'vol')} />
      <Slider label="Speed" value={el.speed} min={0.25} max={4} step={0.05} suffix="×" onChange={(v) => patchEls(ids, { speed: v }, 'speed')} />
      <div className="grid2">
        <Toggle label={<span className="field-label">Mute</span>} value={el.muted} onChange={(v) => patchEls(ids, { muted: v })} />
        <Toggle label={<span className="field-label">Loop</span>} value={el.loop} onChange={(v) => patchEls(ids, { loop: v })} />
      </div>
      {page && clipLen > 0 && (
        <button
          type="button"
          className="btn block"
          disabled={Math.abs(page.duration - clipLen) < 0.05}
          onClick={() => ed().updatePage(page.id, (p) => void (p.duration = Math.max(0.5, Math.round(clipLen * 10) / 10)))}
        >
          <Clock size={15} /> Match page length to clip ({clipLen.toFixed(1)}s)
        </button>
      )}
    </S>
  );
}
