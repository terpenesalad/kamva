import { useState } from 'react';
import { Check, ImagePlus, Pencil, Plus, Sparkles, Trash2, X } from 'lucide-react';
import type { BrandKit } from '../../types';
import { usePrefs, useActiveKit, useUI } from '../../store/ui';
import { useEditor } from '../../store/editor';
import { AddSwatch } from '../../components/ColorPicker';
import { FontPicker } from '../../components/FontPicker';
import { platform, FILTERS } from '../../lib/platform';
import { addAsset, blobToDataUrl, dataUrlToBlob } from '../../lib/assets';
import { placeAsset, errorMessage } from '../../lib/actions';
import { uid } from '../../lib/defaults';
import { addText } from '../elementActions';
import { PanelHead, SectionHead, EmptyState } from './common';
import { applyBrandToDesign, applyColor } from './brandApply';

const MAX_LOGO = 2 * 1024 * 1024;

function Swatches({ colors, onChange }: { colors: string[]; onChange: (c: string[]) => void }) {
  return (
    <div className="swatch-wrap brand-swatches">
      {colors.map((c, i) => (
        <span key={c + i} className="brand-swatch">
          <button className="swatch" style={{ background: c }} onClick={() => applyColor(c)} data-tip={`Apply ${c}`} aria-label={`Apply ${c}`} />
          <button className="swatch-remove" onClick={() => onChange(colors.filter((_, j) => j !== i))} aria-label={`Remove ${c}`}>
            <X size={10} />
          </button>
        </span>
      ))}
      <AddSwatch onAdd={(c) => onChange([...colors, c])} />
    </div>
  );
}

function KitSelector({ kit }: { kit: BrandKit }) {
  const kits = usePrefs((s) => s.brandKits);
  const { set, addKit, deleteKit, updateKit } = usePrefs.getState();
  const [renaming, setRenaming] = useState<string | null>(null);

  if (renaming !== null) {
    const commit = () => {
      const n = renaming.trim();
      if (n) updateKit(kit.id, { name: n });
      setRenaming(null);
    };
    return (
      <div className="row">
        <input
          className="input grow"
          autoFocus
          value={renaming}
          onChange={(e) => setRenaming(e.target.value)}
          onKeyDown={(e) => {
            e.stopPropagation();
            if (e.key === 'Enter') commit();
            if (e.key === 'Escape') setRenaming(null);
          }}
          onBlur={commit}
          aria-label="Brand kit name"
        />
        <button className="icon-btn" onMouseDown={(e) => e.preventDefault()} onClick={commit} aria-label="Save name">
          <Check size={16} />
        </button>
      </div>
    );
  }

  return (
    <div className="row">
      <select className="select grow" value={kit.id} onChange={(e) => set({ activeBrandKit: e.target.value })} aria-label="Brand kit">
        {kits.map((k) => (
          <option key={k.id} value={k.id}>
            {k.name}
          </option>
        ))}
      </select>
      <button className="icon-btn" onClick={() => setRenaming(kit.name)} data-tip="Rename" aria-label="Rename brand kit">
        <Pencil size={15} />
      </button>
      <button className="icon-btn" onClick={() => addKit()} data-tip="New brand kit" aria-label="New brand kit">
        <Plus size={16} />
      </button>
      <button
        className="icon-btn"
        onClick={() => {
          if (window.confirm(`Delete the brand kit “${kit.name}”? This can't be undone.`)) deleteKit(kit.id);
        }}
        data-tip="Delete kit"
        aria-label="Delete brand kit"
      >
        <Trash2 size={15} />
      </button>
    </div>
  );
}

async function uploadLogos(kit: BrandKit) {
  const files = await platform.openFiles({ filters: FILTERS.images, multi: true, title: 'Upload logos' });
  if (!files.length) return;
  const ui = useUI.getState();
  const added: BrandKit['logos'] = [];
  for (const f of files) {
    if (f.data.byteLength > MAX_LOGO) {
      ui.toast(`${f.name} is larger than 2 MB. Use a smaller or compressed version of the logo.`, 'error', 6000);
      continue;
    }
    const mime = f.mime || (f.name.toLowerCase().endsWith('.svg') ? 'image/svg+xml' : 'image/png');
    const url = await blobToDataUrl(new Blob([f.data as BlobPart], { type: mime }));
    added.push({ id: uid(), name: f.name, dataUrl: url });
  }
  if (added.length) {
    // read the latest kit so concurrent edits aren't lost
    const cur = usePrefs.getState().brandKits.find((k) => k.id === kit.id) || kit;
    usePrefs.getState().updateKit(kit.id, { logos: [...cur.logos, ...added] });
  }
}

async function placeLogo(logo: BrandKit['logos'][number]) {
  if (!useEditor.getState().design) return;
  try {
    // stable id so repeated placements reuse one asset
    const meta = await addAsset(dataUrlToBlob(logo.dataUrl), logo.name, { id: `logo_${logo.id}` });
    await placeAsset(meta.id);
  } catch (e) {
    useUI.getState().toast(`Couldn't add ${logo.name}: ${errorMessage(e)}`, 'error');
  }
}

export function BrandPanel() {
  const kit = useActiveKit();
  const updateKit = usePrefs((s) => s.updateKit);
  const [paletteName, setPaletteName] = useState<string | null>(null);
  const hasSel = useEditor((s) => s.selection.length > 0);
  const palettes = kit.palettes || [];

  const setFont = (k: keyof BrandKit['fonts'], f: string) => updateKit(kit.id, { fonts: { ...kit.fonts, [k]: f } });

  return (
    <>
      <PanelHead title="Brand">
        <KitSelector kit={kit} />
      </PanelHead>
      <div className="panel-body">
        <button className="btn block brand-apply" onClick={() => applyBrandToDesign(kit)}>
          <Sparkles size={16} /> Apply brand to this design
        </button>

        <SectionHead title="Brand colours" />
        <p className="panel-hint">{hasSel ? 'Click a colour to apply it to the selection.' : 'Click a colour to set the page background, or select something first.'}</p>
        <Swatches colors={kit.colors} onChange={(colors) => updateKit(kit.id, { colors })} />

        {palettes.map((p, pi) => (
          <div key={pi} className="brand-palette">
            <div className="row brand-palette-head">
              <span className="field-label grow">{p.name}</span>
              <button
                className="icon-btn sm"
                onClick={() => updateKit(kit.id, { palettes: palettes.filter((_, j) => j !== pi) })}
                data-tip="Delete palette"
                aria-label={`Delete palette ${p.name}`}
              >
                <Trash2 size={13} />
              </button>
            </div>
            <Swatches colors={p.colors} onChange={(colors) => updateKit(kit.id, { palettes: palettes.map((x, j) => (j === pi ? { ...x, colors } : x)) })} />
          </div>
        ))}
        {paletteName === null ? (
          <button className="btn sm ghost add-palette" onClick={() => setPaletteName(`Palette ${palettes.length + 2}`)}>
            <Plus size={14} /> Add a palette
          </button>
        ) : (
          <div className="row add-palette">
            <input
              className="input grow"
              autoFocus
              value={paletteName}
              onChange={(e) => setPaletteName(e.target.value)}
              onKeyDown={(e) => {
                e.stopPropagation();
                if (e.key === 'Enter' && paletteName.trim()) {
                  updateKit(kit.id, { palettes: [...palettes, { name: paletteName.trim(), colors: [] }] });
                  setPaletteName(null);
                }
                if (e.key === 'Escape') setPaletteName(null);
              }}
              aria-label="Palette name"
            />
            <button
              className="btn sm primary"
              disabled={!paletteName.trim()}
              onClick={() => {
                updateKit(kit.id, { palettes: [...palettes, { name: paletteName.trim(), colors: [] }] });
                setPaletteName(null);
              }}
            >
              Add
            </button>
          </div>
        )}

        <SectionHead title="Brand fonts" />
        <div className="col brand-fonts">
          {(['heading', 'subheading', 'body'] as const).map((k) => (
            <div key={k} className="brand-font-row">
              <span className="field-label">{k === 'heading' ? 'Heading' : k === 'subheading' ? 'Subheading' : 'Body'}</span>
              <div className="row">
                <div className="grow brand-font-picker">
                  <FontPicker value={kit.fonts[k]} onChange={(f) => setFont(k, f)} width={200} />
                </div>
                <button className="btn sm" onClick={() => addText(k, kit.fonts[k])} data-tip={`Add ${k} text`}>
                  <Plus size={14} /> Add
                </button>
              </div>
            </div>
          ))}
        </div>

        <SectionHead title="Logos" />
        {kit.logos.length ? (
          <div className="tile-grid cols-3">
            {kit.logos.map((l) => (
              <div key={l.id} className="logo-tile-wrap">
                <button className="tile logo-tile" onClick={() => void placeLogo(l)} data-tip={l.name} aria-label={`Add ${l.name}`}>
                  <img src={l.dataUrl} alt="" draggable={false} />
                </button>
                <button
                  className="swatch-remove"
                  onClick={() => updateKit(kit.id, { logos: kit.logos.filter((x) => x.id !== l.id) })}
                  aria-label={`Remove ${l.name}`}
                >
                  <X size={10} />
                </button>
              </div>
            ))}
            <button className="tile add-tile" onClick={() => void uploadLogos(kit)} data-tip="Upload a logo" aria-label="Upload a logo">
              <Plus size={20} />
            </button>
          </div>
        ) : (
          <EmptyState icon={<ImagePlus size={24} />} title="No logos yet">
            <button className="btn sm" onClick={() => void uploadLogos(kit)}>
              Upload a logo
            </button>
            <div className="faint small" style={{ marginTop: 6 }}>
              PNG or SVG up to 2 MB
            </div>
          </EmptyState>
        )}
      </div>
    </>
  );
}
