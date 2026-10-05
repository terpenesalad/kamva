// True vector SVG export built straight from the document model.
//
// Geometry mirrors src/lib/render/builder.ts so the file looks like the canvas:
// shapes and lines are paths, text is <text>/<tspan> laid out by Konva's own
// line breaker, media is embedded once in <defs> and cropped with nested <svg>
// viewports. Only things SVG cannot express faithfully (curved text and the
// glow/neon/echo-style text effects) are rasterised, element by element.
//
// Konva draws an element's parts one by one, each with the element's opacity,
// blend mode and shadow. We do the same: an element is a transform-only <g>
// (which does not isolate) and every top-level part carries the opacity,
// mix-blend-mode and filter itself, so blending against the page matches.
import Konva from 'konva';
import type {
  Design,
  DesignElement,
  DrawElement,
  Fill,
  ImageElement,
  LineElement,
  LineEnd,
  Page,
  Shadow,
  ShapeElement,
  SvgElement,
  TextElement,
  VideoElement,
} from '../../types';
import { allVideoEls, blobToDataUrl, getAsset, getImage, getImageAsync, seekVideo, videoFor, waitVideoReady } from '../assets';
import { fillPrimaryColor, hexToRgb, linearPoints } from '../color';
import { fontFaceCss } from '../fonts';
import { shapePath } from '../shapes';
import { buildElement, displayText, fontStyleOf, svgMarkupFor, videoSourceTime, type BuildCtx } from '../render/builder';
import { coverCrop, drawMedia, effectiveAdjust, isNeutral, processImage } from '../render/media';
import { preparePage } from '../render/renderPage';
import { selectionBox, type Box } from './raster';
import { bytesToBase64, ExportFile, pageFileName, pagesByIds, Progress, releaseCanvas, throwIfAborted, tick } from './common';

export interface SvgOptions {
  transparent: boolean;
  /** Only these elements (of the single chosen page), cropped to their bounds */
  selection?: string[];
  /** Embed fonts used by text (bigger files, but they look right everywhere) */
  embedFonts?: boolean;
}

// ---------------------------------------------------------------------------
// Small helpers
// ---------------------------------------------------------------------------
const n = (v: number) => {
  if (!isFinite(v)) return '0';
  const r = Math.round(v * 1000) / 1000;
  return Object.is(r, -0) ? '0' : String(r);
};
const escAttr = (s: string) => s.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const escText = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

/** Split a CSS colour into an SVG-1.1-safe colour and an opacity */
function splitColor(c: string | undefined): { color: string; opacity: number } {
  if (!c || c === 'none') return { color: 'none', opacity: 1 };
  const s = c.trim();
  if (!s.startsWith('#') && !s.startsWith('rgb') && s !== 'transparent') return { color: s, opacity: 1 };
  const { r, g, b, a } = hexToRgb(s);
  if (![r, g, b].every((x) => isFinite(x))) return { color: s, opacity: 1 };
  const hex = '#' + [r, g, b].map((x) => Math.round(Math.max(0, Math.min(255, x))).toString(16).padStart(2, '0')).join('');
  return { color: hex, opacity: isFinite(a) ? Math.max(0, Math.min(1, a)) : 1 };
}

function dashFor(style: 'solid' | 'dashed' | 'dotted', w: number): number[] | undefined {
  if (style === 'dashed') return [w * 3, w * 2];
  if (style === 'dotted') return [0.001, w * 2];
  return undefined;
}

let segmenter: Intl.Segmenter | null = null;
function graphemes(s: string): string[] {
  try {
    segmenter ||= new Intl.Segmenter(undefined, { granularity: 'grapheme' });
    return Array.from(segmenter.segment(s), (x) => x.segment);
  } catch {
    return Array.from(s);
  }
}

let measureCtx: CanvasRenderingContext2D | null = null;
function measurer(): CanvasRenderingContext2D {
  measureCtx ||= document.createElement('canvas').getContext('2d')!;
  return measureCtx;
}

/** Fetch bytes from any URL the page can load (fetch can't read file:// in Electron, XHR can). */
async function fetchBytes(url: string): Promise<Uint8Array> {
  try {
    const r = await fetch(url);
    if (r.ok) return new Uint8Array(await r.arrayBuffer());
  } catch {
    /* fall through */
  }
  return new Promise((resolve, reject) => {
    const x = new XMLHttpRequest();
    x.open('GET', url);
    x.responseType = 'arraybuffer';
    x.onload = () => (x.response ? resolve(new Uint8Array(x.response)) : reject(new Error('empty')));
    x.onerror = () => reject(new Error('Could not load ' + url));
    x.send();
  });
}

function fontMime(url: string, fallback = 'font/woff2') {
  const ext = url.split('?')[0].split('.').pop()?.toLowerCase();
  return ext === 'woff' ? 'font/woff' : ext === 'ttf' ? 'font/ttf' : ext === 'otf' ? 'font/otf' : ext === 'woff2' ? 'font/woff2' : fallback;
}

/** @font-face rules for families (bundled stylesheet fonts and uploaded font assets) */
async function fontCss(design: Design, families: Set<string>): Promise<string> {
  if (!families.size) return '';
  const parts: string[] = [];
  let css = '';
  try {
    css = await fontFaceCss(families);
  } catch {
    css = '';
  }
  if (css) parts.push(css);
  // Families the stylesheet pass could not inline (e.g. fetch() refused a file:// URL)
  const covered = new Set<string>();
  for (const m of css.matchAll(/font-family:'([^']+)'/g)) covered.add(m[1]);
  const missing = new Set([...families].filter((f) => !covered.has(f)));
  if (missing.size) {
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
        if (!missing.has(fam)) continue;
        const url = rule.style.getPropertyValue('src').match(/url\(["']?([^"')]+)["']?\)/)?.[1];
        if (!url || url.startsWith('data:')) continue;
        try {
          const abs = new URL(url, sheet.href || location.href).href;
          const bytes = await fetchBytes(abs);
          parts.push(
            `@font-face{font-family:'${fam}';src:url(data:${fontMime(abs)};base64,${bytesToBase64(bytes)});font-weight:${rule.style.getPropertyValue('font-weight') || 400};font-style:${rule.style.getPropertyValue('font-style') || 'normal'};}`,
          );
          covered.add(fam);
        } catch {
          /* skip this face */
        }
      }
    }
  }
  // Uploaded fonts
  for (const meta of Object.values(design.assets)) {
    if (meta.kind !== 'font' || !meta.fontFamily || !families.has(meta.fontFamily)) continue;
    const ra = getAsset(meta.id);
    if (!ra) continue;
    try {
      const bytes = new Uint8Array(await ra.blob.arrayBuffer());
      const mime = ra.blob.type && ra.blob.type.startsWith('font/') ? ra.blob.type : fontMime(meta.name, 'font/ttf');
      parts.push(`@font-face{font-family:'${meta.fontFamily.replace(/'/g, "\\'")}';src:url(data:${mime};base64,${bytesToBase64(bytes)});}`);
    } catch {
      /* skip */
    }
  }
  return parts.join('\n');
}

// ---------------------------------------------------------------------------
// The writer: collects <defs> and body for one page
// ---------------------------------------------------------------------------
class SvgWriter {
  defs: string[] = [];
  body: string[] = [];
  families = new Set<string>();
  private idn = 0;
  private assetDefs = new Map<string, { id: string; w: number; h: number }>();

  constructor(
    public design: Design,
    public page: Page,
    private prefix: string,
  ) {}

  id(kind: string) {
    return `${this.prefix}${kind}${++this.idn}`;
  }

  // ---- paints -------------------------------------------------------------
  /** fill="…" fill-opacity="…" for a Fill within a w×h local box */
  paint(fill: Fill | undefined, w: number, h: number, attr: 'fill' | 'stroke' = 'fill'): string {
    if (!fill) return `${attr}="none"`;
    if (fill.type === 'solid') {
      const { color, opacity } = splitColor(fill.color);
      return `${attr}="${escAttr(color)}"` + (opacity < 1 ? ` ${attr}-opacity="${n(opacity)}"` : '');
    }
    const id = this.id('g');
    const stops = [...fill.stops]
      .sort((a, b) => a.offset - b.offset)
      .map((s) => {
        const { color, opacity } = splitColor(s.color);
        return `<stop offset="${n(Math.max(0, Math.min(1, s.offset)))}" stop-color="${escAttr(color)}"${opacity < 1 ? ` stop-opacity="${n(opacity)}"` : ''}/>`;
      })
      .join('');
    if (fill.type === 'linear') {
      const { start, end } = linearPoints(fill.angle, w, h);
      this.defs.push(`<linearGradient id="${id}" gradientUnits="userSpaceOnUse" x1="${n(start.x)}" y1="${n(start.y)}" x2="${n(end.x)}" y2="${n(end.y)}">${stops}</linearGradient>`);
    } else {
      const r = Math.max(w, h) * 0.7;
      this.defs.push(`<radialGradient id="${id}" gradientUnits="userSpaceOnUse" cx="${n(w / 2)}" cy="${n(h / 2)}" fx="${n(w / 2)}" fy="${n(h / 2)}" r="${n(r)}">${stops}</radialGradient>`);
    }
    return `${attr}="url(#${id})"`;
  }

  strokeColor(c: string, width: number) {
    const { color, opacity } = splitColor(c);
    return `stroke="${escAttr(color)}" stroke-width="${n(width)}"` + (opacity < 1 ? ` stroke-opacity="${n(opacity)}"` : '');
  }

  // ---- shadows -------------------------------------------------------------
  /**
   * Drop shadow filter in the element's local space. Canvas shadows are offset
   * in screen space: Konva passes the offset through the node's decomposed
   * absolute scale, so a single flip negates the y offset and rotation is
   * ignored. builder.ts' shadowOnly() (clipped media) uses the raw offset.
   * Map that screen offset back into the element's rotated, flipped space.
   */
  shadowFilter(el: DesignElement, s: Shadow | undefined, opts: { only?: boolean; extra?: number } = {}): string {
    if (!s?.enabled) return '';
    const fx = el.flipX ? -1 : 1;
    const fy = el.flipY ? -1 : 1;
    const sy0 = opts.only ? s.offsetY : s.offsetY * fx * fy;
    const a = (-(el.rotation || 0) * Math.PI) / 180;
    const rx = s.offsetX * Math.cos(a) - sy0 * Math.sin(a);
    const ry = s.offsetX * Math.sin(a) + sy0 * Math.cos(a);
    const dx = fx * rx;
    const dy = fy * ry;
    const { color, opacity } = splitColor(s.color);
    const op = Math.max(0, Math.min(1, opacity * (s.opacity ?? 1)));
    const sd = Math.max(0, s.blur / 2);
    const w = Math.max(1, el.width);
    const h = Math.max(1, el.height);
    const m = sd * 3 + Math.hypot(s.offsetX, s.offsetY) + (opts.extra ?? 0) + 4;
    const id = this.id('f');
    const region = `filterUnits="userSpaceOnUse" x="${n(-m)}" y="${n(-m)}" width="${n(w + m * 2)}" height="${n(h + m * 2)}" color-interpolation-filters="sRGB"`;
    if (opts.only) {
      this.defs.push(
        `<filter id="${id}" ${region}><feGaussianBlur in="SourceAlpha" stdDeviation="${n(sd)}"/><feOffset dx="${n(dx)}" dy="${n(dy)}" result="o"/><feFlood flood-color="${escAttr(color)}" flood-opacity="${n(op)}"/><feComposite in2="o" operator="in"/></filter>`,
      );
    } else {
      this.defs.push(`<filter id="${id}" ${region}><feDropShadow dx="${n(dx)}" dy="${n(dy)}" stdDeviation="${n(sd)}" flood-color="${escAttr(color)}" flood-opacity="${n(op)}"/></filter>`);
    }
    return ` filter="url(#${id})"`;
  }

  // ---- embedded media --------------------------------------------------------
  /** <image> in defs for an asset (embedded once, referenced with <use>) */
  async assetImage(assetId: string): Promise<{ id: string; w: number; h: number } | null> {
    const hit = this.assetDefs.get(assetId);
    if (hit) return hit;
    const ra = getAsset(assetId);
    if (!ra) return null;
    const img = getImage(assetId) || (await getImageAsync(assetId).catch(() => undefined));
    const w = img?.naturalWidth || ra.meta.width || 0;
    const h = img?.naturalHeight || ra.meta.height || 0;
    if (!w || !h) return null;
    const href = await blobToDataUrl(ra.blob);
    const id = this.id('i');
    this.defs.push(`<image id="${id}" width="${n(w)}" height="${n(h)}" preserveAspectRatio="none" xlink:href="${escAttr(href)}"/>`);
    const out = { id, w, h };
    this.assetDefs.set(assetId, out);
    return out;
  }

  /** A raster (canvas) placed in a w×h box */
  canvasImage(c: HTMLCanvasElement, x: number, y: number, w: number, h: number, mime: 'image/png' | 'image/jpeg', extra = ''): string {
    const href = c.toDataURL(mime, mime === 'image/jpeg' ? 0.92 : undefined);
    return `<image x="${n(x)}" y="${n(y)}" width="${n(w)}" height="${n(h)}" preserveAspectRatio="none" xlink:href="${escAttr(href)}"${extra}/>`;
  }

  /** Cropped asset in a w×h box: nested viewport with a viewBox into the source */
  croppedAsset(def: { id: string; w: number; h: number }, crop: { x: number; y: number; w: number; h: number }, w: number, h: number, extra = ''): string {
    const vb = `${n(crop.x * def.w)} ${n(crop.y * def.h)} ${n(Math.max(0.001, crop.w * def.w))} ${n(Math.max(0.001, crop.h * def.h))}`;
    return `<svg x="0" y="0" width="${n(w)}" height="${n(h)}" viewBox="${vb}" preserveAspectRatio="none" overflow="hidden"${extra}><use xlink:href="#${def.id}"/></svg>`;
  }

  clipPath(d: string): string {
    const id = this.id('c');
    this.defs.push(`<clipPath id="${id}"><path d="${d}"/></clipPath>`);
    return id;
  }
}

// ---------------------------------------------------------------------------
// Element emitters
// ---------------------------------------------------------------------------
/** opacity + blend attrs carried by every top-level part of an element */
function partAttrs(el: DesignElement, opacityMul = 1, blendOverride?: string): string {
  const o = Math.max(0, Math.min(1, (el.opacity ?? 1) * opacityMul));
  const blend = el.blendMode && el.blendMode !== 'source-over' ? el.blendMode : blendOverride;
  return (o < 1 ? ` opacity="${n(o)}"` : '') + (blend ? ` style="mix-blend-mode:${blend}"` : '');
}

function elementTransform(el: DesignElement): string {
  const w = Math.max(1, el.width);
  const h = Math.max(1, el.height);
  const t: string[] = [];
  if (el.x || el.y) t.push(`translate(${n(el.x)} ${n(el.y)})`);
  if (el.rotation) t.push(`rotate(${n(el.rotation)} ${n(w / 2)} ${n(h / 2)})`);
  if (el.flipX || el.flipY) {
    t.push(`translate(${n(el.flipX ? w : 0)} ${n(el.flipY ? h : 0)})`);
    t.push(`scale(${el.flipX ? -1 : 1} ${el.flipY ? -1 : 1})`);
  }
  return t.length ? ` transform="${t.join(' ')}"` : '';
}

interface TextLayoutInput {
  text: string;
  width: number;
  height?: number;
  fontFamily: string; // bare family name
  fontSize: number;
  fontWeight: 'normal' | 'bold';
  fontStyle: 'normal' | 'italic';
  align: 'left' | 'center' | 'right' | 'justify';
  verticalAlign: 'top' | 'middle' | 'bottom';
  lineHeight: number;
  letterSpacing: number;
  underline?: boolean;
  strike?: boolean;
}

/**
 * Emit text laid out exactly like Konva.Text: same line breaks (Konva's own
 * textArr), same baseline maths and alignment. Returns the inner markup
 * (decorations + <text>) in the text box's local space.
 */
function textMarkup(w: SvgWriter, t: TextLayoutInput, paint: { fill: string; stroke: string; deco: string }): string {
  const decoration = [t.underline ? 'underline' : '', t.strike ? 'line-through' : ''].filter(Boolean).join(' ');
  const k = new Konva.Text({
    text: t.text,
    width: t.width,
    height: t.height,
    fontFamily: `"${t.fontFamily}"`,
    fontSize: t.fontSize,
    fontStyle: fontStyleOf(t),
    textDecoration: decoration,
    align: t.align,
    verticalAlign: t.verticalAlign,
    lineHeight: t.lineHeight,
    letterSpacing: t.letterSpacing,
    wrap: 'word',
    padding: 0,
  });
  try {
    const lines = k.textArr;
    if (!lines.length || !t.text) return '';
    const fs = t.fontSize;
    const lh = t.lineHeight * fs;
    const totalWidth = k.width();
    const top: number = (k as any)._getTextTop();
    // distance from the top of a line box to its alphabetic baseline (Konva.Text#_sceneFunc)
    let first = lh / 2;
    if (!(Konva as any).legacyTextRendering) {
      const m = k.measureSize('M');
      first = (m.fontBoundingBoxAscent - m.fontBoundingBoxDescent) / 2 + lh / 2;
    }
    const perChar = t.letterSpacing !== 0 || t.align === 'justify';
    const mctx = measurer();
    if (perChar) {
      mctx.font = (k as any)._getContextFont();
      (mctx as any).fontKerning = 'none';
    }
    let under = '';
    let strike = '';
    const tspans: string[] = [];
    const off = Math.round(fs / 4);
    lines.forEach((ln, i) => {
      const y = top + first + i * lh;
      let x = t.align === 'right' ? totalWidth - ln.width : t.align === 'center' ? (totalWidth - ln.width) / 2 : 0;
      const lineW = Math.round(t.align === 'justify' && !ln.lastInParagraph ? totalWidth : ln.width);
      if (t.underline) under += `M${n(x)} ${n(y + off)}H${n(x + lineW)}`;
      if (t.strike) strike += `M${n(x)} ${n(y - off)}H${n(x + lineW)}`;
      if (!ln.text) return;
      if (!perChar) {
        // let the viewer place the glyphs, anchored where Konva aligns the line
        if (t.align === 'center') tspans.push(`<tspan x="${n(totalWidth / 2)}" y="${n(y)}" text-anchor="middle">${escText(ln.text)}</tspan>`);
        else if (t.align === 'right') tspans.push(`<tspan x="${n(totalWidth)}" y="${n(y)}" text-anchor="end">${escText(ln.text)}</tspan>`);
        else tspans.push(`<tspan x="${n(x)}" y="${n(y)}">${escText(ln.text)}</tspan>`);
        return;
      }
      // letter spacing / justify: position every glyph exactly as Konva advances it
      const g = graphemes(ln.text);
      const spaces = ln.text.split(' ').length - 1;
      const xs: number[] = [];
      for (const ch of g) {
        if (ch === ' ' && !ln.lastInParagraph && t.align === 'justify' && spaces > 0) x += (totalWidth - ln.width) / spaces;
        xs.push(x);
        x += mctx.measureText(ch).width + t.letterSpacing;
      }
      if (g.every((ch) => ch.length === 1)) {
        tspans.push(`<tspan x="${xs.map(n).join(' ')}" y="${n(y)}">${escText(ln.text)}</tspan>`);
      } else {
        g.forEach((ch, j) => {
          if (ch !== ' ') tspans.push(`<tspan x="${n(xs[j])}" y="${n(y)}">${escText(ch)}</tspan>`);
        });
      }
    });
    w.families.add(t.fontFamily);
    const font =
      `font-family="${escAttr(`'${t.fontFamily.replace(/'/g, "\\'")}', sans-serif`)}" font-size="${n(fs)}"` +
      (t.fontWeight === 'bold' ? ' font-weight="700"' : '') +
      (t.fontStyle === 'italic' ? ' font-style="italic"' : '') +
      (perChar ? ' font-kerning="none"' : '');
    const decoLine = (d: string) => `<path d="${d}" fill="none" ${paint.deco} stroke-width="${n(Math.max(0.5, fs / 15))}"/>`;
    // Konva draws the underline before the glyphs and the strike-through after
    return (
      (under ? decoLine(under) : '') +
      `<text ${font} ${paint.fill}${paint.stroke} xml:space="preserve" style="white-space:pre">${tspans.join('')}</text>` +
      (strike ? decoLine(strike) : '')
    );
  } finally {
    k.destroy();
  }
}

/** Turn fill="…" fill-opacity="…" into the matching stroke attributes */
const asStroke = (fillAttr: string) => fillAttr.replace(/\bfill(-opacity)?=/g, 'stroke$1=');

function emitText(w: SvgWriter, el: TextElement): string {
  const fx = el.effect || { type: 'none', color: '#000', size: 4, offset: 6 };
  const W = Math.max(1, el.width);
  const H = Math.max(1, el.height);
  const fill = w.paint(el.fill, W, H);
  let stroke = '';
  let fillAttr = fill;
  if (fx.type === 'outline') {
    // stroke under the fill (fillAfterStrokeEnabled)
    stroke = ` ${w.strokeColor(fx.color, fx.size)} stroke-linejoin="round" stroke-miterlimit="2" paint-order="stroke"`;
  } else if (fx.type === 'hollow') {
    stroke = ` ${w.strokeColor(fillPrimaryColor(el.fill), Math.max(1, fx.size * 0.5))} stroke-linejoin="round" stroke-miterlimit="2"`;
    fillAttr = 'fill="none"';
  }
  const inner = textMarkup(
    w,
    {
      text: displayText(el),
      width: el.width,
      height: el.autoHeight ? undefined : el.height,
      fontFamily: el.fontFamily,
      fontSize: el.fontSize,
      fontWeight: el.fontWeight,
      fontStyle: el.fontStyle,
      align: el.align,
      verticalAlign: el.autoHeight ? 'top' : el.verticalAlign,
      lineHeight: el.lineHeight,
      letterSpacing: el.letterSpacing,
      underline: el.underline,
      strike: el.strike,
    },
    { fill: fillAttr, stroke, deco: asStroke(fill) },
  );
  if (!inner) return '';
  const filter = w.shadowFilter(el, el.shadow, { extra: el.fontSize + (fx.type === 'outline' ? fx.size : 0) });
  return `<g${partAttrs(el)}${filter}>${inner}</g>`;
}

function emitShape(w: SvgWriter, el: ShapeElement): string {
  const W = Math.max(1, el.width);
  const H = Math.max(1, el.height);
  const d = shapePath(el.shape, W, H, el.cornerRadius);
  let s = '';
  if (el.strokeWidth > 0) {
    const dash = dashFor(el.strokeDash, el.strokeWidth);
    s =
      ` ${w.strokeColor(el.stroke, el.strokeWidth)} stroke-linejoin="round"` +
      ` stroke-linecap="${el.strokeDash === 'dotted' ? 'round' : 'butt'}"` +
      (dash ? ` stroke-dasharray="${dash.map(n).join(' ')}"` : '');
  }
  const filter = w.shadowFilter(el, el.shadow, { extra: el.strokeWidth });
  let out = `<path d="${d}" ${w.paint(el.fill, W, H)}${s}${partAttrs(el)}${filter}/>`;
  if (el.text) {
    const ts = el.textStyle || {};
    const fs = ts.fontSize ?? Math.max(14, Math.min(W, H) * 0.16);
    const color = ts.fill?.type === 'solid' ? ts.fill.color : '#ffffff';
    const inner = textMarkup(
      w,
      {
        text: el.text,
        width: W * 0.8,
        height: H,
        fontFamily: ts.fontFamily ?? 'Inter',
        fontSize: fs,
        fontWeight: ts.fontWeight ?? 'bold',
        fontStyle: ts.fontStyle ?? 'normal',
        align: ts.align ?? 'center',
        verticalAlign: 'middle',
        lineHeight: ts.lineHeight ?? 1.2,
        letterSpacing: ts.letterSpacing ?? 0,
      },
      { fill: w.paint({ type: 'solid', color }, W, H), stroke: '', deco: 'stroke="none"' },
    );
    if (inner) out += `<g transform="translate(${n(W * 0.1)} 0)"${partAttrs(el)}>${inner}</g>`;
  }
  return out;
}

/** Path data for the filled and the stroked line ends (same maths as builder.ts) */
function lineEnds(ends: [LineEnd, number, number, number][], size: number) {
  let filled = '';
  let stroked = '';
  for (const [kind, x, y, ang] of ends) {
    const c = Math.cos(ang);
    const s = Math.sin(ang);
    const P = (dx: number, dy: number) => [x + dx * c - dy * s, y + dx * s + dy * c] as const;
    switch (kind) {
      case 'triangle': {
        const a = P(0, 0);
        const b = P(-size * 1.2, -size * 0.65);
        const d = P(-size * 1.2, size * 0.65);
        filled += `M${n(a[0])} ${n(a[1])}L${n(b[0])} ${n(b[1])}L${n(d[0])} ${n(d[1])}Z`;
        break;
      }
      case 'circle': {
        const a = P(-size * 0.55, 0);
        const r = size * 0.55;
        filled += `M${n(a[0] + r)} ${n(a[1])}A${n(r)} ${n(r)} 0 1 1 ${n(a[0] - r)} ${n(a[1])}A${n(r)} ${n(r)} 0 1 1 ${n(a[0] + r)} ${n(a[1])}Z`;
        break;
      }
      case 'square': {
        const pts = [P(0, -size * 0.5), P(0, size * 0.5), P(-size, size * 0.5), P(-size, -size * 0.5)];
        filled += 'M' + pts.map((p) => `${n(p[0])} ${n(p[1])}`).join('L') + 'Z';
        break;
      }
      case 'arrow': {
        const L = size * 1.1;
        stroked += `M${n(x - L * c + L * 0.7 * s)} ${n(y - L * s - L * 0.7 * c)}L${n(x)} ${n(y)}L${n(x - L * c - L * 0.7 * s)} ${n(y - L * s + L * 0.7 * c)}`;
        break;
      }
      case 'bar':
        stroked += `M${n(x + size * 0.6 * s)} ${n(y - size * 0.6 * c)}L${n(x - size * 0.6 * s)} ${n(y + size * 0.6 * c)}`;
        break;
    }
  }
  return { filled, stroked };
}

function emitLine(w: SvgWriter, el: LineElement): string {
  const W = Math.max(1, el.width);
  const H = Math.max(1, el.height);
  const sw = el.strokeWidth;
  const size = Math.max(10, sw * 3);
  const cy = H / 2;
  const cpY = cy - el.curve * W * 0.5;
  const startAng = Math.atan2(cy - cpY, 0 - W / 2);
  const endAng = Math.atan2(cy - cpY, W - W / 2);
  const shorten = (k: LineEnd) => (k === 'triangle' ? size * 1.1 : k === 'square' ? size * 0.9 : k === 'circle' ? size * 0.9 : 0);
  const s0 = shorten(el.start);
  const s1 = shorten(el.end);
  const x0 = Math.cos(startAng) * -s0;
  const y0 = cy + Math.sin(startAng) * -s0;
  const x1 = W - Math.cos(endAng) * s1;
  const y1 = cy - Math.sin(endAng) * s1;
  const d = Math.abs(el.curve) > 0.001 ? `M${n(x0)} ${n(y0)}Q${n(W / 2)} ${n(cpY)} ${n(x1)} ${n(y1)}` : `M${n(x0)} ${n(y0)}L${n(x1)} ${n(y1)}`;
  const dash = dashFor(el.strokeDash, sw);
  const filter = w.shadowFilter(el, el.shadow, { extra: size * 1.5 });
  let out =
    `<path d="${d}" fill="none" ${w.strokeColor(el.stroke, sw)} stroke-linecap="${el.strokeDash === 'dotted' ? 'round' : el.lineCap}" stroke-linejoin="round"` +
    (dash ? ` stroke-dasharray="${dash.map(n).join(' ')}"` : '') +
    `${partAttrs(el)}${filter}/>`;
  const { filled, stroked } = lineEnds(
    [
      [el.start, 0, cy, startAng],
      [el.end, W, cy, endAng],
    ],
    size,
  );
  if (filled) {
    const { color, opacity } = splitColor(el.stroke);
    out += `<path d="${filled}" fill="${escAttr(color)}"${opacity < 1 ? ` fill-opacity="${n(opacity)}"` : ''}${partAttrs(el)}${filter}/>`;
  }
  if (stroked) out += `<path d="${stroked}" fill="none" ${w.strokeColor(el.stroke, sw)} stroke-linecap="round" stroke-linejoin="round"${partAttrs(el)}/>`;
  return out;
}

/** Konva.Line tension curve as SVG path data (mirrors Line#_sceneFunc for open lines) */
export function tensionPath(points: number[], tension: number): string {
  if (points.length < 2) return '';
  let d = `M${n(points[0])} ${n(points[1])}`;
  if (tension !== 0 && points.length > 4) {
    const line = new Konva.Line({ points, tension });
    const tp: number[] = line.getTensionPoints();
    line.destroy();
    const len = tp.length;
    d += `Q${n(tp[0])} ${n(tp[1])} ${n(tp[2])} ${n(tp[3])}`;
    let i = 4;
    while (i < len - 2) {
      d += `C${n(tp[i])} ${n(tp[i + 1])} ${n(tp[i + 2])} ${n(tp[i + 3])} ${n(tp[i + 4])} ${n(tp[i + 5])}`;
      i += 6;
    }
    d += `Q${n(tp[len - 2])} ${n(tp[len - 1])} ${n(points[points.length - 2])} ${n(points[points.length - 1])}`;
  } else {
    for (let i = 2; i < points.length; i += 2) d += `L${n(points[i])} ${n(points[i + 1])}`;
  }
  return d;
}

function emitDraw(w: SvgWriter, el: DrawElement): string {
  const W = el.width;
  const H = el.height;
  const pts: number[] = [];
  for (let i = 0; i < el.points.length; i += 2) pts.push(el.points[i] * W, el.points[i + 1] * H);
  if (pts.length < 2) return '';
  const k = Math.sqrt((W * H) / Math.max(1, el.baseWidth * el.baseHeight)) || 1;
  const hl = el.brush === 'highlighter';
  const d = tensionPath(pts, el.brush === 'pen' ? 0.4 : 0.2);
  const filter = w.shadowFilter(el, el.shadow, { extra: el.strokeWidth * k });
  return (
    `<path d="${d}" fill="none" ${w.strokeColor(el.stroke, el.strokeWidth * k)} stroke-linecap="${hl ? 'square' : 'round'}" stroke-linejoin="round"` +
    `${partAttrs(el, hl ? 0.4 : 1, hl ? 'multiply' : undefined)}${filter}/>`
  );
}

/** Recoloured markup as a nested, scaled <svg> with ids made unique */
function emitSvg(w: SvgWriter, el: SvgElement): string {
  const markup = svgMarkupFor(el);
  const doc = new DOMParser().parseFromString(markup, 'image/svg+xml');
  const root = doc.documentElement;
  if (!root || root.nodeName.toLowerCase() !== 'svg' || doc.querySelector('parsererror')) throw new Error('Unparseable SVG markup');
  if (el.meta?.kind === 'chart' && el.meta.chart) w.families.add(el.meta.chart.fontFamily || 'Inter');
  if (el.meta?.kind === 'table' && el.meta.table) w.families.add(el.meta.table.fontFamily || 'Inter');
  root.querySelectorAll('script,foreignObject').forEach((s) => s.remove());
  // unique ids
  const pfx = w.id('s') + '-';
  const ids = new Map<string, string>();
  root.querySelectorAll('[id]').forEach((e) => {
    const nid = pfx + e.id;
    ids.set(e.id, nid);
    e.id = nid;
  });
  const fixRefs = (v: string) =>
    v.replace(/url\(\s*['"]?#([^'")\s]+)['"]?\s*\)/g, (m, id) => (ids.has(id) ? `url(#${ids.get(id)})` : m));
  const all = [root, ...Array.from(root.querySelectorAll('*'))];
  for (const e of all) {
    for (const a of Array.from(e.attributes)) {
      if (a.name.startsWith('on')) {
        e.removeAttribute(a.name);
        continue;
      }
      if ((a.name === 'href' || a.name === 'xlink:href') && a.value.startsWith('#') && ids.has(a.value.slice(1))) {
        e.setAttribute(a.name, '#' + ids.get(a.value.slice(1)));
      } else if (a.value.includes('url(')) {
        e.setAttribute(a.name, fixRefs(a.value));
      }
    }
    if (e.nodeName.toLowerCase() === 'style' && e.textContent) e.textContent = fixRefs(e.textContent);
  }
  // scale to the box
  const vb = root.getAttribute('viewBox');
  if (!vb) {
    const ow = parseFloat(root.getAttribute('width') || '') || el.width;
    const oh = parseFloat(root.getAttribute('height') || '') || el.height;
    root.setAttribute('viewBox', `0 0 ${ow} ${oh}`);
  }
  root.setAttribute('x', '0');
  root.setAttribute('y', '0');
  root.setAttribute('width', n(Math.max(1, el.width)));
  root.setAttribute('height', n(Math.max(1, el.height)));
  if (!root.getAttribute('preserveAspectRatio')) root.setAttribute('preserveAspectRatio', 'none');
  root.removeAttribute('xmlns');
  let s = new XMLSerializer().serializeToString(root);
  // the serializer re-adds the default namespace on the root; harmless but noisy
  s = s.replace(/^<svg xmlns="http:\/\/www\.w3\.org\/2000\/svg"/, '<svg');
  const filter = w.shadowFilter(el, el.shadow);
  return `<g${partAttrs(el)}${filter}>${s}</g>`;
}

function placeholder(W: number, H: number, path: string) {
  const s = Math.min(W, H) * 0.28;
  const ix = (W - s) / 2;
  const iy = (H - s * 0.8) / 2;
  return (
    `<path d="${path}" fill="#e5e7eb"/>` +
    `<path transform="translate(${n(ix)} ${n(iy)})" fill="#9ca3af" d="M0,${n(s * 0.8)} L${n(s * 0.32)},${n(s * 0.35)} L${n(s * 0.55)},${n(s * 0.62)} L${n(s * 0.72)},${n(s * 0.45)} L${n(s)},${n(s * 0.8)} Z M${n(s * 0.78)},${n(s * 0.18)} a${n(s * 0.1)},${n(s * 0.1)} 0 1,0 0.01,0 Z"/>`
  );
}

/** The current frame of a video element (the canvas' frame if it's on screen, else the first frame) */
async function videoFrameSource(el: VideoElement): Promise<HTMLVideoElement | null> {
  const live = allVideoEls().get('edit:' + el.id);
  if (live && live.readyState >= 2 && live.videoWidth && live.dataset.asset === el.assetId) return live;
  const v = videoFor('export:' + el.id, el.assetId!);
  if (!v) return null;
  await waitVideoReady(v);
  const dur = getAsset(el.assetId)?.meta.duration || v.duration || 0;
  await seekVideo(v, videoSourceTime(el, el.timing?.start ?? 0, dur));
  return v.readyState >= 2 && v.videoWidth ? v : null;
}

async function emitMedia(w: SvgWriter, el: ImageElement | VideoElement): Promise<string> {
  const W = Math.max(1, el.width);
  const H = Math.max(1, el.height);
  const masked = el.mask !== 'none' || el.cornerRadius > 0;
  const path = shapePath(el.mask === 'none' ? 'rect' : el.mask, W, H, el.cornerRadius);
  const ra = getAsset(el.assetId);
  if (!el.assetId || !ra) return `<g${partAttrs(el)}>${placeholder(W, H, path)}</g>`;

  const clipped = masked || el.borderWidth > 0;
  const a = effectiveAdjust(el.adjust, el.filter, el.filterIntensity);
  let shadowPart = '';
  let imageFilter = '';
  if (el.shadow?.enabled) {
    if (clipped) shadowPart = `<path d="${path}" fill="#000"${partAttrs(el)}${w.shadowFilter(el, el.shadow, { only: true })}/>`;
    else imageFilter = w.shadowFilter(el, el.shadow);
  }

  let media = '';
  if (el.type === 'video') {
    const v = await videoFrameSource(el);
    if (!v) {
      media = `<path d="${path}" fill="#111111"/>`;
    } else {
      const vw = v.videoWidth;
      const vh = v.videoHeight;
      const k = Math.min((el.crop.w * vw) / W, (el.crop.h * vh) / H);
      let ow = W * k;
      let oh = H * k;
      const lim = 2048 / Math.max(ow, oh);
      if (lim < 1) {
        ow *= lim;
        oh *= lim;
      }
      const c = document.createElement('canvas');
      c.width = Math.max(1, Math.round(ow));
      c.height = Math.max(1, Math.round(oh));
      drawMedia(c.getContext('2d')!, v, vw, vh, el.crop, a, c.width, c.height);
      media = w.canvasImage(c, 0, 0, W, H, 'image/jpeg', imageFilter);
      releaseCanvas(c);
    }
  } else if (isNeutral(a)) {
    const def = await w.assetImage(el.assetId);
    media = def ? w.croppedAsset(def, el.crop, W, H, imageFilter) : `<path d="${path}" fill="#e5e7eb"/>`;
  } else {
    const img = getImage(el.assetId) || (await getImageAsync(el.assetId).catch(() => undefined));
    if (!img) media = `<path d="${path}" fill="#e5e7eb"/>`;
    else {
      const sw = img.naturalWidth;
      const sh = img.naturalHeight;
      const k = Math.min((el.crop.w * sw) / W, (el.crop.h * sh) / H);
      let ow = W * k;
      let oh = H * k;
      const lim = 4096 / Math.max(ow, oh);
      if (lim < 1) {
        ow *= lim;
        oh *= lim;
      }
      const c = processImage(img, el.assetId, el.crop, a, ow, oh);
      const opaque = ra.blob.type === 'image/jpeg';
      media = w.canvasImage(c, 0, 0, W, H, opaque ? 'image/jpeg' : 'image/png', imageFilter);
    }
  }

  let border = '';
  if (el.borderWidth > 0) border = `<path d="${path}" fill="none" ${w.strokeColor(el.borderColor, el.borderWidth * 2)}/>`;
  if (clipped) {
    const cid = w.clipPath(path);
    return `${shadowPart}<g clip-path="url(#${cid})"${partAttrs(el)}>${media}${border}</g>`;
  }
  const pa = partAttrs(el);
  return pa ? `<g${pa}>${media}</g>` : media;
}

/**
 * Render a single element alone through Konva (as placed on the page, so its
 * rotation and screen-space shadow are exact) and embed it as a PNG.
 */
function rasterizeElement(w: SvgWriter, el: DesignElement): string {
  const { design, page } = w;
  const container = document.createElement('div');
  const stage = new Konva.Stage({ container, width: design.width, height: design.height });
  const layer = new Konva.Layer({ listening: false });
  stage.add(layer);
  try {
    const ctx: BuildCtx = { mode: 'export', scale: 2, design, page, videoKey: 'export:', transparent: true };
    const g = buildElement(el, ctx);
    layer.add(g);
    const r = g.getClientRect();
    const pad = (el.type === 'text' ? el.fontSize : 0) + (el.shadow?.enabled ? el.shadow.blur * 2 : 0) + 4;
    const x0 = Math.max(0, Math.floor(r.x - pad));
    const y0 = Math.max(0, Math.floor(r.y - pad));
    const x1 = Math.min(design.width, Math.ceil(r.x + r.width + pad));
    const y1 = Math.min(design.height, Math.ceil(r.y + r.height + pad));
    if (!isFinite(x0 + y0 + x1 + y1) || x1 - x0 < 1 || y1 - y0 < 1) return '';
    const ratio = Math.min(2, 8192 / Math.max(x1 - x0, y1 - y0));
    const c = stage.toCanvas({ x: x0, y: y0, width: x1 - x0, height: y1 - y0, pixelRatio: ratio });
    // opacity is baked in by Konva; blending still has to happen against the page
    const blend = el.blendMode && el.blendMode !== 'source-over' ? ` style="mix-blend-mode:${el.blendMode}"` : '';
    const out = w.canvasImage(c, x0, y0, x1 - x0, y1 - y0, 'image/png', blend);
    releaseCanvas(c);
    return out;
  } finally {
    stage.destroy();
  }
}

/** Can this element be written as true vectors? */
export function needsRaster(el: DesignElement): boolean {
  if (el.type !== 'text') return false;
  if (Math.abs(el.curve) > 1) return true;
  const fx = el.effect?.type ?? 'none';
  return fx !== 'none' && fx !== 'outline' && fx !== 'hollow';
}

async function emitElement(w: SvgWriter, el: DesignElement): Promise<string> {
  if (el.hidden) return '';
  if (needsRaster(el)) return rasterizeElement(w, el);
  let inner = '';
  switch (el.type) {
    case 'text':
      inner = emitText(w, el);
      break;
    case 'shape':
      inner = emitShape(w, el);
      break;
    case 'line':
      inner = emitLine(w, el);
      break;
    case 'draw':
      inner = emitDraw(w, el);
      break;
    case 'svg':
      inner = emitSvg(w, el);
      break;
    case 'image':
    case 'video':
      inner = await emitMedia(w, el);
      break;
  }
  if (!inner) return '';
  const label = el.name ? ` data-name="${escAttr(el.name)}"` : '';
  return `<g${elementTransform(el)}${label}>${inner}</g>`;
}

async function emitBackground(w: SvgWriter, transparent: boolean): Promise<string> {
  const { design, page } = w;
  const W = design.width;
  const H = design.height;
  let out = '';
  if (!transparent) out += `<rect width="${n(W)}" height="${n(H)}" ${w.paint(page.background.fill, W, H)}/>`;
  const bgId = page.background.assetId;
  const ra = getAsset(bgId);
  if (!bgId || !ra) return out;
  const a = effectiveAdjust(page.background.adjust, page.background.filter, page.background.filterIntensity ?? 1);
  if (ra.meta.kind === 'video') {
    const v = videoFor('export:bg:' + page.id, bgId);
    if (v) {
      await waitVideoReady(v);
      await seekVideo(v, 0);
      if (v.videoWidth) {
        const k = Math.min(1, 2048 / Math.max(W, H));
        const c = document.createElement('canvas');
        c.width = Math.max(1, Math.round(W * k));
        c.height = Math.max(1, Math.round(H * k));
        drawMedia(c.getContext('2d')!, v, v.videoWidth, v.videoHeight, coverCrop(v.videoWidth, v.videoHeight, W, H), a, c.width, c.height);
        out += w.canvasImage(c, 0, 0, W, H, 'image/jpeg');
        releaseCanvas(c);
      }
    }
    return out;
  }
  const img = getImage(bgId) || (await getImageAsync(bgId).catch(() => undefined));
  if (!img) return out;
  const crop = coverCrop(img.naturalWidth, img.naturalHeight, W, H);
  if (isNeutral(a)) {
    const def = await w.assetImage(bgId);
    if (def) out += w.croppedAsset(def, crop, W, H);
  } else {
    const k = Math.min((crop.w * img.naturalWidth) / W, (crop.h * img.naturalHeight) / H, 4096 / Math.max(W, H));
    const c = processImage(img, bgId, crop, a, W * k, H * k);
    out += w.canvasImage(c, 0, 0, W, H, ra.blob.type === 'image/jpeg' ? 'image/jpeg' : 'image/png');
  }
  return out;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------
/** Build the SVG document for one page */
export async function pageToSvg(design: Design, page: Page, opts: SvgOptions = { transparent: false }, signal?: AbortSignal): Promise<string> {
  await preparePage(design, page, 'export:');
  const w = new SvgWriter(design, page, 'k' + Math.random().toString(36).slice(2, 6) + '-');
  let box: Box = { x: 0, y: 0, width: design.width, height: design.height };
  let elements = page.elements;
  let transparent = opts.transparent;
  if (opts.selection?.length) {
    const ids = new Set(opts.selection);
    elements = page.elements.filter((e) => ids.has(e.id) && !e.hidden);
    const b = selectionBox(elements);
    if (!b) throw new Error('The selected elements are hidden. Show them or change the selection, then try again.');
    box = b;
    transparent = true;
  } else {
    w.body.push(await emitBackground(w, transparent));
  }
  for (const el of elements) {
    if (signal?.aborted) break;
    try {
      w.body.push(await emitElement(w, el));
    } catch (e) {
      // one broken element shouldn't sink the file: fall back to a raster of it
      console.warn('SVG export: rasterising element after error', el.id, e);
      try {
        w.body.push(rasterizeElement(w, el));
      } catch {
        /* skip */
      }
    }
  }
  throwIfAborted(signal);
  const css = opts.embedFonts === false ? '' : await fontCss(design, w.families);
  const defs = (css ? `<style>${css.replace(/<\/style/gi, '')}</style>` : '') + w.defs.join('');
  const title = escText(page.name || design.name || 'Kamva design');
  return (
    `<?xml version="1.0" encoding="UTF-8"?>\n` +
    `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" version="1.1"` +
    ` width="${n(box.width)}" height="${n(box.height)}" viewBox="${n(box.x)} ${n(box.y)} ${n(box.width)} ${n(box.height)}">` +
    `<title>${title}</title>` +
    (defs ? `<defs>${defs}</defs>` : '') +
    w.body.join('') +
    `</svg>\n`
  );
}

export async function exportSvg(
  design: Design,
  pageIds: string[],
  opts: SvgOptions & { baseName: string },
  onProgress: Progress,
  signal?: AbortSignal,
): Promise<ExportFile[]> {
  const pages = opts.selection?.length ? pagesByIds(design, pageIds).slice(0, 1) : pagesByIds(design, pageIds);
  if (!pages.length) throw new Error('Choose at least one page to export.');
  const multi = pages.length > 1;
  const enc = new TextEncoder();
  const files: ExportFile[] = [];
  for (let i = 0; i < pages.length; i++) {
    throwIfAborted(signal);
    onProgress(i / pages.length, multi ? `Building page ${i + 1} of ${pages.length}` : 'Building SVG');
    await tick();
    const svg = await pageToSvg(design, pages[i], opts, signal);
    files.push({ name: pageFileName(opts.baseName, design, pages[i].id, 'svg', multi), data: enc.encode(svg) });
  }
  onProgress(1, 'Done');
  return files;
}
