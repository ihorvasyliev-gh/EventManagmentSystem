/**
 * Category accent colours as RGB triples, matching the cat-* scales in tailwind.config.js used in
 * the calendar UI (600 shade for text/accents, 100 shade for tinted backgrounds). Used by the PDF digest.
 * They keep the familiar hues, toned down to sit with corkcitypartnership.ie's raspberry and green.
 */
export type Rgb = [number, number, number];

export interface CategoryRgb {
  accent: Rgb;
  tint: Rgb;
}

const NEUTRAL: CategoryRgb = { accent: [115, 115, 115], tint: [243, 243, 243] };

export const CATEGORY_RGB: Record<string, CategoryRgb> = {
  'Enterprise & Employment': { accent: [61, 107, 153], tint: [226, 233, 240] },
  'Community & Family': { accent: [77, 130, 73], tint: [228, 236, 228] },
  'Education & Training': { accent: [116, 87, 160], tint: [234, 230, 241] },
  'Special Visits & Celebrations': { accent: [168, 117, 35], tint: [242, 234, 222] },
  'Public Information Session': { accent: [46, 130, 130], tint: [224, 236, 236] },
  'Health & Wellbeing': { accent: [169, 80, 111], tint: [242, 229, 233] },
  Other: NEUTRAL,
};

export const getCategoryRgb = (category?: string): CategoryRgb =>
  (category && CATEGORY_RGB[category]) || NEUTRAL;
