/**
 * Custom categories added by admins, kept in R2 as one small JSON file beside the other metadata
 * (meta/ is never served by /api/file). Without the file, only the standard CCP categories exist.
 */
import type { IssueBucket } from './digestIssues.ts';
import {
  mergeCategories,
  parseStoredCustomCategories,
  type CategoryDefinition
} from '../constants/categories.ts';

export const CATEGORIES_KEY = 'meta/categories.json';

export interface StoredCategories {
  custom: CategoryDefinition[];
  /** When an admin last changed the custom categories, and who (null: none saved yet) */
  updatedAt: string | null;
  updatedBy: string | null;
}

export interface CategoriesPayload extends StoredCategories {
  categories: CategoryDefinition[];
}

export const readCategories = async (bucket?: IssueBucket | null): Promise<StoredCategories> => {
  const empty: StoredCategories = { custom: [], updatedAt: null, updatedBy: null };
  if (!bucket) return empty;
  const object = await bucket.get(CATEGORIES_KEY);
  if (!object) return empty;
  try {
    const data = JSON.parse(await object.text()) as Partial<Record<keyof StoredCategories, unknown>>;
    return {
      custom: parseStoredCustomCategories(data.custom),
      updatedAt: typeof data.updatedAt === 'string' ? data.updatedAt : null,
      updatedBy: typeof data.updatedBy === 'string' ? data.updatedBy : null
    };
  } catch {
    return empty;
  }
};

export const writeCategories = async (bucket: IssueBucket, stored: StoredCategories): Promise<void> => {
  await bucket.put(CATEGORIES_KEY, new Blob([JSON.stringify(stored)]), {
    httpMetadata: { contentType: 'application/json' }
  });
};

export const categoriesResponsePayload = (stored: StoredCategories): CategoriesPayload => ({
  categories: mergeCategories(stored.custom),
  custom: stored.custom,
  updatedAt: stored.updatedAt,
  updatedBy: stored.updatedBy
});
