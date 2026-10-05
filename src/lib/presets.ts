import type { Unit } from '../types';
import { toPx } from './units';

export interface DesignPreset {
  id: string;
  name: string;
  category: string;
  /** px at 96 dpi */
  width: number;
  height: number;
  unit: Unit;
  description?: string;
}

export const PRESET_CATEGORIES = ['Social', 'Video', 'Presentation', 'Print', 'Other'] as const;

const px = (id: string, name: string, category: string, width: number, height: number, description?: string): DesignPreset => ({
  id,
  name,
  category,
  width,
  height,
  unit: 'px',
  description,
});

const print = (id: string, name: string, w: number, h: number, unit: Unit, description?: string): DesignPreset => ({
  id,
  name,
  category: 'Print',
  width: Math.round(toPx(w, unit)),
  height: Math.round(toPx(h, unit)),
  unit,
  description,
});

export const DESIGN_PRESETS: DesignPreset[] = [
  // Social
  px('instagram-post', 'Instagram post', 'Social', 1080, 1080, 'Square feed post'),
  px('instagram-story', 'Instagram story', 'Social', 1080, 1920, 'Stories and reels cover'),
  px('instagram-portrait', 'Instagram portrait', 'Social', 1080, 1350, '4:5 feed post'),
  px('facebook-post', 'Facebook post', 'Social', 1200, 630, 'Link and feed image'),
  px('facebook-cover', 'Facebook cover', 'Social', 1640, 624, 'Page cover photo'),
  px('x-post', 'X post', 'Social', 1600, 900, '16:9 post image'),
  px('linkedin-post', 'LinkedIn post', 'Social', 1200, 1200, 'Square feed post'),
  px('pinterest-pin', 'Pinterest pin', 'Social', 1000, 1500, '2:3 pin'),
  px('youtube-thumbnail', 'YouTube thumbnail', 'Social', 1280, 720, 'Video thumbnail'),
  px('youtube-banner', 'YouTube banner', 'Social', 2560, 1440, 'Channel art'),
  px('tiktok-video', 'TikTok video', 'Social', 1080, 1920, 'Vertical video'),

  // Video
  px('video-1080p', 'Video 1080p', 'Video', 1920, 1080, 'Full HD, 16:9'),
  px('video-4k', 'Video 4K', 'Video', 3840, 2160, 'Ultra HD, 16:9'),
  px('video-square', 'Square video', 'Video', 1080, 1080, '1:1 for feeds'),
  px('video-vertical', 'Vertical video', 'Video', 1080, 1920, '9:16 for reels and shorts'),

  // Presentation
  px('presentation-16-9', 'Presentation 16:9', 'Presentation', 1920, 1080, 'Widescreen slides'),
  px('presentation-4-3', 'Presentation 4:3', 'Presentation', 1024, 768, 'Standard slides'),

  // Print
  print('a4', 'A4', 210, 297, 'mm', 'Documents and flyers'),
  print('a5', 'A5', 148, 210, 'mm', 'Booklets and notes'),
  print('a3', 'A3', 297, 420, 'mm', 'Small posters'),
  print('us-letter', 'US Letter', 8.5, 11, 'in', 'Documents'),
  print('poster', 'Poster', 18, 24, 'in', 'Wall poster'),
  print('flyer', 'Flyer', 8.5, 11, 'in', 'US Letter flyer'),
  print('business-card', 'Business card', 3.5, 2, 'in', 'Standard US card'),
  print('postcard', 'Postcard', 6, 4, 'in', 'Landscape postcard'),
  print('invitation', 'Invitation', 5, 7, 'in', 'Party and wedding cards'),
  print('certificate', 'Certificate', 11, 8.5, 'in', 'Landscape letter'),

  // Other
  px('logo', 'Logo', 'Other', 500, 500, 'Square mark'),
  px('desktop-wallpaper', 'Desktop wallpaper', 'Other', 1920, 1080, 'Full HD screen'),
  px('phone-wallpaper', 'Phone wallpaper', 'Other', 1080, 2340, 'Modern phone screen'),
  px('email-header', 'Email header', 'Other', 600, 200, 'Newsletter banner'),
  px('web-banner', 'Web banner', 'Other', 728, 90, 'Leaderboard ad'),
];

/** Featured presets shown first on the Home screen */
export const FEATURED_PRESET_IDS = [
  'instagram-post',
  'instagram-story',
  'presentation-16-9',
  'video-1080p',
  'youtube-thumbnail',
  'a4',
  'poster',
  'business-card',
  'logo',
];

export function presetById(id: string) {
  return DESIGN_PRESETS.find((p) => p.id === id);
}
