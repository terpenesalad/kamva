import { BUNDLED_FONTS } from './fontList';
import { customFontFamilies, blobToDataUrl } from './assets';

export const SYSTEM_FONTS = ['Arial', 'Georgia', 'Times New Roman', 'Courier New', 'Verdana', 'Trebuchet MS', 'Impact', 'Segoe UI', 'Tahoma', 'Comic Sans MS'];

export const FONT_COMBOS: { name: string; heading: string; body: string; headingWeight?: 'bold' | 'normal' }[] = [
  { name: 'Modern', heading: 'Montserrat', body: 'Inter', headingWeight: 'bold' },
  { name: 'Editorial', heading: 'Playfair Display', body: 'Lato', headingWeight: 'bold' },
  { name: 'Bold impact', heading: 'Anton', body: 'Roboto' },
  { name: 'Friendly', heading: 'Fredoka', body: 'Nunito', headingWeight: 'bold' },
  { name: 'Elegant', heading: 'Cormorant Garamond', body: 'Raleway', headingWeight: 'bold' },
  { name: 'Handmade', heading: 'Pacifico', body: 'Quicksand' },
  { name: 'Retro', heading: 'Righteous', body: 'Space Grotesk' },
  { name: 'Classic', heading: 'Libre Baskerville', body: 'Open Sans', headingWeight: 'bold' },
  { name: 'Poster', heading: 'Bebas Neue', body: 'Montserrat' },
  { name: 'Wedding', heading: 'Great Vibes', body: 'Lora' },
  { name: 'Tech', heading: 'Space Grotesk', body: 'Source Code Pro', headingWeight: 'bold' },
  { name: 'Playful', heading: 'Bungee', body: 'Poppins' },
];

let localFonts: string[] = [];
export async function loadLocalFonts(): Promise<string[]> {
  try {
    const q = (window as any).queryLocalFonts;
    if (!q) return [];
    const list: { family: string }[] = await q();
    localFonts = [...new Set(list.map((f) => f.family))].sort();
  } catch {
    localFonts = [];
  }
  return localFonts;
}

export function allFontFamilies(): string[] {
  const set = new Set<string>([...BUNDLED_FONTS.map((f) => f.family), ...customFontFamilies(), ...SYSTEM_FONTS, ...localFonts]);
  return [...set];
}

export function fontSupports(family: string) {
  const f = BUNDLED_FONTS.find((x) => x.family === family);
  return { bold: f ? f.bold : true, italic: f ? f.italic : true };
}

const loaded = new Set<string>();
export async function ensureFont(family: string, weight: 'normal' | 'bold' = 'normal', style: 'normal' | 'italic' = 'normal'): Promise<void> {
  const key = `${family}|${weight}|${style}`;
  if (loaded.has(key)) return;
  try {
    await document.fonts.load(`${style} ${weight === 'bold' ? 700 : 400} 32px "${family}"`);
  } catch {
    /* ignore */
  }
  loaded.add(key);
}

export function fontLoaded(family: string, weight: 'normal' | 'bold' = 'normal', style: 'normal' | 'italic' = 'normal') {
  try {
    return document.fonts.check(`${style} ${weight === 'bold' ? 700 : 400} 32px "${family}"`);
  } catch {
    return true;
  }
}

export async function ensureFonts(list: { family: string; weight?: 'normal' | 'bold'; style?: 'normal' | 'italic' }[]) {
  await Promise.all(list.map((f) => ensureFont(f.family, f.weight, f.style)));
}

/** Collect @font-face rules for given families with font data inlined (for SVG export) */
export async function fontFaceCss(families: Set<string>): Promise<string> {
  const out: string[] = [];
  for (const sheet of Array.from(document.styleSheets)) {
    let rules: CSSRuleList;
    try {
      rules = sheet.cssRules;
    } catch {
      continue;
    }
    for (const rule of Array.from(rules)) {
      if (!(rule instanceof CSSFontFaceRule)) continue;
      const fam = rule.style.getPropertyValue('font-family').replace(/["']/g, '').trim();
      if (!families.has(fam)) continue;
      const src = rule.style.getPropertyValue('src');
      const url = src.match(/url\(["']?([^"')]+)["']?\)/)?.[1];
      if (!url) continue;
      try {
        const blob = await (await fetch(new URL(url, sheet.href || location.href).href)).blob();
        const data = await blobToDataUrl(blob);
        out.push(
          `@font-face{font-family:'${fam}';src:url(${data});font-weight:${rule.style.getPropertyValue('font-weight') || 400};font-style:${rule.style.getPropertyValue('font-style') || 'normal'};}`,
        );
      } catch {
        /* skip */
      }
    }
  }
  // Fonts added via FontFace API (user uploads) are not in stylesheets; they're embedded by the exporter.
  return out.join('\n');
}
