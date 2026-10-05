// Small builder helpers that keep the built-in template definitions readable.
import type {
  BlendMode,
  ChartSpec,
  DesignElement,
  ElementAnimation,
  Fill,
  LineElement,
  MaskKind,
  Page,
  Shadow,
  ShapeKind,
  Template,
  TextEffect,
  TextElement,
  TransitionType,
} from '../../types';
import { defaultAnimation, defaultEffect, defaultShadow, makeImage, makeLine, makeShape, makeSvg, makeText, newPage, solid } from '../defaults';
import { chartSvg, defaultChart, iconSvg } from '../render/svgUtil';
import { ICONS } from './icons';

// ---------------------------------------------------------------- fills
export type Paint = string | Fill;
export const paint = (p: Paint): Fill => (typeof p === 'string' ? solid(p) : p);

/** Linear gradient. angle 0 = left to right, 90 = top to bottom. */
export function lin(angle: number, ...colors: string[]): Fill {
  return { type: 'linear', angle, stops: colors.map((color, i) => ({ offset: colors.length > 1 ? i / (colors.length - 1) : 0, color })) };
}
export function rad(...colors: string[]): Fill {
  return { type: 'radial', stops: colors.map((color, i) => ({ offset: colors.length > 1 ? i / (colors.length - 1) : 0, color })) };
}

// ---------------------------------------------------------------- common options
export interface Common {
  name?: string;
  opacity?: number;
  rotation?: number;
  blend?: BlendMode;
  shadow?: Partial<Shadow> | true;
  anim?: Partial<ElementAnimation>;
  /** Visible window within the page, in seconds */
  at?: [number, number | null];
  flipX?: boolean;
}

function applyCommon<T extends DesignElement>(el: T, o: Common): T {
  if (o.name) el.name = o.name;
  if (o.opacity !== undefined) el.opacity = o.opacity;
  if (o.rotation) el.rotation = o.rotation;
  if (o.blend) el.blendMode = o.blend;
  if (o.flipX) el.flipX = true;
  if (o.shadow) el.shadow = { ...defaultShadow(), enabled: true, ...(o.shadow === true ? {} : o.shadow) };
  if (o.anim) el.animation = { ...defaultAnimation(), ...o.anim };
  if (o.at) el.timing = { start: o.at[0], end: o.at[1] };
  return el;
}

// ---------------------------------------------------------------- text
export interface TextOpts extends Common {
  size: number;
  font: string;
  color?: Paint;
  bold?: boolean;
  italic?: boolean;
  align?: TextElement['align'];
  lh?: number;
  /** letter spacing in px */
  ls?: number;
  upper?: boolean;
  role?: TextElement['role'];
  list?: TextElement['list'];
  underline?: boolean;
  effect?: Partial<TextEffect>;
  curve?: number;
}

export function txt(text: string, x: number, y: number, w: number, o: TextOpts): TextElement {
  const lh = o.lh ?? 1.25;
  const lines = text.split('\n').length;
  const el = makeText(text, x, y, w, {
    fontFamily: o.font,
    fontSize: o.size,
    fontWeight: o.bold ? 'bold' : 'normal',
    fontStyle: o.italic ? 'italic' : 'normal',
    fill: paint(o.color ?? '#111111'),
    align: o.align ?? 'left',
    lineHeight: lh,
    letterSpacing: o.ls ?? 0,
    transform: o.upper ? 'uppercase' : 'none',
    list: o.list ?? 'none',
    underline: !!o.underline,
    role: o.role ?? 'body',
    autoHeight: true,
    curve: o.curve ?? 0,
    effect: o.effect ? { ...defaultEffect(), ...o.effect } : defaultEffect(),
  });
  el.height = Math.round(o.size * lh * lines);
  if (o.curve) el.height = Math.round(o.size * 1.4 + w * 0.2);
  return applyCommon(el, o);
}

export const heading = (text: string, x: number, y: number, w: number, o: TextOpts) => txt(text, x, y, w, { role: 'heading', ...o });
export const subheading = (text: string, x: number, y: number, w: number, o: TextOpts) => txt(text, x, y, w, { role: 'subheading', ...o });
export const body = (text: string, x: number, y: number, w: number, o: TextOpts) => txt(text, x, y, w, { role: 'body', ...o });

// ---------------------------------------------------------------- shapes
export interface ShapeOpts extends Common {
  r?: number;
  stroke?: string;
  sw?: number;
  dash?: 'solid' | 'dashed' | 'dotted';
  text?: string;
  textStyle?: { font?: string; size?: number; color?: string; bold?: boolean; ls?: number };
}

export function shp(kind: ShapeKind, x: number, y: number, w: number, h: number, fill: Paint, o: ShapeOpts = {}) {
  const el = makeShape(kind, x, y, w, h);
  el.fill = paint(fill);
  if (o.r !== undefined) el.cornerRadius = o.r;
  if (o.sw) {
    el.strokeWidth = o.sw;
    el.stroke = o.stroke ?? '#000000';
  }
  if (o.dash) el.strokeDash = o.dash;
  if (o.text) {
    el.text = o.text;
    const t = o.textStyle || {};
    el.textStyle = {
      fontFamily: t.font ?? 'Inter',
      fontSize: t.size,
      fill: solid(t.color ?? '#ffffff'),
      fontWeight: t.bold === false ? 'normal' : 'bold',
      letterSpacing: t.ls ?? 0,
    };
  }
  return applyCommon(el, o);
}

export const box = (x: number, y: number, w: number, h: number, fill: Paint, o: ShapeOpts = {}) => shp('rect', x, y, w, h, fill, o);
export const oval = (x: number, y: number, w: number, h: number, fill: Paint, o: ShapeOpts = {}) => shp('ellipse', x, y, w, h, fill, o);
/** Circle by centre and radius */
export const dot = (cx: number, cy: number, r: number, fill: Paint, o: ShapeOpts = {}) => shp('ellipse', cx - r, cy - r, r * 2, r * 2, fill, o);
/** Transparent outlined shape */
export const outline = (kind: ShapeKind, x: number, y: number, w: number, h: number, stroke: string, sw: number, o: ShapeOpts = {}) =>
  shp(kind, x, y, w, h, 'rgba(0,0,0,0)', { ...o, stroke, sw });

// ---------------------------------------------------------------- lines
export interface LineOpts extends Common {
  dash?: LineElement['strokeDash'];
  cap?: LineElement['lineCap'];
  start?: LineElement['start'];
  end?: LineElement['end'];
  curve?: number;
}

/** Horizontal rule whose stroke is centred on `yc` */
export function rule(x: number, yc: number, len: number, color: string, width = 2, o: LineOpts = {}) {
  const h = Math.max(24, width * 3);
  const el = makeLine(x, yc - h / 2, len, {
    stroke: color,
    strokeWidth: width,
    strokeDash: o.dash ?? 'solid',
    lineCap: o.cap ?? 'butt',
    start: o.start ?? 'none',
    end: o.end ?? 'none',
    curve: o.curve ?? 0,
  });
  el.height = h;
  return applyCommon(el, o);
}

// ---------------------------------------------------------------- icons, charts, frames
export function icon(name: keyof typeof ICONS, x: number, y: number, size: number, color: string, o: Common & { sw?: number } = {}) {
  const nodes = ICONS[name];
  const sw = o.sw ?? 2;
  const el = makeSvg(iconSvg(nodes, color, sw), x, y, size, size, { name: o.name ?? name, meta: { kind: 'icon', icon: name }, strokeWidth: sw });
  return applyCommon(el, o);
}

export function chart(spec: Partial<ChartSpec> & { type: ChartSpec['type'] }, x: number, y: number, w: number, h: number, o: Common = {}) {
  const c: ChartSpec = { ...defaultChart(spec.type), ...spec };
  const el = makeSvg(chartSvg(c, w, h), x, y, w, h, { name: o.name ?? 'Chart', meta: { kind: 'chart', chart: c }, keepRatio: false });
  return applyCommon(el, o);
}

export interface FrameOpts extends Common {
  r?: number;
  border?: number;
  borderColor?: string;
}

/** Empty image frame (drop a photo onto it) */
export function frame(x: number, y: number, w: number, h: number, mask: MaskKind = 'rect', o: FrameOpts = {}) {
  const el = makeImage(null, x, y, w, h, {
    name: o.name ?? 'Photo frame',
    mask,
    cornerRadius: o.r ?? 0,
    borderWidth: o.border ?? 0,
    borderColor: o.borderColor ?? '#ffffff',
  });
  return applyCommon(el, o);
}

// ---------------------------------------------------------------- pages and templates
export interface PageOpts {
  name?: string;
  duration?: number;
  transition?: TransitionType;
  transitionDuration?: number;
  notes?: string;
}

export function pg(bg: Paint, elements: DesignElement[], o: PageOpts = {}): Page {
  const p = newPage();
  p.background = { fill: paint(bg) };
  p.elements = elements;
  if (o.name) p.name = o.name;
  if (o.duration) p.duration = o.duration;
  if (o.transition) p.transition = { type: o.transition, duration: o.transitionDuration ?? 0.7 };
  if (o.notes) p.notes = o.notes;
  return p;
}

export function tpl(id: string, name: string, category: string, width: number, height: number, pages: Page[], tags: string[] = []): Template {
  return { id, name, category, width, height, pages, tags, builtIn: true };
}

/** Animation shorthand */
export const enter = (type: ElementAnimation['enter'], dur = 0.7, extra: Partial<ElementAnimation> = {}): Partial<ElementAnimation> => ({
  enter: type,
  enterDuration: dur,
  ...extra,
});
