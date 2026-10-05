import { useCallback, useDeferredValue, useEffect, useMemo, useRef, useState } from 'react';
import { FileText, FolderOpen, Monitor, Moon, MoreHorizontal, Plus, Search, Settings, Sun, Trash2, X, ExternalLink, Film } from 'lucide-react';
import type { Template, Unit } from '../types';
import { Logo } from '../components/Logo';
import { ContextMenu, Modal } from '../components/ui';
import { usePrefs, useUI } from '../store/ui';
import { createDesign, createFromTemplate, openDesignDialog, openDesignPath, openFromLibrary } from '../lib/actions';
import { platform } from '../lib/platform';
import { idb } from '../lib/idb';
import { DESIGN_PRESETS, FEATURED_PRESET_IDS, DesignPreset } from '../lib/presets';
import { BUILT_IN_TEMPLATES, TEMPLATE_CATEGORIES, templateMatches } from '../lib/templates';
import { formatSize } from '../lib/units';
import { TemplateCard } from './TemplateCard';
import './home.css';

interface LibraryItem {
  id: string;
  name: string;
  thumb?: string | null;
  width: number;
  height: number;
  unit?: Unit;
  pages?: number;
  updatedAt?: number;
  duration?: number;
}

interface RecentItem {
  path: string;
  name: string;
  modified: number;
}

export const TEMPLATES_CHANGED = 'kamva-templates-changed';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
export function timeAgo(ts?: number): string {
  if (!ts) return '';
  const s = Math.max(0, (Date.now() - ts) / 1000);
  if (s < 45) return 'just now';
  const m = Math.round(s / 60);
  if (m < 60) return `${m} minute${m === 1 ? '' : 's'} ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h} hour${h === 1 ? '' : 's'} ago`;
  const d = Math.round(h / 24);
  if (d === 1) return 'yesterday';
  if (d < 7) return `${d} days ago`;
  const w = Math.round(d / 7);
  if (d < 30) return `${w} week${w === 1 ? '' : 's'} ago`;
  return new Date(ts).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: new Date(ts).getFullYear() === new Date().getFullYear() ? undefined : 'numeric' });
}

function fmtDur(sec?: number) {
  if (!sec || sec <= 0) return '';
  const m = Math.floor(sec / 60);
  const s = Math.round(sec % 60);
  return `${m}:${String(s).padStart(2, '0')}`;
}

/** A rectangle in the preset's proportions, fitted to a box */
export function AspectGlyph({ w, h, box = 44 }: { w: number; h: number; box?: number }) {
  const s = box / Math.max(w, h);
  const gw = Math.max(6, Math.round(w * s));
  const gh = Math.max(4, Math.round(h * s));
  return (
    <span className="aspect-glyph" style={{ width: box, height: box }}>
      <span style={{ width: gw, height: gh }} />
    </span>
  );
}

export function useUserTemplates(): [Template[] | null, () => void] {
  const [list, setList] = useState<Template[] | null>(null);
  const load = useCallback(() => {
    idb
      .all<Template>('templates')
      .then((l) => setList(l.sort((a, b) => a.name.localeCompare(b.name))))
      .catch(() => setList([]));
  }, []);
  useEffect(() => {
    load();
    window.addEventListener(TEMPLATES_CHANGED, load);
    window.addEventListener('focus', load);
    return () => {
      window.removeEventListener(TEMPLATES_CHANGED, load);
      window.removeEventListener('focus', load);
    };
  }, [load]);
  return [list, load];
}

export async function deleteUserTemplate(t: Template) {
  await idb.del('templates', t.id);
  window.dispatchEvent(new Event(TEMPLATES_CHANGED));
  useUI.getState().toast(`Deleted “${t.name}”`, 'info', 2400);
}

// ---------------------------------------------------------------------------
// Home
// ---------------------------------------------------------------------------
export function Home() {
  const [q, setQ] = useState('');
  const dq = useDeferredValue(q);
  const [cat, setCat] = useState<string>('All');
  const [library, setLibrary] = useState<LibraryItem[] | null>(null);
  const [recent, setRecent] = useState<RecentItem[]>([]);
  const [userTemplates] = useUserTemplates();
  const [confirm, setConfirm] = useState<{ kind: 'design'; item: LibraryItem } | { kind: 'template'; item: Template } | null>(null);
  const templatesRef = useRef<HTMLElement>(null);

  const loadLibrary = useCallback(() => {
    platform
      .libraryList()
      .then((l: LibraryItem[]) => setLibrary([...l].sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0))))
      .catch(() => setLibrary([]));
    platform
      .recentList()
      .then(setRecent)
      .catch(() => setRecent([]));
  }, []);

  useEffect(() => {
    loadLibrary();
    window.addEventListener('focus', loadLibrary);
    return () => window.removeEventListener('focus', loadLibrary);
  }, [loadLibrary]);

  const featured = useMemo(() => FEATURED_PRESET_IDS.map((id) => DESIGN_PRESETS.find((p) => p.id === id)!).filter(Boolean), []);
  const searching = dq.trim().length > 0;
  const templates = useMemo(() => {
    let list = BUILT_IN_TEMPLATES.filter((t) => templateMatches(t, dq));
    if (cat !== 'All') list = list.filter((t) => t.category === cat);
    return list;
  }, [dq, cat]);
  const cats = useMemo(() => ['All', ...TEMPLATE_CATEGORIES.filter((c) => BUILT_IN_TEMPLATES.some((t) => t.category === c))], []);
  const userHits = useMemo(() => (userTemplates || []).filter((t) => templateMatches(t, dq)), [userTemplates, dq]);
  const designHits = useMemo(
    () => (library || []).filter((d) => !searching || d.name.toLowerCase().includes(dq.trim().toLowerCase())),
    [library, dq, searching],
  );

  const doDelete = async () => {
    if (!confirm) return;
    if (confirm.kind === 'design') {
      try {
        await platform.libraryDelete(confirm.item.id);
        useUI.getState().toast(`Deleted “${confirm.item.name || 'Untitled design'}”`, 'info', 2400);
      } catch (e) {
        useUI.getState().toast(`Couldn't delete this design: ${e instanceof Error ? e.message : String(e)}`, 'error');
      }
      loadLibrary();
    } else {
      await deleteUserTemplate(confirm.item);
    }
    setConfirm(null);
  };

  const onSearch = (v: string) => {
    setQ(v);
    if (v && cat !== 'All') setCat('All');
  };

  return (
    <div className="home">
      <HomeBar />
      <main className="home-scroll">
        <div className="home-inner">
          <section className="home-hero">
            <h1>What are you making today?</h1>
            <div className="search home-search">
              <Search size={17} />
              <input
                className="input"
                value={q}
                onChange={(e) => onSearch(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Escape') onSearch('');
                  if (e.key === 'Enter') templatesRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
                }}
                placeholder="Search templates, like “pitch deck” or “wedding”"
                aria-label="Search templates and designs"
              />
              {q && (
                <button className="icon-btn sm home-search-clear" onClick={() => onSearch('')} aria-label="Clear search">
                  <X size={14} />
                </button>
              )}
            </div>
          </section>

          {!searching && (
            <section className="home-section">
              <div className="home-presets">
                <button className="preset-card custom" onClick={() => useUI.getState().openModal('newDesign')}>
                  <span className="aspect-glyph plus" style={{ width: 40, height: 40 }}>
                    <Plus size={20} />
                  </span>
                  <span className="preset-text">
                    <span className="preset-name">Custom size</span>
                    <span className="preset-size">Any size or unit</span>
                  </span>
                </button>
                {featured.map((p) => (
                  <PresetCard key={p.id} p={p} />
                ))}
              </div>
            </section>
          )}

          {(!searching || designHits.length > 0) && (
            <section className="home-section">
              <div className="home-section-head">
                <h2>Your designs</h2>
                {library && library.length > 0 && <span className="home-count">{library.length}</span>}
              </div>
              {library === null ? (
                <div className="design-grid">
                  {[0, 1, 2, 3].map((i) => (
                    <div key={i} className="design-card skeleton">
                      <div className="design-thumb" />
                    </div>
                  ))}
                </div>
              ) : designHits.length === 0 ? (
                <div className="home-empty">
                  <div className="home-empty-art" aria-hidden="true">
                    <span />
                    <span />
                    <span />
                  </div>
                  <div>
                    <div className="home-empty-title">Your first design starts here</div>
                    <p>Pick a size above or start from a template below. Everything you make is kept here automatically, so you can pick up where you left off.</p>
                  </div>
                </div>
              ) : (
                <div className="design-grid">
                  {designHits.map((d) => (
                    <DesignCard key={d.id} d={d} onDelete={() => setConfirm({ kind: 'design', item: d })} />
                  ))}
                </div>
              )}
            </section>
          )}

          {!searching && recent.length > 0 && (
            <section className="home-section">
              <div className="home-section-head">
                <h2>Recent files</h2>
              </div>
              <div className="recent-list">
                {recent.slice(0, 8).map((r) => (
                  <button key={r.path} className="recent-row" onClick={() => void openDesignPath(r.path)} title={r.path}>
                    <FileText size={16} className="faint" />
                    <span className="recent-name">{r.name}</span>
                    <span className="recent-path"><bdi>{r.path}</bdi></span>
                    <span className="recent-time">{timeAgo(r.modified)}</span>
                  </button>
                ))}
              </div>
            </section>
          )}

          {userHits.length > 0 && (
            <section className="home-section">
              <div className="home-section-head">
                <h2>My templates</h2>
                <span className="home-count">{userHits.length}</span>
              </div>
              <div className="tgrid">
                {userHits.map((t) => (
                  <TemplateCard key={t.id} t={t} onOpen={(tt) => void createFromTemplate(tt)} onDelete={(tt) => setConfirm({ kind: 'template', item: tt })} showSize />
                ))}
              </div>
            </section>
          )}

          <section className="home-section" ref={templatesRef}>
            <div className="home-section-head">
              <h2>{searching ? `Templates matching “${dq.trim()}”` : 'Start from a template'}</h2>
              <span className="home-count">{templates.length}</span>
            </div>
            {!searching && (
              <div className="chip-row" role="tablist" aria-label="Template categories">
                {cats.map((c) => (
                  <button key={c} role="tab" aria-selected={cat === c} className={'chip' + (cat === c ? ' active' : '')} onClick={() => setCat(c)}>
                    {c}
                  </button>
                ))}
              </div>
            )}
            {templates.length ? (
              <div className="tgrid">
                {templates.map((t) => (
                  <TemplateCard key={t.id} t={t} onOpen={(tt) => void createFromTemplate(tt)} showSize />
                ))}
              </div>
            ) : (
              <div className="home-empty compact">
                <div>
                  <div className="home-empty-title">No templates match “{dq.trim()}”</div>
                  <p>Try a broader word like “poster”, “sale” or “video”, or start from a blank size instead.</p>
                </div>
                <button className="btn" onClick={() => useUI.getState().openModal('newDesign')}>
                  <Plus size={15} /> New design
                </button>
              </div>
            )}
          </section>
          <footer className="home-foot">Kamva keeps a copy of everything you make in its design library.</footer>
        </div>
      </main>
      {confirm && (
        <Modal
          title={confirm.kind === 'design' ? 'Delete this design?' : 'Delete this template?'}
          onClose={() => setConfirm(null)}
          footer={
            <>
              <button className="btn" onClick={() => setConfirm(null)}>
                Cancel
              </button>
              <button className="btn primary danger-fill" onClick={() => void doDelete()} autoFocus>
                Delete
              </button>
            </>
          }
        >
          <p className="muted" style={{ margin: 0, lineHeight: 1.5 }}>
            {confirm.kind === 'design' ? (
              <>
                “{confirm.item.name || 'Untitled design'}” will be removed from your design library. Files you saved to disk are not affected.
              </>
            ) : (
              <>“{confirm.item.name}” will be removed from your templates. Designs made from it are not affected.</>
            )}
          </p>
        </Modal>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Pieces
// ---------------------------------------------------------------------------
function HomeBar() {
  const theme = usePrefs((s) => s.theme);
  const setPrefs = usePrefs((s) => s.set);
  const opts: { v: 'light' | 'dark' | 'system'; icon: React.ReactNode; label: string }[] = [
    { v: 'light', icon: <Sun size={15} />, label: 'Light theme' },
    { v: 'dark', icon: <Moon size={15} />, label: 'Dark theme' },
    { v: 'system', icon: <Monitor size={15} />, label: 'Match system' },
  ];
  return (
    <header className="home-bar">
      <Logo size={28} withWord />
      <div className="spacer" />
      <button className="btn ghost" onClick={() => void openDesignDialog()}>
        <FolderOpen size={16} /> Open file…
      </button>
      <div className="seg home-theme" role="radiogroup" aria-label="Theme">
        {opts.map((o) => (
          <button key={o.v} type="button" role="radio" aria-checked={theme === o.v} className={theme === o.v ? 'active' : ''} onClick={() => setPrefs({ theme: o.v })} data-tip={o.label} aria-label={o.label}>
            {o.icon}
          </button>
        ))}
      </div>
      <button className="icon-btn" onClick={() => useUI.getState().openModal('settings')} data-tip="Settings" aria-label="Settings">
        <Settings size={18} />
      </button>
      <button className="btn primary" onClick={() => useUI.getState().openModal('newDesign')}>
        <Plus size={16} /> New design
      </button>
    </header>
  );
}

function PresetCard({ p }: { p: DesignPreset }) {
  return (
    <button className="preset-card" onClick={() => createDesign(p.width, p.height, p.name, p.unit, p.category)} title={`${p.name}, ${formatSize(p.width, p.height, p.unit)}`}>
      <AspectGlyph w={p.width} h={p.height} box={40} />
      <span className="preset-text">
        <span className="preset-name">{p.name}</span>
        <span className="preset-size">{formatSize(p.width, p.height, p.unit)}</span>
      </span>
    </button>
  );
}

function DesignCard({ d, onDelete }: { d: LibraryItem; onDelete: () => void }) {
  const [menu, setMenu] = useState<{ x: number; y: number } | null>(null);
  const open = () => void openFromLibrary(d.id);
  const pages = d.pages || 1;
  const dur = fmtDur(d.duration);
  const showDur = !!dur && pages > 1;
  const showMenu = (x: number, y: number) => setMenu({ x, y });
  return (
    <div
      className="design-card"
      onContextMenu={(e) => {
        e.preventDefault();
        showMenu(e.clientX, e.clientY);
      }}
    >
      <button className="design-thumb" onClick={open} aria-label={`Open ${d.name || 'Untitled design'}`}>
        {d.thumb ? (
          <img src={d.thumb} alt="" draggable={false} style={{ aspectRatio: `${d.width} / ${d.height}` }} />
        ) : (
          <span className="design-thumb-blank" style={{ aspectRatio: `${d.width || 1} / ${d.height || 1}` }} />
        )}
        {(pages > 1 || showDur) && (
          <span className="tcard-badges">
            {showDur && (
              <span className="tcard-badge">
                <Film size={11} />
                {dur}
              </span>
            )}
            {pages > 1 && <span className="tcard-badge">{pages} pages</span>}
          </span>
        )}
      </button>
      <div className="design-meta">
        <div className="grow">
          <div className="dcard-name" title={d.name}>
            {d.name || 'Untitled design'}
          </div>
          <div className="design-sub" title={d.width ? formatSize(d.width, d.height, d.unit || 'px') : undefined}>
            Edited {timeAgo(d.updatedAt)}
          </div>
        </div>
        <button
          className="icon-btn sm design-more"
          aria-label="More options"
          onClick={(e) => {
            const r = e.currentTarget.getBoundingClientRect();
            showMenu(r.left, r.bottom + 4);
          }}
        >
          <MoreHorizontal size={16} />
        </button>
      </div>
      {menu && (
        <ContextMenu
          x={menu.x}
          y={menu.y}
          onClose={() => setMenu(null)}
          items={[
            { label: 'Open', icon: <ExternalLink size={15} />, onClick: open },
            { sep: true },
            { label: 'Delete…', icon: <Trash2 size={15} />, danger: true, onClick: onDelete },
          ]}
        />
      )}
    </div>
  );
}
