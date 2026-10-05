// Print templates: posters, flyers, business cards, resume, invitations, certificate and menu.
// Sizes are px at 96 dpi.
import type { Template } from '../../types';
import { body, box, dot, frame, heading, icon, lin, oval, outline, pg, rule, shp, subheading, tpl, txt } from './kit';

const A4 = { w: 794, h: 1123 };
const LETTER = { w: 816, h: 1056 };
const POSTER = { w: 1728, h: 2304 }; // 18 × 24 in
const CARD = { w: 336, h: 192 }; // 3.5 × 2 in
const INVITE = { w: 480, h: 672 }; // 5 × 7 in
const CERT = { w: 1056, h: 816 }; // 11 × 8.5 in

// ---------------------------------------------------------------------------
// Posters and flyers
// ---------------------------------------------------------------------------
function jazzPoster(): Template {
  const { w, h } = POSTER;
  const blue = '#1B3FA0';
  const cream = '#F4ECD8';
  const red = '#E0432B';
  return tpl('tpl-poster-jazz', 'Jazz festival poster', 'Poster', w, h, [
    pg(cream, [
      box(0, 0, w, 1340, blue),
      dot(1240, 640, 420, red, { name: 'Red sun' }),
      shp('semicircle', 120, 900, 900, 440, '#F2B33D'),
      shp('ring', 260, 180, 560, 560, cream, { opacity: 0.9 }),
      dot(1360, 260, 60, cream),
      txt('The 12th annual', 140, 1420, 1450, { font: 'Josefin Sans', size: 56, bold: true, ls: 10, upper: true, color: red, role: 'subheading' }),
      heading('Harbour\nJazz Festival', 128, 1500, 1500, { font: 'DM Serif Display', size: 190, lh: 0.98, color: blue }),
      rule(140, 1930, 1448, blue, 4),
      body('16–18 August', 140, 1970, 700, { font: 'Josefin Sans', size: 56, bold: true, color: blue }),
      body('Waterfront Stage, Cardiff Bay', 140, 2050, 820, { font: 'Josefin Sans', size: 44, color: '#3A3A3A' }),
      body('Nubya Garcia\nEzra Collective\nYussef Dayes Trio', 1000, 1970, 588, { font: 'Josefin Sans', size: 44, bold: true, lh: 1.3, align: 'right', color: red }),
      body('Tickets from £35 at harbourjazz.co.uk', 140, 2180, 1448, { font: 'Josefin Sans', size: 36, color: '#3A3A3A' }),
    ]),
  ], ['music', 'festival', 'jazz', 'event']);
}

function runFlyer(): Template {
  const { w, h } = LETTER;
  const lime = '#D6FF3D';
  const ink = '#0B0B0B';
  return tpl('tpl-flyer-run', 'Charity fun run flyer', 'Flyer', w, h, [
    pg(ink, [
      frame(0, 0, w, 560, 'rect', { name: 'Runners photo' }),
      shp('parallelogram', -120, 470, 1100, 170, lime, { rotation: -6 }),
      heading('Run the city', 48, 498, 720, { font: 'Anton', size: 92, upper: true, color: ink, rotation: -6 }),
      txt('5K and 10K charity fun run', 56, 680, 700, { font: 'Oswald', size: 34, bold: true, upper: true, ls: 2, color: lime, role: 'subheading' }),
      body('Every finisher gets a medal, a free breakfast and a very good feeling. All money raised goes to the Riverside Children’s Hospital.', 56, 740, 520, {
        font: 'Roboto',
        size: 19,
        lh: 1.5,
        color: '#D9D9D9',
      }),
      icon('calendar', 56, 880, 26, lime),
      body('Sunday 21 April, 9am start', 96, 880, 440, { font: 'Roboto', size: 20, bold: true, color: '#FFFFFF' }),
      icon('map-pin', 56, 924, 26, lime),
      body('Riverside Park, north gate', 96, 924, 440, { font: 'Roboto', size: 20, bold: true, color: '#FFFFFF' }),
      shp('burst', 590, 800, 190, 190, lime, { rotation: 10, text: '£15\nentry', textStyle: { font: 'Anton', size: 36, color: ink, bold: false } }),
      box(0, 1000, w, 56, '#1C1C1C'),
      body('Sign up at runthecity.org.uk', 56, 1014, 700, { font: 'Roboto', size: 20, bold: true, color: lime }),
    ]),
  ], ['run', 'charity', 'sport', 'event', 'flyer']);
}

function plantFlyer(): Template {
  const { w, h } = A4;
  const green = '#2E5E3E';
  const sage = '#DCE8D2';
  const terracotta = '#B65F3B';
  return tpl('tpl-flyer-plants', 'Plant swap flyer', 'Flyer', w, h, [
    pg('#FBFAF5', [
      shp('arch', 397 - 280, 70, 560, 560, sage),
      frame(397 - 230, 140, 460, 490, 'arch', { name: 'Plant photo' }),
      icon('sprout', 80, 90, 56, green, { sw: 1.5 }),
      icon('leaf', 660, 560, 56, green, { sw: 1.5, rotation: 20 }),
      txt('Community event', 60, 680, 674, { font: 'Raleway', size: 18, bold: true, ls: 6, upper: true, align: 'center', color: terracotta, role: 'subheading' }),
      heading('Spring Plant Swap', 60, 716, 674, { font: 'Cormorant Garamond', size: 74, bold: true, align: 'center', color: green }),
      body('Bring a cutting, take a cutting. Free entry, tea and cake, and advice from the Hollybank gardeners.', 120, 820, 554, {
        font: 'Raleway',
        size: 18,
        lh: 1.6,
        align: 'center',
        color: '#4B5A4F',
      }),
      rule(120, 940, 554, '#C9D6BF', 1.5),
      body('Saturday 6 April', 60, 966, 337, { font: 'Raleway', size: 20, bold: true, align: 'center', color: green }),
      body('11am – 3pm', 60, 996, 337, { font: 'Raleway', size: 17, align: 'center', color: '#4B5A4F' }),
      body('Hollybank Library', 397, 966, 337, { font: 'Raleway', size: 20, bold: true, align: 'center', color: green }),
      body('22 Mill Lane', 397, 996, 337, { font: 'Raleway', size: 17, align: 'center', color: '#4B5A4F' }),
    ]),
  ], ['plants', 'community', 'garden', 'flyer']);
}

// ---------------------------------------------------------------------------
// Business cards
// ---------------------------------------------------------------------------
function cardArchitect(): Template {
  const { w, h } = CARD;
  const ink = '#1A1A1A';
  const stone = '#EDEAE4';
  return tpl('tpl-card-architect', 'Architect business card', 'Business card', w, h, [
    pg(ink, [
      box(24, 24, 2, 144, '#C8A46A'),
      heading('Ines Duarte', 40, 54, 260, { font: 'Cormorant Garamond', size: 30, bold: true, color: stone }),
      txt('Architect, RIBA', 40, 94, 260, { font: 'Raleway', size: 10, bold: true, ls: 3, upper: true, color: '#C8A46A', role: 'subheading' }),
      shp('hexagon', 268, 20, 44, 40, 'rgba(0,0,0,0)', { stroke: '#C8A46A', sw: 1.5 }),
    ], { name: 'Front' }),
    pg(stone, [
      subheading('Duarte Studio', 24, 24, 200, { font: 'Cormorant Garamond', size: 20, bold: true, color: ink }),
      rule(24, 62, 288, '#BDB6A8', 1),
      icon('phone', 24, 80, 13, ink),
      body('+351 912 448 210', 46, 80, 260, { font: 'Raleway', size: 10.5, color: ink }),
      icon('mail', 24, 104, 13, ink),
      body('ines@duarte.studio', 46, 104, 260, { font: 'Raleway', size: 10.5, color: ink }),
      icon('map-pin', 24, 128, 13, ink),
      body('Rua das Flores 28, Porto', 46, 128, 260, { font: 'Raleway', size: 10.5, color: ink }),
      icon('globe', 24, 152, 13, ink),
      body('duarte.studio', 46, 152, 260, { font: 'Raleway', size: 10.5, color: ink }),
    ], { name: 'Back' }),
  ], ['business card', 'architect', 'minimal']);
}

function cardBakery(): Template {
  const { w, h } = CARD;
  const pink = '#F7C6D0';
  const choc = '#5A2E1E';
  return tpl('tpl-card-bakery', 'Bakery business card', 'Business card', w, h, [
    pg(pink, [
      dot(168, 82, 58, '#FFFFFF'),
      icon('cake', 144, 56, 48, choc, { sw: 1.5 }),
      heading('Crumb & Co.', 18, 146, 300, { font: 'Pacifico', size: 22, align: 'center', color: choc }),
      oval(-40, 150, 80, 80, '#F3A9B9'),
      oval(300, -40, 80, 80, '#F3A9B9'),
    ], { name: 'Front' }),
    pg('#FFFFFF', [
      box(0, 0, 10, h, pink),
      subheading('Mei Tanaka', 30, 26, 280, { font: 'Quicksand', size: 18, bold: true, color: choc }),
      body('Head baker & owner', 30, 52, 280, { font: 'Quicksand', size: 11, color: '#9A6B5A' }),
      body('07700 900 431\nhello@crumbandco.co.uk\n8 Market Row, Brixton\nOpen Tue–Sun, 8am–4pm', 30, 88, 280, { font: 'Quicksand', size: 11, bold: true, lh: 1.55, color: choc }),
    ], { name: 'Back' }),
  ], ['business card', 'bakery', 'food', 'cute']);
}

// ---------------------------------------------------------------------------
// Resume (A4)
// ---------------------------------------------------------------------------
function resume(): Template {
  const { w, h } = A4;
  const navy = '#1F2A44';
  const accent = '#3B82C4';
  const side = 250;
  const bodyCol = '#3D4556';
  const section = (t: string, x: number, y: number, wd: number, color = navy) => [
    txt(t, x, y, wd, { font: 'Montserrat', size: 13, bold: true, ls: 2.5, upper: true, color, role: 'subheading' }),
    rule(x, y + 26, wd, color === navy ? '#D5DAE3' : 'rgba(255,255,255,0.25)', 1),
  ];
  const job = (y: number, role: string, co: string, dates: string, text: string) => [
    subheading(role, 290, y, 330, { font: 'Montserrat', size: 15, bold: true, color: navy }),
    body(dates, 620, y + 2, 134, { font: 'Lato', size: 11.5, align: 'right', color: '#7A8296' }),
    body(co, 290, y + 22, 460, { font: 'Lato', size: 12.5, italic: true, color: accent }),
    body(text, 290, y + 46, 464, { font: 'Lato', size: 12, lh: 1.5, list: 'bullet', color: bodyCol }),
  ];
  return tpl('tpl-resume', 'Clean resume', 'Resume', w, h, [
    pg('#FFFFFF', [
      box(0, 0, side, h, navy),
      frame(55, 50, 140, 140, 'ellipse', { name: 'Profile photo', border: 4, borderColor: '#FFFFFF' }),
      ...section('Contact', 30, 230, 190, '#FFFFFF'),
      icon('mail', 30, 276, 14, '#9FC3E8'),
      body('sofia.marin@email.com', 52, 275, 180, { font: 'Lato', size: 11.5, color: '#E6EAF2' }),
      icon('phone', 30, 302, 14, '#9FC3E8'),
      body('+44 7700 900 218', 52, 301, 180, { font: 'Lato', size: 11.5, color: '#E6EAF2' }),
      icon('map-pin', 30, 328, 14, '#9FC3E8'),
      body('Manchester, UK', 52, 327, 180, { font: 'Lato', size: 11.5, color: '#E6EAF2' }),
      icon('globe', 30, 354, 14, '#9FC3E8'),
      body('sofiamarin.design', 52, 353, 180, { font: 'Lato', size: 11.5, color: '#E6EAF2' }),
      ...section('Skills', 30, 410, 190, '#FFFFFF'),
      body('User research\nInteraction design\nDesign systems\nPrototyping in Figma\nAccessibility (WCAG 2.2)\nWorkshop facilitation', 30, 452, 200, {
        font: 'Lato',
        size: 12,
        lh: 1.75,
        color: '#E6EAF2',
      }),
      ...section('Education', 30, 640, 190, '#FFFFFF'),
      subheading('BA Interaction Design', 30, 682, 200, { font: 'Lato', size: 12.5, bold: true, color: '#FFFFFF' }),
      body('Manchester School of Art\n2012 – 2015', 30, 702, 200, { font: 'Lato', size: 11.5, lh: 1.5, color: '#C3CCDD' }),
      ...section('Languages', 30, 790, 190, '#FFFFFF'),
      body('English (native)\nSpanish (fluent)\nFrench (conversational)', 30, 832, 200, { font: 'Lato', size: 12, lh: 1.75, color: '#E6EAF2' }),
      heading('Sofia Marín', 290, 56, 470, { font: 'Montserrat', size: 40, bold: true, color: navy }),
      txt('Senior product designer', 290, 112, 470, { font: 'Montserrat', size: 15, bold: true, ls: 2, upper: true, color: accent, role: 'subheading' }),
      body('Product designer with nine years of experience shaping fintech and health products. I turn messy problems into calm, accessible interfaces and help teams ship with confidence.', 290, 150, 464, {
        font: 'Lato',
        size: 12.5,
        lh: 1.6,
        color: bodyCol,
      }),
      ...section('Experience', 290, 250, 464),
      ...job(296, 'Senior product designer', 'Monzo Bank, London', '2021 – present', 'Led design for savings and budgeting, used by 4M customers\nBuilt the accessibility review process now used across the company\nMentored four designers through promotion'),
      ...job(436, 'Product designer', 'Babylon Health, Manchester', '2018 – 2021', 'Redesigned appointment booking, cutting drop-off by 22%\nRan weekly research sessions with patients and GPs'),
      ...job(558, 'UX designer', 'Made by Many, London', '2015 – 2018', 'Designed websites and apps for clients including the BBC and Mumsnet\nIntroduced design sprints to the studio'),
      ...section('Selected projects', 290, 690, 464),
      subheading('Savings Pots', 290, 736, 220, { font: 'Montserrat', size: 13.5, bold: true, color: navy }),
      body('A goal-based savings feature that grew deposits by 31% in its first year.', 290, 758, 220, { font: 'Lato', size: 11.5, lh: 1.5, color: bodyCol }),
      subheading('Clarity design system', 534, 736, 220, { font: 'Montserrat', size: 13.5, bold: true, color: navy }),
      body('140 components in Figma and React, with documentation and usage guidelines.', 534, 758, 220, { font: 'Lato', size: 11.5, lh: 1.5, color: bodyCol }),
      ...section('Recognition', 290, 860, 464),
      body('Speaker at UX London 2023 — “Designing for financial anxiety”\nShortlisted, Design Week Awards 2022, digital product', 290, 904, 464, {
        font: 'Lato',
        size: 12,
        lh: 1.6,
        list: 'bullet',
        color: bodyCol,
      }),
    ]),
  ], ['resume', 'cv', 'job', 'career']);
}

// ---------------------------------------------------------------------------
// Invitations (5 × 7 in)
// ---------------------------------------------------------------------------
function weddingInvite(): Template {
  const { w, h } = INVITE;
  const sage = '#7C9473';
  const ink = '#3B4234';
  return tpl('tpl-invite-wedding', 'Garden wedding invitation', 'Invitation', w, h, [
    pg('#FAF7F0', [
      outline('rect', 20, 20, w - 40, h - 40, '#C9D3BF', 1.5),
      outline('arch', 140, 46, 200, 120, sage, 1.5),
      icon('leaf', 214, 90, 52, sage, { sw: 1.25 }),
      txt('Together with their families', 40, 196, 400, { font: 'Lora', size: 12, bold: true, ls: 3, upper: true, align: 'center', color: sage, role: 'subheading' }),
      heading('Eleanor\n& James', 40, 230, 400, { font: 'Great Vibes', size: 66, lh: 1.05, align: 'center', color: ink }),
      body('request the pleasure of your company\nat the celebration of their marriage', 40, 386, 400, { font: 'Lora', size: 13, italic: true, lh: 1.6, align: 'center', color: '#5B6352' }),
      rule(200, 456, 80, sage, 1.5),
      subheading('Saturday 14 June 2025', 40, 474, 400, { font: 'Lora', size: 16, bold: true, align: 'center', color: ink }),
      body('at two o’clock in the afternoon', 40, 500, 400, { font: 'Lora', size: 13, align: 'center', color: '#5B6352' }),
      body('Hartwell House Gardens\nAylesbury, Buckinghamshire', 40, 538, 400, { font: 'Lora', size: 13, lh: 1.5, align: 'center', color: '#5B6352' }),
      body('Reception to follow  ·  RSVP by 1 May', 40, 604, 400, { font: 'Lora', size: 11, bold: true, ls: 1, align: 'center', color: sage }),
    ]),
  ], ['wedding', 'invitation', 'elegant', 'botanical']);
}

function birthdayInvite(): Template {
  const { w, h } = INVITE;
  const ink = '#1F1147';
  return tpl('tpl-invite-birthday', 'Birthday party invitation', 'Invitation', w, h, [
    pg('#FFCF56', [
      dot(70, 70, 120, '#FF5A8A'),
      dot(440, 180, 70, '#3DD6D0'),
      dot(470, 700, 100, '#7B5CFF'),
      shp('star', 360, 60, 54, 54, '#FFFFFF', { rotation: 12 }),
      shp('star4', 36, 380, 36, 36, '#FFFFFF'),
      icon('party-popper', 200, 120, 80, ink, { sw: 1.75 }),
      txt('You’re invited to', 40, 222, 400, { font: 'Fredoka', size: 22, bold: true, align: 'center', color: ink, role: 'subheading' }),
      heading('Leo is\nturning 6', 30, 256, 420, { font: 'Bungee', size: 58, lh: 1.05, align: 'center', color: ink }),
      shp('roundRect', 70, 412, 340, 122, '#FFFFFF', { r: 20 }),
      body('Saturday 22 March, 2–5pm\nJungle Jim’s Play Centre\n41 Station Road, Didsbury', 80, 432, 320, { font: 'Fredoka', size: 16, bold: true, lh: 1.6, align: 'center', color: ink }),
      body('Party food, games and cake. Please RSVP to Hannah on 07700 900 562.', 90, 560, 300, { font: 'Nunito', size: 13, bold: true, lh: 1.4, align: 'center', color: ink }),
    ]),
  ], ['birthday', 'party', 'kids', 'invitation']);
}

// ---------------------------------------------------------------------------
// Certificate (11 × 8.5 in landscape)
// ---------------------------------------------------------------------------
function certificate(): Template {
  const { w, h } = CERT;
  const navy = '#14284B';
  const gold = '#B8913A';
  return tpl('tpl-certificate', 'Certificate of completion', 'Certificate', w, h, [
    pg('#FFFDF7', [
      box(0, 0, w, h, 'rgba(0,0,0,0)'),
      outline('rect', 28, 28, w - 56, h - 56, navy, 6),
      outline('rect', 44, 44, w - 88, h - 88, gold, 1.5),
      shp('rightTriangle', 34, h - 214, 180, 180, navy),
      shp('rightTriangle', w - 214, 34, 180, 180, navy, { rotation: 180 }),
      txt('Certificate', 100, 110, w - 200, { font: 'Cinzel', size: 60, bold: true, ls: 6, align: 'center', color: navy, role: 'heading' }),
      txt('of completion', 100, 186, w - 200, { font: 'Cinzel', size: 22, ls: 8, align: 'center', color: gold, role: 'subheading' }),
      body('This certifies that', 100, 270, w - 200, { font: 'Libre Baskerville', size: 18, italic: true, align: 'center', color: '#55607A' }),
      heading('Daniel Okonkwo', 100, 304, w - 200, { font: 'Great Vibes', size: 76, align: 'center', color: navy }),
      rule(278, 410, 500, gold, 1.5),
      body('has successfully completed the twelve-week course\nData Analysis with Python, with distinction', 150, 432, w - 300, {
        font: 'Libre Baskerville',
        size: 17,
        lh: 1.6,
        align: 'center',
        color: '#3A4560',
      }),
      shp('star8', 478, 532, 100, 100, gold, { name: 'Seal' }),
      dot(528, 582, 36, '#D7B866'),
      icon('award', 510, 564, 36, navy, { sw: 1.75 }),
      rule(150, 650, 240, navy, 1),
      subheading('Dr Ruth Abebe', 150, 664, 240, { font: 'Libre Baskerville', size: 15, bold: true, align: 'center', color: navy }),
      body('Course director', 150, 688, 240, { font: 'Libre Baskerville', size: 12, align: 'center', color: '#6B7590' }),
      rule(666, 650, 240, navy, 1),
      subheading('12 December 2025', 666, 664, 240, { font: 'Libre Baskerville', size: 15, bold: true, align: 'center', color: navy }),
      body('Date awarded', 666, 688, 240, { font: 'Libre Baskerville', size: 12, align: 'center', color: '#6B7590' }),
    ]),
  ], ['certificate', 'award', 'education', 'course']);
}

// ---------------------------------------------------------------------------
// Menu (A4)
// ---------------------------------------------------------------------------
function menu(): Template {
  const { w, h } = A4;
  const olive = '#3E4A2C';
  const tomato = '#D2492A';
  const paper = '#F4EEDF';
  const item = (y: number, name: string, desc: string, price: string) => [
    subheading(name, 70, y, 520, { font: 'Playfair Display', size: 20, bold: true, color: olive }),
    body(price, 624, y + 2, 100, { font: 'Playfair Display', size: 19, bold: true, align: 'right', color: tomato }),
    body(desc, 70, y + 30, 520, { font: 'Lato', size: 13, italic: true, lh: 1.45, color: '#6A6450' }),
  ];
  const sectionHead = (y: number, t: string) => [
    txt(t, 70, y, 654, { font: 'Josefin Sans', size: 16, bold: true, ls: 5, upper: true, color: tomato, role: 'subheading' }),
    rule(70, y + 30, 654, '#D8CDB0', 1.5),
  ];
  return tpl('tpl-menu', 'Trattoria menu', 'Menu', w, h, [
    pg(paper, [
      box(0, 0, w, 210, olive),
      shp('semicircle', 337, 150, 120, 60, paper),
      icon('utensils', 379, 160, 36, olive, { sw: 1.75 }),
      heading('Trattoria Lucia', 40, 56, w - 80, { font: 'Playfair Display', size: 52, bold: true, italic: true, align: 'center', color: paper }),
      txt('Cucina di casa  ·  since 1987', 40, 124, w - 80, { font: 'Josefin Sans', size: 14, bold: true, ls: 4, upper: true, align: 'center', color: '#C9D1A8', role: 'subheading' }),
      ...sectionHead(250, 'Antipasti'),
      ...item(298, 'Burrata e pomodori', 'Creamy burrata, heritage tomatoes, basil oil, sourdough', '£11'),
      ...item(372, 'Arancini al ragù', 'Crisp risotto balls filled with slow-cooked beef ragù', '£8'),
      ...sectionHead(460, 'Primi'),
      ...item(508, 'Tagliatelle al tartufo', 'Fresh egg pasta, black truffle, butter and parmesan', '£18'),
      ...item(582, 'Cacio e pepe', 'Tonnarelli, pecorino romano, toasted black pepper', '£14'),
      ...item(656, 'Risotto ai funghi', 'Carnaroli rice, wild mushrooms, thyme, aged parmesan', '£16'),
      ...sectionHead(744, 'Dolci'),
      ...item(792, 'Tiramisù della nonna', 'Savoiardi, espresso, mascarpone and cocoa', '£7'),
      ...item(866, 'Panna cotta', 'Vanilla cream, roasted strawberries, basil', '£7'),
      box(70, 980, 654, 80, '#E9E0C8'),
      body('Please tell us about any allergies. A discretionary 12.5% service charge is added to tables of six or more.', 100, 994, 594, {
        font: 'Lato',
        size: 12,
        lh: 1.5,
        align: 'center',
        color: olive,
      }),
    ]),
  ], ['menu', 'restaurant', 'food', 'italian']);
}

export const PRINT_TEMPLATES: Template[] = [
  jazzPoster(),
  runFlyer(),
  plantFlyer(),
  cardArchitect(),
  cardBakery(),
  resume(),
  weddingInvite(),
  birthdayInvite(),
  certificate(),
  menu(),
];

