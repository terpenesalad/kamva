// Multi-page presentation templates (1920 × 1080).
import type { Template } from '../../types';
import { body, box, chart, dot, frame, heading, icon, lin, oval, pg, rule, shp, subheading, tpl, txt } from './kit';

const W = 1920;
const H = 1080;
const M = 120; // outer margin

// ---------------------------------------------------------------------------
// 1. Pitch deck: clean, confident, indigo + mint
// ---------------------------------------------------------------------------
function pitchDeck(): Template {
  const ink = '#14143C';
  const indigo = '#3F37C9';
  const mint = '#4CE0B3';
  const mist = '#F3F3FA';
  const f = 'Montserrat';
  const b = 'Inter';
  const footer = (n: number) => [
    rule(M, H - 80, W - M * 2, '#DCDCEB', 2),
    body('Fieldnote  ·  Seed round 2025', M, H - 62, 600, { font: b, size: 20, color: '#8A8AA6' }),
    body(String(n).padStart(2, '0'), W - M - 100, H - 62, 100, { font: b, size: 20, bold: true, align: 'right', color: indigo }),
  ];
  return tpl('tpl-pres-pitch', 'Pitch deck', 'Presentation', W, H, [
    pg(ink, [
      dot(1500, 540, 520, indigo, { name: 'Halo' }),
      dot(1500, 540, 360, '#2A24A0'),
      frame(1180, 220, 640, 640, 'ellipse', { name: 'Product photo' }),
      shp('roundRect', M, 200, 190, 52, mint, { r: 26, text: 'Seed round', textStyle: { font: f, size: 22, color: ink } }),
      heading('Fieldnote', M, 290, 1000, { font: f, size: 150, bold: true, color: '#FFFFFF', ls: -4 }),
      subheading('Field research for product teams, without the spreadsheets.', M, 500, 820, { font: b, size: 44, lh: 1.3, color: '#C9C8F2' }),
      rule(M, 760, 80, mint, 6),
      body('Amara Okafor, CEO  ·  amara@fieldnote.app', M, 790, 900, { font: b, size: 26, color: '#FFFFFF' }),
    ], { name: 'Title', notes: 'Open with the one-line pitch, then pause.' }),
    pg(mist, [
      txt('Agenda', M, 140, 600, { font: f, size: 28, bold: true, upper: true, ls: 4, color: indigo, role: 'subheading' }),
      heading('What we’ll cover', M, 190, 900, { font: f, size: 80, bold: true, color: ink }),
      ...[
        ['01', 'The problem', 'Research lives in scattered docs and is lost within weeks.'],
        ['02', 'Our product', 'One place to capture, tag and search every customer interview.'],
        ['03', 'Traction', 'Paying teams, retention and where growth comes from.'],
        ['04', 'The team and the ask', 'Who we are and what this round unlocks.'],
      ].flatMap(([n, t, d], i) => {
        const x = M + (i % 2) * 850;
        const y = 400 + Math.floor(i / 2) * 270;
        return [
          shp('roundRect', x, y, 800, 230, '#FFFFFF', { r: 20 }),
          txt(n, x + 40, y + 40, 120, { font: f, size: 56, bold: true, color: mint, role: 'heading' }),
          subheading(t, x + 170, y + 46, 590, { font: f, size: 36, bold: true, color: ink }),
          body(d, x + 170, y + 104, 590, { font: b, size: 24, lh: 1.45, color: '#5B5B78' }),
        ];
      }),
      ...footer(2),
    ], { name: 'Agenda' }),
    pg('#FFFFFF', [
      txt('Traction', M, 140, 600, { font: f, size: 28, bold: true, upper: true, ls: 4, color: indigo, role: 'subheading' }),
      heading('Revenue has grown 4× in twelve months', M, 190, 760, { font: f, size: 68, bold: true, lh: 1.12, color: ink }),
      body('Teams start on the free plan, then upgrade once a second team joins. Net revenue retention is 138%.', M, 380, 680, {
        font: b,
        size: 28,
        lh: 1.5,
        color: '#5B5B78',
      }),
      txt('$1.2M', M, 600, 340, { font: f, size: 84, bold: true, color: indigo, role: 'heading' }),
      body('Annual recurring revenue', M, 710, 340, { font: b, size: 22, color: '#5B5B78' }),
      txt('312', M + 380, 600, 300, { font: f, size: 84, bold: true, color: indigo, role: 'heading' }),
      body('Paying teams', M + 380, 710, 300, { font: b, size: 22, color: '#5B5B78' }),
      shp('roundRect', 960, 160, 840, 760, mist, { r: 24 }),
      subheading('ARR by quarter ($k)', 1010, 210, 600, { font: b, size: 24, bold: true, color: ink }),
      chart(
        { type: 'column', labels: ['Q1', 'Q2', 'Q3', 'Q4', 'Q1', 'Q2'], values: [280, 390, 520, 710, 940, 1200], colors: [indigo, indigo, indigo, indigo, indigo, mint], textColor: ink, fontFamily: b },
        1010,
        280,
        740,
        600,
      ),
      ...footer(3),
    ], { name: 'Traction' }),
    pg(mist, [
      txt('Team', M, 140, 600, { font: f, size: 28, bold: true, upper: true, ls: 4, color: indigo, role: 'subheading' }),
      heading('Built by people who ran research teams', M, 190, 1400, { font: f, size: 68, bold: true, color: ink }),
      ...[
        ['Amara Okafor', 'CEO, ex-Head of Research at Monzo'],
        ['Tomás Ruiz', 'CTO, built search at Algolia'],
        ['Lena Fischer', 'Design, ex-IDEO'],
        ['Kenji Mori', 'Growth, scaled Notion in Japan'],
      ].flatMap(([n, r], i) => {
        const x = M + i * 430;
        return [
          frame(x, 380, 380, 380, 'roundRect', { r: 24, name: `${n} photo` }),
          subheading(n, x, 790, 380, { font: f, size: 32, bold: true, color: ink }),
          body(r, x, 838, 380, { font: b, size: 22, lh: 1.4, color: '#5B5B78' }),
        ];
      }),
      ...footer(4),
    ], { name: 'Team' }),
    pg(indigo, [
      dot(1700, 900, 420, '#4A42D8'),
      dot(1700, 900, 260, mint, { opacity: 0.9 }),
      txt('The ask', M, 200, 600, { font: f, size: 28, bold: true, upper: true, ls: 4, color: mint, role: 'subheading' }),
      heading('Raising $3M to reach 1,000 teams by 2026', M, 250, 1200, { font: f, size: 96, bold: true, lh: 1.08, color: '#FFFFFF' }),
      body('50% engineering  ·  30% go-to-market  ·  20% operations', M, 560, 1200, { font: b, size: 30, color: '#D8D6FF' }),
      heading('Thank you', M, 760, 900, { font: f, size: 56, bold: true, color: '#FFFFFF' }),
      body('amara@fieldnote.app  ·  fieldnote.app', M, 840, 900, { font: b, size: 26, color: '#D8D6FF' }),
    ], { name: 'Closing' }),
  ], ['pitch', 'startup', 'investor', 'business']);
}

// ---------------------------------------------------------------------------
// 2. Quarterly report: editorial, warm paper + forest
// ---------------------------------------------------------------------------
function quarterlyReport(): Template {
  const paper = '#F7F3EA';
  const forest = '#21423A';
  const rust = '#C4572E';
  const sand = '#E6DCC7';
  const serif = 'Libre Baskerville';
  const sans = 'Open Sans';
  const pageNum = (n: number, light = false) =>
    body(`Q3 review  ·  ${n}`, W - M - 400, H - 90, 400, { font: sans, size: 20, align: 'right', color: light ? '#B8C9C2' : '#8A8270' });
  return tpl('tpl-pres-report', 'Quarterly report', 'Presentation', W, H, [
    pg(paper, [
      box(1180, 0, 740, H, forest),
      frame(1240, 120, 560, 840, 'rect', { name: 'Cover photo' }),
      txt('Quarterly business review', M, 200, 900, { font: sans, size: 26, bold: true, ls: 3, upper: true, color: rust, role: 'subheading' }),
      heading('Q3 2025\nin review', M, 260, 1000, { font: serif, size: 120, bold: true, lh: 1.08, color: forest }),
      rule(M, 610, 140, rust, 4),
      body('Northwind Coffee Roasters\nPrepared for the board, 14 October', M, 650, 800, { font: sans, size: 30, lh: 1.5, color: '#4F4A3E' }),
    ], { name: 'Title' }),
    pg(paper, [
      heading('Agenda', M, 140, 800, { font: serif, size: 80, bold: true, color: forest }),
      rule(M, 290, W - M * 2, sand, 2),
      ...['Highlights from the quarter', 'Sales by channel', 'Wholesale partners', 'Priorities for Q4'].flatMap((t, i) => [
        txt(`0${i + 1}`, M, 340 + i * 150, 140, { font: serif, size: 54, bold: true, color: rust, role: 'subheading' }),
        subheading(t, M + 180, 350 + i * 150, 1100, { font: serif, size: 44, color: forest }),
        rule(M, 450 + i * 150, W - M * 2, sand, 2),
      ]),
      pageNum(2),
    ], { name: 'Agenda' }),
    pg(paper, [
      txt('Sales by channel', M, 130, 800, { font: sans, size: 26, bold: true, ls: 3, upper: true, color: rust, role: 'subheading' }),
      heading('Online sales overtook cafés for the first time', M, 180, 760, { font: serif, size: 60, bold: true, lh: 1.2, color: forest }),
      body('Subscriptions drove most of the growth after the August price change. Café revenue held steady despite two closures for refits.', M, 440, 700, {
        font: sans,
        size: 28,
        lh: 1.55,
        color: '#4F4A3E',
      }),
      box(M, 700, 700, 2, sand),
      txt('+31%', M, 740, 300, { font: serif, size: 72, bold: true, color: forest, role: 'heading' }),
      body('Online revenue vs Q2', M, 840, 300, { font: sans, size: 22, color: '#6E6757' }),
      txt('£842k', M + 360, 740, 340, { font: serif, size: 72, bold: true, color: forest, role: 'heading' }),
      body('Total quarterly revenue', M + 360, 840, 340, { font: sans, size: 22, color: '#6E6757' }),
      shp('roundRect', 960, 130, 840, 820, '#FFFFFF', { r: 12 }),
      subheading('Share of revenue', 1010, 180, 600, { font: sans, size: 26, bold: true, color: forest }),
      chart(
        { type: 'donut', labels: ['Online', 'Cafés', 'Wholesale', 'Events'], values: [41, 36, 18, 5], colors: [forest, rust, '#D9A441', '#9DB5AC'], textColor: '#3A362C', fontFamily: sans },
        1010,
        250,
        740,
        640,
      ),
      pageNum(3),
    ], { name: 'Channels' }),
    pg(paper, [
      txt('Wholesale partners', M, 130, 800, { font: sans, size: 26, bold: true, ls: 3, upper: true, color: rust, role: 'subheading' }),
      heading('Three new partners this quarter', M, 180, 1400, { font: serif, size: 60, bold: true, color: forest }),
      ...[
        ['Harbour Bakery', 'Six sites across Bristol, house blend and decaf.'],
        ['Fold Hotels', 'Breakfast service in all four hotels from November.'],
        ['The Reading Room', 'Single-origin rotation for their new café bar.'],
      ].flatMap(([n, d], i) => {
        const x = M + i * 570;
        return [
          frame(x, 340, 520, 400, 'rect', { name: `${n} photo` }),
          subheading(n, x, 770, 520, { font: serif, size: 34, bold: true, color: forest }),
          body(d, x, 826, 520, { font: sans, size: 24, lh: 1.5, color: '#4F4A3E' }),
        ];
      }),
      pageNum(4),
    ], { name: 'Partners' }),
    pg(forest, [
      oval(1300, -200, 900, 900, '#2A5249'),
      txt('Priorities for Q4', M, 200, 800, { font: sans, size: 26, bold: true, ls: 3, upper: true, color: '#E9A27F', role: 'subheading' }),
      heading('Thank you.\nQuestions?', M, 260, 1200, { font: serif, size: 110, bold: true, lh: 1.1, color: paper }),
      body('Open two new cafés  ·  Launch the gift subscription  ·  Hire a head of wholesale', M, 640, 1500, { font: sans, size: 30, color: '#CFE0D6' }),
      body('Hannah Price, Managing Director  ·  hannah@northwind.coffee', M, 860, 1400, { font: sans, size: 24, color: '#B8C9C2' }),
      pageNum(5, true),
    ], { name: 'Closing' }),
  ], ['report', 'quarterly', 'business', 'review']);
}

// ---------------------------------------------------------------------------
// 3. Workshop / course deck: playful, bright, rounded
// ---------------------------------------------------------------------------
function workshopDeck(): Template {
  const sky = '#D7EEFF';
  const navy = '#14213D';
  const orange = '#FF8A3D';
  const pink = '#FF5D8F';
  const yellow = '#FFD23F';
  const h = 'Fredoka';
  const b = 'Nunito';
  return tpl('tpl-pres-workshop', 'Workshop slides', 'Presentation', W, H, [
    pg(sky, [
      shp('blob1', 1200, 120, 760, 760, yellow),
      frame(1300, 220, 560, 560, 'blob3', { name: 'Workshop photo' }),
      shp('star', 1220, 760, 120, 120, pink, { rotation: 14 }),
      dot(1840, 120, 40, orange),
      shp('roundRect', M, 220, 300, 60, navy, { r: 30, text: 'Beginner workshop', textStyle: { font: b, size: 24, color: '#FFFFFF' } }),
      heading('Intro to\nwatercolour', M, 310, 1100, { font: h, size: 140, bold: true, lh: 1.0, color: navy }),
      body('Saturday 9 November  ·  The Old Print Works', M, 640, 1000, { font: b, size: 36, bold: true, color: '#3B4A6B' }),
      body('with Rosa Lindqvist', M, 700, 1000, { font: b, size: 30, color: '#3B4A6B' }),
    ], { name: 'Title' }),
    pg('#FFFFFF', [
      heading('Today’s plan', M, 130, 1000, { font: h, size: 90, bold: true, color: navy }),
      ...[
        ['10:00', 'Materials and paper', orange, 'palette'],
        ['10:45', 'Washes and gradients', pink, 'droplet'],
        ['11:30', 'Coffee break', yellow, 'coffee'],
        ['11:45', 'Painting a landscape', '#3FA7F5', 'mountain'],
      ].flatMap(([t, d, c, ic], i) => {
        const x = M + i * 430;
        return [
          shp('roundRect', x, 340, 390, 460, sky, { r: 36 }),
          dot(x + 105, 455, 65, c),
          icon(ic as any, x + 75, 425, 60, navy),
          txt(t, x + 40, 580, 320, { font: h, size: 56, bold: true, color: navy, role: 'subheading' }),
          body(d, x + 40, 660, 320, { font: b, size: 32, bold: true, lh: 1.3, color: '#3B4A6B' }),
        ];
      }),
    ], { name: 'Agenda' }),
    pg(sky, [
      heading('How long each step takes', M, 130, 900, { font: h, size: 80, bold: true, lh: 1.05, color: navy }),
      body('Most beginners rush the drying. Plan your painting around it and the colours stay clean.', M, 360, 760, {
        font: b,
        size: 32,
        lh: 1.5,
        color: '#3B4A6B',
      }),
      shp('roundRect', M, 600, 760, 220, '#FFFFFF', { r: 30 }),
      icon('lightbulb', M + 40, 650, 64, orange),
      body('Tip: tilt the board slightly so washes run down and settle evenly.', M + 130, 650, 580, { font: b, size: 28, bold: true, lh: 1.4, color: navy }),
      shp('roundRect', 1000, 130, 800, 820, '#FFFFFF', { r: 36 }),
      subheading('Minutes per step', 1060, 180, 600, { font: h, size: 34, bold: true, color: navy }),
      chart(
        { type: 'column', labels: ['Sketch', 'Wash', 'Dry', 'Detail', 'Finish'], values: [10, 15, 25, 20, 5], colors: [orange, pink, '#3FA7F5', yellow, '#7BD389'], textColor: navy, fontFamily: b },
        1060,
        260,
        680,
        620,
      ),
    ], { name: 'Content' }),
    pg('#FFFFFF', [
      heading('Your work', M, 130, 1000, { font: h, size: 90, bold: true, color: navy }),
      frame(M, 300, 820, 620, 'roundRect', { r: 36, name: 'Photo 1' }),
      frame(980, 300, 400, 300, 'roundRect', { r: 30, name: 'Photo 2' }),
      frame(1400, 300, 400, 300, 'roundRect', { r: 30, name: 'Photo 3' }),
      frame(980, 620, 820, 300, 'roundRect', { r: 30, name: 'Photo 4' }),
      shp('star', 1720, 110, 110, 110, yellow, { rotation: -12 }),
    ], { name: 'Photos' }),
    pg(navy, [
      shp('blob2', -200, 600, 700, 700, pink, { opacity: 0.9 }),
      shp('blob1', 1500, -200, 600, 600, orange, { opacity: 0.9 }),
      dot(1700, 900, 50, yellow),
      heading('Thanks for\npainting with us', 300, 300, 1320, { font: h, size: 120, bold: true, lh: 1.0, align: 'center', color: '#FFFFFF' }),
      body('Share your work with #paintwithrosa  ·  rosalindqvist.art', 300, 640, 1320, { font: b, size: 34, bold: true, align: 'center', color: yellow }),
    ], { name: 'Closing' }),
  ], ['workshop', 'class', 'education', 'course']);
}

export const PRESENTATION_TEMPLATES: Template[] = [pitchDeck(), quarterlyReport(), workshopDeck()];
