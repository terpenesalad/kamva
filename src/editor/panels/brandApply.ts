import type { BrandKit, DesignElement, Fill, Page, TextElement } from '../../types';
import { useEditor } from '../../store/editor';
import { useUI } from '../../store/ui';
import { svgColors } from '../../lib/render/svgUtil';

const lc = (c: string) => c.toLowerCase();

/** Apply a colour to the selection, or to the page background when nothing is selected. */
export function applyColor(color: string) {
  const st = useEditor.getState();
  const page = st.design?.pages.find((p) => p.id === st.activePageId);
  if (!page) return;
  const sel = page.elements.filter((e) => st.selection.includes(e.id) && !e.locked);
  if (!sel.length) {
    st.updatePage(page.id, (p) => {
      p.background.fill = { type: 'solid', color };
    });
    return;
  }
  st.updateElements(
    sel.map((e) => e.id),
    (el) => recolorElement(el, color),
  );
}

function recolorElement(el: DesignElement, color: string) {
  switch (el.type) {
    case 'text':
    case 'shape':
      el.fill = { type: 'solid', color };
      break;
    case 'line':
    case 'draw':
      el.stroke = color;
      break;
    case 'svg': {
      const first = svgColors(el.svg)[0];
      if (first) el.colorMap = { ...(el.colorMap || {}), [first]: color };
      break;
    }
  }
}

function fillColors(f: Fill | undefined): string[] {
  if (!f) return [];
  if (f.type === 'solid') return [f.color];
  return f.stops.map((s) => s.color);
}

function mapFill(f: Fill, map: Map<string, string>): Fill {
  if (f.type === 'solid') return { ...f, color: map.get(lc(f.color)) ?? f.color };
  return { ...f, stops: f.stops.map((s) => ({ ...s, color: map.get(lc(s.color)) ?? s.color })) } as Fill;
}

function isBlackOrWhite(c: string) {
  const v = lc(c);
  return ['#fff', '#ffffff', '#ffffffff', '#000', '#000000', '#000000ff', 'transparent'].includes(v);
}

/**
 * Best effort "apply brand": fonts by role (or largest text), and shape colours remapped to the kit
 * palette by usage order. Runs as a single history step.
 */
export function applyBrandToDesign(kit: BrandKit) {
  const st = useEditor.getState();
  const d = st.design;
  if (!d) return;
  // count colour usage across shapes, keeping black & white as neutrals
  const usage = new Map<string, number>();
  for (const p of d.pages)
    for (const e of p.elements)
      if (e.type === 'shape') for (const c of fillColors(e.fill)) if (c.startsWith('#') && !isBlackOrWhite(c)) usage.set(lc(c), (usage.get(lc(c)) || 0) + 1);
  const ordered = [...usage.entries()].sort((a, b) => b[1] - a[1]).map(([c]) => c);
  const palette = kit.colors.filter((c) => c && !isBlackOrWhite(c));
  const map = new Map<string, string>();
  if (palette.length) ordered.forEach((c, i) => map.set(c, palette[i % palette.length]));

  let texts = 0;
  let shapes = 0;
  st.update((dd) => {
    for (const p of dd.pages as Page[]) {
      const textEls = p.elements.filter((e): e is TextElement => e.type === 'text');
      const maxSize = Math.max(0, ...textEls.map((t) => t.fontSize));
      for (const e of p.elements) {
        if (e.locked) continue;
        if (e.type === 'text') {
          if (e.fontFamily === 'Segoe UI Emoji') continue;
          const role = e.role === 'heading' || e.fontSize >= maxSize * 0.98 ? 'heading' : e.role === 'subheading' ? 'subheading' : 'body';
          const font = role === 'heading' ? kit.fonts.heading : role === 'subheading' ? kit.fonts.subheading : kit.fonts.body;
          if (font && e.fontFamily !== font) {
            e.fontFamily = font;
            texts++;
          }
        } else if (e.type === 'shape' && map.size) {
          const next = mapFill(e.fill, map);
          if (JSON.stringify(next) !== JSON.stringify(e.fill)) {
            e.fill = next;
            shapes++;
          }
        }
      }
    }
  });
  const ui = useUI.getState();
  if (!texts && !shapes) ui.toast('This design already matches your brand kit', 'info');
  else ui.toast(`Applied ${kit.name}: updated ${texts} text ${texts === 1 ? 'box' : 'boxes'} and ${shapes} ${shapes === 1 ? 'shape' : 'shapes'}`, 'success');
}
