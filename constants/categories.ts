/**
 * Cork City Partnership Event Categories
 * Built-in official categories plus support for admin-defined custom categories with icons & colours.
 * Pure TypeScript (no React/DOM imports) so both client and Cloudflare Pages Functions can share it.
 */

export const EVENT_CATEGORIES = [
  'Enterprise & Employment',
  'Community & Family',
  'Education & Training',
  'Special Visits & Celebrations',
  'Public Information Session',
  'Health & Wellbeing',
  'Seminar/Conference',
  'Other'
] as const;

export type EventCategoryName = (typeof EVENT_CATEGORIES)[number];

export const CATEGORY_TONES = [
  'enterprise',
  'community',
  'education',
  'special',
  'info',
  'health',
  'seminar',
  'indigo',
  'olive',
  'other'
] as const;

export type CategoryTone = (typeof CATEGORY_TONES)[number];

export const CATEGORY_ICON_IDS = [
  'briefcase',
  'users',
  'graduation-cap',
  'sparkles',
  'megaphone',
  'heart',
  'presentation',
  'tag',
  'calendar',
  'book-open',
  'music',
  'palette',
  'trophy',
  'leaf',
  'globe',
  'mic',
  'coffee',
  'hand-helping',
  'building-2',
  'lightbulb',
  'star',
  'award',
  'compass',
  'wrench',
  'laptop',
  'bike',
  'baby',
  'handshake',
  'film',
  'utensils'
] as const;

export type CategoryIconId = (typeof CATEGORY_ICON_IDS)[number];

export interface CategoryDefinition {
  name: string;
  shortLabel?: string;
  icon: CategoryIconId;
  color: CategoryTone;
  builtIn?: boolean;
  createdAt?: string;
  createdBy?: string;
}

export const MAX_CATEGORY_NAME = 60;
export const MIN_CATEGORY_NAME = 2;
export const MAX_SHORT_LABEL = 24;
export const MAX_CUSTOM_CATEGORIES = 40;

/** Short names for tight spots (the calendar's category filter); the full name stays in the tooltip */
export const CATEGORY_SHORT_LABELS: Record<EventCategoryName, string> = {
  'Enterprise & Employment': 'Enterprise',
  'Community & Family': 'Community',
  'Education & Training': 'Education',
  'Special Visits & Celebrations': 'Special visits',
  'Public Information Session': 'Info sessions',
  'Health & Wellbeing': 'Health',
  'Seminar/Conference': 'Seminars',
  Other: 'Other'
};

export const DEFAULT_CATEGORIES: readonly CategoryDefinition[] = [
  { name: 'Enterprise & Employment', shortLabel: 'Enterprise', icon: 'briefcase', color: 'enterprise', builtIn: true },
  { name: 'Community & Family', shortLabel: 'Community', icon: 'users', color: 'community', builtIn: true },
  { name: 'Education & Training', shortLabel: 'Education', icon: 'graduation-cap', color: 'education', builtIn: true },
  { name: 'Special Visits & Celebrations', shortLabel: 'Special visits', icon: 'sparkles', color: 'special', builtIn: true },
  { name: 'Public Information Session', shortLabel: 'Info sessions', icon: 'megaphone', color: 'info', builtIn: true },
  { name: 'Health & Wellbeing', shortLabel: 'Health', icon: 'heart', color: 'health', builtIn: true },
  { name: 'Seminar/Conference', shortLabel: 'Seminars', icon: 'presentation', color: 'seminar', builtIn: true },
  { name: 'Other', shortLabel: 'Other', icon: 'tag', color: 'other', builtIn: true }
];

const LEGACY_TONES: Record<string, CategoryTone> = {
  meeting: 'enterprise',
  workshop: 'education',
  social: 'health',
  training: 'community',
  community: 'special',
  celebration: 'special',
  other: 'other'
};

const TONE_SET = new Set<string>(CATEGORY_TONES);
const ICON_SET = new Set<string>(CATEGORY_ICON_IDS);

export const isCategoryTone = (value: unknown): value is CategoryTone =>
  typeof value === 'string' && TONE_SET.has(value);

export const isCategoryIconId = (value: unknown): value is CategoryIconId =>
  typeof value === 'string' && ICON_SET.has(value);

/** Collapses surrounding and repeated whitespace */
export const normalizeCategoryName = (value: string): string =>
  value.trim().replace(/\s+/g, ' ');

/**
 * A category's name in an address: "Health & Wellbeing" → "health-wellbeing". Letters and digits
 * only, so a calendar app or a chat that re-encodes the address can't break it the way it can
 * "Health%20%26%20Wellbeing". The full name gives the same key, so older addresses still work.
 */
export const categoryKey = (name: string): string => {
  const plain = name.trim().toLowerCase();
  return plain.replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || plain;
};

const BUILTIN_KEYS = new Set(DEFAULT_CATEGORIES.map((c) => categoryKey(c.name)));

export const isBuiltInCategory = (name: string): boolean => BUILTIN_KEYS.has(categoryKey(name));

/** Built-in categories (with custom ones inserted right before "Other"), deduplicated by key */
export const mergeCategories = (custom: readonly CategoryDefinition[]): CategoryDefinition[] => {
  const seen = new Set<string>(BUILTIN_KEYS);
  const validCustom: CategoryDefinition[] = [];
  for (const item of custom) {
    const key = categoryKey(item.name);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    validCustom.push({
      name: normalizeCategoryName(item.name),
      ...(item.shortLabel?.trim() ? { shortLabel: normalizeCategoryName(item.shortLabel) } : {}),
      icon: isCategoryIconId(item.icon) ? item.icon : 'tag',
      color: isCategoryTone(item.color) ? item.color : 'other',
      builtIn: false,
      ...(item.createdAt ? { createdAt: item.createdAt } : {}),
      ...(item.createdBy ? { createdBy: item.createdBy } : {})
    });
  }
  const beforeOther = DEFAULT_CATEGORIES.filter((c) => c.name !== 'Other');
  const other = DEFAULT_CATEGORIES.find((c) => c.name === 'Other')!;
  return [...beforeOther, ...validCustom, other];
};

export interface CategoryInputResult {
  ok: true;
  category: CategoryDefinition;
}
export interface CategoryInputError {
  ok: false;
  error: string;
}

/** Validates input when an admin creates a custom category */
export const validateCategoryInput = (
  input: unknown,
  existing: readonly Pick<CategoryDefinition, 'name'>[] = DEFAULT_CATEGORIES
): CategoryInputResult | CategoryInputError => {
  if (!input || typeof input !== 'object') {
    return { ok: false, error: 'Category details are required.' };
  }
  const raw = input as Record<string, unknown>;
  const name = typeof raw.name === 'string' ? normalizeCategoryName(raw.name) : '';
  if (name.length < MIN_CATEGORY_NAME) {
    return { ok: false, error: `Category name must be at least ${MIN_CATEGORY_NAME} characters.` };
  }
  if (name.length > MAX_CATEGORY_NAME) {
    return { ok: false, error: `Category name must be at most ${MAX_CATEGORY_NAME} characters.` };
  }
  const key = categoryKey(name);
  if (!key || !/[\p{L}\p{N}]/u.test(name)) {
    return { ok: false, error: 'Category name must include letters or numbers.' };
  }
  if (existing.some((c) => categoryKey(c.name) === key)) {
    return { ok: false, error: 'A category with that name already exists.' };
  }

  let shortLabel: string | undefined;
  if (raw.shortLabel !== undefined && raw.shortLabel !== null && raw.shortLabel !== '') {
    if (typeof raw.shortLabel !== 'string') {
      return { ok: false, error: 'Short label must be text.' };
    }
    const cleanShort = normalizeCategoryName(raw.shortLabel);
    if (cleanShort.length > MAX_SHORT_LABEL) {
      return { ok: false, error: `Short label must be at most ${MAX_SHORT_LABEL} characters.` };
    }
    if (cleanShort) shortLabel = cleanShort;
  }

  const icon: CategoryIconId = raw.icon === undefined ? 'tag' : isCategoryIconId(raw.icon) ? raw.icon : ('' as CategoryIconId);
  if (!icon) {
    return { ok: false, error: 'Please pick a valid icon.' };
  }

  const color: CategoryTone = raw.color === undefined ? 'indigo' : isCategoryTone(raw.color) ? raw.color : ('' as CategoryTone);
  if (!color) {
    return { ok: false, error: 'Please pick a valid colour.' };
  }

  return {
    ok: true,
    category: {
      name,
      ...(shortLabel ? { shortLabel } : {}),
      icon,
      color,
      builtIn: false
    }
  };
};

/** Validates a patch when an admin updates a custom category's icon, colour or short label */
export const validateCategoryPatch = (
  input: unknown
): { ok: true; patch: { icon?: CategoryIconId; color?: CategoryTone; shortLabel?: string | null } } | CategoryInputError => {
  if (!input || typeof input !== 'object') {
    return { ok: false, error: 'Update details are required.' };
  }
  const raw = input as Record<string, unknown>;
  const patch: { icon?: CategoryIconId; color?: CategoryTone; shortLabel?: string | null } = {};

  if (raw.icon !== undefined) {
    if (!isCategoryIconId(raw.icon)) return { ok: false, error: 'Please pick a valid icon.' };
    patch.icon = raw.icon;
  }
  if (raw.color !== undefined) {
    if (!isCategoryTone(raw.color)) return { ok: false, error: 'Please pick a valid colour.' };
    patch.color = raw.color;
  }
  if (raw.shortLabel !== undefined) {
    if (raw.shortLabel === null || raw.shortLabel === '') {
      patch.shortLabel = null;
    } else if (typeof raw.shortLabel === 'string') {
      const cleanShort = normalizeCategoryName(raw.shortLabel);
      if (cleanShort.length > MAX_SHORT_LABEL) {
        return { ok: false, error: `Short label must be at most ${MAX_SHORT_LABEL} characters.` };
      }
      patch.shortLabel = cleanShort || null;
    } else {
      return { ok: false, error: 'Short label must be text.' };
    }
  }

  if (patch.icon === undefined && patch.color === undefined && patch.shortLabel === undefined) {
    return { ok: false, error: 'Nothing to update.' };
  }
  return { ok: true, patch };
};

/** Sanitizes an untrusted array of custom categories (from R2 or localStorage) */
export const parseStoredCustomCategories = (value: unknown): CategoryDefinition[] => {
  if (!Array.isArray(value)) return [];
  const seen = new Set<string>(BUILTIN_KEYS);
  const out: CategoryDefinition[] = [];
  for (const item of value) {
    if (!item || typeof item !== 'object') continue;
    const raw = item as Record<string, unknown>;
    const name = typeof raw.name === 'string' ? normalizeCategoryName(raw.name) : '';
    if (name.length < MIN_CATEGORY_NAME || name.length > MAX_CATEGORY_NAME || !/[\p{L}\p{N}]/u.test(name)) continue;
    const key = categoryKey(name);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    const shortRaw = typeof raw.shortLabel === 'string' ? normalizeCategoryName(raw.shortLabel) : '';
    const shortLabel = shortRaw && shortRaw.length <= MAX_SHORT_LABEL ? shortRaw : undefined;
    out.push({
      name,
      ...(shortLabel ? { shortLabel } : {}),
      icon: isCategoryIconId(raw.icon) ? raw.icon : 'tag',
      color: isCategoryTone(raw.color) ? raw.color : 'indigo',
      builtIn: false,
      ...(typeof raw.createdAt === 'string' ? { createdAt: raw.createdAt } : {}),
      ...(typeof raw.createdBy === 'string' ? { createdBy: raw.createdBy } : {})
    });
    if (out.length >= MAX_CUSTOM_CATEGORIES) break;
  }
  return out;
};

// ---------------------------------------------------------------------------
// Module-level runtime registry synced by CategoriesContext (used by pure
// styling & PDF helpers without needing React context plumbing everywhere)
// ---------------------------------------------------------------------------

let activeCategories: CategoryDefinition[] = [...DEFAULT_CATEGORIES];
let byKey = new Map<string, CategoryDefinition>(activeCategories.map((c) => [categoryKey(c.name), c]));

export const setCustomCategories = (custom: readonly CategoryDefinition[]): CategoryDefinition[] => {
  activeCategories = mergeCategories(custom);
  byKey = new Map(activeCategories.map((c) => [categoryKey(c.name), c]));
  return activeCategories;
};

export const getAllCategories = (): readonly CategoryDefinition[] => activeCategories;

export const getCategoryDefinition = (category?: string): CategoryDefinition | undefined => {
  if (!category) return undefined;
  return byKey.get(categoryKey(category));
};

export const getCategoryTone = (category?: string): CategoryTone => {
  if (!category) return 'other';
  const def = byKey.get(categoryKey(category));
  if (def) return def.color;
  return LEGACY_TONES[category.trim().toLowerCase()] ?? 'other';
};

export const getCategoryIconId = (category?: string): CategoryIconId => {
  if (!category) return 'tag';
  return byKey.get(categoryKey(category))?.icon ?? 'tag';
};

/** The short name of a category; custom or older names use their shortLabel or full name */
export const shortCategoryLabel = (category?: string): string => {
  if (!category) return 'Event';
  const def = byKey.get(categoryKey(category));
  if (def) return def.shortLabel ?? def.name;
  return CATEGORY_SHORT_LABELS[category as EventCategoryName] ?? category;
};

/** The known category a key or name stands for, or undefined for an unknown name */
export const categoryFromKey = (
  keyOrName: string,
  list?: readonly Pick<CategoryDefinition, 'name'>[]
): string | undefined => {
  const key = categoryKey(keyOrName);
  if (list) return list.find((c) => categoryKey(c.name) === key)?.name;
  return byKey.get(key)?.name;
};
