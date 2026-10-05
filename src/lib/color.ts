import type { Fill } from '../types';

export function hexToRgb(hex: string): { r: number; g: number; b: number; a: number } {
  let h = hex.trim();
  if (h.startsWith('rgb')) {
    const m = h.match(/rgba?\(([^)]+)\)/);
    if (m) {
      const [r, g, b, a] = m[1].split(',').map((s) => parseFloat(s));
      return { r, g, b, a: a ?? 1 };
    }
  }
  if (h === 'transparent') return { r: 0, g: 0, b: 0, a: 0 };
  h = h.replace('#', '');
  if (h.length === 3 || h.length === 4) h = h.split('').map((c) => c + c).join('');
  const n = parseInt(h.slice(0, 6), 16);
  const a = h.length === 8 ? parseInt(h.slice(6, 8), 16) / 255 : 1;
  return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255, a };
}

export function rgbToHex(r: number, g: number, b: number, a = 1): string {
  const c = (v: number) => Math.round(Math.max(0, Math.min(255, v))).toString(16).padStart(2, '0');
  return '#' + c(r) + c(g) + c(b) + (a < 1 ? c(a * 255) : '');
}

export function withAlpha(color: string, alpha: number): string {
  const { r, g, b, a } = hexToRgb(color);
  return `rgba(${r},${g},${b},${+(a * alpha).toFixed(3)})`;
}

export function normalizeHex(c: string): string {
  const { r, g, b, a } = hexToRgb(c);
  return rgbToHex(r, g, b, a);
}

export function luminance(color: string): number {
  const { r, g, b } = hexToRgb(color);
  const ch = (v: number) => {
    v /= 255;
    return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
  };
  return 0.2126 * ch(r) + 0.7152 * ch(g) + 0.0722 * ch(b);
}

export function contrastText(bg: string): string {
  return luminance(bg) > 0.45 ? '#111827' : '#ffffff';
}

export function rgbToHsl(r: number, g: number, b: number) {
  r /= 255;
  g /= 255;
  b /= 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  let h = 0;
  let s = 0;
  const l = (max + min) / 2;
  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    switch (max) {
      case r:
        h = (g - b) / d + (g < b ? 6 : 0);
        break;
      case g:
        h = (b - r) / d + 2;
        break;
      default:
        h = (r - g) / d + 4;
    }
    h /= 6;
  }
  return { h: h * 360, s: s * 100, l: l * 100 };
}

export function hslToHex(h: number, s: number, l: number): string {
  s /= 100;
  l /= 100;
  const k = (n: number) => (n + h / 30) % 12;
  const a = s * Math.min(l, 1 - l);
  const fn = (n: number) => l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
  return rgbToHex(fn(0) * 255, fn(8) * 255, fn(4) * 255);
}

export function fillToCss(fill: Fill | undefined): string {
  if (!fill) return 'transparent';
  if (fill.type === 'solid') return fill.color;
  const stops = fill.stops.map((s) => `${s.color} ${Math.round(s.offset * 100)}%`).join(', ');
  if (fill.type === 'linear') return `linear-gradient(${fill.angle + 90}deg, ${stops})`;
  return `radial-gradient(circle, ${stops})`;
}

export function fillPrimaryColor(fill: Fill | undefined): string {
  if (!fill) return '#000000';
  if (fill.type === 'solid') return fill.color;
  return fill.stops[0]?.color ?? '#000000';
}

/** Gradient endpoints for a w×h box given an angle in degrees (0 = left→right) */
export function linearPoints(angle: number, w: number, h: number) {
  const a = (angle * Math.PI) / 180;
  const cx = w / 2;
  const cy = h / 2;
  const len = Math.abs(w * Math.cos(a)) / 2 + Math.abs(h * Math.sin(a)) / 2;
  return {
    start: { x: cx - Math.cos(a) * len, y: cy - Math.sin(a) * len },
    end: { x: cx + Math.cos(a) * len, y: cy + Math.sin(a) * len },
  };
}

/** Konva fill attributes for a Fill within a w×h box (local coordinates, origin at 0,0) */
export function konvaFill(fill: Fill | undefined, w: number, h: number): Record<string, unknown> {
  if (!fill) return { fill: undefined };
  if (fill.type === 'solid') {
    return { fill: fill.color, fillPriority: 'color' };
  }
  const stops: (number | string)[] = [];
  for (const s of [...fill.stops].sort((a, b) => a.offset - b.offset)) stops.push(s.offset, s.color);
  if (fill.type === 'linear') {
    const { start, end } = linearPoints(fill.angle, w, h);
    return {
      fillPriority: 'linear-gradient',
      fillLinearGradientStartPoint: start,
      fillLinearGradientEndPoint: end,
      fillLinearGradientColorStops: stops,
    };
  }
  return {
    fillPriority: 'radial-gradient',
    fillRadialGradientStartPoint: { x: w / 2, y: h / 2 },
    fillRadialGradientEndPoint: { x: w / 2, y: h / 2 },
    fillRadialGradientStartRadius: 0,
    fillRadialGradientEndRadius: Math.max(w, h) * 0.7,
    fillRadialGradientColorStops: stops,
  };
}

/** Fill a 2D context region with a Fill */
export function canvasFillStyle(ctx: CanvasRenderingContext2D, fill: Fill, w: number, h: number): string | CanvasGradient {
  if (fill.type === 'solid') return fill.color;
  let g: CanvasGradient;
  if (fill.type === 'linear') {
    const { start, end } = linearPoints(fill.angle, w, h);
    g = ctx.createLinearGradient(start.x, start.y, end.x, end.y);
  } else {
    g = ctx.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, Math.max(w, h) * 0.7);
  }
  for (const s of fill.stops) g.addColorStop(Math.max(0, Math.min(1, s.offset)), s.color);
  return g;
}

export const DEFAULT_SWATCHES = [
  '#000000', '#545454', '#737373', '#a6a6a6', '#d9d9d9', '#ffffff',
  '#ff3131', '#ff5757', '#ff66c4', '#cb6ce6', '#8c52ff', '#5e17eb',
  '#0097b2', '#0cc0df', '#5ce1e6', '#38b6ff', '#5271ff', '#004aad',
  '#00bf63', '#7ed957', '#c1ff72', '#ffde59', '#ffbd59', '#ff914d',
];

export const PRESET_GRADIENTS: Fill[] = [
  { type: 'linear', angle: 45, stops: [{ offset: 0, color: '#ff6a88' }, { offset: 1, color: '#ff99ac' }] },
  { type: 'linear', angle: 45, stops: [{ offset: 0, color: '#8e2de2' }, { offset: 1, color: '#4a00e0' }] },
  { type: 'linear', angle: 90, stops: [{ offset: 0, color: '#00c6ff' }, { offset: 1, color: '#0072ff' }] },
  { type: 'linear', angle: 135, stops: [{ offset: 0, color: '#f7971e' }, { offset: 1, color: '#ffd200' }] },
  { type: 'linear', angle: 45, stops: [{ offset: 0, color: '#11998e' }, { offset: 1, color: '#38ef7d' }] },
  { type: 'linear', angle: 0, stops: [{ offset: 0, color: '#fc466b' }, { offset: 1, color: '#3f5efb' }] },
  { type: 'linear', angle: 90, stops: [{ offset: 0, color: '#232526' }, { offset: 1, color: '#414345' }] },
  { type: 'linear', angle: 60, stops: [{ offset: 0, color: '#ee9ca7' }, { offset: 1, color: '#ffdde1' }] },
  { type: 'linear', angle: 120, stops: [{ offset: 0, color: '#a1c4fd' }, { offset: 1, color: '#c2e9fb' }] },
  { type: 'linear', angle: 45, stops: [{ offset: 0, color: '#ff9a9e' }, { offset: 0.5, color: '#fad0c4' }, { offset: 1, color: '#fbc2eb' }] },
  { type: 'linear', angle: 90, stops: [{ offset: 0, color: '#0f2027' }, { offset: 0.5, color: '#203a43' }, { offset: 1, color: '#2c5364' }] },
  { type: 'linear', angle: 30, stops: [{ offset: 0, color: '#f12711' }, { offset: 1, color: '#f5af19' }] },
  { type: 'radial', stops: [{ offset: 0, color: '#fdfbfb' }, { offset: 1, color: '#ebedee' }] },
  { type: 'radial', stops: [{ offset: 0, color: '#ffecd2' }, { offset: 1, color: '#fcb69f' }] },
  { type: 'radial', stops: [{ offset: 0, color: '#4facfe' }, { offset: 1, color: '#00f2fe' }] },
  { type: 'radial', stops: [{ offset: 0, color: '#43e97b' }, { offset: 1, color: '#38f9d7' }] },
];
