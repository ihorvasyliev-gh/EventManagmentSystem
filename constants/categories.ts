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
