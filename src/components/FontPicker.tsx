import { useMemo, useState } from 'react';
import { ChevronDown, Search, Upload } from 'lucide-react';
import { BUNDLED_FONTS } from '../lib/fontList';
import { SYSTEM_FONTS, loadLocalFonts } from '../lib/fonts';
import { customFontFamilies } from '../lib/assets';
import { Popover } from './ui';
import { useActiveKit } from '../store/ui';
import { importFontFiles } from '../lib/actions';

const CAT_LABEL: Record<string, string> = { sans: 'Sans serif', serif: 'Serif', display: 'Display', script: 'Handwritten & script', mono: 'Monospace' };

export function FontPicker({ value, onChange, width = 170 }: { value: string; onChange: (f: string) => void; width?: number }) {
  const [anchor, setAnchor] = useState<HTMLElement | null>(null);
  const [q, setQ] = useState('');
  const [local, setLocal] = useState<string[]>([]);
  const kit = useActiveKit();
  const custom = customFontFamilies();

  const groups = useMemo(() => {
    const match = (f: string) => f.toLowerCase().includes(q.toLowerCase());
    const g: { title: string; fonts: string[] }[] = [];
    const brand = [...new Set([kit.fonts.heading, kit.fonts.subheading, kit.fonts.body])].filter(match);
    if (brand.length) g.push({ title: 'Brand fonts', fonts: brand });
    if (custom.filter(match).length) g.push({ title: 'Uploaded fonts', fonts: custom.filter(match) });
    for (const cat of ['sans', 'serif', 'display', 'script', 'mono']) {
      const fonts = BUNDLED_FONTS.filter((f) => f.category === cat && match(f.family)).map((f) => f.family);
      if (fonts.length) g.push({ title: CAT_LABEL[cat], fonts });
    }
    const sys = SYSTEM_FONTS.filter(match);
    if (sys.length) g.push({ title: 'System', fonts: sys });
    const loc = local.filter((f) => match(f) && !SYSTEM_FONTS.includes(f) && !BUNDLED_FONTS.some((b) => b.family === f));
    if (loc.length) g.push({ title: 'Installed on this computer', fonts: loc.slice(0, 300) });
    return g;
  }, [q, kit, custom.join(','), local]);

  return (
    <>
      <button className="font-btn" style={{ width }} onClick={(e) => setAnchor(anchor ? null : e.currentTarget)} title="Font">
        <span style={{ fontFamily: `"${value}"` }}>{value}</span>
        <ChevronDown size={14} />
      </button>
      {anchor && (
        <Popover anchor={anchor} onClose={() => setAnchor(null)} width={300}>
          <div className="col" style={{ gap: 8 }}>
            <div className="search">
              <Search size={16} />
              <input className="input" autoFocus placeholder="Search fonts" value={q} onChange={(e) => setQ(e.target.value)} onKeyDown={(e) => e.stopPropagation()} />
            </div>
            <div className="row">
              <button className="btn sm grow" onClick={() => importFontFiles()}>
                <Upload size={14} /> Upload a font
              </button>
              {!local.length && 'queryLocalFonts' in window && (
                <button className="btn sm grow" onClick={async () => setLocal(await loadLocalFonts())}>
                  Show installed fonts
                </button>
              )}
            </div>
            <div className="font-list">
              {groups.map((g) => (
                <div key={g.title}>
                  <div className="font-group">{g.title}</div>
                  {g.fonts.map((f) => (
                    <button
                      key={g.title + f}
                      className={'font-item' + (f === value ? ' active' : '')}
                      style={{ fontFamily: `"${f}"` }}
                      onClick={() => {
                        onChange(f);
                        setAnchor(null);
                      }}
                    >
                      {f}
                    </button>
                  ))}
                </div>
              ))}
              {!groups.length && <div className="muted small" style={{ padding: 8 }}>No fonts match “{q}”.</div>}
            </div>
          </div>
        </Popover>
      )}
    </>
  );
}
