import type { ShapeKind } from '../types';

// Every shape is generated as an SVG path that exactly fills a w×h box.
// The same path is used for on-canvas rendering, masks/frames and SVG export.

const f = (n: number) => +n.toFixed(2);

function poly(pts: [number, number][]): string {
  return 'M' + pts.map(([x, y]) => `${f(x)},${f(y)}`).join(' L') + ' Z';
}

function roundedPoly(pts: [number, number][], r: number): string {
  if (r <= 0) return poly(pts);
  const n = pts.length;
  let d = '';
  for (let i = 0; i < n; i++) {
    const p0 = pts[(i - 1 + n) % n];
    const p1 = pts[i];
    const p2 = pts[(i + 1) % n];
    const v1 = [p0[0] - p1[0], p0[1] - p1[1]];
    const v2 = [p2[0] - p1[0], p2[1] - p1[1]];
    const l1 = Math.hypot(v1[0], v1[1]);
    const l2 = Math.hypot(v2[0], v2[1]);
    const rr = Math.min(r, l1 / 2, l2 / 2);
    const a = [p1[0] + (v1[0] / l1) * rr, p1[1] + (v1[1] / l1) * rr];
    const b = [p1[0] + (v2[0] / l2) * rr, p1[1] + (v2[1] / l2) * rr];
    d += (i === 0 ? 'M' : 'L') + `${f(a[0])},${f(a[1])} Q${f(p1[0])},${f(p1[1])} ${f(b[0])},${f(b[1])} `;
  }
  return d + 'Z';
}

function regular(n: number, w: number, h: number, rot = -Math.PI / 2): [number, number][] {
  const pts: [number, number][] = [];
  for (let i = 0; i < n; i++) {
    const a = rot + (i * 2 * Math.PI) / n;
    pts.push([w / 2 + (Math.cos(a) * w) / 2, h / 2 + (Math.sin(a) * h) / 2]);
  }
  return pts;
}

function star(n: number, inner: number, w: number, h: number): [number, number][] {
  const pts: [number, number][] = [];
  for (let i = 0; i < n * 2; i++) {
    const a = -Math.PI / 2 + (i * Math.PI) / n;
    const r = i % 2 === 0 ? 1 : inner;
    pts.push([w / 2 + (Math.cos(a) * w * r) / 2, h / 2 + (Math.sin(a) * h * r) / 2]);
  }
  return pts;
}

function ellipse(w: number, h: number): string {
  const rx = w / 2;
  const ry = h / 2;
  return `M0,${f(ry)} A${f(rx)},${f(ry)} 0 1,0 ${f(w)},${f(ry)} A${f(rx)},${f(ry)} 0 1,0 0,${f(ry)} Z`;
}

function roundRect(w: number, h: number, r: number): string {
  r = Math.max(0, Math.min(r, w / 2, h / 2));
  if (r === 0) return `M0,0 H${f(w)} V${f(h)} H0 Z`;
  return (
    `M${f(r)},0 H${f(w - r)} A${f(r)},${f(r)} 0 0 1 ${f(w)},${f(r)} V${f(h - r)} ` +
    `A${f(r)},${f(r)} 0 0 1 ${f(w - r)},${f(h)} H${f(r)} A${f(r)},${f(r)} 0 0 1 0,${f(h - r)} V${f(r)} A${f(r)},${f(r)} 0 0 1 ${f(r)},0 Z`
  );
}

// Unit-space (100×100) paths scaled to the box
function scaled(d100: string, w: number, h: number): string {
  const sx = w / 100;
  const sy = h / 100;
  // Scale every coordinate pair; arcs not used in these definitions.
  return d100.replace(/(-?\d*\.?\d+),(-?\d*\.?\d+)/g, (_m, a, b) => `${f(parseFloat(a) * sx)},${f(parseFloat(b) * sy)}`);
}

const UNIT: Partial<Record<ShapeKind, string>> = {
  heart:
    'M50,92 C47,89 8,62 4,38 C1,20 13,6 29,6 C39,6 46,12 50,20 C54,12 61,6 71,6 C87,6 99,20 96,38 C92,62 53,89 50,92 Z',
  cloud:
    'M25,85 C10,85 0,74 0,61 C0,48 10,38 23,38 C24,22 37,10 53,10 C68,10 80,20 83,34 C94,36 100,46 100,58 C100,73 89,85 75,85 Z',
  speech: 'M8,0 L92,0 C96.4,0 100,3.6 100,8 L100,62 C100,66.4 96.4,70 92,70 L42,70 L20,96 L24,70 L8,70 C3.6,70 0,66.4 0,62 L0,8 C0,3.6 3.6,0 8,0 Z',
  blob1:
    'M78,14 C92,24 100,44 96,62 C92,80 76,96 56,98 C36,100 14,90 6,72 C-2,54 2,30 16,16 C30,2 64,4 78,14 Z',
  blob2:
    'M70,6 C86,10 98,26 99,44 C100,62 92,74 84,86 C74,98 54,100 38,96 C22,92 6,80 2,62 C-2,44 6,28 18,16 C30,4 54,2 70,6 Z',
  blob3:
    'M50,2 C64,2 70,14 82,20 C94,26 100,40 96,54 C92,68 98,82 86,92 C74,100 58,96 46,98 C32,100 16,96 8,84 C0,72 6,58 4,44 C2,30 8,16 20,10 C30,4 38,2 50,2 Z',
  moon: 'M62,2 C38,8 22,28 22,52 C22,76 38,94 62,98 C34,104 2,84 2,50 C2,16 34,-4 62,2 Z',
  lightning: 'M58,0 L14,56 L44,56 L36,100 L86,38 L54,38 L66,0 Z',
  drop: 'M50,0 C50,0 88,44 88,64 C88,85 71,100 50,100 C29,100 12,85 12,64 C12,44 50,0 50,0 Z',
  shield: 'M50,0 L94,14 C94,56 80,82 50,100 C20,82 6,56 6,14 Z',
  tag: 'M0,10 C0,4.5 4.5,0 10,0 L70,0 L100,50 L70,100 L10,100 C4.5,100 0,95.5 0,90 Z',
};

export function shapePath(kind: ShapeKind, w: number, h: number, radius = 0): string {
  w = Math.max(1, w);
  h = Math.max(1, h);
  switch (kind) {
    case 'rect':
      return roundRect(w, h, radius);
    case 'roundRect':
      return roundRect(w, h, radius || Math.min(w, h) * 0.15);
    case 'ellipse':
      return ellipse(w, h);
    case 'triangle':
      return roundedPoly([[w / 2, 0], [w, h], [0, h]], radius);
    case 'rightTriangle':
      return roundedPoly([[0, 0], [w, h], [0, h]], radius);
    case 'diamond':
      return roundedPoly([[w / 2, 0], [w, h / 2], [w / 2, h], [0, h / 2]], radius);
    case 'pentagon':
      return roundedPoly(regular(5, w, h), radius);
    case 'hexagon':
      return roundedPoly(regular(6, w, h, 0), radius);
    case 'octagon':
      return roundedPoly(regular(8, w, h, Math.PI / 8), radius);
    case 'star':
      return roundedPoly(star(5, 0.45, w, h), radius);
    case 'star4':
      return roundedPoly(star(4, 0.38, w, h), radius);
    case 'star8':
      return roundedPoly(star(8, 0.6, w, h), radius);
    case 'burst':
      return roundedPoly(star(16, 0.78, w, h), radius);
    case 'arrowRight':
      return roundedPoly([[0, h * 0.3], [w * 0.6, h * 0.3], [w * 0.6, 0], [w, h / 2], [w * 0.6, h], [w * 0.6, h * 0.7], [0, h * 0.7]], radius);
    case 'arrowLeft':
      return roundedPoly([[w, h * 0.3], [w * 0.4, h * 0.3], [w * 0.4, 0], [0, h / 2], [w * 0.4, h], [w * 0.4, h * 0.7], [w, h * 0.7]], radius);
    case 'arrowUp':
      return roundedPoly([[w * 0.3, h], [w * 0.3, h * 0.4], [0, h * 0.4], [w / 2, 0], [w, h * 0.4], [w * 0.7, h * 0.4], [w * 0.7, h]], radius);
    case 'arrowDown':
      return roundedPoly([[w * 0.3, 0], [w * 0.3, h * 0.6], [0, h * 0.6], [w / 2, h], [w, h * 0.6], [w * 0.7, h * 0.6], [w * 0.7, 0]], radius);
    case 'chevron':
      return roundedPoly([[0, 0], [w * 0.7, 0], [w, h / 2], [w * 0.7, h], [0, h], [w * 0.3, h / 2]], radius);
    case 'cross': {
      const t = 0.32;
      return roundedPoly(
        [
          [w * t, 0], [w * (1 - t), 0], [w * (1 - t), h * t], [w, h * t], [w, h * (1 - t)], [w * (1 - t), h * (1 - t)],
          [w * (1 - t), h], [w * t, h], [w * t, h * (1 - t)], [0, h * (1 - t)], [0, h * t], [w * t, h * t],
        ],
        radius,
      );
    }
    case 'parallelogram':
      return roundedPoly([[w * 0.25, 0], [w, 0], [w * 0.75, h], [0, h]], radius);
    case 'trapezoid':
      return roundedPoly([[w * 0.2, 0], [w * 0.8, 0], [w, h], [0, h]], radius);
    case 'ring': {
      const o = ellipse(w, h);
      const iw = w * 0.6;
      const ih = h * 0.6;
      const ox = (w - iw) / 2;
      const oy = (h - ih) / 2;
      // inner ellipse drawn in reverse for even-odd style hole
      const inner = `M${f(ox)},${f(oy + ih / 2)} A${f(iw / 2)},${f(ih / 2)} 0 1,1 ${f(ox + iw)},${f(oy + ih / 2)} A${f(iw / 2)},${f(ih / 2)} 0 1,1 ${f(ox)},${f(oy + ih / 2)} Z`;
      return o + ' ' + inner;
    }
    case 'arch': {
      const ry = Math.min(w / 2, h);
      return `M0,${f(h)} V${f(ry)} A${f(w / 2)},${f(ry)} 0 0 1 ${f(w)},${f(ry)} V${f(h)} Z`;
    }
    case 'semicircle':
      return `M0,${f(h)} A${f(w / 2)},${f(h)} 0 0 1 ${f(w)},${f(h)} Z`;
    default: {
      const u = UNIT[kind];
      if (u) return scaled(u, w, h);
      return roundRect(w, h, radius);
    }
  }
}

export const SHAPE_LIST: { kind: ShapeKind; label: string }[] = [
  { kind: 'rect', label: 'Square' },
  { kind: 'roundRect', label: 'Rounded square' },
  { kind: 'ellipse', label: 'Circle' },
  { kind: 'triangle', label: 'Triangle' },
  { kind: 'rightTriangle', label: 'Right triangle' },
  { kind: 'diamond', label: 'Diamond' },
  { kind: 'pentagon', label: 'Pentagon' },
  { kind: 'hexagon', label: 'Hexagon' },
  { kind: 'octagon', label: 'Octagon' },
  { kind: 'star', label: 'Star' },
  { kind: 'star4', label: 'Sparkle' },
  { kind: 'star8', label: '8-point star' },
  { kind: 'burst', label: 'Badge burst' },
  { kind: 'heart', label: 'Heart' },
  { kind: 'arrowRight', label: 'Arrow right' },
  { kind: 'arrowLeft', label: 'Arrow left' },
  { kind: 'arrowUp', label: 'Arrow up' },
  { kind: 'arrowDown', label: 'Arrow down' },
  { kind: 'chevron', label: 'Chevron' },
  { kind: 'cross', label: 'Cross' },
  { kind: 'speech', label: 'Speech bubble' },
  { kind: 'cloud', label: 'Cloud' },
  { kind: 'ring', label: 'Ring' },
  { kind: 'arch', label: 'Arch' },
  { kind: 'semicircle', label: 'Semicircle' },
  { kind: 'parallelogram', label: 'Parallelogram' },
  { kind: 'trapezoid', label: 'Trapezoid' },
  { kind: 'blob1', label: 'Blob' },
  { kind: 'blob2', label: 'Pebble' },
  { kind: 'blob3', label: 'Organic' },
  { kind: 'moon', label: 'Moon' },
  { kind: 'lightning', label: 'Lightning' },
  { kind: 'drop', label: 'Drop' },
  { kind: 'shield', label: 'Shield' },
  { kind: 'tag', label: 'Tag' },
];

/** Shapes that make sense as photo frames (masks) */
export const FRAME_LIST: { kind: ShapeKind; label: string }[] = [
  { kind: 'rect', label: 'Square' },
  { kind: 'roundRect', label: 'Rounded' },
  { kind: 'ellipse', label: 'Circle' },
  { kind: 'arch', label: 'Arch' },
  { kind: 'hexagon', label: 'Hexagon' },
  { kind: 'star', label: 'Star' },
  { kind: 'heart', label: 'Heart' },
  { kind: 'blob1', label: 'Blob' },
  { kind: 'blob2', label: 'Pebble' },
  { kind: 'blob3', label: 'Organic' },
  { kind: 'diamond', label: 'Diamond' },
  { kind: 'triangle', label: 'Triangle' },
  { kind: 'burst', label: 'Burst' },
  { kind: 'cloud', label: 'Cloud' },
  { kind: 'speech', label: 'Speech' },
  { kind: 'shield', label: 'Shield' },
  { kind: 'drop', label: 'Drop' },
  { kind: 'semicircle', label: 'Semicircle' },
];

export function shapeUsesEvenOdd(kind: ShapeKind) {
  return kind === 'ring';
}
