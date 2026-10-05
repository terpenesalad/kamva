import type { Template } from '../../types';
import { SOCIAL_TEMPLATES } from './social';
import { PRESENTATION_TEMPLATES } from './presentations';
import { PRINT_TEMPLATES } from './print';
import { BRAND_TEMPLATES } from './brand';

/** Display order of template categories */
export const TEMPLATE_CATEGORIES: string[] = [
  'Instagram post',
  'Instagram story',
  'Presentation',
  'Video',
  'YouTube thumbnail',
  'Facebook post',
  'Poster',
  'Flyer',
  'Business card',
  'Resume',
  'Invitation',
  'Logo',
  'Certificate',
  'Menu',
  'Quote',
];

const order = (c: string) => {
  const i = TEMPLATE_CATEGORIES.indexOf(c);
  return i < 0 ? TEMPLATE_CATEGORIES.length : i;
};

export const BUILT_IN_TEMPLATES: Template[] = [...SOCIAL_TEMPLATES, ...PRESENTATION_TEMPLATES, ...PRINT_TEMPLATES, ...BRAND_TEMPLATES].sort(
  (a, b) => order(a.category) - order(b.category),
);

/** Case-insensitive match on name, category and tags */
export function templateMatches(t: Template, q: string): boolean {
  const s = q.trim().toLowerCase();
  if (!s) return true;
  const hay = [t.name, t.category, ...(t.tags || [])].join(' ').toLowerCase();
  return s.split(/\s+/).every((w) => hay.includes(w));
}

/** Is this template animated (any page transition or element animation)? */
export function templateIsAnimated(t: Template): boolean {
  return t.pages.some(
    (p) => (p.transition && p.transition.type !== 'none') || p.elements.some((e) => e.animation && (e.animation.enter !== 'none' || e.animation.loop !== 'none')),
  );
}
