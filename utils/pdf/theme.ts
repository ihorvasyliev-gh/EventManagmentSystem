/** The digest's look: corkcitypartnership.ie colours, category shapes, spacing presets */
import { type Rgb } from '../../constants/categoryColors';

// Second cue besides colour for each category (see categoryMark)
export type CategoryShape = 'circle' | 'square' | 'triangle' | 'diamond' | 'triangleDown' | 'hexagon' | 'ring';
export const CATEGORY_SHAPE: Record<string, CategoryShape> = {
  'Enterprise & Employment': 'circle',
  'Community & Family': 'square',
  'Education & Training': 'triangle',
  'Special Visits & Celebrations': 'diamond',
  'Public Information Session': 'triangleDown',
  'Health & Wellbeing': 'hexagon',
  Other: 'ring'
};


// ---------------------------------------------------------------------------
// Palette
// ---------------------------------------------------------------------------

// corkcitypartnership.ie: raspberry and green on white, neutral greys, #222 text
export const BRAND: Rgb = [185, 11, 79];        // #B90B4F raspberry
export const GREEN: Rgb = [96, 156, 92];        // #609C5C green
export const GREEN_DARK: Rgb = [67, 111, 64];   // #436F40 the green for small type
export const INK: Rgb = [34, 34, 34];           // #222222
export const BODY: Rgb = [66, 66, 66];          // #424242
export const MUTED: Rgb = [115, 115, 115];      // #737373
export const FAINT: Rgb = [163, 163, 163];      // #A3A3A3
export const BORDER: Rgb = [230, 230, 230];     // #E6E6E6
export const BG: Rgb = [250, 250, 250];         // #FAFAFA
export const WHITE: Rgb = [255, 255, 255];
export const LINK: Rgb = BRAND;
export const PLACE: Rgb = GREEN_DARK;           // venues (they link to Google Maps)
export const BRAND_TINT: Rgb = [251, 240, 244]; // #FBF0F4
export const BRAND_TINT_BORDER: Rgb = [234, 182, 202]; // #EAB6CA
export const BRAND_LIGHT: Rgb = [232, 169, 194];       // #E8A9C2, the hairline after a label
export const DAY_WITH_EVENTS: Rgb = [243, 243, 243];   // #F3F3F3, the site's grey sections


/**
 * Spacing presets for the executive digest, from roomiest to tightest. The tighter ones
 * are only used when they stop an event from being pushed to the next page for want of
 * a few millimetres, leaving a large empty gap behind it.
 */
export interface Density {
  /** "At a glance" row height (null: by number of weeks) */
  glanceCellH: number | null;
  weekBannerH: number;
  /** Extra space before the first card of a new day */
  dayGap: number;
  cardPadY: number;
  cardGap: number;
  flyerMaxH: number;
}

export const DENSITIES: Density[] = [
  { glanceCellH: null, weekBannerH: 11, dayGap: 2.4, cardPadY: 4.6, cardGap: 3.2, flyerMaxH: 42 },
  { glanceCellH: 10.5, weekBannerH: 10, dayGap: 2, cardPadY: 4.1, cardGap: 2.7, flyerMaxH: 37 },
  { glanceCellH: 10, weekBannerH: 9.5, dayGap: 1.6, cardPadY: 3.7, cardGap: 2.3, flyerMaxH: 32 }
];
