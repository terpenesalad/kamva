export interface Box {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface SnapLine {
  axis: 'x' | 'y';
  pos: number;
  from: number;
  to: number;
  kind: 'page' | 'object' | 'guide' | 'grid';
}

export interface SnapResult {
  dx: number;
  dy: number;
  lines: SnapLine[];
}

interface Target {
  pos: number;
  from: number;
  to: number;
  kind: SnapLine['kind'];
}

/**
 * Snap a moving box to page edges/centre, other objects' edges/centres and guides.
 * Returns the correction to add to the box position.
 */
export function snapBox(
  moving: Box,
  others: Box[],
  page: { width: number; height: number },
  opts: { threshold: number; page: boolean; objects: boolean; guides?: { axis: 'x' | 'y'; pos: number }[]; grid?: number },
): SnapResult {
  const xs: Target[] = [];
  const ys: Target[] = [];
  if (opts.page) {
    for (const p of [0, page.width / 2, page.width]) xs.push({ pos: p, from: 0, to: page.height, kind: 'page' });
    for (const p of [0, page.height / 2, page.height]) ys.push({ pos: p, from: 0, to: page.width, kind: 'page' });
  }
  if (opts.objects) {
    for (const o of others) {
      for (const p of [o.x, o.x + o.width / 2, o.x + o.width]) xs.push({ pos: p, from: o.y, to: o.y + o.height, kind: 'object' });
      for (const p of [o.y, o.y + o.height / 2, o.y + o.height]) ys.push({ pos: p, from: o.x, to: o.x + o.width, kind: 'object' });
    }
  }
  for (const g of opts.guides || []) {
    if (g.axis === 'x') xs.push({ pos: g.pos, from: -1e5, to: 1e5, kind: 'guide' });
    else ys.push({ pos: g.pos, from: -1e5, to: 1e5, kind: 'guide' });
  }

  const mx = [moving.x, moving.x + moving.width / 2, moving.x + moving.width];
  const my = [moving.y, moving.y + moving.height / 2, moving.y + moving.height];

  const best = (vals: number[], targets: Target[]) => {
    let bestD = Infinity;
    let delta = 0;
    for (const v of vals) {
      for (const t of targets) {
        const d = t.pos - v;
        if (Math.abs(d) < Math.abs(bestD) && Math.abs(d) <= opts.threshold) {
          bestD = d;
          delta = d;
        }
      }
    }
    return Number.isFinite(bestD) ? delta : null;
  };

  let dx = best(mx, xs);
  let dy = best(my, ys);

  if (opts.grid && opts.grid > 2) {
    if (dx === null) {
      const g = Math.round(moving.x / opts.grid) * opts.grid - moving.x;
      if (Math.abs(g) <= opts.threshold) dx = g;
    }
    if (dy === null) {
      const g = Math.round(moving.y / opts.grid) * opts.grid - moving.y;
      if (Math.abs(g) <= opts.threshold) dy = g;
    }
  }

  const lines: SnapLine[] = [];
  const fx = dx ?? 0;
  const fy = dy ?? 0;
  const snappedX = mx.map((v) => v + fx);
  const snappedY = my.map((v) => v + fy);
  if (dx !== null) {
    for (const t of xs) {
      if (snappedX.some((v) => Math.abs(v - t.pos) < 0.5)) {
        const from = Math.min(t.from, moving.y + fy);
        const to = Math.max(t.to, moving.y + fy + moving.height);
        lines.push({ axis: 'x', pos: t.pos, from: t.kind === 'guide' ? moving.y + fy - 20 : from, to: t.kind === 'guide' ? moving.y + fy + moving.height + 20 : to, kind: t.kind });
      }
    }
  }
  if (dy !== null) {
    for (const t of ys) {
      if (snappedY.some((v) => Math.abs(v - t.pos) < 0.5)) {
        const from = Math.min(t.from, moving.x + fx);
        const to = Math.max(t.to, moving.x + fx + moving.width);
        lines.push({ axis: 'y', pos: t.pos, from: t.kind === 'guide' ? moving.x + fx - 20 : from, to: t.kind === 'guide' ? moving.x + fx + moving.width + 20 : to, kind: t.kind });
      }
    }
  }
  return { dx: fx, dy: fy, lines };
}

export function unionBox(boxes: Box[]): Box {
  const x1 = Math.min(...boxes.map((b) => b.x));
  const y1 = Math.min(...boxes.map((b) => b.y));
  const x2 = Math.max(...boxes.map((b) => b.x + b.width));
  const y2 = Math.max(...boxes.map((b) => b.y + b.height));
  return { x: x1, y: y1, width: x2 - x1, height: y2 - y1 };
}

export function intersects(a: Box, b: Box) {
  return a.x < b.x + b.width && a.x + a.width > b.x && a.y < b.y + b.height && a.y + a.height > b.y;
}
