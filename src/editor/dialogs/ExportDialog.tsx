import { useEffect, useMemo, useRef, useState } from 'react';
import {
  AudioLines,
  Check,
  CircleCheck,
  Clapperboard,
  FileImage,
  FileText,
  Film,
  FolderOpen,
  ImagePlay,
  Info,
  Package,
  PenTool,
  TriangleAlert,
} from 'lucide-react';
import { Modal, NumberField, Seg, Slider, Toggle } from '../../components/ui';
import { expandGroups, useEditor } from '../../store/editor';
import { usePrefs } from '../../store/ui';
import { isDesktop, platform } from '../../lib/platform';
import type { Design, Page } from '../../types';
import { pageThumbnail } from '../../lib/render/renderPage';
import {
  FORMATS,
  formatInfo,
  isAbort,
  runExport,
  safeFileName,
  subDesign,
  visiblePageIds,
  type ExportFormat,
  type ExportResult,
  type FormatGroup,
} from '../../lib/export';
import { clampScale, outputSize, selectionBox } from '../../lib/export/raster';
import { pdfPageSize, pdfPixelSize, type PdfQuality } from '../../lib/export/pdf';
import { RESOLUTIONS, browserWebmSupported, videoSize, type VideoResolution } from '../../lib/export/video';
import { frameCount, timelineDuration } from '../../lib/export/timeline';
import { gifSize, type GifMaxWidth } from '../../lib/export/gif';
import { hasSoundSources } from '../../lib/export/audio';
import './export.css';

type PageMode = 'all' | 'current' | 'custom';
type Phase = { kind: 'idle' } | { kind: 'running'; fraction: number; label: string } | { kind: 'done'; result: ExportResult } | { kind: 'error'; message: string };

const ICONS: Record<ExportFormat, React.ReactNode> = {
  png: <FileImage size={18} />,
  jpg: <FileImage size={18} />,
  webp: <FileImage size={18} />,
  svg: <PenTool size={18} />,
  pdf: <FileText size={18} />,
  mp4: <Film size={18} />,
  webm: <Clapperboard size={18} />,
  gif: <ImagePlay size={18} />,
  audio: <AudioLines size={18} />,
  kamva: <Package size={18} />,
};

const GROUPS: FormatGroup[] = ['Image', 'Document', 'Video', 'Audio', 'Project'];
const RASTER = new Set<ExportFormat>(['png', 'jpg', 'webp']);
const STILL = new Set<ExportFormat>(['png', 'jpg', 'webp', 'svg']);
const TIMED = new Set<ExportFormat>(['mp4', 'webm', 'gif', 'audio']);
const SCALE_STEPS = [0.5, 0.75, 1, 1.5, 2, 3, 4];

const fmtDuration = (s: number) => {
  if (s < 60) return `${+s.toFixed(1)} s`;
  const m = Math.floor(s / 60);
  const r = Math.round(s % 60);
  return `${m}:${String(r).padStart(2, '0')}`;
};

// Page thumbnails, cached per page object (a new object means the page changed)
const thumbCache = new WeakMap<Page, string>();

function PageThumb({ design, page }: { design: Design; page: Page }) {
  const [url, setUrl] = useState(() => thumbCache.get(page) || '');
  useEffect(() => {
    if (thumbCache.has(page)) return;
    let live = true;
    void pageThumbnail(design, page, 160)
      .then((c) => {
        const u = c.toDataURL('image/jpeg', 0.8);
        thumbCache.set(page, u);
        if (live) setUrl(u);
      })
      .catch(() => undefined);
    return () => {
      live = false;
    };
  }, [design, page]);
  const ar = design.width / design.height;
  return (
    <div className="xp-thumb checker" style={{ aspectRatio: String(ar) }}>
      {url && <img src={url} alt="" draggable={false} />}
    </div>
  );
}

export function ExportDialog({ onClose }: { onClose: () => void }) {
  const design = useEditor((s) => s.design);
  const activePageId = useEditor((s) => s.activePageId);
  const selectionRaw = useEditor((s) => s.selection);
  const prefs = usePrefs();

  const [format, setFormatState] = useState<ExportFormat>(() => (FORMATS.some((f) => f.id === prefs.exportFormat) ? (prefs.exportFormat as ExportFormat) : 'png'));
  const [name, setName] = useState(() => safeFileName(design?.name || ''));
  const [pageMode, setPageMode] = useState<PageMode>('all');
  const [custom, setCustom] = useState<Set<string>>(() => new Set(design ? [activePageId] : []));
  const [selOnly, setSelOnly] = useState(false);
  const [transparent, setTransparent] = useState(false);
  const [zip, setZip] = useState(false);
  const [pdfQuality, setPdfQuality] = useState<PdfQuality>('standard');
  const [resolution, setResolution] = useState<VideoResolution>('1080p');
  const [fps, setFps] = useState<number>(() => (design && [24, 30, 60].includes(design.fps) ? design.fps : 30));
  const [videoQuality, setVideoQuality] = useState<'standard' | 'high' | 'best'>('high');
  const [gifFps, setGifFps] = useState<10 | 15 | 20>(15);
  const [gifWidth, setGifWidth] = useState<GifMaxWidth>(480);
  const [audioFormat, setAudioFormat] = useState<'wav' | 'mp3'>('wav');
  const [ffmpeg, setFfmpeg] = useState<boolean | null>(isDesktop ? null : false);
  const [phase, setPhase] = useState<Phase>({ kind: 'idle' });
  const abortRef = useRef<AbortController | null>(null);

  const scale = Math.max(0.05, Math.min(16, prefs.exportScale || 1));
  const quality = Math.max(0.1, Math.min(1, prefs.jpegQuality || 0.92));

  useEffect(() => {
    let live = true;
    if (isDesktop) void platform.appInfo().then((i) => live && setFfmpeg(!!i.ffmpeg)).catch(() => live && setFfmpeg(false));
    return () => {
      live = false;
      abortRef.current?.abort();
    };
  }, []);

  const setFormat = (f: ExportFormat) => {
    setFormatState(f);
    prefs.set({ exportFormat: f });
    if (phase.kind !== 'running') setPhase({ kind: 'idle' });
  };

  const activePage = design?.pages.find((p) => p.id === activePageId) || design?.pages[0];
  const selection = useMemo(() => (activePage ? expandGroups(activePage, selectionRaw).filter((id) => activePage.elements.some((e) => e.id === id && !e.hidden)) : []), [activePage, selectionRaw]);
  const canSelOnly = STILL.has(format) && selection.length > 0;
  const useSel = canSelOnly && selOnly;

  const pageIds = useMemo(() => {
    if (!design) return [];
    if (useSel) return [activePage!.id];
    if (pageMode === 'current') return [activePage!.id];
    if (pageMode === 'custom') return design.pages.filter((p) => custom.has(p.id)).map((p) => p.id);
    return TIMED.has(format) ? design.pages.filter((p) => !p.hidden).map((p) => p.id) : visiblePageIds(design);
  }, [design, useSel, pageMode, custom, activePage, format]);

  if (!design || !activePage) return null;

  const info = formatInfo(format);
  const running = phase.kind === 'running';
  const multiPage = design.pages.length > 1;

  // ----- derived sizes ---------------------------------------------------
  const selBox = useSel ? selectionBox(activePage.elements.filter((e) => selection.includes(e.id))) : null;
  const baseW = selBox?.width ?? design.width;
  const baseH = selBox?.height ?? design.height;
  const effScale = clampScale(scale, baseW, baseH);
  const px = outputSize(baseW, baseH, effScale);
  const timedDesign = TIMED.has(format) ? subDesign(design, pageIds) : design;
  const duration = TIMED.has(format) ? timelineDuration(timedDesign) : 0;

  const close = () => {
    abortRef.current?.abort();
    onClose();
  };

  const doExport = async () => {
    if (running) return;
    const ac = new AbortController();
    abortRef.current = ac;
    setPhase({ kind: 'running', fraction: 0, label: 'Preparing' });
    let last = 0;
    try {
      const result = await runExport(
        {
          format,
          design,
          baseName: safeFileName(name),
          pageIds,
          zip,
          scale: effScale,
          transparent: (format === 'png' || format === 'webp' || format === 'svg' || format === 'pdf') && transparent,
          quality,
          selection: useSel ? selection : undefined,
          pdfQuality,
          video: { format: format === 'webm' ? 'webm' : 'mp4', fps, resolution, quality: videoQuality === 'best' ? 1 : videoQuality === 'high' ? 0.8 : 0.55 },
          gif: { fps: gifFps, maxWidth: gifWidth },
          audioFormat: audioFormat === 'mp3' && isDesktop && ffmpeg ? 'mp3' : 'wav',
        },
        (fraction, label) => {
          // throttle React updates to ~10/s
          const now = performance.now();
          if (now - last < 90 && fraction < 1) return;
          last = now;
          if (!ac.signal.aborted) setPhase({ kind: 'running', fraction, label });
        },
        ac.signal,
      );
      if (ac.signal.aborted) return;
      setPhase(result ? { kind: 'done', result } : { kind: 'idle' });
    } catch (e) {
      if (isAbort(e) || ac.signal.aborted) {
        setPhase({ kind: 'idle' });
        return;
      }
      console.error(e);
      const msg = e instanceof Error ? e.message : String(e);
      setPhase({ kind: 'error', message: msg || 'Something went wrong while exporting. Try again.' });
    } finally {
      if (abortRef.current === ac) abortRef.current = null;
    }
  };

  const cancel = () => {
    abortRef.current?.abort();
    setPhase({ kind: 'idle' });
  };

  // ----- blocking reasons ----------------------------------------------------
  let blocker: string | null = null;
  if (!pageIds.length && format !== 'kamva') blocker = 'Choose at least one page to export.';
  else if (TIMED.has(format) && !(duration > 0)) blocker = 'The chosen pages are hidden or have no duration.';
  else if (format === 'mp4' && ffmpeg === false) blocker = isDesktop ? 'Video encoding is not available in this build. Reinstall Kamva to restore it.' : 'MP4 export needs the Kamva desktop app. Export WebM or GIF instead.';
  else if (format === 'webm' && ffmpeg === false && !browserWebmSupported()) blocker = 'This browser cannot record video. Use the Kamva desktop app to export videos.';
  else if (format === 'audio' && !hasSoundSources(timedDesign)) blocker = 'This design has no sound. Add music from the Audio panel, or unmute a video, then export again.';

  // ----- option panes ---------------------------------------------------------
  const pageSection = format !== 'kamva' && !useSel && (
    <div className="xp-field">
      <div className="xp-label">Pages</div>
      <Seg<PageMode>
        value={pageMode}
        onChange={setPageMode}
        options={[
          { value: 'all', label: multiPage ? `All pages (${TIMED.has(format) ? design.pages.filter((p) => !p.hidden).length : visiblePageIds(design).length})` : 'All pages' },
          { value: 'current', label: `Current page (${design.pages.indexOf(activePage) + 1})` },
          ...(multiPage ? [{ value: 'custom' as PageMode, label: 'Choose' }] : []),
        ]}
      />
      {pageMode === 'custom' && multiPage && (
        <>
          <div className="xp-pages">
            {design.pages.map((p, i) => {
              const on = custom.has(p.id);
              return (
                <button
                  type="button"
                  key={p.id}
                  className={'xp-page' + (on ? ' on' : '') + (p.hidden ? ' hidden-page' : '')}
                  onClick={() => {
                    const next = new Set(custom);
                    if (on) next.delete(p.id);
                    else next.add(p.id);
                    setCustom(next);
                  }}
                  aria-pressed={on}
                  title={p.name || `Page ${i + 1}`}
                >
                  <PageThumb design={design} page={p} />
                  <span className="xp-check">{on && <Check size={12} strokeWidth={3} />}</span>
                  <span className="xp-page-n">{p.name ? `${i + 1}. ${p.name}` : `Page ${i + 1}`}</span>
                </button>
              );
            })}
          </div>
          <div className="row small">
            <button type="button" className="btn ghost sm" onClick={() => setCustom(new Set(design.pages.map((p) => p.id)))}>
              Select all
            </button>
            <button type="button" className="btn ghost sm" onClick={() => setCustom(new Set())}>
              Clear
            </button>
            <span className="spacer" />
            <span className="faint">{custom.size} selected</span>
          </div>
        </>
      )}
    </div>
  );

  const selectionToggle = canSelOnly && (
    <div className="xp-field">
      <Toggle value={selOnly} onChange={setSelOnly} label={`Selected elements only (${selection.length})`} />
      {selOnly && <div className="xp-hint">Crops to the selection and leaves out the background and other elements.</div>}
    </div>
  );

  const multiFiles = STILL.has(format) && pageIds.length > 1;
  const destination = multiFiles && (
    <div className="xp-field">
      <div className="xp-label">Save {pageIds.length} files as</div>
      {isDesktop ? (
        <Seg<'folder' | 'zip'>
          value={zip ? 'zip' : 'folder'}
          onChange={(v) => setZip(v === 'zip')}
          options={[
            { value: 'folder', label: 'Files in a folder' },
            { value: 'zip', label: 'One ZIP file' },
          ]}
        />
      ) : (
        <div className="xp-hint">The pages download together as one ZIP file.</div>
      )}
      <div className="xp-hint">
        Named {safeFileName(name)}-1.{format}, {safeFileName(name)}-2.{format} and so on.
      </div>
    </div>
  );

  let options: React.ReactNode = null;
  if (RASTER.has(format)) {
    options = (
      <>
        {selectionToggle}
        <div className="xp-field">
          <div className="xp-label">
            Size
            <span className="xp-dim">
              {px.width} × {px.height} px
            </span>
          </div>
          <Slider value={scale} min={0.5} max={4} step={0.25} onChange={(v) => prefs.set({ exportScale: v })} suffix="×" />
          <div className="row">
            <div className="seg xp-steps">
              {SCALE_STEPS.map((s) => (
                <button type="button" key={s} className={Math.abs(scale - s) < 0.001 ? 'active' : ''} onClick={() => prefs.set({ exportScale: s })}>
                  {s}×
                </button>
              ))}
            </div>
          </div>
          <div className="grid2">
            <NumberField label="W" unit="px" value={px.width} min={16} max={16000} onChange={(v) => prefs.set({ exportScale: Math.max(0.05, v / baseW) })} />
            <NumberField label="H" unit="px" value={px.height} min={16} max={16000} onChange={(v) => prefs.set({ exportScale: Math.max(0.05, v / baseH) })} />
          </div>
          {effScale < scale - 0.001 && <div className="xp-hint warn">Limited to {px.width} × {px.height} px, the largest size this format can save.</div>}
        </div>
        {format === 'jpg' || useSel ? null : (
          <div className="xp-field">
            <Toggle value={transparent} onChange={setTransparent} label="Transparent background" />
          </div>
        )}
        {format !== 'png' && (
          <div className="xp-field">
            <Slider label="Quality" value={Math.round(quality * 100)} min={10} max={100} step={1} suffix="%" onChange={(v) => prefs.set({ jpegQuality: v / 100 })} />
          </div>
        )}
        {pageSection}
        {destination}
      </>
    );
  } else if (format === 'svg') {
    options = (
      <>
        {selectionToggle}
        {!useSel && (
          <div className="xp-field">
            <Toggle value={transparent} onChange={setTransparent} label="Transparent background" />
          </div>
        )}
        <div className="xp-note">
          <Info size={15} />
          <span>Shapes, lines, drawings and text stay as editable vectors, with their fonts embedded. Photos, videos, curved text and glow-style text effects are embedded as images.</span>
        </div>
        {pageSection}
        {destination}
      </>
    );
  } else if (format === 'pdf') {
    const pt = pdfPageSize(design);
    const ppx = pdfPixelSize(design, pdfQuality);
    options = (
      <>
        <div className="xp-field">
          <div className="xp-label">
            Quality
            <span className="xp-dim">
              {ppx.width} × {ppx.height} px per page
            </span>
          </div>
          <Seg<PdfQuality>
            value={pdfQuality}
            onChange={setPdfQuality}
            options={[
              { value: 'standard', label: 'Standard' },
              { value: 'print', label: 'Print (300 dpi)' },
            ]}
          />
          <div className="xp-hint">
            Page size {(pt.w / 72).toFixed(2)} × {(pt.h / 72).toFixed(2)} in ({Math.round(pt.w)} × {Math.round(pt.h)} pt).
          </div>
        </div>
        <div className="xp-field">
          <Toggle value={transparent} onChange={setTransparent} label="Transparent background" />
          {transparent && <div className="xp-hint">Pages are stored losslessly, so the file will be larger.</div>}
        </div>
        {pageSection}
      </>
    );
  } else if (format === 'mp4' || format === 'webm') {
    const size = videoSize(design, resolution);
    const browserRec = format === 'webm' && ffmpeg === false;
    const vfps = browserRec ? Math.min(fps, 30) : fps;
    options = (
      <>
        <div className="xp-field">
          <div className="xp-label">
            Resolution
            <span className="xp-dim">
              {size.width} × {size.height} px
            </span>
          </div>
          <Seg<VideoResolution> value={resolution} onChange={setResolution} options={RESOLUTIONS.map((r) => ({ value: r.id, label: r.label, title: r.id === '1x' || r.id === '2x' ? `${r.label} the design size` : undefined }))} />
        </div>
        <div className="xp-field">
          <div className="xp-label">Frame rate</div>
          <Seg<string>
            value={String(fps)}
            onChange={(v) => setFps(Number(v))}
            options={[24, 30, 60].map((f) => ({ value: String(f), label: `${f} fps` }))}
          />
        </div>
        {!browserRec && (
          <div className="xp-field">
            <div className="xp-label">Quality</div>
            <Seg<'standard' | 'high' | 'best'>
              value={videoQuality}
              onChange={setVideoQuality}
              options={[
                { value: 'standard', label: 'Smaller file' },
                { value: 'high', label: 'High' },
                { value: 'best', label: 'Best' },
              ]}
            />
          </div>
        )}
        <div className="xp-stats">
          <span>{fmtDuration(duration)}</span>
          <span>{frameCount(timedDesign, vfps)} frames</span>
          <span>{hasSoundSources(timedDesign) ? 'With sound' : 'No sound'}</span>
        </div>
        {browserRec && (
          <div className="xp-note">
            <Info size={15} />
            <span>In the browser, video is recorded in real time at up to 30 fps. The desktop app exports faster and also saves MP4.</span>
          </div>
        )}
        {pageSection}
      </>
    );
  } else if (format === 'gif') {
    const size = gifSize(design, gifWidth);
    const frames = frameCount(timedDesign, gifFps);
    options = (
      <>
        <div className="xp-field">
          <div className="xp-label">
            Width
            <span className="xp-dim">
              {size.width} × {size.height} px
            </span>
          </div>
          <Seg<string>
            value={String(gifWidth)}
            onChange={(v) => setGifWidth(Number(v) as GifMaxWidth)}
            options={[320, 480, 640, 800, 0].map((w) => ({ value: String(w), label: w ? String(w) : 'Original' }))}
          />
        </div>
        <div className="xp-field">
          <div className="xp-label">Frame rate</div>
          <Seg<string> value={String(gifFps)} onChange={(v) => setGifFps(Number(v) as 10 | 15 | 20)} options={[10, 15, 20].map((f) => ({ value: String(f), label: `${f} fps` }))} />
        </div>
        <div className="xp-stats">
          <span>{fmtDuration(duration)}</span>
          <span>{frames} frames</span>
          <span>Loops forever</span>
        </div>
        {duration > 20 && (
          <div className="xp-hint warn">Long GIFs get very large. Choose fewer pages or a smaller width, or export a video instead.</div>
        )}
        {pageSection}
      </>
    );
  } else if (format === 'audio') {
    options = (
      <>
        <div className="xp-field">
          <div className="xp-label">Format</div>
          <Seg<'wav' | 'mp3'>
            value={audioFormat === 'mp3' && !(isDesktop && ffmpeg) ? 'wav' : audioFormat}
            onChange={setAudioFormat}
            options={[
              { value: 'wav', label: 'WAV (lossless)' },
              { value: 'mp3', label: 'MP3', title: isDesktop && ffmpeg ? undefined : 'MP3 needs the desktop app' },
            ]}
          />
          {audioFormat === 'mp3' && !(isDesktop && ffmpeg) && <div className="xp-hint warn">MP3 needs the Kamva desktop app, so WAV will be saved instead.</div>}
        </div>
        <div className="xp-stats">
          <span>{fmtDuration(duration)}</span>
          <span>Stereo, 48 kHz</span>
        </div>
        <div className="xp-hint">Mixes every unmuted audio track and video sound, with their volume and fades.</div>
        {pageSection}
      </>
    );
  } else {
    options = (
      <div className="xp-note">
        <Info size={15} />
        <span>Saves an editable .kamva file with every page, image, video, sound and uploaded font. Open it in Kamva on any computer to keep working.</span>
      </div>
    );
  }

  const ext = format === 'audio' ? (audioFormat === 'mp3' && isDesktop && ffmpeg ? 'mp3' : 'wav') : multiFiles && (zip || !isDesktop) ? 'zip' : info.ext;

  // ----- render ---------------------------------------------------------------
  return (
    <Modal title="Export" onClose={close} wide className="xp-modal">
      <div className="xp">
        <nav className="xp-formats" aria-label="Formats">
          {GROUPS.map((g) => (
            <div key={g} className="xp-group">
              <div className="xp-group-title">{g}</div>
              {FORMATS.filter((f) => f.group === g).map((f) => (
                <button
                  type="button"
                  key={f.id}
                  className={'xp-format' + (format === f.id ? ' active' : '')}
                  onClick={() => !running && setFormat(f.id)}
                  disabled={running && format !== f.id}
                  aria-pressed={format === f.id}
                >
                  <span className="xp-format-icon">{ICONS[f.id]}</span>
                  <span className="xp-format-text">
                    <span className="xp-format-name">{f.name}</span>
                    <span className="xp-format-desc">{f.desc}</span>
                  </span>
                </button>
              ))}
            </div>
          ))}
        </nav>

        <section className="xp-options">
          {phase.kind === 'done' ? (
            <div className="xp-done">
              <CircleCheck size={40} className="xp-done-icon" />
              <h3>Export complete</h3>
              <p className="muted">
                {phase.result.count > 1 ? `${phase.result.count} files saved` : 'Saved'}
                {isDesktop ? (
                  <>
                    {' '}
                    to <span className="xp-path">{phase.result.path}</span>
                  </>
                ) : (
                  ' to your downloads'
                )}
              </p>
              <div className="row">
                {isDesktop && (
                  <button type="button" className="btn" onClick={() => void platform.reveal(phase.result.path)}>
                    <FolderOpen size={16} /> Show in folder
                  </button>
                )}
                <button type="button" className="btn" onClick={() => setPhase({ kind: 'idle' })}>
                  Export another
                </button>
                <button type="button" className="btn primary" onClick={close}>
                  Done
                </button>
              </div>
            </div>
          ) : (
            <>
              <div className="xp-head">
                <span className="xp-head-icon">{ICONS[format]}</span>
                <div>
                  <h3>{info.name}</h3>
                  <div className="faint small">{info.desc}</div>
                </div>
              </div>

              <fieldset className="xp-body" disabled={running}>
                {options}
                <div className="xp-field">
                  <div className="xp-label">File name</div>
                  <div className="xp-name">
                    <input
                      className="input"
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      onBlur={() => setName(safeFileName(name))}
                      onKeyDown={(e) => {
                        e.stopPropagation();
                        if (e.key === 'Enter') void doExport();
                      }}
                      spellCheck={false}
                    />
                    <span className="xp-ext">.{ext}</span>
                  </div>
                </div>
              </fieldset>

              <div className="xp-foot">
                {phase.kind === 'error' && (
                  <div className="xp-error" role="alert">
                    <TriangleAlert size={16} />
                    <span>{phase.message}</span>
                  </div>
                )}
                {blocker && phase.kind !== 'running' && (
                  <div className="xp-hint warn">{blocker}</div>
                )}
                {running ? (
                  <div className="xp-progress">
                    <div className="xp-progress-row">
                      <span className="xp-progress-label">{phase.label}</span>
                      <span className="xp-progress-pct">{Math.round(phase.fraction * 100)}%</span>
                    </div>
                    <div className="xp-bar" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(phase.fraction * 100)}>
                      <div style={{ width: `${Math.max(2, phase.fraction * 100)}%` }} />
                    </div>
                    <div className="row">
                      <span className="spacer" />
                      <button type="button" className="btn" onClick={cancel}>
                        Cancel
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="row">
                    <span className="spacer" />
                    <button type="button" className="btn" onClick={close}>
                      Close
                    </button>
                    <button type="button" className="btn primary xp-go" disabled={!!blocker || (ffmpeg === null && (format === 'mp4' || format === 'webm'))} onClick={() => void doExport()}>
                      {phase.kind === 'error' ? 'Try again' : 'Export'}
                    </button>
                  </div>
                )}
              </div>
            </>
          )}
        </section>
      </div>
    </Modal>
  );
}
