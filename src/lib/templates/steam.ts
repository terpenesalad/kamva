// Steam store, library and event artwork, one template per Steamworks asset size.
// All share one look (a fictional game, "Starfall Drifters") so the set reads as a matching store kit.
// The artwork is built from shapes: drop your key art onto the page background (or over it) to replace it.
import type { DesignElement, Template } from '../../types';
import { body, box, dot, lin, outline, pg, rad, rule, shp, tpl, txt } from './kit';

const NIGHT = '#0B0F2A';
const DUSK = '#2A1B5C';
const GLOW = '#FF7A59';
const GOLD = '#FFD27A';
const MINT = '#7CF5D4';
const CREAM = '#FFF6E8';

const sky = (angle = 90) => lin(angle, NIGHT, DUSK, '#7A2E6E');

/** Deterministic pseudo-random numbers so templates render identically every time */
function rng(seed: number) {
  let s = seed;
  return () => {
    s = (s * 1664525 + 1013904223) % 4294967296;
    return s / 4294967296;
  };
}

interface SceneOpts {
  /** planet centre and radius as fractions of the page (radius relative to height) */
  planet?: [number, number, number];
  /** horizon height as a fraction of the page height, measured from the top */
  horizon?: number;
  stars?: number;
  seed?: number;
  /** 0..1, dims the whole scene (page backgrounds must stay subtle) */
  dim?: number;
}

/** Key-art scene sized to any page: stars, ringed planet, glow and a mountain skyline */
function scene(W: number, H: number, o: SceneOpts = {}): DesignElement[] {
  const [px, py, pr] = o.planet ?? [0.72, 0.38, 0.32];
  const horizon = o.horizon ?? 0.78;
  const rand = rng(o.seed ?? 7);
  const u = Math.min(W, H);
  const out: DesignElement[] = [];

  // stars
  const n = o.stars ?? 40;
  for (let i = 0; i < n; i++) {
    const x = rand() * W;
    const y = rand() * H * horizon * 0.95;
    const s = u * (0.006 + rand() * 0.016);
    const big = rand() > 0.85;
    out.push(
      big
        ? shp('star4', x - s * 1.5, y - s * 1.5, s * 3, s * 3, CREAM, { opacity: 0.9, name: 'Star' })
        : dot(x, y, s * 0.35, CREAM, { opacity: 0.35 + rand() * 0.5, name: 'Star' }),
    );
  }

  // planet, its glow and ring
  const cx = W * px;
  const cy = H * py;
  const r = H * pr;
  out.push(dot(cx, cy, r * 1.9, rad('rgba(255,122,89,0.35)', 'rgba(255,122,89,0)'), { name: 'Planet glow' }));
  out.push(dot(cx, cy, r, lin(135, GOLD, GLOW, '#B23A6F'), { name: 'Planet' }));
  out.push(
    outline('ellipse', cx - r * 1.65, cy - r * 0.32, r * 3.3, r * 0.64, 'rgba(255,214,140,0.75)', Math.max(2, r * 0.05), {
      rotation: -14,
      name: 'Planet ring',
    }),
  );

  // horizon glow and mountain skyline
  const hy = H * horizon;
  out.push(box(0, hy - H * 0.22, W, H * 0.24, lin(90, 'rgba(255,122,89,0)', 'rgba(255,122,89,0.35)'), { name: 'Horizon glow' }));
  const peaks = Math.max(4, Math.round(W / (H * 0.45)));
  const pw = (W / peaks) * 1.7;
  for (let i = -1; i <= peaks; i++) {
    const ph = H * (0.16 + rand() * 0.16);
    out.push(shp('triangle', i * (W / peaks) - pw * 0.2, hy - ph, pw, ph + 2, '#3B1F5E', { name: 'Far peak' }));
  }
  for (let i = -1; i <= peaks; i++) {
    const ph = H * (0.08 + rand() * 0.12);
    out.push(shp('triangle', i * (W / peaks) + pw * 0.25, hy - ph * 0.6, pw * 0.9, ph + 2, '#1A1238', { name: 'Near peak' }));
  }
  out.push(box(0, hy, W, H - hy + 2, '#1A1238', { name: 'Ground' }));

  // a small ship streaking across
  const sx = W * 0.18;
  const sy = H * 0.24;
  out.push(rule(sx - u * 0.16, sy, u * 0.16, 'rgba(124,245,212,0.6)', Math.max(2, u * 0.006), { cap: 'round', rotation: -8, name: 'Ship trail' }));
  out.push(shp('chevron', sx, sy - u * 0.02, u * 0.05, u * 0.04, MINT, { rotation: -8, name: 'Ship' }));

  if (o.dim) out.push(box(0, 0, W, H, `rgba(11,15,42,${o.dim})`, { name: 'Dim overlay' }));
  return out;
}

interface LogoOpts {
  /** size of the main word in px */
  size: number;
  align?: 'left' | 'center' | 'right';
  tagline?: string;
}

/** The game logo: "STARFALL" over a spaced-out "DRIFTERS" with a glow */
function logo(x: number, y: number, w: number, o: LogoOpts): DesignElement[] {
  const s = o.size;
  const align = o.align ?? 'left';
  const els: DesignElement[] = [
    txt('STARFALL', x, y, w, {
      font: 'Bungee',
      size: s,
      lh: 1,
      align,
      color: lin(90, CREAM, GOLD),
      role: 'heading',
      effect: { type: 'glow', color: GLOW, size: Math.max(4, s * 0.12), offset: 0 },
      name: 'Logo',
    }),
    txt('DRIFTERS', x, y + s * 1.02, w, {
      font: 'Space Grotesk',
      size: s * 0.42,
      bold: true,
      lh: 1,
      ls: s * 0.22,
      align,
      color: MINT,
      role: 'subheading',
      name: 'Logo subtitle',
    }),
  ];
  if (o.tagline) {
    els.push(body(o.tagline, x, y + s * 1.62, w, { font: 'Space Grotesk', size: Math.max(12, s * 0.2), align, color: 'rgba(255,246,232,0.8)', name: 'Tagline' }));
  }
  return els;
}

/** Dark wash behind the logo so it stays readable over any key art */
/** angle: 0 = dark on the left, 90 = dark at the top, 180 = dark on the right, 270 = dark at the bottom */
const scrim = (W: number, H: number, angle: number, x = 0, y = 0) =>
  box(x, y, W, H, lin(angle, 'rgba(11,15,42,0.75)', 'rgba(11,15,42,0)'), { name: 'Logo scrim' });

// ---------------------------------------------------------------------------
// Store capsules
// ---------------------------------------------------------------------------
function headerCapsule(): Template {
  const W = 920;
  const H = 430;
  return tpl('tpl-steam-header', 'Header capsule · 920×430', 'Steam', W, H, [
    pg(sky(), [...scene(W, H, { planet: [0.76, 0.36, 0.3], seed: 3 }), scrim(W * 0.7, H, 0), ...logo(52, 120, 560, { size: 92 })], { name: 'Header capsule' }),
  ], ['steam', 'capsule', 'header', 'store', 'game', '920x430']);
}

function smallCapsule(): Template {
  const W = 462;
  const H = 174;
  // Small capsules show at thumbnail size: the logo fills most of the space
  return tpl('tpl-steam-small', 'Small capsule · 462×174', 'Steam', W, H, [
    pg(sky(), [...scene(W, H, { planet: [0.86, 0.3, 0.42], horizon: 0.86, stars: 18, seed: 11 }), scrim(W, H, 0), ...logo(20, 34, 422, { size: 62 })], {
      name: 'Small capsule',
    }),
  ], ['steam', 'capsule', 'small', 'store', 'game', '462x174']);
}

function mainCapsule(): Template {
  const W = 1232;
  const H = 706;
  return tpl('tpl-steam-main', 'Main capsule · 1232×706', 'Steam', W, H, [
    pg(sky(), [...scene(W, H, { planet: [0.7, 0.34, 0.3], seed: 5, stars: 60 }), scrim(W, H * 0.6, 90), ...logo(0, 70, W, { size: 130, align: 'center' })], {
      name: 'Main capsule',
    }),
  ], ['steam', 'capsule', 'main', 'featured', 'store', 'game', '1232x706']);
}

function verticalCapsule(): Template {
  const W = 748;
  const H = 896;
  return tpl('tpl-steam-vertical', 'Vertical capsule · 748×896', 'Steam', W, H, [
    pg(sky(), [...scene(W, H, { planet: [0.62, 0.52, 0.2], horizon: 0.82, seed: 9, stars: 55 }), scrim(W, H * 0.45, 90), ...logo(0, 70, W, { size: 112, align: 'center' })], {
      name: 'Vertical capsule',
    }),
  ], ['steam', 'capsule', 'vertical', 'sale', 'store', 'game', '748x896']);
}

function pageBackground(): Template {
  const W = 1438;
  const H = 810;
  // Steam asks for subtle artwork here: no logo, dimmed so store text stays readable
  return tpl('tpl-steam-background', 'Page background · 1438×810', 'Steam', W, H, [
    pg(sky(), [...scene(W, H, { planet: [0.8, 0.3, 0.26], seed: 13, stars: 70, dim: 0.55 })], { name: 'Page background' }),
  ], ['steam', 'background', 'store', 'page', 'game', '1438x810']);
}

function screenshot(): Template {
  const W = 1920;
  const H = 1080;
  return tpl('tpl-steam-screenshot', 'Screenshot · 1920×1080', 'Steam', W, H, [
    pg(sky(), [...scene(W, H, { planet: [0.7, 0.36, 0.28], seed: 21, stars: 80 })], { name: 'Screenshot' }),
  ], ['steam', 'screenshot', 'gameplay', 'store', 'game', '1920x1080']);
}

// ---------------------------------------------------------------------------
// Library assets
// ---------------------------------------------------------------------------
function libraryCapsule(): Template {
  const W = 600;
  const H = 900;
  return tpl('tpl-steam-library-capsule', 'Library capsule · 600×900', 'Steam', W, H, [
    pg(sky(), [...scene(W, H, { planet: [0.58, 0.44, 0.18], horizon: 0.8, seed: 17, stars: 50 }), scrim(W, H * 0.4, 270, 0, H * 0.6), ...logo(0, 700, W, { size: 86, align: 'center' })], {
      name: 'Library capsule',
    }),
  ], ['steam', 'library', 'capsule', 'cover', 'game', '600x900']);
}

function libraryHeader(): Template {
  const W = 920;
  const H = 430;
  return tpl('tpl-steam-library-header', 'Library header · 920×430', 'Steam', W, H, [
    pg(sky(), [...scene(W, H, { planet: [0.26, 0.4, 0.3], seed: 23 }), scrim(W, H, 180), ...logo(340, 130, 540, { size: 86, align: 'right' })], {
      name: 'Library header',
    }),
  ], ['steam', 'library', 'header', 'capsule', 'game', '920x430']);
}

function libraryHero(): Template {
  const W = 3840;
  const H = 1240;
  // Artwork only: Steam lays the separate library logo over this image
  return tpl('tpl-steam-library-hero', 'Library hero · 3840×1240', 'Steam', W, H, [
    pg(sky(), [...scene(W, H, { planet: [0.72, 0.42, 0.3], horizon: 0.8, seed: 29, stars: 140 })], { name: 'Library hero' }),
  ], ['steam', 'library', 'hero', 'banner', 'game', '3840x1240']);
}

function libraryLogo(): Template {
  const W = 1280;
  const H = 720;
  // Transparent background: export as PNG with "Transparent background" ticked
  return tpl('tpl-steam-library-logo', 'Library logo · 1280×720', 'Steam', W, H, [
    pg('rgba(0,0,0,0)', [...logo(0, 230, W, { size: 190, align: 'center' })], { name: 'Library logo' }),
  ], ['steam', 'library', 'logo', 'transparent', 'png', 'game', '1280x720']);
}

// ---------------------------------------------------------------------------
// Events and announcements
// ---------------------------------------------------------------------------
function eventCover(): Template {
  const W = 800;
  const H = 450;
  return tpl('tpl-steam-event-cover', 'Event cover · 800×450', 'Steam', W, H, [
    pg(sky(), [
      ...scene(W, H, { planet: [0.8, 0.34, 0.3], seed: 31, stars: 35 }),
      scrim(W * 0.8, H, 0),
      shp('roundRect', 44, 48, 210, 40, MINT, { r: 20, text: 'MAJOR UPDATE', textStyle: { font: 'Space Grotesk', size: 15, color: NIGHT, ls: 2 } }),
      txt('Update 1.2\nThe Outer Rings', 44, 112, 520, { font: 'Bungee', size: 54, lh: 1.05, color: CREAM, role: 'heading', name: 'Event title' }),
      body('New zone, two ships and co-op for up to four drifters.', 44, 262, 440, { font: 'Space Grotesk', size: 22, lh: 1.35, color: 'rgba(255,246,232,0.85)' }),
      shp('roundRect', 44, 354, 180, 50, GOLD, { r: 25, text: 'Out now', textStyle: { font: 'Space Grotesk', size: 22, color: NIGHT } }),
    ], { name: 'Event cover' }),
  ], ['steam', 'event', 'announcement', 'update', 'news', 'game', '800x450']);
}

function eventHeader(): Template {
  const W = 1920;
  const H = 622;
  return tpl('tpl-steam-event-header', 'Event header · 1920×622', 'Steam', W, H, [
    pg(sky(), [
      ...scene(W, H, { planet: [0.82, 0.38, 0.32], seed: 37, stars: 70 }),
      scrim(W * 0.75, H, 0),
      ...logo(110, 150, 900, { size: 120 }),
      txt('UPDATE 1.2  ·  THE OUTER RINGS', 116, 430, 900, { font: 'Space Grotesk', size: 34, bold: true, ls: 6, color: GOLD, role: 'subheading', name: 'Event title' }),
    ], { name: 'Event header' }),
  ], ['steam', 'event', 'header', 'announcement', 'game', '1920x622']);
}

// ---------------------------------------------------------------------------
// Icons
// ---------------------------------------------------------------------------
function iconMark(S: number, id: string, name: string, tags: string[]): Template {
  return tpl(id, name, 'Steam', S, S, [
    pg(lin(135, DUSK, NIGHT), [
      dot(S * 0.5, S * 0.5, S * 0.42, rad('rgba(255,122,89,0.45)', 'rgba(255,122,89,0)'), { name: 'Glow' }),
      dot(S * 0.5, S * 0.5, S * 0.3, lin(135, GOLD, GLOW, '#B23A6F'), { name: 'Planet' }),
      outline('ellipse', S * 0.04, S * 0.4, S * 0.92, S * 0.2, GOLD, Math.max(2, S * 0.03), { rotation: -14, name: 'Planet ring' }),
      txt('SD', 0, S * 0.36, S, { font: 'Bungee', size: S * 0.26, lh: 1, align: 'center', color: CREAM, role: 'heading', effect: { type: 'outline', color: NIGHT, size: Math.max(2, S * 0.02), offset: 0 }, name: 'Initials' }),
    ], { name }),
  ], tags);
}

const shortcutIcon = () => iconMark(256, 'tpl-steam-shortcut-icon', 'Shortcut icon · 256×256', ['steam', 'icon', 'shortcut', 'desktop', 'game', '256x256']);
const appIcon = () => iconMark(184, 'tpl-steam-app-icon', 'App icon · 184×184', ['steam', 'icon', 'community', 'app', 'game', '184x184']);

export const STEAM_TEMPLATES: Template[] = [
  headerCapsule(),
  smallCapsule(),
  mainCapsule(),
  verticalCapsule(),
  pageBackground(),
  screenshot(),
  libraryCapsule(),
  libraryHeader(),
  libraryHero(),
  libraryLogo(),
  eventCover(),
  eventHeader(),
  shortcutIcon(),
  appIcon(),
];
