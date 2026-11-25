import { fetchWithRetry } from '../utils/networkRetry';
import {
  mergeCategories,
  parseStoredCustomCategories,
  type CategoryDefinition,
  type CategoryIconId,
  type CategoryShape,
  type CategoryTone
} from '../constants/categories';

const PATH = '/api/categories';
const CACHE_KEY = 'ccp_custom_categories_v1';

export interface CategoriesSnapshot {
  categories: CategoryDefinition[];
  custom: CategoryDefinition[];
  updatedAt: string | null;
  updatedBy: string | null;
}

export interface NewCategoryInput {
  name: string;
  shortLabel?: string;
  icon: CategoryIconId;
  color: CategoryTone;
  pdfShape?: CategoryShape;
}

export interface UpdateCategoryInput {
  shortLabel?: string | null;
  icon?: CategoryIconId;
  color?: CategoryTone;
  pdfShape?: CategoryShape;
}

export const readCachedCustomCategories = (): CategoryDefinition[] => {
  try {
    return parseStoredCustomCategories(JSON.parse(localStorage.getItem(CACHE_KEY) ?? '[]'));
  } catch {
    return [];
  }
};

export const cacheCustomCategories = (custom: readonly CategoryDefinition[]): void => {
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify(custom));
  } catch {
    // Storage unavailable
  }
};

const toSnapshot = (data: Partial<CategoriesSnapshot>): CategoriesSnapshot => {
  const custom = parseStoredCustomCategories(data.custom);
  cacheCustomCategories(custom);
  return {
    categories: mergeCategories(custom),
    custom,
    updatedAt: typeof data.updatedAt === 'string' ? data.updatedAt : null,
    updatedBy: typeof data.updatedBy === 'string' ? data.updatedBy : null
  };
};

/** Public read (no auth or Supabase import, so /subscribe stays lightweight) */
export const fetchCategories = async (): Promise<CategoriesSnapshot> => {
  const res = await fetchWithRetry(() => fetch(PATH, { headers: { Accept: 'application/json' } }));
  if (!res.ok) throw new Error(`Categories request failed (${res.status})`);
  const data = (await res.json()) as Partial<CategoriesSnapshot>;
  return toSnapshot(data);
};

/** Admin only: add a new category with an icon and colour */
export const createCategory = async (
  input: NewCategoryInput
): Promise<CategoriesSnapshot & { category: CategoryDefinition }> => {
  const { callApi } = await import('./apiClient');
  const data = await callApi<Partial<CategoriesSnapshot> & { category: CategoryDefinition }>(PATH, {
    method: 'POST',
    body: input
  });
  return { ...toSnapshot(data), category: data.category };
};

/** Admin only: update a custom category's icon, colour or short label */
export const updateCategory = async (
  name: string,
  patch: UpdateCategoryInput
): Promise<CategoriesSnapshot & { category: CategoryDefinition }> => {
  const { callApi } = await import('./apiClient');
  const data = await callApi<Partial<CategoriesSnapshot> & { category: CategoryDefinition }>(PATH, {
    method: 'PATCH',
    body: { name, ...patch }
  });
  return { ...toSnapshot(data), category: data.category };
};

/** Admin only: remove a custom category (existing events keep their label) */
export const deleteCategory = async (name: string): Promise<CategoriesSnapshot> => {
  const { callApi } = await import('./apiClient');
  const data = await callApi<Partial<CategoriesSnapshot>>(`${PATH}?name=${encodeURIComponent(name)}`, {
    method: 'DELETE'
  });
  return toSnapshot(data);
};
