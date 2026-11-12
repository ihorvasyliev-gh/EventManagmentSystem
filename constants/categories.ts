/**
 * Official Cork City Partnership Event Categories
 * Standardized across Public Submission Form, Admin Edit Modal, Calendar Filters, and PDF Bulletin.
 */

export const EVENT_CATEGORIES = [
  'Enterprise & Employment',
  'Community & Family',
  'Education & Training',
  'Special Visits & Celebrations',
  'Public Information Session',
  'Health & Wellbeing',
  'Other'
] as const;

export type EventCategoryName = (typeof EVENT_CATEGORIES)[number];

/** Short names for tight spots (the calendar's category filter); the full name stays in the tooltip */
export const CATEGORY_SHORT_LABELS: Record<EventCategoryName, string> = {
  'Enterprise & Employment': 'Enterprise',
  'Community & Family': 'Community',
  'Education & Training': 'Education',
  'Special Visits & Celebrations': 'Special visits',
  'Public Information Session': 'Info sessions',
  'Health & Wellbeing': 'Health',
  Other: 'Other'
};

/** The short name of a category; other (older or custom) names as they are */
export const shortCategoryLabel = (category?: string): string =>
  !category ? 'Event' : CATEGORY_SHORT_LABELS[category as EventCategoryName] ?? category;

/**
 * A category's name in an address: "Health & Wellbeing" → "health-wellbeing". Letters and digits
 * only, so a calendar app or a chat that re-encodes the address can't break it the way it can
 * "Health%20%26%20Wellbeing". The full name gives the same key, so older addresses still work.
 */
export const categoryKey = (name: string): string => {
  const plain = name.trim().toLowerCase();
  return plain.replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || plain;
};

/** The official category a key or name stands for, or undefined for any other (older or custom) name */
export const categoryFromKey = (keyOrName: string): EventCategoryName | undefined => {
  const key = categoryKey(keyOrName);
  return EVENT_CATEGORIES.find((c) => categoryKey(c) === key);
};
