import type { Unit } from '../types';

export const UNIT_LABEL: Record<Unit, string> = { px: 'pixels', in: 'inches', mm: 'millimetres', cm: 'centimetres' };

/** Design pixels per unit at a given DPI */
export function unitToPx(unit: Unit, dpi = 96): number {
  switch (unit) {
    case 'in':
      return dpi;
    case 'cm':
      return dpi / 2.54;
    case 'mm':
      return dpi / 25.4;
    default:
      return 1;
  }
}

export const toPx = (v: number, unit: Unit, dpi = 96) => v * unitToPx(unit, dpi);
export const fromPx = (px: number, unit: Unit, dpi = 96) => px / unitToPx(unit, dpi);

export function formatSize(w: number, h: number, unit: Unit, dpi = 96): string {
  const f = (v: number) => {
    const n = fromPx(v, unit, dpi);
    return unit === 'px' ? Math.round(n).toString() : (+n.toFixed(unit === 'mm' ? 0 : 2)).toString();
  };
  return `${f(w)} × ${f(h)} ${unit}`;
}
