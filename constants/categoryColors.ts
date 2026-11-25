/**
 * Category accent colours as RGB triples, matching the cat-* scales in tailwind.config.js used in
 * the calendar UI (600 shade for text/accents, 100 shade for tinted backgrounds). Used by the PDF digest.
 * They keep the familiar hues, toned down to sit with corkcitypartnership.ie's raspberry and green.
 */
import { getCategoryTone, type CategoryTone } from './categories.ts';

export type Rgb = [number, number, number];

export interface CategoryRgb {
  accent: Rgb;
  tint: Rgb;
}

const NEUTRAL: CategoryRgb = { accent: [115, 115, 115], tint: [243, 243, 243] };

export const TONE_RGB: Record<CategoryTone, CategoryRgb> = {
  enterprise: { accent: [61, 107, 153], tint: [226, 233, 240] },
  community: { accent: [77, 130, 73], tint: [228, 236, 228] },
  education: { accent: [116, 87, 160], tint: [234, 230, 241] },
  special: { accent: [168, 117, 35], tint: [242, 234, 222] },
  info: { accent: [46, 130, 130], tint: [224, 236, 236] },
  health: { accent: [169, 80, 111], tint: [242, 229, 233] },
  seminar: { accent: [165, 87, 57], tint: [245, 231, 225] },
  indigo: { accent: [78, 93, 148], tint: [229, 232, 243] },
  olive: { accent: [110, 122, 56], tint: [236, 239, 226] },
  other: NEUTRAL
};

export const CATEGORY_RGB: Record<string, CategoryRgb> = {
  'Enterprise & Employment': TONE_RGB.enterprise,
  'Community & Family': TONE_RGB.community,
  'Education & Training': TONE_RGB.education,
  'Special Visits & Celebrations': TONE_RGB.special,
  'Public Information Session': TONE_RGB.info,
  'Health & Wellbeing': TONE_RGB.health,
  'Seminar/Conference': TONE_RGB.seminar,
  Other: NEUTRAL
};

export const getCategoryRgb = (category?: string): CategoryRgb =>
  category ? TONE_RGB[getCategoryTone(category)] ?? NEUTRAL : NEUTRAL;
