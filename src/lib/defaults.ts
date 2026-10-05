import { nanoid } from 'nanoid';
import type {
  Crop,
  Design,
  DesignElement,
  DrawElement,
  ElementAnimation,
  Fill,
  ImageAdjust,
  ImageElement,
  LineElement,
  Page,
  Shadow,
  ShapeElement,
  ShapeKind,
  SvgElement,
  TextEffect,
  TextElement,
  VideoElement,
  AudioTrack,
} from '../types';

export const uid = (n = 10) => nanoid(n);

export const solid = (color: string): Fill => ({ type: 'solid', color });

export const defaultAdjust = (): ImageAdjust => ({
  brightness: 0,
  contrast: 0,
  saturation: 0,
  hue: 0,
  temperature: 0,
  tint: 0,
  blur: 0,
  vignette: 0,
  sepia: 0,
  grayscale: 0,
  invert: 0,
  sharpen: 0,
  highlights: 0,
  shadows: 0,
  grain: 0,
});

export const fullCrop = (): Crop => ({ x: 0, y: 0, w: 1, h: 1 });

export const defaultShadow = (): Shadow => ({
  enabled: false,
  color: '#000000',
  blur: 20,
  offsetX: 0,
  offsetY: 8,
  opacity: 0.35,
});

export const defaultAnimation = (): ElementAnimation => ({
  enter: 'none',
  enterDuration: 0.6,
  exit: 'none',
  exitDuration: 0.5,
  loop: 'none',
});

export const defaultEffect = (): TextEffect => ({ type: 'none', color: '#000000', size: 4, offset: 6 });

export function newPage(bg = '#ffffff'): Page {
  return {
    id: uid(),
    background: { fill: solid(bg) },
    elements: [],
    duration: 5,
    transition: { type: 'none', duration: 0.6 },
  };
}

export function newDesign(width: number, height: number, name = 'Untitled design', unit: Design['unit'] = 'px', category?: string): Design {
  return {
    id: uid(12),
    name,
    width: Math.round(width),
    height: Math.round(height),
    unit,
    dpi: 96,
    fps: 30,
    category,
    pages: [newPage()],
    audio: [],
    assets: {},
    createdAt: Date.now(),
    updatedAt: Date.now(),
    version: 1,
  };
}

function base(x: number, y: number, w: number, h: number) {
  return {
    id: uid(),
    x,
    y,
    width: w,
    height: h,
    rotation: 0,
    opacity: 1,
  };
}

export function makeShape(shape: ShapeKind, x: number, y: number, w: number, h: number, color = '#8b5cf6'): ShapeElement {
  return {
    ...base(x, y, w, h),
    type: 'shape',
    shape,
    fill: solid(color),
    stroke: '#1f2937',
    strokeWidth: 0,
    strokeDash: 'solid',
    cornerRadius: shape === 'roundRect' ? Math.min(w, h) * 0.15 : 0,
  };
}

export function makeLine(x: number, y: number, length: number, opts: Partial<LineElement> = {}): LineElement {
  return {
    ...base(x, y, length, 24),
    type: 'line',
    stroke: '#1f2937',
    strokeWidth: 6,
    strokeDash: 'solid',
    lineCap: 'round',
    start: 'none',
    end: 'none',
    curve: 0,
    ...opts,
  };
}

export function makeText(text: string, x: number, y: number, w: number, opts: Partial<TextElement> = {}): TextElement {
  const fontSize = opts.fontSize ?? 48;
  return {
    ...base(x, y, w, fontSize * 1.3),
    type: 'text',
    text,
    fontFamily: 'Inter',
    fontSize,
    fontWeight: 'normal',
    fontStyle: 'normal',
    underline: false,
    strike: false,
    fill: solid('#111827'),
    align: 'center',
    verticalAlign: 'top',
    lineHeight: 1.25,
    letterSpacing: 0,
    transform: 'none',
    list: 'none',
    effect: defaultEffect(),
    curve: 0,
    autoHeight: true,
    ...opts,
  };
}

export function makeImage(assetId: string | null, x: number, y: number, w: number, h: number, opts: Partial<ImageElement> = {}): ImageElement {
  return {
    ...base(x, y, w, h),
    type: 'image',
    assetId,
    crop: fullCrop(),
    adjust: defaultAdjust(),
    filter: 'none',
    filterIntensity: 1,
    mask: 'none',
    cornerRadius: 0,
    borderColor: '#ffffff',
    borderWidth: 0,
    ...opts,
  };
}

export function makeVideo(assetId: string, x: number, y: number, w: number, h: number, opts: Partial<VideoElement> = {}): VideoElement {
  return {
    ...base(x, y, w, h),
    type: 'video',
    assetId,
    crop: fullCrop(),
    adjust: defaultAdjust(),
    filter: 'none',
    filterIntensity: 1,
    mask: 'none',
    cornerRadius: 0,
    borderColor: '#ffffff',
    borderWidth: 0,
    trimStart: 0,
    trimEnd: null,
    volume: 1,
    muted: false,
    loop: false,
    speed: 1,
    ...opts,
  };
}

export function makeSvg(svg: string, x: number, y: number, w: number, h: number, opts: Partial<SvgElement> = {}): SvgElement {
  return {
    ...base(x, y, w, h),
    type: 'svg',
    svg,
    colorMap: {},
    keepRatio: true,
    ...opts,
  };
}

export function makeDraw(points: number[], x: number, y: number, w: number, h: number, opts: Partial<DrawElement> = {}): DrawElement {
  return {
    ...base(x, y, w, h),
    type: 'draw',
    points,
    stroke: '#111827',
    strokeWidth: 8,
    brush: 'pen',
    baseWidth: w,
    baseHeight: h,
    ...opts,
  };
}

export function makeAudioTrack(assetId: string, name: string, start = 0, lane = 0): AudioTrack {
  return {
    id: uid(),
    assetId,
    name,
    start,
    trimStart: 0,
    trimEnd: null,
    volume: 1,
    fadeIn: 0,
    fadeOut: 0,
    muted: false,
    lane,
  };
}

/** Deep clone an element with a fresh id */
export function cloneElement<T extends DesignElement>(el: T, dx = 0, dy = 0): T {
  const c = structuredClone(el) as T;
  c.id = uid();
  c.x += dx;
  c.y += dy;
  return c;
}

export function clonePage(p: Page): Page {
  const c = structuredClone(p);
  c.id = uid();
  const groupMap = new Map<string, string>();
  c.elements = c.elements.map((e) => {
    const n = { ...e, id: uid() };
    if (n.groupId) {
      if (!groupMap.has(n.groupId)) groupMap.set(n.groupId, uid());
      n.groupId = groupMap.get(n.groupId)!;
    }
    return n;
  });
  return c;
}

/** Fill in any missing fields so older/foreign files still load */
export function normalizeDesign(d: Design): Design {
  d.unit ||= 'px';
  d.dpi ||= 96;
  d.fps ||= 30;
  d.audio ||= [];
  d.assets ||= {};
  d.pages ||= [newPage()];
  for (const p of d.pages) {
    p.id ||= uid();
    p.duration ||= 5;
    p.transition ||= { type: 'none', duration: 0.6 };
    p.background ||= { fill: solid('#ffffff') };
    p.elements ||= [];
    for (const e of p.elements as any[]) {
      e.id ||= uid();
      e.opacity ??= 1;
      e.rotation ??= 0;
      if (e.type === 'image' || e.type === 'video') {
        e.crop ||= fullCrop();
        e.adjust = { ...defaultAdjust(), ...(e.adjust || {}) };
        e.filter ||= 'none';
        e.filterIntensity ??= 1;
        e.mask ||= 'none';
        e.cornerRadius ??= 0;
        e.borderWidth ??= 0;
        e.borderColor ||= '#ffffff';
      }
      if (e.type === 'text') {
        e.effect ||= defaultEffect();
        e.curve ??= 0;
        e.list ||= 'none';
        e.transform ||= 'none';
        e.autoHeight ??= true;
        if (typeof e.fill === 'string') e.fill = solid(e.fill);
      }
      if (e.type === 'shape' && typeof e.fill === 'string') e.fill = solid(e.fill);
    }
  }
  return d;
}

export const isMedia = (e: DesignElement): e is ImageElement | VideoElement => e.type === 'image' || e.type === 'video';
