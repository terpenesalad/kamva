import Konva from 'konva';
import type {
  Design,
  DesignElement,
  DrawElement,
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
import { getAsset, getImage, getImageAsync, videoFor } from '../assets';
import { konvaFill, withAlpha, fillPrimaryColor, canvasFillStyle } from '../color';
import { shapePath } from '../shapes';
import { animState } from './animation';
import { drawMedia, effectiveAdjust, isNeutral, needsPixelOps, processImage, coverCrop } from './media';
import { chartSvg, renderedMarkup, svgImage, tableSvg } from './svgUtil';

export interface BuildCtx {
  mode: 'edit' | 'export' | 'play';
  /** Output pixels per design pixel (used for raster resolution of processed media) */
  scale: number;
  design: Design;
  page: Page;
  videoKey: string;
  /** Called when an async resource (image/svg/video frame) becomes available */
  onAsync?: () => void;
  transparent?: boolean;
}

const D = 100000; // offscreen offset used for shadow-only drawing

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function shadowAttrs(s: Shadow | undefined): Record<string, any> {
  if (!s?.enabled) return { shadowEnabled: false };
  return {
    shadowEnabled: true,
    shadowColor: s.color,
    shadowBlur: s.blur,
    shadowOffsetX: s.offsetX,
    shadowOffsetY: s.offsetY,
    shadowOpacity: s.opacity,
    shadowForStrokeEnabled: true,
  };
}

/** A shape that only paints the drop shadow of a path (used for clipped media). */
function shadowOnly(path: string, s: Shadow) {
  const p2d = new Path2D(path);
  return new Konva.Shape({
    listening: false,
    sceneFunc: (kctx) => {
      const n = (kctx as any)._context as CanvasRenderingContext2D;
      const m = n.getTransform();
      const sc = Math.hypot(m.a, m.b);
      n.save();
      n.shadowColor = withAlpha(s.color, s.opacity);
      n.shadowBlur = s.blur * sc;
      n.shadowOffsetX = D * m.a + s.offsetX * sc;
      n.shadowOffsetY = D * m.b + s.offsetY * sc;
      n.translate(-D, 0);
      n.fillStyle = '#000';
      n.fill(p2d);
      n.restore();
    },
  });
}

function dashFor(style: 'solid' | 'dashed' | 'dotted', w: number): number[] | undefined {
  if (style === 'dashed') return [w * 3, w * 2];
  if (style === 'dotted') return [0.001, w * 2];
  return undefined;
}

export function displayText(el: TextElement): string {
  let t = el.text ?? '';
  if (el.transform === 'uppercase') t = t.toUpperCase();
  else if (el.transform === 'lowercase') t = t.toLowerCase();
  else if (el.transform === 'capitalize') t = t.replace(/\b\p{L}/gu, (c) => c.toUpperCase());
  if (el.list !== 'none') {
    let n = 0;
    t = t
      .split('\n')
      .map((line) => {
        if (!line.trim()) return line;
        n++;
        return (el.list === 'bullet' ? '•  ' : `${n}.  `) + line;
      })
      .join('\n');
  }
  return t;
}

export function fontStyleOf(el: { fontWeight: string; fontStyle: string }) {
  const parts = [];
  if (el.fontStyle === 'italic') parts.push('italic');
  if (el.fontWeight === 'bold') parts.push('bold');
  return parts.join(' ') || 'normal';
}

function textBaseAttrs(el: TextElement, text: string) {
  const deco = [el.underline ? 'underline' : '', el.strike ? 'line-through' : ''].filter(Boolean).join(' ');
  return {
    text,
    width: el.width,
    fontFamily: `"${el.fontFamily}"`,
    fontSize: el.fontSize,
    fontStyle: fontStyleOf(el),
    textDecoration: deco,
    align: el.align,
    lineHeight: el.lineHeight,
    letterSpacing: el.letterSpacing,
    wrap: 'word' as const,
    padding: 0,
  };
}

/** Measure the natural height of a text element */
export function measureText(el: TextElement): number {
  if (Math.abs(el.curve) > 1) return curvedTextHeight(el);
  const t = new Konva.Text(textBaseAttrs(el, displayText(el) || ' '));
  const h = t.height();
  t.destroy();
  return Math.max(el.fontSize * el.lineHeight * 0.8, h);
}

function curvedTextHeight(el: TextElement) {
  const { R, theta } = curveGeom(el);
  const sag = R * (1 - Math.cos(Math.min(Math.PI, theta)));
  return Math.max(el.fontSize * 1.4, sag + el.fontSize * 1.4);
}

function textWidth(el: TextElement) {
  const t = new Konva.Text({ ...textBaseAttrs(el, displayText(el).replace(/\n/g, ' ')), width: undefined, wrap: 'none' });
  const w = t.width();
  t.destroy();
  return w;
}

function curveGeom(el: TextElement) {
  const k = Math.max(-100, Math.min(100, el.curve)) / 100;
  const tw = Math.max(10, textWidth(el));
  // larger curve -> smaller radius
  const R = tw / (Math.abs(k) * Math.PI * 1.15 + 0.0001);
  const theta = tw / 2 / R; // half angle covered by text
  return { k, R, theta, tw };
}

// ---------------------------------------------------------------------------
// Element builders
// ---------------------------------------------------------------------------
function buildText(el: TextElement, g: Konva.Group, ctx: BuildCtx) {
  const text = displayText(el);
  const w = el.width;
  const h = el.height;
  const fillAttrs = konvaFill(el.fill, w, h);
  const mainColor = fillPrimaryColor(el.fill);
  const fx = el.effect || { type: 'none', color: '#000', size: 4, offset: 6 };

  if (Math.abs(el.curve) > 1) {
    const { k, R } = curveGeom(el);
    const fs = el.fontSize;
    const cx = w / 2;
    let data: string;
    if (k > 0) {
      // rainbow: arc centre below
      const cy = fs * 1.05 + R;
      data = `M ${cx} ${cy + R} A ${R} ${R} 0 1 1 ${cx + 0.01} ${cy + R}`;
    } else {
      // smile: arc centre above
      const cy = h - fs * 0.35 - R;
      data = `M ${cx} ${cy - R} A ${R} ${R} 0 1 0 ${cx + 0.01} ${cy - R}`;
    }
    const tp = new Konva.TextPath({
      name: 'textMain',
      data,
      text,
      fontFamily: `"${el.fontFamily}"`,
      fontSize: fs,
      fontStyle: fontStyleOf(el),
      letterSpacing: el.letterSpacing,
      align: 'center',
      textBaseline: 'middle',
      listening: false,
      ...fillAttrs,
      ...shadowAttrs(el.shadow),
    });
    // TextPath "align: center" centres along the whole circle; for a full circle starting at the
    // bottom/top the visual centre is the opposite point, which is exactly the top/bottom of the arc.
    if (fx.type === 'outline' || fx.type === 'hollow' || fx.type === 'splice') {
      tp.setAttrs({ stroke: fx.type === 'outline' ? fx.color : mainColor, strokeWidth: fx.size, fillAfterStrokeEnabled: true });
      if (fx.type === 'hollow') tp.setAttrs({ fillEnabled: false });
    }
    if (fx.type === 'glow' || fx.type === 'neon') {
      tp.setAttrs({ shadowEnabled: true, shadowColor: fx.color, shadowBlur: fx.size * 4, shadowOffsetX: 0, shadowOffsetY: 0, shadowOpacity: 1 });
    }
    if (fx.type === 'lift') {
      tp.setAttrs({ shadowEnabled: true, shadowColor: '#000', shadowBlur: fx.size * 3, shadowOffsetX: 0, shadowOffsetY: fx.size, shadowOpacity: 0.45 });
    }
    tp.setAttr('fullText', text);
    g.add(tp);
    return;
  }

  const base = {
    ...textBaseAttrs(el, text),
    height: el.autoHeight ? undefined : h,
    verticalAlign: el.autoHeight ? 'top' : el.verticalAlign,
    listening: false,
  };

  const add = (attrs: Record<string, unknown>) => {
    const t = new Konva.Text({ ...base, ...attrs });
    g.add(t);
    return t;
  };

  // Highlight: rounded rectangles behind each line
  if (fx.type === 'highlight') {
    const probe = new Konva.Text(base);
    const lines: { text: string; width: number }[] = (probe as any).textArr || [];
    const lh = el.fontSize * el.lineHeight;
    const totalH = lines.length * lh;
    const offY = !el.autoHeight && el.verticalAlign !== 'top' ? (el.verticalAlign === 'middle' ? (h - totalH) / 2 : h - totalH) : 0;
    const pad = fx.size * 2 + el.fontSize * 0.12;
    lines.forEach((ln, i) => {
      if (!ln.text.trim()) return;
      const lw = ln.width;
      const x = el.align === 'center' ? (w - lw) / 2 : el.align === 'right' ? w - lw : 0;
      g.add(
        new Konva.Rect({
          x: x - pad,
          y: offY + i * lh - pad * 0.3 + (lh - el.fontSize) / 2 - el.fontSize * 0.05,
          width: lw + pad * 2,
          height: el.fontSize * 1.1 + pad * 0.6,
          fill: fx.color,
          cornerRadius: Math.min(fx.offset, el.fontSize * 0.4),
          listening: false,
        }),
      );
    });
    probe.destroy();
  }

  if (fx.type === 'echo') {
    for (let i = 2; i >= 1; i--) {
      add({ x: fx.offset * i * 0.6, y: fx.offset * i * 0.6, fill: fx.color, opacity: 0.25 * (3 - i) * 0.6 });
    }
  }
  if (fx.type === 'splice') {
    add({ x: fx.offset * 0.5, y: fx.offset * 0.5, fill: fx.color });
  }

  const main = add({ name: 'textMain', ...fillAttrs, ...shadowAttrs(el.shadow) });
  main.setAttr('fullText', text);
  switch (fx.type) {
    case 'outline':
      main.setAttrs({ stroke: fx.color, strokeWidth: fx.size, fillAfterStrokeEnabled: true, lineJoin: 'round' });
      break;
    case 'hollow':
      main.setAttrs({ stroke: mainColor, strokeWidth: Math.max(1, fx.size * 0.5), fillEnabled: false, lineJoin: 'round' });
      break;
    case 'splice':
      main.setAttrs({ stroke: mainColor, strokeWidth: Math.max(1, fx.size * 0.5), fillEnabled: false, lineJoin: 'round' });
      break;
    case 'glow':
      main.setAttrs({ shadowEnabled: true, shadowColor: fx.color, shadowBlur: fx.size * 4, shadowOffsetX: 0, shadowOffsetY: 0, shadowOpacity: 1 });
      break;
    case 'neon': {
      main.setAttrs({ shadowEnabled: true, shadowColor: fx.color, shadowBlur: fx.size * 5, shadowOffsetX: 0, shadowOffsetY: 0, shadowOpacity: 1 });
      // second glow layer for intensity
      const inner = main.clone({ name: 'neon2', shadowBlur: fx.size * 1.5 });
      g.add(inner);
      break;
    }
    case 'lift':
      main.setAttrs({ shadowEnabled: true, shadowColor: '#000', shadowBlur: fx.size * 3, shadowOffsetX: 0, shadowOffsetY: fx.size * 0.8, shadowOpacity: 0.4 });
      break;
  }
}

function buildShape(el: ShapeElement, g: Konva.Group, ctx: BuildCtx) {
  const w = el.width;
  const h = el.height;
  const data = shapePath(el.shape, w, h, el.cornerRadius);
  g.add(
    new Konva.Path({
      data,
      listening: false,
      ...konvaFill(el.fill, w, h),
      stroke: el.strokeWidth > 0 ? el.stroke : undefined,
      strokeWidth: el.strokeWidth,
      strokeEnabled: el.strokeWidth > 0,
      dash: dashFor(el.strokeDash, el.strokeWidth),
      lineJoin: 'round',
      lineCap: el.strokeDash === 'dotted' ? 'round' : 'butt',
      ...shadowAttrs(el.shadow),
    }),
  );
  if (el.text) {
    const ts = el.textStyle || {};
    const fs = ts.fontSize ?? Math.max(14, Math.min(w, h) * 0.16);
    g.add(
      new Konva.Text({
        name: 'textMain',
        text: el.text,
        x: w * 0.1,
        y: 0,
        width: w * 0.8,
        height: h,
        align: ts.align ?? 'center',
        verticalAlign: 'middle',
        fontFamily: `"${ts.fontFamily ?? 'Inter'}"`,
        fontSize: fs,
        fontStyle: fontStyleOf({ fontWeight: ts.fontWeight ?? 'bold', fontStyle: ts.fontStyle ?? 'normal' }),
        lineHeight: ts.lineHeight ?? 1.2,
        letterSpacing: ts.letterSpacing ?? 0,
        fill: ts.fill?.type === 'solid' ? ts.fill.color : '#ffffff',
        wrap: 'word',
        listening: false,
      }),
    );
  }
}

function endMarker(kctx: Konva.Context, kind: LineEnd, x: number, y: number, ang: number, size: number, filled: boolean[]) {
  const c = Math.cos(ang);
  const s = Math.sin(ang);
  const P = (dx: number, dy: number) => [x + dx * c - dy * s, y + dx * s + dy * c] as const;
  switch (kind) {
    case 'triangle': {
      const a = P(0, 0);
      const b = P(-size * 1.2, -size * 0.65);
      const d = P(-size * 1.2, size * 0.65);
      kctx.moveTo(a[0], a[1]);
      kctx.lineTo(b[0], b[1]);
      kctx.lineTo(d[0], d[1]);
      kctx.closePath();
      filled.push(true);
      break;
    }
    case 'circle': {
      const a = P(-size * 0.55, 0);
      kctx.moveTo(a[0] + size * 0.55, a[1]);
      kctx.arc(a[0], a[1], size * 0.55, 0, Math.PI * 2);
      filled.push(true);
      break;
    }
    case 'square': {
      const pts = [P(0, -size * 0.5), P(0, size * 0.5), P(-size, size * 0.5), P(-size, -size * 0.5)];
      kctx.moveTo(pts[0][0], pts[0][1]);
      pts.slice(1).forEach((p) => kctx.lineTo(p[0], p[1]));
      kctx.closePath();
      filled.push(true);
      break;
    }
    default:
      break;
  }
}

function buildLine(el: LineElement, g: Konva.Group) {
  const w = el.width;
  const h = el.height;
  const sw = el.strokeWidth;
  const size = Math.max(10, sw * 3);
  const cy = h / 2;
  const cpY = cy - el.curve * w * 0.5;
  const startAng = Math.atan2(cy - cpY, 0 - w / 2); // direction pointing outwards at start
  const endAng = Math.atan2(cy - cpY, w - w / 2);
  const shorten = (k: LineEnd) => (k === 'triangle' ? size * 1.1 : k === 'square' ? size * 0.9 : k === 'circle' ? size * 0.9 : 0);
  const s0 = shorten(el.start);
  const s1 = shorten(el.end);
  const x0 = Math.cos(startAng) * -s0 + 0;
  const y0 = cy + Math.sin(startAng) * -s0;
  const x1 = w - Math.cos(endAng) * s1;
  const y1 = cy - Math.sin(endAng) * s1;
  g.add(
    new Konva.Shape({
      listening: false,
      stroke: el.stroke,
      strokeWidth: sw,
      lineCap: el.strokeDash === 'dotted' ? 'round' : el.lineCap,
      lineJoin: 'round',
      dash: dashFor(el.strokeDash, sw),
      ...shadowAttrs(el.shadow),
      sceneFunc: (kctx, shape) => {
        kctx.beginPath();
        kctx.moveTo(x0, y0);
        if (Math.abs(el.curve) > 0.001) kctx.quadraticCurveTo(w / 2, cpY, x1, y1);
        else kctx.lineTo(x1, y1);
        kctx.strokeShape(shape);
      },
    }),
  );
  const ends: [LineEnd, number, number, number][] = [
    [el.start, 0, cy, startAng],
    [el.end, w, cy, endAng],
  ];
  // filled heads
  g.add(
    new Konva.Shape({
      listening: false,
      fill: el.stroke,
      ...shadowAttrs(el.shadow),
      sceneFunc: (kctx, shape) => {
        kctx.beginPath();
        const filled: boolean[] = [];
        for (const [k, x, y, a] of ends) endMarker(kctx, k, x, y, a, size, filled);
        if (filled.length) kctx.fillShape(shape);
      },
    }),
  );
  // stroked heads (open arrow, bar)
  g.add(
    new Konva.Shape({
      listening: false,
      stroke: el.stroke,
      strokeWidth: sw,
      lineCap: 'round',
      lineJoin: 'round',
      sceneFunc: (kctx, shape) => {
        kctx.beginPath();
        let any = false;
        for (const [k, x, y, a] of ends) {
          const c = Math.cos(a);
          const s = Math.sin(a);
          if (k === 'arrow') {
            const L = size * 1.1;
            kctx.moveTo(x - L * c + L * 0.7 * s, y - L * s - L * 0.7 * c);
            kctx.lineTo(x, y);
            kctx.lineTo(x - L * c - L * 0.7 * s, y - L * s + L * 0.7 * c);
            any = true;
          } else if (k === 'bar') {
            kctx.moveTo(x + size * 0.6 * s, y - size * 0.6 * c);
            kctx.lineTo(x - size * 0.6 * s, y + size * 0.6 * c);
            any = true;
          }
        }
        if (any) kctx.strokeShape(shape);
      },
    }),
  );
}

function placeholderFrame(g: Konva.Group, w: number, h: number, path: string) {
  g.add(new Konva.Path({ data: path, fill: '#e5e7eb', listening: false }));
  const s = Math.min(w, h) * 0.28;
  const ix = (w - s) / 2;
  const iy = (h - s * 0.8) / 2;
  g.add(
    new Konva.Path({
      x: ix,
      y: iy,
      data: `M0,${s * 0.8} L${s * 0.32},${s * 0.35} L${s * 0.55},${s * 0.62} L${s * 0.72},${s * 0.45} L${s},${s * 0.8} Z M${s * 0.78},${s * 0.18} a${s * 0.1},${s * 0.1} 0 1,0 0.01,0 Z`,
      fill: '#9ca3af',
      listening: false,
    }),
  );
}

function mediaClipGroup(el: ImageElement | VideoElement, w: number, h: number) {
  const masked = el.mask !== 'none' || el.cornerRadius > 0;
  const path = shapePath(el.mask === 'none' ? 'rect' : el.mask, w, h, el.cornerRadius);
  const clip = new Konva.Group({ listening: false });
  if (masked) {
    const p2d = new Path2D(path);
    clip.clipFunc(() => [p2d] as any);
  }
  return { clip, path, masked };
}

function buildImage(el: ImageElement, g: Konva.Group, ctx: BuildCtx) {
  const w = el.width;
  const h = el.height;
  const { clip, path, masked } = mediaClipGroup(el, w, h);
  const asset = getAsset(el.assetId);
  if (!el.assetId || !asset) {
    placeholderFrame(g, w, h, path);
    return;
  }
  const img = getImage(el.assetId);
  if (!img) {
    getImageAsync(el.assetId).then(() => ctx.onAsync?.());
    g.add(new Konva.Path({ data: path, fill: '#e5e7eb', listening: false }));
    return;
  }
  if (el.shadow?.enabled && (masked || el.borderWidth > 0)) g.add(shadowOnly(path, el.shadow));
  const a = effectiveAdjust(el.adjust, el.filter, el.filterIntensity);
  const sw = img.naturalWidth;
  const sh = img.naturalHeight;
  let node: Konva.Image;
  if (isNeutral(a)) {
    node = new Konva.Image({
      image: img,
      width: w,
      height: h,
      crop: { x: el.crop.x * sw, y: el.crop.y * sh, width: el.crop.w * sw, height: el.crop.h * sh },
      listening: false,
    });
  } else {
    // resolution: what's needed for output, capped by the cropped source size
    const maxW = el.crop.w * sw;
    const maxH = el.crop.h * sh;
    const want = ctx.scale * (ctx.mode === 'export' ? 1 : window.devicePixelRatio || 1);
    let ow = Math.min(maxW * 1.0, w * want);
    let oh = Math.min(maxH * 1.0, h * want);
    // keep aspect of box
    const k = Math.min(ow / w, oh / h);
    ow = w * k;
    oh = h * k;
    const lim = 4096 / Math.max(ow, oh);
    if (lim < 1) {
      ow *= lim;
      oh *= lim;
    }
    const canvas = processImage(img, el.assetId, el.crop, a, ow, oh);
    node = new Konva.Image({ image: canvas, width: w, height: h, listening: false });
  }
  if (el.shadow?.enabled && !masked && el.borderWidth <= 0) node.setAttrs(shadowAttrs(el.shadow) as any);
  clip.add(node);
  if (el.borderWidth > 0) {
    clip.add(new Konva.Path({ data: path, stroke: el.borderColor, strokeWidth: el.borderWidth * 2, listening: false }));
  }
  g.add(clip);
  if (el.borderWidth > 0 && !masked) clip.clipFunc(() => [new Path2D(path)] as any);
}

/** Source time for a video element at page time t */
export function videoSourceTime(el: VideoElement, t: number, assetDuration: number): number {
  const start = el.timing?.start ?? 0;
  const local = Math.max(0, t - start) * (el.speed || 1);
  const end = el.trimEnd ?? assetDuration;
  const len = Math.max(0.05, end - el.trimStart);
  const off = el.loop ? local % len : Math.min(local, len - 0.04);
  return el.trimStart + off;
}

function buildVideo(el: VideoElement, g: Konva.Group, ctx: BuildCtx) {
  const w = el.width;
  const h = el.height;
  const { clip, path, masked } = mediaClipGroup(el, w, h);
  const asset = getAsset(el.assetId);
  if (!asset) {
    placeholderFrame(g, w, h, path);
    return;
  }
  const v = videoFor(ctx.videoKey + el.id, el.assetId!);
  if (!v) return;
  if (ctx.mode === 'edit' && v.readyState < 2) {
    const onReady = () => {
      v.removeEventListener('loadeddata', onReady);
      if (Math.abs(v.currentTime - el.trimStart) > 0.05) v.currentTime = el.trimStart + 0.001;
      ctx.onAsync?.();
    };
    v.addEventListener('loadeddata', onReady);
    v.addEventListener('seeked', () => ctx.onAsync?.(), { once: true });
  }
  if (el.shadow?.enabled) g.add(shadowOnly(path, el.shadow));
  const a = effectiveAdjust(el.adjust, el.filter, el.filterIntensity);
  clip.add(
    new Konva.Shape({
      name: 'videoFrame',
      listening: false,
      sceneFunc: (kctx) => {
        const n = (kctx as any)._context as CanvasRenderingContext2D;
        if (v.readyState < 2 || !v.videoWidth) {
          n.fillStyle = '#111';
          n.fillRect(0, 0, w, h);
          return;
        }
        drawMedia(n, v, v.videoWidth, v.videoHeight, el.crop, a, w, h);
      },
    }),
  );
  if (el.borderWidth > 0) {
    clip.add(new Konva.Path({ data: path, stroke: el.borderColor, strokeWidth: el.borderWidth * 2, listening: false }));
    if (!masked) clip.clipFunc(() => [new Path2D(path)] as any);
  }
  g.add(clip);
  g.setAttr('video', v);
}

export function svgMarkupFor(el: SvgElement): string {
  if (el.meta?.kind === 'chart' && el.meta.chart) return chartSvg(el.meta.chart, Math.max(50, el.width), Math.max(50, el.height));
  if (el.meta?.kind === 'table' && el.meta.table) return tableSvg(el.meta.table, Math.max(50, el.width), Math.max(30, el.height));
  return renderedMarkup(el);
}

function buildSvg(el: SvgElement, g: Konva.Group, ctx: BuildCtx) {
  const markup = svgMarkupFor(el);
  const img = svgImage(markup, ctx.onAsync);
  if (!img) return;
  g.add(new Konva.Image({ image: img, width: el.width, height: el.height, listening: false, ...(shadowAttrs(el.shadow) as object) }));
}

function buildDraw(el: DrawElement, g: Konva.Group) {
  const w = el.width;
  const h = el.height;
  const pts: number[] = [];
  for (let i = 0; i < el.points.length; i += 2) pts.push(el.points[i] * w, el.points[i + 1] * h);
  const k = Math.sqrt((w * h) / Math.max(1, el.baseWidth * el.baseHeight)) || 1;
  const hl = el.brush === 'highlighter';
  g.add(
    new Konva.Line({
      points: pts,
      stroke: el.stroke,
      strokeWidth: el.strokeWidth * k,
      tension: el.brush === 'pen' ? 0.4 : 0.2,
      lineCap: hl ? 'square' : 'round',
      lineJoin: 'round',
      opacity: hl ? 0.4 : 1,
      globalCompositeOperation: hl ? 'multiply' : 'source-over',
      listening: false,
      ...shadowAttrs(el.shadow),
    }),
  );
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------
export function buildElement(el: DesignElement, ctx: BuildCtx): Konva.Group {
  const w = Math.max(1, el.width);
  const h = Math.max(1, el.height);
  const outer = new Konva.Group({
    id: el.id,
    name: 'element',
    x: el.x + w / 2,
    y: el.y + h / 2,
    offsetX: w / 2,
    offsetY: h / 2,
    rotation: el.rotation || 0,
    opacity: el.opacity ?? 1,
    visible: ctx.mode === 'edit' ? true : !el.hidden,
    listening: ctx.mode === 'edit',
  });
  if (el.hidden && ctx.mode === 'edit') outer.opacity((el.opacity ?? 1) * 0.25);
  outer.setAttr('base', { x: el.x + w / 2, y: el.y + h / 2, rotation: el.rotation || 0, opacity: el.opacity ?? 1, w, h });

  // hit area for selection
  if (ctx.mode === 'edit') outer.add(new Konva.Rect({ name: 'hit', width: w, height: h, fill: 'rgba(0,0,0,0)' }));

  const inner = new Konva.Group({
    name: 'inner',
    listening: false,
    x: el.flipX ? w : 0,
    y: el.flipY ? h : 0,
    scaleX: el.flipX ? -1 : 1,
    scaleY: el.flipY ? -1 : 1,
  });
  if (el.blendMode && el.blendMode !== 'source-over') {
    // Group-level blending: render content then composite
    inner.setAttr('blend', el.blendMode);
  }
  outer.add(inner);

  switch (el.type) {
    case 'text':
      buildText(el, inner, ctx);
      break;
    case 'shape':
      buildShape(el, inner, ctx);
      break;
    case 'line':
      buildLine(el, inner);
      break;
    case 'image':
      buildImage(el, inner, ctx);
      break;
    case 'video':
      buildVideo(el, inner, ctx);
      break;
    case 'svg':
      buildSvg(el, inner, ctx);
      break;
    case 'draw':
      buildDraw(el, inner);
      break;
  }

  if (el.blendMode && el.blendMode !== 'source-over') {
    inner.find('Shape').forEach((n) => n.setAttr('globalCompositeOperation', el.blendMode));
  }
  return outer;
}

export function buildBackground(page: Page, ctx: BuildCtx): Konva.Group {
  const W = ctx.design.width;
  const H = ctx.design.height;
  const g = new Konva.Group({ name: 'background', listening: ctx.mode === 'edit' });
  if (!ctx.transparent) {
    g.add(new Konva.Rect({ name: 'bgRect', width: W, height: H, ...konvaFill(page.background.fill, W, H) }));
  } else if (ctx.mode === 'edit') {
    g.add(new Konva.Rect({ name: 'bgRect', width: W, height: H, fill: 'rgba(0,0,0,0)' }));
  }
  const bgId = page.background.assetId;
  const asset = getAsset(bgId);
  if (bgId && asset) {
    const a = effectiveAdjust(page.background.adjust, page.background.filter, page.background.filterIntensity ?? 1);
    if (asset.meta.kind === 'video') {
      const v = videoFor(ctx.videoKey + 'bg:' + page.id, bgId);
      if (v) {
        if (ctx.mode === 'edit' && v.readyState < 2) v.addEventListener('loadeddata', () => ctx.onAsync?.(), { once: true });
        g.add(
          new Konva.Shape({
            name: 'videoFrame',
            listening: false,
            sceneFunc: (kctx) => {
              const n = (kctx as any)._context as CanvasRenderingContext2D;
              if (v.readyState < 2 || !v.videoWidth) return;
              drawMedia(n, v, v.videoWidth, v.videoHeight, coverCrop(v.videoWidth, v.videoHeight, W, H), a, W, H);
            },
          }),
        );
        g.setAttr('video', v);
      }
    } else {
      const img = getImage(bgId);
      if (!img) getImageAsync(bgId).then(() => ctx.onAsync?.());
      else {
        const crop = coverCrop(img.naturalWidth, img.naturalHeight, W, H);
        if (isNeutral(a) && !needsPixelOps(a)) {
          g.add(
            new Konva.Image({
              image: img,
              width: W,
              height: H,
              listening: false,
              crop: { x: crop.x * img.naturalWidth, y: crop.y * img.naturalHeight, width: crop.w * img.naturalWidth, height: crop.h * img.naturalHeight },
            }),
          );
        } else {
          const k = Math.min(1, 2048 / Math.max(W, H)) * ctx.scale;
          g.add(new Konva.Image({ image: processImage(img, bgId, crop, a, W * k, H * k), width: W, height: H, listening: false }));
        }
      }
    }
  }
  return g;
}

/** Apply animation state for time t (seconds into page) to an element group */
export function applyAnimation(node: Konva.Group, el: DesignElement, t: number | null, pageDuration: number, W: number, H: number) {
  const base = node.getAttr('base');
  if (!base) return;
  const textNode = node.findOne('.textMain') as Konva.Text | undefined;
  if (t === null) {
    node.setAttrs({ x: base.x, y: base.y, rotation: base.rotation, opacity: base.opacity, scaleX: 1, scaleY: 1, visible: !el.hidden });
    node.clipFunc(undefined as any);
    if (textNode && textNode.getAttr('fullText') !== undefined) textNode.text(textNode.getAttr('fullText'));
    return;
  }
  const s = animState(el, t, pageDuration, W, H);
  node.visible(s.visible && !el.hidden);
  if (!s.visible) return;
  node.setAttrs({
    x: base.x + s.dx,
    y: base.y + s.dy,
    rotation: base.rotation + s.rotation,
    opacity: base.opacity * Math.max(0, Math.min(1, s.opacity)),
    scaleX: s.scale,
    scaleY: s.scale,
  });
  if (s.blur > 0.5) node.opacity(node.opacity() * Math.max(0, 1 - s.blur / 30));
  if (s.wipe < 0.999) {
    const ww = base.w * s.wipe;
    node.clipFunc((c: any) => {
      c.rect(-base.w, -base.h, base.w + ww, base.h * 3);
    });
  } else node.clipFunc(undefined as any);
  if (textNode && textNode.getAttr('fullText') !== undefined) {
    const full: string = textNode.getAttr('fullText');
    const n = Math.round(full.length * s.chars);
    if (textNode.text().length !== n) textNode.text(full.slice(0, n));
  }
}

/** Build the whole page into a layer. Returns map of element id -> group */
export function buildPageInto(layer: Konva.Layer, ctx: BuildCtx): Map<string, Konva.Group> {
  layer.destroyChildren();
  layer.add(buildBackground(ctx.page, ctx));
  const map = new Map<string, Konva.Group>();
  for (const el of ctx.page.elements) {
    const g = buildElement(el, ctx);
    layer.add(g);
    map.set(el.id, g);
  }
  return map;
}

export { canvasFillStyle };
