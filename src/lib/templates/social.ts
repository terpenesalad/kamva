// Social media templates: Instagram posts and stories, Facebook, YouTube and quote cards.
import type { Template } from '../../types';
import { body, box, dot, frame, heading, icon, lin, oval, outline, pg, rule, shp, subheading, tpl, txt } from './kit';

// ---------------------------------------------------------------------------
// Instagram posts (1080 × 1080)
// ---------------------------------------------------------------------------
function instaSale(): Template {
  const plum = '#3A1C4A';
  const cream = '#FFF4EC';
  return tpl('tpl-insta-sale', 'Summer sale', 'Instagram post', 1080, 1080, [
    pg('#FF6B3D', [
      dot(790, 560, 300, plum, { name: 'Backdrop circle' }),
      frame(530, 300, 520, 520, 'ellipse', { name: 'Product photo' }),
      shp('star4', 470, 196, 60, 60, cream),
      shp('star4', 990, 230, 40, 40, plum),
      shp('roundRect', 72, 72, 290, 56, plum, { r: 28, text: 'The summer edit', textStyle: { font: 'Space Grotesk', size: 24, color: '#FFE3D3' } }),
      subheading('Up to', 72, 186, 400, { font: 'Space Grotesk', size: 48, bold: true, color: plum }),
      heading('50%\noff', 64, 250, 470, { font: 'Archivo Black', size: 190, lh: 0.9, color: cream }),
      body('Linen shirts, sandals and everything for long weekends away.', 72, 650, 400, { font: 'Inter', size: 30, lh: 1.35, color: plum }),
      shp('roundRect', 72, 830, 290, 84, plum, { r: 42, text: 'Shop the sale', textStyle: { font: 'Space Grotesk', size: 30, color: '#FFE3D3' } }),
      shp('burst', 850, 770, 180, 180, '#E3D4FF', { rotation: 12, text: 'From\n$19', textStyle: { font: 'Space Grotesk', size: 34, color: plum } }),
      body('Juniper & Co.  ·  juniperandco.com', 72, 990, 700, { font: 'Inter', size: 24, bold: true, color: plum }),
    ]),
  ], ['sale', 'fashion', 'discount', 'shop']);
}

function instaQuote(): Template {
  const ink = '#1E1B4B';
  const violet = '#5B4BDB';
  return tpl('tpl-insta-quote', 'Design quote', 'Instagram post', 1080, 1080, [
    pg(lin(135, '#FBE3EC', '#D9E4FF'), [
      oval(-120, -140, 420, 420, 'rgba(255,255,255,0.45)'),
      oval(820, 780, 380, 380, 'rgba(91,75,219,0.12)'),
      shp('roundRect', 110, 110, 860, 860, '#FFFFFF', { r: 40, shadow: { color: '#5B4BDB', blur: 60, offsetY: 24, opacity: 0.18 } }),
      icon('quote', 190, 200, 76, violet, { sw: 1.75 }),
      heading('The details are not the details. They make the design.', 190, 320, 700, { font: 'DM Serif Display', size: 70, lh: 1.15, color: ink }),
      rule(190, 680, 80, violet, 4),
      subheading('Charles Eames', 190, 712, 600, { font: 'Poppins', size: 32, bold: true, color: ink }),
      body('Designer and architect', 190, 760, 600, { font: 'Poppins', size: 24, color: '#6B6A8A' }),
      body('@studio.notes', 190, 860, 400, { font: 'Poppins', size: 22, color: violet, bold: true }),
      dot(860, 878, 8, violet),
      dot(886, 878, 8, '#C9C3F5'),
      dot(834, 878, 8, '#C9C3F5'),
    ]),
  ], ['quote', 'inspiration', 'design']);
}

function instaAnnouncement(): Template {
  const green = '#0F3B2E';
  const mustard = '#F2B33D';
  const paper = '#F6EFD9';
  return tpl('tpl-insta-announcement', 'Shop opening', 'Instagram post', 1080, 1080, [
    pg(green, [
      outline('arch', 590, 160, 420, 640, mustard, 3),
      frame(560, 130, 420, 640, 'arch', { name: 'Shop photo' }),
      txt('Announcement', 80, 150, 420, { font: 'Josefin Sans', size: 24, bold: true, ls: 6, upper: true, color: mustard, role: 'subheading' }),
      heading('We’ve opened\na second\nbookshop.', 80, 200, 460, { font: 'Playfair Display', size: 70, bold: true, lh: 1.08, color: paper }),
      body('Find us at 14 Constitution Street, Leith. New and secondhand books, good coffee and a reading room upstairs.', 80, 470, 420, {
        font: 'Lato',
        size: 26,
        lh: 1.45,
        color: '#CFE0D6',
      }),
      icon('calendar', 80, 728, 34, mustard),
      body('Opening Saturday at 10am', 128, 728, 380, { font: 'Lato', size: 26, bold: true, color: paper }),
      box(0, 930, 1080, 150, mustard),
      subheading('Chapter & Verse Books', 80, 982, 520, { font: 'Playfair Display', size: 36, bold: true, color: green }),
      body('chapterandverse.co.uk', 620, 992, 380, { font: 'Lato', size: 24, bold: true, align: 'right', color: green }),
    ]),
  ], ['announcement', 'opening', 'store', 'books']);
}

function instaTips(): Template {
  const ink = '#121212';
  return tpl('tpl-insta-tips', 'Tips carousel cover', 'Instagram post', 1080, 1080, [
    pg('#FFE94D', [
      dot(900, 900, 380, ink, { name: 'Corner circle' }),
      shp('roundRect', 72, 72, 270, 56, ink, { r: 28, text: 'Deep work series', textStyle: { font: 'Space Grotesk', size: 22, color: '#FFE94D' } }),
      body('1 / 6', 840, 86, 168, { font: 'Space Grotesk', size: 26, bold: true, align: 'right', color: ink }),
      heading('5 habits that\nprotect your\nfocus', 72, 180, 860, { font: 'Space Grotesk', size: 104, bold: true, lh: 1.0, color: ink, ls: -2 }),
      body('A practical guide for people whose days come in short, scattered pieces.', 72, 520, 470, { font: 'Inter', size: 30, lh: 1.4, color: ink }),
      body('Swipe for all five', 640, 700, 380, { font: 'Space Grotesk', size: 36, bold: true, color: '#FFFFFF' }),
      icon('arrow-right', 636, 760, 120, '#FFE94D', { sw: 1.5 }),
      body('@makerdaily', 72, 970, 400, { font: 'Inter', size: 26, bold: true, color: ink }),
    ]),
  ], ['tips', 'carousel', 'productivity', 'education']);
}

function instaEvent(): Template {
  const navy = '#1D2B64';
  const moon = '#FFF1D6';
  return tpl('tpl-insta-event', 'Rooftop cinema', 'Instagram post', 1080, 1080, [
    pg(lin(90, '#1D2B64', '#B85C8A', '#F8CDDA'), [
      dot(840, 230, 130, moon, { opacity: 0.95, name: 'Moon' }),
      shp('star4', 640, 120, 34, 34, '#FFFFFF', { opacity: 0.85 }),
      shp('star4', 980, 420, 26, 26, '#FFFFFF', { opacity: 0.7 }),
      shp('star4', 560, 320, 20, 20, '#FFFFFF', { opacity: 0.6 }),
      txt('Summer screenings', 80, 120, 500, { font: 'Quicksand', size: 28, bold: true, ls: 3, color: 'rgba(255,255,255,0.85)', role: 'subheading' }),
      heading('Rooftop\nCinema', 76, 166, 700, { font: 'Righteous', size: 140, lh: 0.95, color: '#FFFFFF' }),
      body('Classic films under the stars, every Friday in July.', 80, 466, 560, { font: 'Quicksand', size: 34, bold: true, lh: 1.3, color: '#FFFFFF' }),
      shp('roundRect', 80, 630, 620, 270, 'rgba(255,255,255,0.16)', { r: 28 }),
      icon('calendar', 120, 676, 40, '#FFFFFF'),
      body('Every Friday, 5–26 July', 184, 680, 480, { font: 'Quicksand', size: 30, bold: true, color: '#FFFFFF' }),
      icon('clock', 120, 752, 40, '#FFFFFF'),
      body('Doors 8pm · Film at sunset', 184, 756, 480, { font: 'Quicksand', size: 30, bold: true, color: '#FFFFFF' }),
      icon('map-pin', 120, 828, 40, '#FFFFFF'),
      body('Level 9, The Arcade Building', 184, 832, 480, { font: 'Quicksand', size: 30, bold: true, color: '#FFFFFF' }),
      shp('roundRect', 740, 810, 260, 90, moon, { r: 45, text: 'Book tickets', textStyle: { font: 'Quicksand', size: 30, color: navy } }),
      body('£12 per person · Blankets provided', 80, 960, 700, { font: 'Quicksand', size: 26, bold: true, color: navy }),
    ]),
  ], ['event', 'cinema', 'summer', 'night']);
}

// ---------------------------------------------------------------------------
// Instagram stories (1080 × 1920)
// ---------------------------------------------------------------------------
function storyArrivals(): Template {
  const red = '#E63323';
  const ink = '#141414';
  return tpl('tpl-story-arrivals', 'New arrivals story', 'Instagram story', 1080, 1920, [
    pg('#F2F1EE', [
      frame(60, 60, 960, 1180, 'rect', { name: 'Hero photo' }),
      heading('New in', 48, 1060, 1000, { font: 'Bebas Neue', size: 300, lh: 0.9, color: red }),
      subheading('The autumn collection', 64, 1360, 900, { font: 'Cormorant Garamond', size: 72, italic: true, bold: true, color: ink }),
      body('Heavy knits, wool coats and the boots you’ll wear until spring. Forty new pieces, all made in Portugal.', 64, 1470, 820, {
        font: 'Inter',
        size: 32,
        lh: 1.45,
        color: '#4A4A4A',
      }),
      rule(64, 1700, 952, ink, 2),
      body('Shop the collection', 64, 1736, 600, { font: 'Inter', size: 34, bold: true, color: ink }),
      icon('arrow-up-right', 956, 1730, 56, red, { sw: 2.5 }),
      body('Link in bio  ·  @atelier.nord', 64, 1800, 700, { font: 'Inter', size: 26, color: '#6E6E6E' }),
    ]),
  ], ['fashion', 'new', 'collection', 'story']);
}

function storyQA(): Template {
  const violet = '#6C4CF5';
  const ink = '#1C1446';
  return tpl('tpl-story-qa', 'Ask me anything', 'Instagram story', 1080, 1920, [
    pg(lin(160, '#8C6CFF', '#5A3BE0'), [
      dot(160, 260, 220, 'rgba(255,255,255,0.08)'),
      dot(980, 1560, 300, 'rgba(255,255,255,0.08)'),
      shp('star4', 860, 200, 90, 90, '#FFD84D', { rotation: 10 }),
      shp('star4', 150, 1500, 60, 60, '#FFD84D'),
      txt('Friday Q&A', 90, 320, 900, { font: 'Fredoka', size: 44, bold: true, align: 'center', color: '#FFD84D', role: 'subheading' }),
      heading('Ask me\nanything', 90, 400, 900, { font: 'Fredoka', size: 170, bold: true, lh: 0.95, align: 'center', color: '#FFFFFF' }),
      body('About freelancing, pricing, burnout or the tools I use every day.', 140, 760, 800, {
        font: 'Nunito',
        size: 38,
        lh: 1.35,
        align: 'center',
        color: 'rgba(255,255,255,0.9)',
      }),
      shp('roundRect', 120, 960, 840, 420, '#FFFFFF', { r: 48, shadow: { color: '#1C1446', blur: 50, offsetY: 24, opacity: 0.3 } }),
      dot(540, 960, 70, '#FFD84D'),
      icon('message-circle', 500, 920, 80, ink, { sw: 2 }),
      body('Place the question sticker here', 180, 1100, 720, { font: 'Nunito', size: 34, bold: true, align: 'center', color: '#B2A8D6' }),
      shp('roundRect', 200, 1220, 680, 90, '#F1EDFF', { r: 45, text: 'Type something…', textStyle: { font: 'Nunito', size: 30, color: violet } }),
      body('Answers go live Sunday at 6pm', 90, 1500, 900, { font: 'Nunito', size: 32, bold: true, align: 'center', color: '#FFFFFF' }),
      body('@hana.makes', 90, 1760, 900, { font: 'Fredoka', size: 34, bold: true, align: 'center', color: '#FFD84D' }),
    ]),
  ], ['questions', 'q&a', 'engagement', 'story']);
}

function storyRecipe(): Template {
  const green = '#1E5945';
  const peach = '#FFD7C2';
  return tpl('tpl-story-recipe', 'Recipe story', 'Instagram story', 1080, 1920, [
    pg(peach, [
      oval(-200, -260, 1480, 1060, '#FFC3A6'),
      frame(190, 150, 700, 700, 'ellipse', { name: 'Dish photo', border: 14, borderColor: '#FFFFFF' }),
      shp('burst', 760, 680, 220, 220, green, { rotation: -10, text: '20 min', textStyle: { font: 'Poppins', size: 40, color: peach } }),
      txt('Sunday breakfast', 80, 930, 920, { font: 'Poppins', size: 32, bold: true, ls: 4, upper: true, align: 'center', color: '#C2552B', role: 'subheading' }),
      heading('Fluffy buttermilk pancakes', 80, 990, 920, { font: 'Poppins', size: 88, bold: true, lh: 1.05, align: 'center', color: green }),
      shp('roundRect', 80, 1250, 920, 470, '#FFFFFF', { r: 40 }),
      subheading('You’ll need', 140, 1300, 400, { font: 'Poppins', size: 36, bold: true, color: green }),
      body('2 cups flour\n2 tbsp sugar\n2 tsp baking powder\n1 pinch of salt', 140, 1370, 400, { font: 'Poppins', size: 30, lh: 1.6, list: 'bullet', color: '#3B3B3B' }),
      body('2 cups buttermilk\n2 eggs\n3 tbsp melted butter\nMaple syrup to serve', 560, 1370, 420, { font: 'Poppins', size: 30, lh: 1.6, list: 'bullet', color: '#3B3B3B' }),
      body('Full method on the blog  ·  @greenkitchen', 80, 1790, 920, { font: 'Poppins', size: 30, bold: true, align: 'center', color: green }),
    ]),
  ], ['food', 'recipe', 'cooking', 'story']);
}

// ---------------------------------------------------------------------------
// Facebook posts (1200 × 630)
// ---------------------------------------------------------------------------
function fbWebinar(): Template {
  const blue = '#2D5BFF';
  const ink = '#0E1B3D';
  return tpl('tpl-fb-webinar', 'Webinar promo', 'Facebook post', 1200, 630, [
    pg('#F3F6FB', [
      box(780, 0, 420, 630, blue),
      dot(1150, 70, 120, 'rgba(255,255,255,0.12)'),
      frame(810, 135, 360, 360, 'ellipse', { name: 'Speaker photo', border: 10, borderColor: '#FFFFFF' }),
      shp('roundRect', 830, 520, 320, 64, '#FFFFFF', { r: 32, text: 'Priya Raman, coach', textStyle: { font: 'Montserrat', size: 20, color: ink } }),
      shp('roundRect', 64, 64, 210, 48, '#DDE5FF', { r: 24, text: 'Free webinar', textStyle: { font: 'Montserrat', size: 20, color: blue } }),
      heading('How to price your freelance work', 64, 140, 660, { font: 'Montserrat', size: 58, bold: true, lh: 1.1, color: ink }),
      body('A one-hour live session on day rates, value pricing and saying no to bad-fit projects.', 64, 300, 620, { font: 'Inter', size: 22, lh: 1.5, color: '#4A5677' }),
      icon('calendar', 64, 422, 30, blue),
      body('Thursday 14 March', 104, 424, 260, { font: 'Inter', size: 22, bold: true, color: ink }),
      icon('clock', 380, 422, 30, blue),
      body('6:00pm GMT', 420, 424, 240, { font: 'Inter', size: 22, bold: true, color: ink }),
      shp('roundRect', 64, 500, 250, 66, blue, { r: 12, text: 'Save your seat', textStyle: { font: 'Montserrat', size: 22, color: '#FFFFFF' } }),
      body('Limited to 200 places', 336, 521, 300, { font: 'Inter', size: 20, color: '#6B7699' }),
    ]),
  ], ['webinar', 'event', 'business', 'online']);
}

function fbHiring(): Template {
  const coral = '#FF6B4A';
  const ink = '#2A0E07';
  return tpl('tpl-fb-hiring', 'We’re hiring', 'Facebook post', 1200, 630, [
    pg(coral, [
      shp('blob2', 760, 60, 480, 480, '#FFB199', { opacity: 0.6 }),
      shp('roundRect', 780, 130, 340, 340, '#FFFFFF', { r: 24, rotation: 4, shadow: { blur: 40, offsetY: 20, opacity: 0.2, color: ink } }),
      subheading('Open roles', 820, 172, 260, { font: 'Montserrat', size: 26, bold: true, color: ink, rotation: 4 }),
      body('Senior product designer\nFrontend engineer\nCustomer success lead\nData analyst', 820, 236, 280, {
        font: 'Montserrat',
        size: 21,
        lh: 2.1,
        list: 'bullet',
        color: ink,
        rotation: 4,
      }),
      txt('Join the team', 64, 76, 600, { font: 'Montserrat', size: 26, bold: true, ls: 3, upper: true, color: ink, role: 'subheading' }),
      heading('We’re\nhiring.', 58, 120, 660, { font: 'Montserrat', size: 150, bold: true, lh: 0.92, color: '#FFFFFF', ls: -4 }),
      body('Remote-first across Europe. Four-day weeks, real equity and a team that writes things down.', 64, 420, 620, { font: 'Inter', size: 24, lh: 1.45, color: ink }),
      icon('arrow-right', 64, 532, 36, ink, { sw: 2.5 }),
      body('lumenhq.com/careers', 112, 534, 400, { font: 'Inter', size: 24, bold: true, color: ink }),
    ]),
  ], ['hiring', 'jobs', 'careers', 'team']);
}

// ---------------------------------------------------------------------------
// YouTube thumbnails (1280 × 720)
// ---------------------------------------------------------------------------
function ytReview(): Template {
  const yellow = '#FFD60A';
  return tpl('tpl-yt-review', 'Tech review thumbnail', 'YouTube thumbnail', 1280, 720, [
    pg('#101010', [
      box(0, 0, 720, 720, yellow),
      shp('parallelogram', 600, 0, 240, 720, yellow),
      frame(700, 0, 580, 720, 'rect', { name: 'Your face' }),
      heading('I tested\nevery $50\nmic', 52, 60, 700, {
        font: 'Anton',
        size: 150,
        lh: 0.98,
        upper: true,
        color: '#101010',
      }),
      shp('roundRect', 56, 560, 360, 96, '#E8202A', { r: 14, rotation: -3, text: 'Only one wins', textStyle: { font: 'Anton', size: 46, color: '#FFFFFF', bold: false } }),
      shp('arrowRight', 520, 450, 220, 140, '#E8202A', { rotation: -20, shadow: { blur: 16, offsetY: 6, opacity: 0.4 } }),
      shp('roundRect', 1060, 600, 180, 70, '#101010', { r: 12, text: '7 mics', textStyle: { font: 'Anton', size: 36, color: yellow, bold: false } }),
    ]),
  ], ['youtube', 'review', 'tech', 'thumbnail']);
}

function ytTravel(): Template {
  return tpl('tpl-yt-travel', 'Travel vlog thumbnail', 'YouTube thumbnail', 1280, 720, [
    pg('#0E5E6F', [
      frame(0, 0, 1280, 720, 'rect', { name: 'Background photo' }),
      box(0, 0, 1280, 720, lin(0, 'rgba(6,40,48,0.85)', 'rgba(6,40,48,0.2)', 'rgba(6,40,48,0)')),
      shp('roundRect', 64, 70, 300, 64, '#FFC93C', { r: 32, text: 'Portugal vlog', textStyle: { font: 'Poppins', size: 28, color: '#0E3A44' } }),
      heading('48 hours\nin Lisbon', 58, 160, 760, {
        font: 'Poppins',
        size: 130,
        bold: true,
        lh: 0.98,
        color: '#FFFFFF',
        effect: { type: 'lift', size: 8 },
      }),
      subheading('on €150', 64, 440, 520, { font: 'Permanent Marker', size: 96, color: '#FFC93C', rotation: -4 }),
      shp('roundRect', 64, 600, 340, 60, 'rgba(255,255,255,0.92)', { r: 30, text: 'Food · Trams · Views', textStyle: { font: 'Poppins', size: 20, color: '#0E3A44' } }),
    ]),
  ], ['youtube', 'travel', 'vlog', 'thumbnail']);
}

// ---------------------------------------------------------------------------
// Quote cards
// ---------------------------------------------------------------------------
function quoteBold(): Template {
  const teal = '#0E7C66';
  const lime = '#C8F169';
  return tpl('tpl-quote-bold', 'Bold quote', 'Quote', 1080, 1350, [
    pg(teal, [
      shp('semicircle', 640, 1150, 560, 280, '#0A6655'),
      dot(940, 210, 70, lime),
      txt('“', 70, 60, 300, { font: 'Abril Fatface', size: 360, lh: 1, color: lime, role: 'heading' }),
      heading('You can’t use up creativity. The more you use, the more you have.', 90, 440, 900, {
        font: 'Abril Fatface',
        size: 84,
        lh: 1.12,
        color: '#FFFFFF',
      }),
      rule(90, 1020, 120, lime, 6),
      subheading('Maya Angelou', 90, 1056, 700, { font: 'Josefin Sans', size: 40, bold: true, ls: 2, color: '#FFFFFF' }),
      body('Poet and memoirist', 90, 1112, 700, { font: 'Josefin Sans', size: 28, color: 'rgba(255,255,255,0.72)' }),
    ]),
  ], ['quote', 'creativity', 'inspiration']);
}

function quoteSunrise(): Template {
  const ink = '#3A2E5C';
  return tpl('tpl-quote-sunrise', 'Sunrise quote', 'Quote', 1080, 1080, [
    pg(lin(90, '#FFE1C6', '#FFC1B6', '#E7B8E8'), [
      dot(540, 780, 230, lin(90, '#FFB347', '#FF7A59'), { name: 'Sun' }),
      shp('triangle', -120, 700, 760, 420, '#B58AC9', { name: 'Far hill' }),
      shp('triangle', 420, 640, 820, 480, '#8C6BB1', { name: 'Mountain' }),
      box(0, 960, 1080, 120, '#6F4F9A'),
      heading('The journey of a thousand miles begins with a single step.', 130, 150, 820, {
        font: 'Lora',
        size: 64,
        italic: true,
        bold: true,
        lh: 1.25,
        align: 'center',
        color: ink,
      }),
      rule(500, 470, 80, ink, 3),
      subheading('Lao Tzu', 130, 500, 820, { font: 'Raleway', size: 30, bold: true, ls: 6, upper: true, align: 'center', color: ink }),
      body('@morningpages', 130, 1004, 820, { font: 'Raleway', size: 26, bold: true, align: 'center', color: '#F6E7FF' }),
    ]),
  ], ['quote', 'motivation', 'calm']);
}

export const SOCIAL_TEMPLATES: Template[] = [
  instaSale(),
  instaQuote(),
  instaAnnouncement(),
  instaTips(),
  instaEvent(),
  storyArrivals(),
  storyQA(),
  storyRecipe(),
  fbWebinar(),
  fbHiring(),
  ytReview(),
  ytTravel(),
  quoteBold(),
  quoteSunrise(),
];
