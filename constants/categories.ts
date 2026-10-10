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
