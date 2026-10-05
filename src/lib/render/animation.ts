import type { AnimationType, DesignElement, TransitionType } from '../../types';

export interface AnimState {
  visible: boolean;
  opacity: number;
  dx: number;
  dy: number;
  scale: number;
  rotation: number;
  blur: number; // px
  wipe: number; // 0..1 reveal fraction (1 = fully shown)
  chars: number; // 0..1 fraction of text revealed
}

const IDENTITY: AnimState = { visible: true, opacity: 1, dx: 0, dy: 0, scale: 1, rotation: 0, blur: 0, wipe: 1, chars: 1 };

const easeOut = (t: number) => 1 - Math.pow(1 - t, 3);
const easeIn = (t: number) => t * t * t;
const easeOutBack = (t: number) => {
  const c1 = 1.70158;
  const c3 = c1 + 1;
  return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2);
};
const bounceOut = (t: number) => {
  const n1 = 7.5625;
  const d1 = 2.75;
  if (t < 1 / d1) return n1 * t * t;
  if (t < 2 / d1) return n1 * (t -= 1.5 / d1) * t + 0.75;
  if (t < 2.5 / d1) return n1 * (t -= 2.25 / d1) * t + 0.9375;
  return n1 * (t -= 2.625 / d1) * t + 0.984375;
};

/** p = progress 0..1 where 1 = fully in place. Returns partial state. */
function apply(type: AnimationType, p: number, s: AnimState, el: DesignElement, pageW: number, pageH: number) {
  const dist = Math.max(40, Math.min(pageW, pageH) * 0.12);
  switch (type) {
    case 'fade':
      s.opacity *= easeOut(p);
      break;
    case 'rise':
      s.opacity *= easeOut(p);
      s.dy += (1 - easeOut(p)) * dist;
      break;
    case 'drop':
      s.opacity *= easeOut(p);
      s.dy -= (1 - easeOut(p)) * dist;
      break;
    case 'slideLeft':
      s.opacity *= Math.min(1, p * 2);
      s.dx += (1 - easeOut(p)) * dist * 2;
      break;
    case 'slideRight':
      s.opacity *= Math.min(1, p * 2);
      s.dx -= (1 - easeOut(p)) * dist * 2;
      break;
    case 'pop':
      s.opacity *= Math.min(1, p * 3);
      s.scale *= Math.max(0.01, easeOutBack(p));
      break;
    case 'zoomIn':
      s.opacity *= easeOut(p);
      s.scale *= 0.5 + 0.5 * easeOut(p);
      break;
    case 'zoomOut':
      s.opacity *= easeOut(p);
      s.scale *= 1.6 - 0.6 * easeOut(p);
      break;
    case 'spin':
      s.opacity *= easeOut(p);
      s.rotation += (1 - easeOut(p)) * -180;
      s.scale *= 0.6 + 0.4 * easeOut(p);
      break;
    case 'bounce':
      s.opacity *= Math.min(1, p * 4);
      s.dy -= (1 - bounceOut(p)) * dist * 1.5;
      break;
    case 'blur':
      s.opacity *= easeOut(p);
      s.blur += (1 - easeOut(p)) * 24;
      break;
    case 'wipe':
      s.wipe *= easeOut(p);
      break;
    case 'typewriter':
      if (el.type === 'text') s.chars *= p;
      else s.opacity *= p;
      break;
    case 'pulse':
      s.opacity *= easeOut(p);
      s.scale *= 1 + Math.sin(p * Math.PI) * 0.15;
      break;
    case 'wiggle':
      s.opacity *= Math.min(1, p * 3);
      s.rotation += Math.sin(p * Math.PI * 6) * (1 - p) * 12;
      break;
    default:
      break;
  }
}

/**
 * Animation state of an element at `t` seconds into its page.
 * `pageDuration` is the length of the page.
 */
export function animState(el: DesignElement, t: number, pageDuration: number, pageW: number, pageH: number): AnimState {
  const s: AnimState = { ...IDENTITY };
  const start = el.timing?.start ?? 0;
  const end = el.timing?.end ?? pageDuration;
  if (t < start - 1e-6 || t > end + 1e-6) {
    s.visible = false;
    return s;
  }
  const a = el.animation;
  if (!a) return s;
  const local = t - start;
  const span = end - start;
  if (a.enter !== 'none' && a.enterDuration > 0 && local < a.enterDuration) {
    apply(a.enter, Math.max(0, local / a.enterDuration), s, el, pageW, pageH);
  }
  const untilEnd = end - t;
  if (a.exit !== 'none' && a.exitDuration > 0 && untilEnd < a.exitDuration && span > a.exitDuration) {
    apply(a.exit, Math.max(0, untilEnd / a.exitDuration), s, el, pageW, pageH);
  }
  switch (a.loop) {
    case 'pulse':
      s.scale *= 1 + Math.sin(local * Math.PI * 1.5) * 0.04;
      break;
    case 'wiggle':
      s.rotation += Math.sin(local * Math.PI * 4) * 3;
      break;
    case 'float':
      s.dy += Math.sin(local * Math.PI) * 10;
      break;
    case 'rotate':
      s.rotation += (local * 90) % 360;
      break;
  }
  return s;
}

export const ANIMATIONS: { id: AnimationType; name: string }[] = [
  { id: 'none', name: 'None' },
  { id: 'fade', name: 'Fade' },
  { id: 'rise', name: 'Rise' },
  { id: 'drop', name: 'Drop' },
  { id: 'slideLeft', name: 'Slide in' },
  { id: 'slideRight', name: 'Slide back' },
  { id: 'pop', name: 'Pop' },
  { id: 'zoomIn', name: 'Grow' },
  { id: 'zoomOut', name: 'Shrink' },
  { id: 'spin', name: 'Spin' },
  { id: 'bounce', name: 'Bounce' },
  { id: 'blur', name: 'Focus' },
  { id: 'wipe', name: 'Wipe' },
  { id: 'typewriter', name: 'Typewriter' },
  { id: 'pulse', name: 'Pulse' },
  { id: 'wiggle', name: 'Wiggle' },
];

export const LOOPS = [
  { id: 'none', name: 'None' },
  { id: 'pulse', name: 'Breathe' },
  { id: 'wiggle', name: 'Wiggle' },
  { id: 'float', name: 'Float' },
  { id: 'rotate', name: 'Rotate' },
] as const;

export const TRANSITIONS: { id: TransitionType; name: string }[] = [
  { id: 'none', name: 'None' },
  { id: 'fade', name: 'Fade to black' },
  { id: 'dissolve', name: 'Dissolve' },
  { id: 'slideLeft', name: 'Slide left' },
  { id: 'slideRight', name: 'Slide right' },
  { id: 'slideUp', name: 'Slide up' },
  { id: 'slideDown', name: 'Slide down' },
  { id: 'zoom', name: 'Zoom' },
  { id: 'wipeLeft', name: 'Wipe left' },
  { id: 'wipeRight', name: 'Wipe right' },
  { id: 'circle', name: 'Circle reveal' },
  { id: 'spin', name: 'Spin' },
  { id: 'blur', name: 'Blur' },
  { id: 'flash', name: 'Flash' },
];

/**
 * Composite a transition between two rendered page canvases.
 * `p` goes 0..1 across the transition; `from` is the outgoing page.
 */
export function drawTransition(
  ctx: CanvasRenderingContext2D,
  type: TransitionType,
  p: number,
  from: CanvasImageSource,
  to: CanvasImageSource,
  w: number,
  h: number,
) {
  const e = p < 0.5 ? 2 * p * p : 1 - Math.pow(-2 * p + 2, 2) / 2; // easeInOutQuad
  ctx.save();
  ctx.clearRect(0, 0, w, h);
  switch (type) {
    case 'fade': {
      ctx.fillStyle = '#000';
      ctx.fillRect(0, 0, w, h);
      if (p < 0.5) {
        ctx.globalAlpha = 1 - p * 2;
        ctx.drawImage(from, 0, 0, w, h);
      } else {
        ctx.globalAlpha = (p - 0.5) * 2;
        ctx.drawImage(to, 0, 0, w, h);
      }
      break;
    }
    case 'flash': {
      ctx.drawImage(p < 0.5 ? from : to, 0, 0, w, h);
      ctx.globalAlpha = 1 - Math.abs(p - 0.5) * 2;
      ctx.fillStyle = '#fff';
      ctx.fillRect(0, 0, w, h);
      break;
    }
    case 'slideLeft':
      ctx.drawImage(from, -w * e, 0, w, h);
      ctx.drawImage(to, w - w * e, 0, w, h);
      break;
    case 'slideRight':
      ctx.drawImage(from, w * e, 0, w, h);
      ctx.drawImage(to, -w + w * e, 0, w, h);
      break;
    case 'slideUp':
      ctx.drawImage(from, 0, -h * e, w, h);
      ctx.drawImage(to, 0, h - h * e, w, h);
      break;
    case 'slideDown':
      ctx.drawImage(from, 0, h * e, w, h);
      ctx.drawImage(to, 0, -h + h * e, w, h);
      break;
    case 'zoom': {
      ctx.drawImage(from, 0, 0, w, h);
      const s = 0.4 + 0.6 * e;
      ctx.globalAlpha = Math.min(1, e * 1.5);
      ctx.drawImage(to, (w - w * s) / 2, (h - h * s) / 2, w * s, h * s);
      break;
    }
    case 'wipeLeft':
      ctx.drawImage(from, 0, 0, w, h);
      ctx.beginPath();
      ctx.rect(w - w * e, 0, w * e, h);
      ctx.clip();
      ctx.drawImage(to, 0, 0, w, h);
      break;
    case 'wipeRight':
      ctx.drawImage(from, 0, 0, w, h);
      ctx.beginPath();
      ctx.rect(0, 0, w * e, h);
      ctx.clip();
      ctx.drawImage(to, 0, 0, w, h);
      break;
    case 'circle':
      ctx.drawImage(from, 0, 0, w, h);
      ctx.beginPath();
      ctx.arc(w / 2, h / 2, (Math.hypot(w, h) / 2) * e, 0, Math.PI * 2);
      ctx.clip();
      ctx.drawImage(to, 0, 0, w, h);
      break;
    case 'spin': {
      ctx.fillStyle = '#000';
      ctx.fillRect(0, 0, w, h);
      const src = p < 0.5 ? from : to;
      const k = p < 0.5 ? 1 - e * 2 : (e - 0.5) * 2;
      const s = Math.max(0.01, k);
      ctx.translate(w / 2, h / 2);
      ctx.rotate((1 - k) * Math.PI * (p < 0.5 ? 1 : -1));
      ctx.scale(s, s);
      ctx.drawImage(src, -w / 2, -h / 2, w, h);
      break;
    }
    case 'blur': {
      const b = (1 - Math.abs(p - 0.5) * 2) * 24;
      ctx.filter = `blur(${b}px)`;
      ctx.drawImage(from, 0, 0, w, h);
      ctx.globalAlpha = e;
      ctx.drawImage(to, 0, 0, w, h);
      break;
    }
    case 'dissolve':
    default:
      ctx.drawImage(from, 0, 0, w, h);
      ctx.globalAlpha = e;
      ctx.drawImage(to, 0, 0, w, h);
      break;
  }
  ctx.restore();
}
