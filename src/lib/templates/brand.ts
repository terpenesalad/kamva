// Logos (500 × 500) and animated video templates.
import type { Template } from '../../types';
import { body, box, dot, enter, frame, heading, icon, lin, oval, outline, pg, rule, shp, subheading, tpl, txt } from './kit';

// ---------------------------------------------------------------------------
// Logos
// ---------------------------------------------------------------------------
function logoCoffee(): Template {
  const brown = '#4A2C1D';
  const cream = '#F5E9D7';
  return tpl('tpl-logo-coffee', 'Coffee roaster logo', 'Logo', 500, 500, [
    pg(cream, [
      dot(250, 250, 200, brown),
      outline('ellipse', 66, 66, 368, 368, cream, 2, { dash: 'dashed' }),
      icon('coffee', 200, 128, 100, cream, { sw: 1.5 }),
      heading('Ember', 70, 236, 360, { font: 'Alfa Slab One', size: 64, align: 'center', color: cream }),
      txt('Coffee roasters', 70, 322, 360, { font: 'Josefin Sans', size: 18, bold: true, ls: 5, upper: true, align: 'center', color: '#E0B884', role: 'subheading' }),
      txt('Est. 2019', 70, 356, 360, { font: 'Josefin Sans', size: 14, ls: 3, upper: true, align: 'center', color: 'rgba(245,233,215,0.7)' }),
    ]),
  ], ['logo', 'coffee', 'badge', 'emblem']);
}

function logoTech(): Template {
  const ink = '#0D1B2A';
  return tpl('tpl-logo-tech', 'Tech startup logo', 'Logo', 500, 500, [
    pg('#FFFFFF', [
      shp('roundRect', 170, 110, 160, 160, lin(135, '#22C1C3', '#3D5AFE'), { r: 44 }),
      shp('hexagon', 205, 145, 90, 90, 'rgba(0,0,0,0)', { stroke: '#FFFFFF', sw: 8 }),
      dot(250, 190, 14, '#FFFFFF'),
      heading('northstack', 40, 300, 420, { font: 'Space Grotesk', size: 54, bold: true, align: 'center', color: ink, ls: -1 }),
      txt('Cloud infrastructure', 40, 372, 420, { font: 'Inter', size: 18, align: 'center', color: '#5A6B7F', role: 'subheading' }),
    ]),
  ], ['logo', 'tech', 'startup', 'modern']);
}

// ---------------------------------------------------------------------------
// Animated videos
// ---------------------------------------------------------------------------
function brandIntro(): Template {
  const W = 1920;
  const H = 1080;
  const ink = '#0F1020';
  const coral = '#FF5E5B';
  const lilac = '#C3B8FF';
  const sand = '#FFF4E8';
  const f = 'Poppins';
  return tpl('tpl-video-brand-intro', 'Brand intro', 'Video', W, H, [
    pg(ink, [
      dot(960, 540, 260, coral, { anim: enter('zoomIn', 0.8, { loop: 'pulse' }), name: 'Mark circle' }),
      shp('star4', 870, 450, 180, 180, sand, { anim: enter('spin', 1.0), at: [0.3, null] }),
      heading('Lumen', 460, 840, 1000, { font: f, size: 80, bold: true, align: 'center', color: '#FFFFFF', anim: enter('rise', 0.7), at: [0.9, null] }),
    ], { name: 'Logo reveal', duration: 3, transition: 'zoom', transitionDuration: 0.6 }),
    pg(sand, [
      box(0, 0, 28, H, coral, { anim: enter('wipe', 0.6) }),
      txt('Lumen Studio', 160, 300, 1200, { font: f, size: 36, bold: true, ls: 4, upper: true, color: coral, role: 'subheading', anim: enter('fade', 0.6) }),
      heading('We design brands\nthat people remember.', 150, 370, 1500, {
        font: f,
        size: 110,
        bold: true,
        lh: 1.05,
        color: ink,
        anim: enter('rise', 0.9, { exit: 'fade', exitDuration: 0.5 }),
        at: [0.3, null],
      }),
      dot(1640, 860, 120, lilac, { anim: enter('pop', 0.6, { loop: 'float' }), at: [0.8, null] }),
    ], { name: 'Statement', duration: 4, transition: 'slideLeft', transitionDuration: 0.6 }),
    pg(ink, [
      ...[
        ['Strategy', 'pen-tool', coral],
        ['Identity', 'palette', lilac],
        ['Motion', 'play', '#FFD166'],
      ].flatMap(([t, ic, c], i) => {
        const x = 260 + i * 500;
        const at: [number, null] = [0.25 + i * 0.35, null];
        return [
          shp('roundRect', x, 330, 400, 420, '#1C1E36', { r: 36, anim: enter('rise', 0.7), at }),
          dot(x + 200, 470, 80, c as string, { anim: enter('pop', 0.6), at: [at[0] + 0.2, null] }),
          icon(ic as any, x + 160, 430, 80, ink, { anim: enter('pop', 0.6), at: [at[0] + 0.2, null] }),
          subheading(t as string, x, 600, 400, { font: f, size: 48, bold: true, align: 'center', color: '#FFFFFF', anim: enter('fade', 0.6), at: [at[0] + 0.3, null] }),
        ];
      }),
    ], { name: 'Services', duration: 4, transition: 'fade', transitionDuration: 0.6 }),
    pg(coral, [
      heading('Let’s make something.', 160, 380, 1600, { font: f, size: 120, bold: true, align: 'center', color: '#FFFFFF', anim: enter('blur', 0.9) }),
      body('hello@lumen.studio  ·  lumen.studio', 160, 580, 1600, { font: f, size: 44, align: 'center', color: sand, anim: enter('rise', 0.7), at: [0.6, null] }),
      shp('star4', 920, 760, 80, 80, sand, { anim: enter('spin', 0.8, { loop: 'rotate' }), at: [1, null] }),
    ], { name: 'Call to action', duration: 3 }),
  ], ['video', 'intro', 'brand', 'animated', 'logo reveal']);
}

function productPromo(): Template {
  const W = 1080;
  const H = 1080;
  const ink = '#13261F';
  const mint = '#B6F2D3';
  const lime = '#E4FF6B';
  const f = 'Montserrat';
  return tpl('tpl-video-product-promo', 'Product promo', 'Video', W, H, [
    pg(mint, [
      dot(540, 520, 330, '#8EE6BB', { anim: enter('zoomIn', 0.8) }),
      frame(290, 270, 500, 500, 'ellipse', { name: 'Product photo', anim: enter('pop', 0.8, { loop: 'float' }), at: [0.2, null] }),
      shp('burst', 760, 180, 200, 200, lime, {
        rotation: 12,
        text: 'New',
        textStyle: { font: f, size: 48, color: ink },
        anim: enter('spin', 0.7, { loop: 'wiggle' }),
        at: [0.8, null],
      }),
      heading('Meet Aura', 80, 850, 920, { font: f, size: 96, bold: true, align: 'center', color: ink, anim: enter('rise', 0.7), at: [0.5, null] }),
    ], { name: 'Intro', duration: 3, transition: 'circle', transitionDuration: 0.7 }),
    pg(ink, [
      txt('Wireless earbuds', 80, 140, 920, { font: f, size: 34, bold: true, ls: 4, upper: true, align: 'center', color: lime, role: 'subheading', anim: enter('fade', 0.5) }),
      ...[
        ['battery-charging', '36 hours', 'of battery with the case'],
        ['volume-2', 'Adaptive', 'noise cancelling'],
        ['droplet', 'IPX5', 'sweat and rain proof'],
      ].flatMap(([ic, t, d], i) => {
        const y = 290 + i * 230;
        const at: [number, null] = [0.3 + i * 0.5, null];
        return [
          shp('roundRect', 120, y, 840, 190, '#1E3A30', { r: 32, anim: enter('slideLeft', 0.6), at }),
          dot(230, y + 95, 60, mint, { anim: enter('pop', 0.5), at: [at[0] + 0.2, null] }),
          icon(ic as any, 195, y + 60, 70, ink, { anim: enter('pop', 0.5), at: [at[0] + 0.2, null] }),
          subheading(t, 330, y + 40, 600, { font: f, size: 52, bold: true, color: '#FFFFFF', anim: enter('fade', 0.5), at: [at[0] + 0.25, null] }),
          body(d, 330, y + 112, 600, { font: 'Inter', size: 30, color: mint, anim: enter('fade', 0.5), at: [at[0] + 0.35, null] }),
        ];
      }),
    ], { name: 'Features', duration: 4.5, transition: 'slideUp', transitionDuration: 0.6 }),
    pg(lime, [
      heading('£129', 80, 300, 920, { font: f, size: 220, bold: true, align: 'center', color: ink, anim: enter('pop', 0.7, { exit: 'zoomOut', exitDuration: 0.4 }) }),
      body('Launch price until 31 May', 80, 580, 920, { font: f, size: 44, bold: true, align: 'center', color: ink, anim: enter('rise', 0.6), at: [0.4, null] }),
      shp('roundRect', 290, 720, 500, 110, ink, {
        r: 55,
        text: 'Shop now at aura.audio',
        textStyle: { font: f, size: 30, color: lime },
        anim: enter('rise', 0.6, { loop: 'pulse' }),
        at: [0.8, null],
      }),
    ], { name: 'Offer', duration: 3.5 }),
  ], ['video', 'product', 'promo', 'animated', 'ad']);
}

function verticalReel(): Template {
  const W = 1080;
  const H = 1920;
  const ink = '#1A1033';
  const pink = '#FF4FA3';
  const orange = '#FF9F1C';
  const f = 'Bebas Neue';
  const b = 'Nunito';
  return tpl('tpl-video-reel', 'Vertical reel', 'Video', W, H, [
    pg(lin(160, '#FF4FA3', '#FF9F1C'), [
      dot(900, 260, 220, 'rgba(255,255,255,0.15)', { anim: enter('zoomIn', 1.0, { loop: 'float' }) }),
      dot(160, 1600, 300, 'rgba(255,255,255,0.12)', { anim: enter('zoomIn', 1.0, { loop: 'float' }) }),
      txt('3 tips for', 90, 620, 900, { font: b, size: 64, bold: true, align: 'center', color: '#FFFFFF', role: 'subheading', anim: enter('drop', 0.6) }),
      heading('Better\nphone photos', 60, 720, 960, { font: f, size: 200, lh: 0.9, align: 'center', color: ink, anim: enter('pop', 0.7, { exit: 'zoomOut', exitDuration: 0.4 }), at: [0.4, null] }),
      shp('roundRect', 340, 1200, 400, 90, ink, { r: 45, text: 'Save for later', textStyle: { font: b, size: 34, color: '#FFFFFF' }, anim: enter('rise', 0.5), at: [1.0, null] }),
    ], { name: 'Hook', duration: 2.5, transition: 'slideUp', transitionDuration: 0.5 }),
    ...[
      ['01', 'Clean your lens', 'Most hazy photos come from a fingerprint, not the camera.', 'sun'],
      ['02', 'Tap to focus', 'Then slide down a little to protect the highlights.', 'target'],
      ['03', 'Find side light', 'Stand by a window and turn until shadows shape the face.', 'camera'],
    ].map(([n, t, d, ic], i) =>
      pg(i % 2 ? '#FFF2E0' : ink, [
        txt(n, 90, 260, 900, { font: f, size: 320, lh: 1, color: i % 2 ? orange : pink, role: 'heading', anim: enter('slideRight', 0.6) }),
        dot(860, 420, 110, i % 2 ? ink : orange, { anim: enter('pop', 0.6, { loop: 'pulse' }), at: [0.3, null] }),
        icon(ic as any, 800, 360, 120, i % 2 ? '#FFF2E0' : ink, { anim: enter('pop', 0.6), at: [0.4, null] }),
        heading(t, 90, 640, 900, { font: f, size: 150, lh: 0.95, color: i % 2 ? ink : '#FFFFFF', anim: enter('rise', 0.6), at: [0.3, null] }),
        body(d, 90, 980, 860, { font: b, size: 52, bold: true, lh: 1.3, color: i % 2 ? '#4A3B5C' : '#E7DDFF', anim: enter('fade', 0.6, { exit: 'fade', exitDuration: 0.4 }), at: [0.7, null] }),
        frame(90, 1260, 900, 520, 'roundRect', { r: 40, name: 'Example photo', anim: enter('rise', 0.6), at: [1.0, null] }),
      ], { name: `Tip ${n}`, duration: 3, transition: i === 2 ? 'zoom' : 'slideLeft', transitionDuration: 0.5 }),
    ),
    pg(pink, [
      heading('Follow for\nmore', 60, 640, 960, { font: f, size: 220, lh: 0.9, align: 'center', color: '#FFFFFF', anim: enter('bounce', 0.9) }),
      subheading('@lens.and.light', 60, 1120, 960, { font: b, size: 60, bold: true, align: 'center', color: ink, anim: enter('rise', 0.6), at: [0.6, null] }),
      icon('heart', 470, 1300, 140, ink, { anim: enter('pop', 0.6, { loop: 'pulse' }), at: [1.0, null] }),
    ], { name: 'Outro', duration: 2.5 }),
  ], ['video', 'reel', 'tiktok', 'vertical', 'animated', 'tips']);
}

export const BRAND_TEMPLATES: Template[] = [logoCoffee(), logoTech(), brandIntro(), productPromo(), verticalReel()];

