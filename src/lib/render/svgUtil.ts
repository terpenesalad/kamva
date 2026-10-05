import QRCode from 'qrcode';
import type { ChartSpec, SvgElement, TableSpec } from '../../types';

// ---------------------------------------------------------------------------
// Recolouring
// ---------------------------------------------------------------------------
const COLOR_RE = /#(?:[0-9a-fA-F]{3,4}){1,2}\b|rgba?\([^)]*\)|currentColor/g;

/** List distinct colours used by an SVG (fill/stroke/stop-color/style). */
export function svgColors(svg: string): string[] {
  const out = new Set<string>();
  const attrRe = /(?:fill|stroke|stop-color|color)\s*[:=]\s*["']?\s*(#[0-9a-fA-F]{3,8}|rgba?\([^)]*\)|currentColor|[a-zA-Z]+)/g;
  let m: RegExpExecArray | null;
  while ((m = attrRe.exec(svg))) {
    const c = m[1];
    if (/^(none|transparent|inherit|url)$/i.test(c)) continue;
    out.add(normalizeColorToken(c));
  }
  // SVGs with no explicit fill draw black
  if (!out.size) out.add('#000000');
  return [...out].slice(0, 12);
}

const NAMED: Record<string, string> = {
  black: '#000000', white: '#ffffff', red: '#ff0000', green: '#008000', blue: '#0000ff', yellow: '#ffff00',
  orange: '#ffa500', purple: '#800080', gray: '#808080', grey: '#808080', pink: '#ffc0cb',
};

function normalizeColorToken(c: string): string {
  if (c === 'currentColor') return 'currentColor';
  if (NAMED[c.toLowerCase()]) return NAMED[c.toLowerCase()];
  if (c.startsWith('#') && (c.length === 4 || c.length === 5)) {
    return '#' + c.slice(1).split('').map((x) => x + x).join('').toLowerCase();
  }
  return c.toLowerCase();
}

export function applyColorMap(svg: string, map: Record<string, string>, strokeWidth?: number): string {
  let out = svg;
  const keys = Object.keys(map);
  if (keys.length) {
    out = out.replace(/(fill|stroke|stop-color|color)(\s*[:=]\s*["']?\s*)(#[0-9a-fA-F]{3,8}|rgba?\([^)]*\)|currentColor|[a-zA-Z]+)/g, (m, attr, sep, val) => {
      const key = normalizeColorToken(val);
      return map[key] ? `${attr}${sep}${map[key]}` : m;
    });
    // implicit black fill
    if (map['#000000'] && !/\sfill\s*=/.test(out.split('>')[0])) {
      out = out.replace(/<svg\b/, `<svg fill="${map['#000000']}"`);
    }
  }
  if (strokeWidth !== undefined) {
    out = out.replace(/stroke-width="[^"]*"/g, `stroke-width="${strokeWidth}"`);
  }
  // make sure the root scales to the box
  out = out.replace(/<svg\b([^>]*)>/, (_m, attrs: string) => {
    let a = attrs;
    if (!/preserveAspectRatio/.test(a)) a += ' preserveAspectRatio="none"';
    return `<svg${a}>`;
  });
  return out;
}

export function svgToDataUrl(svg: string): string {
  return 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg);
}

const imgCache = new Map<string, HTMLImageElement>();
const pending = new Map<string, Promise<HTMLImageElement>>();

/** Image for an svg element (recoloured). Sync result if cached. */
export function svgImage(markup: string, onLoad?: () => void): HTMLImageElement | null {
  const hit = imgCache.get(markup);
  if (hit) return hit;
  if (!pending.has(markup)) {
    const p = new Promise<HTMLImageElement>((resolve, reject) => {
      const img = new Image();
      img.onload = () => {
        imgCache.set(markup, img);
        if (imgCache.size > 400) imgCache.delete(imgCache.keys().next().value!);
        resolve(img);
      };
      img.onerror = reject;
      img.src = svgToDataUrl(markup);
    });
    pending.set(markup, p);
    p.catch(() => undefined).finally(() => pending.delete(markup));
  }
  pending.get(markup)!.then(() => onLoad?.()).catch(() => undefined);
  return null;
}

export async function svgImageAsync(markup: string): Promise<HTMLImageElement | null> {
  const hit = imgCache.get(markup);
  if (hit) return hit;
  svgImage(markup);
  try {
    return await pending.get(markup)!;
  } catch {
    return imgCache.get(markup) || null;
  }
}

export function renderedMarkup(el: SvgElement): string {
  return applyColorMap(el.svg, el.colorMap || {}, el.strokeWidth);
}

// ---------------------------------------------------------------------------
// Icons (lucide)
// ---------------------------------------------------------------------------
type IconNode = [string, Record<string, string>][];
let iconNodes: Record<string, IconNode> | null = null;
let iconTags: Record<string, string[]> | null = null;

export async function loadIcons() {
  if (!iconNodes) {
    const [n, t] = await Promise.all([import('lucide-static/icon-nodes.json'), import('lucide-static/tags.json')]);
    iconNodes = (n as any).default || n;
    iconTags = (t as any).default || t;
  }
  return { nodes: iconNodes!, tags: iconTags! };
}

export function iconSvg(nodes: IconNode, color = '#111827', strokeWidth = 2): string {
  const body = nodes
    .map(([tag, attrs]) => `<${tag} ${Object.entries(attrs).filter(([k]) => k !== 'key').map(([k, v]) => `${k}="${v}"`).join(' ')}/>`)
    .join('');
  return `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="${color}" stroke-width="${strokeWidth}" stroke-linecap="round" stroke-linejoin="round">${body}</svg>`;
}

// ---------------------------------------------------------------------------
// QR codes
// ---------------------------------------------------------------------------
export async function qrSvg(value: string, fg: string, bg: string, margin = 2): Promise<string> {
  const svg = await QRCode.toString(value || ' ', { type: 'svg', margin, color: { dark: fg, light: bg }, errorCorrectionLevel: 'M' });
  return svg.replace('<svg ', '<svg preserveAspectRatio="none" ');
}

// ---------------------------------------------------------------------------
// Charts
// ---------------------------------------------------------------------------
const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

export function chartSvg(c: ChartSpec, w = 600, h = 400): string {
  const font = `font-family="${esc(c.fontFamily || 'Inter')}, sans-serif"`;
  const n = c.values.length;
  const max = Math.max(1, ...c.values.map((v) => Math.abs(v)));
  const col = (i: number) => c.colors[i % c.colors.length] || '#7c5cff';
  let body = '';
  const fs = Math.max(12, Math.min(w, h) * 0.045);
  if (c.type === 'pie' || c.type === 'donut') {
    const total = c.values.reduce((a, b) => a + Math.max(0, b), 0) || 1;
    const legendW = c.showLabels ? w * 0.32 : 0;
    const cx = (w - legendW) / 2;
    const cy = h / 2;
    const r = Math.min(cx, cy) * 0.92;
    let a0 = -Math.PI / 2;
    c.values.forEach((v, i) => {
      const a1 = a0 + (Math.max(0, v) / total) * Math.PI * 2;
      const large = a1 - a0 > Math.PI ? 1 : 0;
      const p = (a: number, rr: number) => `${(cx + Math.cos(a) * rr).toFixed(2)},${(cy + Math.sin(a) * rr).toFixed(2)}`;
      if (c.values.filter((x) => x > 0).length === 1 && v > 0) {
        body += `<circle cx="${cx}" cy="${cy}" r="${r}" fill="${col(i)}"/>`;
      } else {
        body += `<path d="M${cx},${cy} L${p(a0, r)} A${r},${r} 0 ${large} 1 ${p(a1, r)} Z" fill="${col(i)}"/>`;
      }
      if (c.showValues && v > 0) {
        const am = (a0 + a1) / 2;
        const rr = c.type === 'donut' ? r * 0.78 : r * 0.62;
        body += `<text x="${(cx + Math.cos(am) * rr).toFixed(1)}" y="${(cy + Math.sin(am) * rr).toFixed(1)}" fill="#fff" font-size="${fs}" font-weight="700" text-anchor="middle" dominant-baseline="middle" ${font}>${Math.round((v / total) * 100)}%</text>`;
      }
      a0 = a1;
    });
    if (c.type === 'donut') body += `<circle cx="${cx}" cy="${cy}" r="${r * 0.55}" fill="#ffffff" fill-opacity="0"/>`;
    if (c.type === 'donut') {
      // punch the hole with a mask so the background shows through
      body = `<mask id="m"><rect width="${w}" height="${h}" fill="#fff"/><circle cx="${cx}" cy="${cy}" r="${r * 0.55}" fill="#000"/></mask><g mask="url(#m)">${body}</g>`;
    }
    if (c.showLabels) {
      c.labels.forEach((l, i) => {
        const y = h / 2 - (n * fs * 1.6) / 2 + i * fs * 1.6;
        body += `<rect x="${w - legendW + 8}" y="${y}" width="${fs}" height="${fs}" rx="${fs / 4}" fill="${col(i)}"/>`;
        body += `<text x="${w - legendW + 8 + fs * 1.5}" y="${y + fs * 0.85}" fill="${c.textColor}" font-size="${fs}" ${font}>${esc(l)}</text>`;
      });
    }
  } else if (c.type === 'progress') {
    const v = Math.max(0, Math.min(100, c.values[0] ?? 0));
    const cx = w / 2;
    const cy = h / 2;
    const r = Math.min(w, h) * 0.4;
    const sw = r * 0.22;
    const circ = 2 * Math.PI * r;
    body += `<circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="${c.colors[1] || '#e5e7eb'}" stroke-width="${sw}"/>`;
    body += `<circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="${col(0)}" stroke-width="${sw}" stroke-linecap="round" stroke-dasharray="${(circ * v) / 100} ${circ}" transform="rotate(-90 ${cx} ${cy})"/>`;
    if (c.showValues) body += `<text x="${cx}" y="${cy}" fill="${c.textColor}" font-size="${r * 0.5}" font-weight="700" text-anchor="middle" dominant-baseline="middle" ${font}>${Math.round(v)}%</text>`;
  } else {
    const padL = c.type === 'bar' && c.showLabels ? w * 0.2 : w * 0.06;
    const padB = c.type !== 'bar' && c.showLabels ? fs * 2.2 : fs * 0.6;
    const padT = c.showValues ? fs * 1.6 : fs * 0.6;
    const pw = w - padL - w * 0.04;
    const ph = h - padB - padT;
    body += `<line x1="${padL}" y1="${padT + ph}" x2="${padL + pw}" y2="${padT + ph}" stroke="${c.textColor}" stroke-opacity="0.25" stroke-width="2"/>`;
    if (c.type === 'column' || c.type === 'bar') {
      const horiz = c.type === 'bar';
      const slot = (horiz ? ph : pw) / n;
      c.values.forEach((v, i) => {
        const len = (Math.max(0, v) / max) * (horiz ? pw : ph);
        if (horiz) {
          const y = padT + i * slot + slot * 0.15;
          body += `<rect x="${padL}" y="${y}" width="${len}" height="${slot * 0.7}" rx="${Math.min(8, slot * 0.1)}" fill="${col(i)}"/>`;
          if (c.showLabels) body += `<text x="${padL - 8}" y="${y + slot * 0.35}" fill="${c.textColor}" font-size="${fs}" text-anchor="end" dominant-baseline="middle" ${font}>${esc(c.labels[i] || '')}</text>`;
          if (c.showValues) body += `<text x="${padL + len + 6}" y="${y + slot * 0.35}" fill="${c.textColor}" font-size="${fs}" dominant-baseline="middle" ${font}>${v}</text>`;
        } else {
          const x = padL + i * slot + slot * 0.15;
          body += `<rect x="${x}" y="${padT + ph - len}" width="${slot * 0.7}" height="${len}" rx="${Math.min(8, slot * 0.1)}" fill="${col(i)}"/>`;
          if (c.showLabels) body += `<text x="${x + slot * 0.35}" y="${padT + ph + fs * 1.4}" fill="${c.textColor}" font-size="${fs}" text-anchor="middle" ${font}>${esc(c.labels[i] || '')}</text>`;
          if (c.showValues) body += `<text x="${x + slot * 0.35}" y="${padT + ph - len - 6}" fill="${c.textColor}" font-size="${fs}" text-anchor="middle" ${font}>${v}</text>`;
        }
      });
    } else {
      const step = n > 1 ? pw / (n - 1) : 0;
      const pts = c.values.map((v, i) => [padL + i * step, padT + ph - (Math.max(0, v) / max) * ph] as const);
      const d = pts.map(([x, y], i) => `${i ? 'L' : 'M'}${x.toFixed(1)},${y.toFixed(1)}`).join(' ');
      if (c.type === 'area') {
        body += `<path d="${d} L${padL + (n - 1) * step},${padT + ph} L${padL},${padT + ph} Z" fill="${col(0)}" fill-opacity="0.35"/>`;
      }
      body += `<path d="${d}" fill="none" stroke="${col(0)}" stroke-width="${Math.max(3, fs * 0.25)}" stroke-linejoin="round" stroke-linecap="round"/>`;
      pts.forEach(([x, y], i) => {
        body += `<circle cx="${x}" cy="${y}" r="${Math.max(4, fs * 0.3)}" fill="#fff" stroke="${col(0)}" stroke-width="3"/>`;
        if (c.showLabels) body += `<text x="${x}" y="${padT + ph + fs * 1.4}" fill="${c.textColor}" font-size="${fs}" text-anchor="middle" ${font}>${esc(c.labels[i] || '')}</text>`;
        if (c.showValues) body += `<text x="${x}" y="${y - fs * 0.8}" fill="${c.textColor}" font-size="${fs}" text-anchor="middle" ${font}>${c.values[i]}</text>`;
      });
    }
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" preserveAspectRatio="none">${body}</svg>`;
}

export function defaultChart(type: ChartSpec['type']): ChartSpec {
  return {
    type,
    labels: type === 'progress' ? ['Progress'] : ['Q1', 'Q2', 'Q3', 'Q4', 'Q5'],
    values: type === 'progress' ? [72] : [12, 19, 8, 24, 16],
    colors: type === 'progress' ? ['#7c5cff', '#e5e7eb'] : ['#7c5cff', '#ff6b6b', '#ffd166', '#06d6a0', '#118ab2', '#ef476f'],
    showLabels: true,
    showValues: true,
    textColor: '#1f2937',
    fontFamily: 'Inter',
  };
}

// ---------------------------------------------------------------------------
// Tables
// ---------------------------------------------------------------------------
export function tableSvg(t: TableSpec, w = 600, h = 300): string {
  const rows = t.rows.length || 1;
  const cols = Math.max(1, ...t.rows.map((r) => r.length));
  const cw = w / cols;
  const rh = h / rows;
  let body = '';
  t.rows.forEach((r, ri) => {
    const fill = ri === 0 ? t.headerFill : ri % 2 === 0 ? t.altFill : t.cellFill;
    body += `<rect x="0" y="${ri * rh}" width="${w}" height="${rh}" fill="${fill}"/>`;
    for (let ci = 0; ci < cols; ci++) {
      const txt = r[ci] ?? '';
      body += `<text x="${ci * cw + cw / 2}" y="${ri * rh + rh / 2}" fill="${ri === 0 ? t.headerColor : t.textColor}" font-size="${t.fontSize}" font-weight="${ri === 0 ? 700 : 400}" font-family="${esc(t.fontFamily)}, sans-serif" text-anchor="middle" dominant-baseline="middle">${esc(txt)}</text>`;
    }
  });
  for (let ci = 1; ci < cols; ci++) body += `<line x1="${ci * cw}" y1="0" x2="${ci * cw}" y2="${h}" stroke="${t.borderColor}" stroke-width="1.5"/>`;
  for (let ri = 1; ri < rows; ri++) body += `<line x1="0" y1="${ri * rh}" x2="${w}" y2="${ri * rh}" stroke="${t.borderColor}" stroke-width="1.5"/>`;
  body += `<rect x="0.75" y="0.75" width="${w - 1.5}" height="${h - 1.5}" fill="none" stroke="${t.borderColor}" stroke-width="1.5"/>`;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" preserveAspectRatio="none">${body}</svg>`;
}

export function defaultTable(): TableSpec {
  return {
    rows: [
      ['Item', 'Qty', 'Price'],
      ['Design', '1', '$120'],
      ['Print', '50', '$45'],
      ['Delivery', '1', '$15'],
    ],
    headerFill: '#1f2937',
    headerColor: '#ffffff',
    cellFill: '#ffffff',
    altFill: '#f3f4f6',
    textColor: '#1f2937',
    borderColor: '#d1d5db',
    fontFamily: 'Inter',
    fontSize: 22,
  };
}
