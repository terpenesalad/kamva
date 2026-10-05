import { useEffect, useMemo, useState } from 'react';
import { ArrowLeftRight, Check, Copy, ExternalLink, FolderOpen, Monitor, Moon, RotateCcw, Search, Sun, Scaling } from 'lucide-react';
import type { Unit } from '../../types';
import { Modal, NumberField, Seg, Toggle, MOD, isMac } from '../../components/ui';
import { ColorButton } from '../../components/ColorPicker';
import { Logo } from '../../components/Logo';
import { useEditor } from '../../store/editor';
import { usePrefs, useUI } from '../../store/ui';
import { DESIGN_PRESETS, PRESET_CATEGORIES, DesignPreset } from '../../lib/presets';
import { fromPx, toPx, formatSize } from '../../lib/units';
import { autosave, errorMessage, resizeDesign, saveAsTemplate, startDesign } from '../../lib/actions';
import { loadProject, saveProject } from '../../lib/project';
import { uid } from '../../lib/defaults';
import { platform } from '../../lib/platform';
import { fillPrimaryColor } from '../../lib/color';
import '../inspector/inspector.css';
import '../inspector/dialogs.css';

const UNIT_OPTS: { value: Unit; label: string }[] = [
  { value: 'px', label: 'px' },
  { value: 'in', label: 'in' },
  { value: 'mm', label: 'mm' },
  { value: 'cm', label: 'cm' },
];
const DEC: Record<Unit, number> = { px: 0, in: 2, mm: 0, cm: 2 };
const STEP: Record<Unit, number> = { px: 1, in: 0.1, mm: 1, cm: 0.1 };

/**
 * The shared Modal stops keydown propagation at the dialog, so its window-level
 * Escape listener never sees keys pressed while focus is inside. Handle it here.
 */
function EscClose({ onClose, children, className }: { onClose: () => void; children: React.ReactNode; className?: string }) {
  return (
    <div
      className={className}
      onKeyDownCapture={(e) => {
        if (e.key === 'Escape' && !(e.target as HTMLElement).closest('.popover, .menu')) {
          e.preventDefault();
          onClose();
        }
      }}
    >
      {children}
    </div>
  );
}

// ===========================================================================
// Resize
// ===========================================================================
function PresetGlyph({ w, h }: { w: number; h: number }) {
  const k = 22 / Math.max(w, h);
  return (
    <span className="rz-glyph">
      <span style={{ width: Math.max(4, w * k), height: Math.max(4, h * k) }} />
    </span>
  );
}

export function ResizeDialog({ onClose }: { onClose: () => void }) {
  const design = useEditor((s) => s.design);
  const dpi = design?.dpi || 96;
  const [unit, setUnit] = useState<Unit>(design?.unit || 'px');
  const [w, setW] = useState(design?.width || 1080); // px
  const [h, setH] = useState(design?.height || 1080);
  const [scale, setScale] = useState(true);
  const [q, setQ] = useState('');
  const [cat, setCat] = useState<string>('All');
  const [picked, setPicked] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const custom = usePrefs((s) => s.customSizes);

  const list = useMemo(() => {
    const s = q.trim().toLowerCase();
    const customPresets: DesignPreset[] = custom.map((c) => ({
      id: 'custom-' + c.id,
      name: c.name,
      category: 'Your sizes',
      width: c.width,
      height: c.height,
      unit: c.unit,
    }));
    return [...customPresets, ...DESIGN_PRESETS].filter(
      (p) =>
        (cat === 'All' || p.category === cat) &&
        (!s || p.name.toLowerCase().includes(s) || p.category.toLowerCase().includes(s) || (p.description || '').toLowerCase().includes(s)),
    );
  }, [q, cat, custom]);

  if (!design) return null;
  const cats = ['All', ...(custom.length ? ['Your sizes'] : []), ...PRESET_CATEGORIES];
  const changed = Math.round(w) !== design.width || Math.round(h) !== design.height || unit !== design.unit;
  const valid = w >= 1 && h >= 1 && w <= 20000 && h <= 20000;

  const pick = (p: DesignPreset) => {
    // presets are px at 96 dpi; keep the physical size for print units at this design's dpi
    const k = p.unit === 'px' ? 1 : dpi / 96;
    setW(Math.round(p.width * k));
    setH(Math.round(p.height * k));
    setUnit(p.unit);
    setPicked(p.id);
  };

  const doResize = () => {
    resizeDesign(Math.round(w), Math.round(h), unit, scale);
    useUI.getState().toast(`Resized to ${formatSize(Math.round(w), Math.round(h), unit, dpi)}`, 'success', 2000);
    onClose();
  };

  const copyAndResize = async () => {
    const d = useEditor.getState().design;
    if (!d) return;
    setBusy(true);
    try {
      await autosave(true); // keep the original safe in the library
      const data = await saveProject(d, { includeAll: true });
      const copy = await loadProject(data);
      copy.id = uid();
      copy.name = `${d.name} (copy)`;
      copy.createdAt = copy.updatedAt = Date.now();
      startDesign(copy);
      resizeDesign(Math.round(w), Math.round(h), unit, scale);
      useUI.getState().toast(`Created “${copy.name}” at ${formatSize(Math.round(w), Math.round(h), unit, dpi)}`, 'success', 2600);
      onClose();
    } catch (e) {
      useUI.getState().toast(`Couldn't copy the design: ${errorMessage(e)}`, 'error', 6000);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      title="Resize design"
      onClose={onClose}
      wide
      className="rz-modal"
      footer={
        <>
          <span className="small muted" style={{ marginRight: 'auto' }}>
            Currently {formatSize(design.width, design.height, design.unit, dpi)}
          </span>
          <button className="btn" disabled={!valid || busy} onClick={() => void copyAndResize()}>
            <Copy size={15} /> {busy ? 'Copying…' : 'Copy and resize'}
          </button>
          <button className="btn primary" disabled={!valid || !changed || busy} onClick={doResize}>
            <Scaling size={15} /> Resize
          </button>
        </>
      }
    >
      <EscClose onClose={onClose} className="rz-layout">
        <div className="rz-left">
          <div className="search">
            <Search size={16} />
            <input
              className="input"
              placeholder="Search sizes"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              onKeyDown={(e) => e.stopPropagation()}
              autoFocus
            />
          </div>
          <div className="pop-chips">
            {cats.map((c) => (
              <button key={c} type="button" className={'chip' + (cat === c ? ' active' : '')} onClick={() => setCat(c)}>
                {c}
              </button>
            ))}
          </div>
          <div className="rz-list">
            {list.map((p) => (
              <button key={p.id} type="button" className={'rz-item' + (picked === p.id ? ' active' : '')} onClick={() => pick(p)}>
                <PresetGlyph w={p.width} h={p.height} />
                <span className="rz-name">
                  <span>{p.name}</span>
                  <span className="small faint">{formatSize(p.width, p.height, p.unit, 96)}</span>
                </span>
                {picked === p.id && <Check size={16} className="rz-check" />}
              </button>
            ))}
            {!list.length && (
              <div className="small muted" style={{ padding: 12 }}>
                No sizes match “{q}”.
              </div>
            )}
          </div>
        </div>
        <div className="rz-right">
          <div className="field-label">Custom size</div>
          <div className="rz-dims">
            <NumberField
              label="W"
              value={fromPx(w, unit, dpi)}
              decimals={DEC[unit]}
              step={STEP[unit]}
              min={STEP[unit]}
              onChange={(v) => {
                setW(toPx(v, unit, dpi));
                setPicked(null);
              }}
            />
            <button
              type="button"
              className="icon-btn sm"
              onClick={() => {
                setW(h);
                setH(w);
                setPicked(null);
              }}
              data-tip="Swap orientation"
              aria-label="Swap orientation"
            >
              <ArrowLeftRight size={15} />
            </button>
            <NumberField
              label="H"
              value={fromPx(h, unit, dpi)}
              decimals={DEC[unit]}
              step={STEP[unit]}
              min={STEP[unit]}
              onChange={(v) => {
                setH(toPx(v, unit, dpi));
                setPicked(null);
              }}
            />
          </div>
          <Seg value={unit} options={UNIT_OPTS} onChange={setUnit} />
          <div className="rz-preview">
            <div className="rz-frame old" style={frameStyle(design.width, design.height, w, h, true)} />
            <div className="rz-frame" style={frameStyle(design.width, design.height, w, h, false)} />
          </div>
          <div className="small faint" style={{ textAlign: 'center' }}>
            {Math.round(w)} × {Math.round(h)} px
            {unit !== 'px' ? ` at ${dpi} dpi` : ''}
          </div>
          <div className="rz-opt">
            <Toggle label="Scale content to fit" value={scale} onChange={setScale} />
            <div className="small muted">
              {scale ? 'Elements are scaled and centred so the layout keeps its proportions.' : 'Elements keep their size and position; the page edges move.'}
            </div>
          </div>
          {!valid && (
            <div className="small" style={{ color: 'var(--danger)' }}>
              Choose a size between 1 and 20,000 pixels on each side.
            </div>
          )}
        </div>
      </EscClose>
    </Modal>
  );
}

function frameStyle(ow: number, oh: number, nw: number, nh: number, old: boolean): React.CSSProperties {
  const box = 150;
  const k = box / Math.max(ow, oh, nw, nh);
  const w = (old ? ow : nw) * k;
  const h = (old ? oh : nh) * k;
  return { width: Math.max(4, w), height: Math.max(4, h) };
}

// ===========================================================================
// Settings
// ===========================================================================
const ACCENTS = ['#7c5cff', '#2f6bff', '#0ea5a4', '#16a34a', '#e8590c', '#e5484d', '#d6409f', '#334155'];

type SettingsTab = 'appearance' | 'editor' | 'saving' | 'video';

export function SettingsDialog({ onClose }: { onClose: () => void }) {
  const p = usePrefs();
  const set = p.set;
  const [tab, setTab] = useState<SettingsTab>('appearance');
  const [info, setInfo] = useState<{
    version: string;
    userData: string;
    platform: string;
  } | null>(null);
  useEffect(() => {
    void platform
      .appInfo()
      .then(setInfo)
      .catch(() => undefined);
  }, []);

  const tabs: { id: SettingsTab; label: string }[] = [
    { id: 'appearance', label: 'Appearance' },
    { id: 'editor', label: 'Editor' },
    { id: 'saving', label: 'Saving' },
    { id: 'video', label: 'Video' },
  ];

  return (
    <Modal
      title="Settings"
      onClose={onClose}
      wide
      className="settings-modal"
      footer={
        <>
          <button
            className="btn ghost"
            style={{ marginRight: 'auto' }}
            onClick={() => {
              p.reset();
              useUI.getState().toast('Settings restored to defaults. Brand kits and saved sizes were kept.', 'info', 3000);
            }}
          >
            <RotateCcw size={15} /> Reset to defaults
          </button>
          <button className="btn primary" onClick={onClose}>
            Done
          </button>
        </>
      }
    >
      <EscClose onClose={onClose} className="set-layout">
        <nav className="set-nav">
          {tabs.map((t) => (
            <button key={t.id} type="button" className={tab === t.id ? 'active' : ''} onClick={() => setTab(t.id)}>
              {t.label}
            </button>
          ))}
        </nav>
        <div className="set-body">
          {tab === 'appearance' && (
            <>
              <SetRow label="Theme">
                <Seg
                  value={p.theme}
                  onChange={(v) => set({ theme: v })}
                  options={[
                    {
                      value: 'light',
                      label: (
                        <>
                          <Sun size={14} /> Light
                        </>
                      ),
                    },
                    {
                      value: 'dark',
                      label: (
                        <>
                          <Moon size={14} /> Dark
                        </>
                      ),
                    },
                    {
                      value: 'system',
                      label: (
                        <>
                          <Monitor size={14} /> System
                        </>
                      ),
                    },
                  ]}
                />
              </SetRow>
              <SetRow label="Accent colour" hint="Used for selection, highlights and primary buttons.">
                <div className="row" style={{ flexWrap: 'wrap', gap: 8 }}>
                  {ACCENTS.map((c) => (
                    <button
                      key={c}
                      type="button"
                      className={'swatch' + (p.accent.toLowerCase() === c ? ' selected' : '')}
                      style={{ background: c }}
                      onClick={() => set({ accent: c })}
                      aria-label={`Accent ${c}`}
                    />
                  ))}
                  <span className="vdivider" />
                  <ColorButton
                    value={p.accent}
                    onChange={(f) => {
                      const c = fillPrimaryColor(f);
                      if (/^#[0-9a-f]{6}/i.test(c)) set({ accent: c.slice(0, 7) });
                    }}
                    allowGradient={false}
                    allowTransparent={false}
                    title="Custom accent"
                  />
                </div>
              </SetRow>
              <SetRow label="Interface size">
                <Seg
                  value={String(p.uiScale)}
                  onChange={(v) => set({ uiScale: parseFloat(v) })}
                  options={[
                    { value: '0.9', label: '90%' },
                    { value: '1', label: '100%' },
                    { value: '1.1', label: '110%' },
                    { value: '1.25', label: '125%' },
                  ]}
                />
              </SetRow>
              <SetRow label="Canvas backdrop" hint="The area around your pages.">
                <div className="row">
                  <ColorButton
                    value={p.canvasBg || themeMat()}
                    onChange={(f) => set({ canvasBg: fillPrimaryColor(f) })}
                    allowGradient={false}
                    allowTransparent={false}
                    square
                    title="Canvas backdrop"
                  />
                  <button className="btn sm ghost" disabled={!p.canvasBg} onClick={() => set({ canvasBg: '' })}>
                    <RotateCcw size={13} /> Use theme default
                  </button>
                </div>
              </SetRow>
            </>
          )}
          {tab === 'editor' && (
            <>
              <SetRow label="Default unit" hint="For new designs and custom sizes.">
                <Seg value={p.unit} options={UNIT_OPTS} onChange={(v) => set({ unit: v })} />
              </SetRow>
              <SetRow label="Snapping">
                <div className="col" style={{ gap: 6 }}>
                  <Toggle label="Snap to other elements" value={p.snapObjects} onChange={(v) => set({ snapObjects: v })} />
                  <Toggle label="Snap to page edges and centre" value={p.snapPage} onChange={(v) => set({ snapPage: v })} />
                  <Toggle label="Snap to grid" value={p.snapGrid} onChange={(v) => set({ snapGrid: v })} />
                  <div className="small faint">Hold Alt while dragging to move freely.</div>
                </div>
              </SetRow>
              <SetRow label="Grid size">
                <div style={{ width: 120 }}>
                  <NumberField value={p.gridSize} min={4} max={500} unit="px" onChange={(v) => set({ gridSize: Math.round(v) })} />
                </div>
              </SetRow>
              <SetRow label="Show on canvas">
                <div className="col" style={{ gap: 6 }}>
                  <Toggle label="Grid" value={p.showGrid} onChange={(v) => set({ showGrid: v })} />
                  <Toggle label="Rulers" value={p.showRulers} onChange={(v) => set({ showRulers: v })} />
                  <Toggle label="Margins" value={p.showMargins} onChange={(v) => set({ showMargins: v })} />
                  <Toggle label="Print bleed" value={p.showBleed} onChange={(v) => set({ showBleed: v })} />
                </div>
              </SetRow>
              <SetRow label="Arrow key nudge" hint="How far the arrow keys move a selection.">
                <div className="grid2" style={{ maxWidth: 260 }}>
                  <label className="col" style={{ gap: 4 }}>
                    <span className="small muted">Arrow</span>
                    <NumberField value={p.nudge} min={0.1} max={100} decimals={1} unit="px" onChange={(v) => set({ nudge: v })} />
                  </label>
                  <label className="col" style={{ gap: 4 }}>
                    <span className="small muted">Shift + arrow</span>
                    <NumberField value={p.nudgeBig} min={1} max={500} unit="px" onChange={(v) => set({ nudgeBig: v })} />
                  </label>
                </div>
              </SetRow>
            </>
          )}
          {tab === 'saving' && (
            <>
              <SetRow label="Autosave" hint="Keeps a copy of the open design in your library on this computer, so work is never lost.">
                <Toggle value={p.autosave} onChange={(v) => set({ autosave: v })} />
              </SetRow>
              <SetRow label="Autosave every">
                <div style={{ width: 120 }}>
                  <NumberField value={p.autosaveSeconds} min={5} max={600} unit="s" onChange={(v) => set({ autosaveSeconds: Math.round(v) })} />
                </div>
                <div className="small faint">Takes effect the next time you open a design.</div>
              </SetRow>
              <SetRow label="Data location" hint="Your design library, templates and settings are stored here.">
                {info?.userData ? (
                  <div className="row">
                    <code className="set-path grow" title={info.userData}>
                      {info.userData}
                    </code>
                    <button className="btn sm" onClick={() => void platform.reveal(info.userData)}>
                      <FolderOpen size={14} /> Show
                    </button>
                  </div>
                ) : (
                  <div className="small muted">Stored in this browser's local storage.</div>
                )}
              </SetRow>
            </>
          )}
          {tab === 'video' && (
            <>
              <SetRow label="Default frame rate" hint="For new designs. Change it for the open design in the properties panel.">
                <Seg
                  value={String(p.fpsDefault)}
                  onChange={(v) => set({ fpsDefault: +v })}
                  options={[24, 25, 30, 60].map((f) => ({
                    value: String(f),
                    label: `${f} fps`,
                  }))}
                />
              </SetRow>
              <SetRow label="Default page length">
                <div style={{ width: 120 }}>
                  <NumberField
                    value={p.pageDurationDefault}
                    min={0.5}
                    max={600}
                    step={0.5}
                    decimals={1}
                    unit="s"
                    onChange={(v) => set({ pageDurationDefault: v })}
                  />
                </div>
              </SetRow>
            </>
          )}
        </div>
      </EscClose>
    </Modal>
  );
}

function themeMat() {
  const v = getComputedStyle(document.documentElement).getPropertyValue('--mat').trim();
  return /^#[0-9a-f]{6}$/i.test(v) ? v : '#808080';
}

function SetRow({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div className="set-row">
      <div className="set-label">
        <div>{label}</div>
        {hint && <div className="small faint">{hint}</div>}
      </div>
      <div className="set-ctrl">{children}</div>
    </div>
  );
}

// ===========================================================================
// Shortcuts
// ===========================================================================
const ALT = isMac ? '⌥' : 'Alt';
const SHIFT = isMac ? '⇧' : 'Shift';

type Sc = { keys: string[][]; label: string };
const S = (label: string, ...keys: string[][]): Sc => ({ label, keys });

const SHORTCUTS: { title: string; items: Sc[] }[] = [
  {
    title: 'File',
    items: [
      S('New design', [MOD, 'N']),
      S('Go to home', [MOD, SHIFT, 'H']),
      S('Open', [MOD, 'O']),
      S('Import files', [MOD, 'I']),
      S('Save', [MOD, 'S']),
      S('Save as', [MOD, SHIFT, 'S']),
      S('Export', [MOD, 'E']),
      S('Resize design', [MOD, 'R']),
      S('Settings', [MOD, ',']),
      S('Keyboard shortcuts', [MOD, '/']),
    ],
  },
  {
    title: 'Edit',
    items: [
      S('Undo', [MOD, 'Z']),
      S('Redo', [MOD, SHIFT, 'Z'], [MOD, 'Y']),
      S('Copy', [MOD, 'C']),
      S('Cut', [MOD, 'X']),
      S('Paste (elements, images or SVG)', [MOD, 'V']),
      S('Duplicate', [MOD, 'D']),
      S('Select all', [MOD, 'A']),
      S('Delete', ['Delete'], ['Backspace']),
      S('Copy style', [MOD, ALT, 'C']),
      S('Paste style', [MOD, ALT, 'V']),
      S('Deselect, finish crop or stop editing', ['Esc']),
    ],
  },
  {
    title: 'Arrange',
    items: [
      S('Group', [MOD, 'G']),
      S('Ungroup', [MOD, SHIFT, 'G']),
      S('Bring forward', [MOD, ']']),
      S('Bring to front', [MOD, ALT, ']']),
      S('Send backward', [MOD, '[']),
      S('Send to back', [MOD, ALT, '[']),
      S('Lock or unlock', [MOD, SHIFT, 'L']),
      S('Centre horizontally on page', [SHIFT, 'A']),
      S('Nudge', ['←', '→', '↑', '↓']),
      S('Nudge further', [SHIFT, 'Arrow']),
    ],
  },
  {
    title: 'Text',
    items: [S('Edit selected text', ['Enter']), S('Bold', [MOD, 'B']), S('Underline', [MOD, 'U']), S('Finish editing', [MOD, 'Enter'], ['Esc'])],
  },
  {
    title: 'Add',
    items: [S('Text box', ['T']), S('Rectangle', ['R']), S('Circle', ['C']), S('Line', ['L']), S('Draw tool', ['D']), S('New page', [MOD, 'Enter'])],
  },
  {
    title: 'Tools and view',
    items: [
      S('Select tool', ['V']),
      S('Hand tool', ['H']),
      S('Pan while held', ['Space']),
      S('Zoom in', [MOD, '+']),
      S('Zoom out', [MOD, '-']),
      S('Fit to screen', [MOD, '0']),
      S('Actual size', [MOD, '1']),
      S('Toggle rulers', [MOD, SHIFT, 'R']),
      S('Toggle grid', [MOD, "'"]),
      S('Toggle timeline', [MOD, SHIFT, 'T']),
    ],
  },
  {
    title: 'Pages and playback',
    items: [S('Previous or next page (nothing selected)', ['←', '→']), S('Play or pause', ['K']), S('Present', [SHIFT, 'P'], [MOD, ALT, 'P'])],
  },
  {
    title: 'Mouse',
    items: [
      S('Add to selection', [SHIFT, 'Click']),
      S('Move along one axis', [SHIFT, 'Drag']),
      S('Move without snapping', [ALT, 'Drag']),
      S('Zoom', [MOD, 'Scroll']),
      S('Scroll sideways', [SHIFT, 'Scroll']),
      S('Pan', ['Middle-drag']),
      S('Edit text, crop photo or add text to shape', ['Double-click']),
      S('Change the page background', ['Double-click page']),
      S('More options', ['Right-click']),
    ],
  },
];

export function ShortcutsDialog({ onClose }: { onClose: () => void }) {
  const [q, setQ] = useState('');
  const s = q.trim().toLowerCase();
  const groups = SHORTCUTS.map((g) => ({
    ...g,
    items: g.items.filter((i) => !s || i.label.toLowerCase().includes(s) || g.title.toLowerCase().includes(s)),
  })).filter((g) => g.items.length);
  return (
    <Modal title="Keyboard shortcuts" onClose={onClose} wide className="sc-modal">
      <EscClose onClose={onClose}>
        <div className="search" style={{ marginBottom: 12 }}>
          <Search size={16} />
          <input
            className="input"
            placeholder="Search shortcuts"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            autoFocus
            onKeyDown={(e) => e.stopPropagation()}
          />
        </div>
        <div className="sc-grid">
          {groups.map((g) => (
            <section key={g.title} className="sc-group">
              <h4>{g.title}</h4>
              <table>
                <tbody>
                  {g.items.map((it) => (
                    <tr key={it.label}>
                      <td>{it.label}</td>
                      <td className="sc-keys">
                        {it.keys.map((combo, ci) => (
                          <span key={ci} className="sc-combo">
                            {ci > 0 && <span className="faint sc-or">or</span>}
                            {combo.map((k, ki) => (
                              <kbd key={ki}>{k}</kbd>
                            ))}
                          </span>
                        ))}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </section>
          ))}
          {!groups.length && <div className="muted">No shortcuts match “{q}”.</div>}
        </div>
      </EscClose>
    </Modal>
  );
}

// ===========================================================================
// About
// ===========================================================================
const CREDITS: { name: string; note: string; url: string }[] = [
  {
    name: 'Electron',
    note: 'Desktop shell, MIT',
    url: 'https://www.electronjs.org',
  },
  { name: 'React', note: 'Interface, MIT', url: 'https://react.dev' },
  { name: 'Konva', note: 'Canvas engine, MIT', url: 'https://konvajs.org' },
  {
    name: 'FFmpeg',
    note: 'Video encoding, GPL. Bundled as a separate program.',
    url: 'https://ffmpeg.org',
  },
  {
    name: 'pdf.js',
    note: 'PDF import, Apache 2.0',
    url: 'https://mozilla.github.io/pdf.js/',
  },
  {
    name: 'jsPDF',
    note: 'PDF export, MIT',
    url: 'https://github.com/parallax/jsPDF',
  },
  { name: 'Lucide', note: 'Icons, ISC', url: 'https://lucide.dev' },
  {
    name: 'Fontsource',
    note: 'Bundled fonts under the SIL Open Font License',
    url: 'https://fontsource.org',
  },
];

export function AboutDialog({ onClose }: { onClose: () => void }) {
  const [info, setInfo] = useState<{
    version: string;
    platform: string;
    ffmpeg: boolean;
  } | null>(null);
  useEffect(() => {
    void platform
      .appInfo()
      .then(setInfo)
      .catch(() => undefined);
  }, []);
  return (
    <Modal title="About Kamva" onClose={onClose} className="about-modal">
      <EscClose onClose={onClose}>
        <div className="about-hero">
          <Logo size={44} withWord />
          <div className="small muted">
            Version {info?.version ?? '…'}
            {info?.platform ? ` · ${info.platform}` : ''}
            {info && !info.ffmpeg && info.platform !== 'web' ? ' · video export unavailable' : ''}
          </div>
        </div>
        <p className="about-desc">
          Kamva is a desktop studio for designs, photos, video and audio. Make social posts, presentations, prints and short videos, then export them as images,
          PDFs or video, all on your own computer.
        </p>
        <div className="field-label" style={{ marginBottom: 6 }}>
          Built with open-source software
        </div>
        <ul className="about-credits">
          {CREDITS.map((c) => (
            <li key={c.name}>
              <button type="button" className="link-btn" onClick={() => void platform.openExternal(c.url)}>
                {c.name}
              </button>
              <span className="small muted">{c.note}</span>
            </li>
          ))}
        </ul>
        <div className="row" style={{ marginTop: 14 }}>
          <button className="btn" onClick={() => void platform.openExternal('https://github.com/terpenesalad/kamva')}>
            <ExternalLink size={15} /> Kamva on GitHub
          </button>
          <span className="spacer" />
          <span className="small faint">© {new Date().getFullYear()} terpenesalad · MIT licence</span>
        </div>
      </EscClose>
    </Modal>
  );
}

// ===========================================================================
// Save as template
// ===========================================================================
export function SaveTemplateDialog({ onClose }: { onClose: () => void }) {
  const design = useEditor((s) => s.design);
  const [name, setName] = useState(design?.name || 'My template');
  const [category, setCategory] = useState('My templates');
  const [busy, setBusy] = useState(false);
  if (!design) return null;
  const save = async () => {
    if (!name.trim() || busy) return;
    setBusy(true);
    try {
      await saveAsTemplate(name.trim(), category.trim() || 'My templates');
      window.dispatchEvent(new Event('kamva-templates-changed'));
      onClose();
    } catch (e) {
      useUI.getState().toast(`Couldn't save the template: ${errorMessage(e)}`, 'error', 6000);
      setBusy(false);
    }
  };
  return (
    <Modal
      title="Save as template"
      onClose={onClose}
      footer={
        <>
          <button className="btn" onClick={onClose}>
            Cancel
          </button>
          <button className="btn primary" disabled={!name.trim() || busy} onClick={() => void save()}>
            {busy ? 'Saving…' : 'Save template'}
          </button>
        </>
      }
    >
      <EscClose onClose={onClose} className="col tpl-form">
        <div className="small muted">
          Saves all {design.pages.length} page
          {design.pages.length > 1 ? 's' : ''} with their images and media, so you can start new designs from it in the Templates panel.
        </div>
        <label className="col" style={{ gap: 5 }}>
          <span className="field-label">Template name</span>
          <input
            className="input"
            value={name}
            autoFocus
            onFocus={(e) => e.target.select()}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => {
              e.stopPropagation();
              if (e.key === 'Enter') void save();
            }}
          />
        </label>
        <label className="col" style={{ gap: 5 }}>
          <span className="field-label">Category</span>
          <input
            className="input"
            value={category}
            list="kamva-template-cats"
            onChange={(e) => setCategory(e.target.value)}
            onKeyDown={(e) => {
              e.stopPropagation();
              if (e.key === 'Enter') void save();
            }}
          />
          <datalist id="kamva-template-cats">
            {['My templates', 'Social', 'Presentation', 'Video', 'Print', 'Brand'].map((c) => (
              <option key={c} value={c} />
            ))}
          </datalist>
        </label>
      </EscClose>
    </Modal>
  );
}
