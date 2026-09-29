/**
 * Category accent colours as RGB triples, matching the Tailwind palette used in the calendar UI
 * (600 shade for text/accents, 100 shade for tinted backgrounds). Used by the PDF digest.
 */
export type Rgb = [number, number, number];

export interface CategoryRgb {
  accent: Rgb;
  tint: Rgb;
}

const SLATE: CategoryRgb = { accent: [100, 116, 139], tint: [241, 245, 249] };

export const CATEGORY_RGB: Record<string, CategoryRgb> = {
  'Enterprise & Employment': { accent: [37, 99, 235], tint: [219, 234, 254] },
  'Community & Family': { accent: [5, 150, 105], tint: [209, 250, 229] },
  'Education & Training': { accent: [147, 51, 234], tint: [243, 232, 255] },
  'Special Visits & Celebrations': { accent: [217, 119, 6], tint: [254, 243, 199] },
  'Public Information Session': { accent: [8, 145, 178], tint: [207, 250, 254] },
  'Health & Wellbeing': { accent: [225, 29, 72], tint: [255, 228, 230] },
  Other: SLATE,
};

export const getCategoryRgb = (category?: string): CategoryRgb =>
  (category && CATEGORY_RGB[category]) || SLATE;
