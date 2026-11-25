import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import {
  DEFAULT_CATEGORIES,
  mergeCategories,
  setCustomCategories,
  type CategoryDefinition
} from '../constants/categories';
import {
  createCategory,
  deleteCategory,
  fetchCategories,
  readCachedCustomCategories,
  updateCategory,
  type NewCategoryInput,
  type UpdateCategoryInput
} from '../services/categoryService';

interface CategoriesContextValue {
  /** All active categories: standard CCP categories + admin-added custom ones (with "Other" last) */
  categories: readonly CategoryDefinition[];
  /** Custom categories added by admins */
  customCategories: readonly CategoryDefinition[];
  /** Whether the initial fetch from /api/categories is still in flight */
  isLoading: boolean;
  /** Re-fetch categories from the server */
  refreshCategories: () => Promise<void>;
  /** Admin only: create a custom category and update the app immediately */
  addCategory: (input: NewCategoryInput) => Promise<CategoryDefinition>;
  /** Admin only: update a custom category's icon, colour or short label */
  editCategory: (name: string, patch: UpdateCategoryInput) => Promise<CategoryDefinition>;
  /** Admin only: remove a custom category */
  removeCategory: (name: string) => Promise<void>;
}

const DEFAULT_VALUE: CategoriesContextValue = {
  categories: DEFAULT_CATEGORIES,
  customCategories: [],
  isLoading: false,
  refreshCategories: async () => undefined,
  addCategory: async () => {
    throw new Error('CategoriesProvider is missing');
  },
  editCategory: async () => {
    throw new Error('CategoriesProvider is missing');
  },
  removeCategory: async () => {
    throw new Error('CategoriesProvider is missing');
  }
};

const CategoriesContext = createContext<CategoriesContextValue>(DEFAULT_VALUE);

export const CategoriesProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [customCategories, setCustomState] = useState<CategoryDefinition[]>(() => {
    const cached = readCachedCustomCategories();
    setCustomCategories(cached);
    return cached;
  });
  const [isLoading, setIsLoading] = useState(true);

  const applyCustom = useCallback((next: CategoryDefinition[]) => {
    setCustomCategories(next);
    setCustomState(next);
  }, []);

  const refreshCategories = useCallback(async () => {
    try {
      const snap = await fetchCategories();
      applyCustom(snap.custom);
    } catch {
      // Offline or local dev without Functions: keep cached/default categories silently
    } finally {
      setIsLoading(false);
    }
  }, [applyCustom]);

  useEffect(() => {
    void refreshCategories();
  }, [refreshCategories]);

  const addCategory = useCallback(async (input: NewCategoryInput) => {
    const res = await createCategory(input);
    applyCustom(res.custom);
    return res.category;
  }, [applyCustom]);

  const editCategory = useCallback(async (name: string, patch: UpdateCategoryInput) => {
    const res = await updateCategory(name, patch);
    applyCustom(res.custom);
    return res.category;
  }, [applyCustom]);

  const removeCategory = useCallback(async (name: string) => {
    const res = await deleteCategory(name);
    applyCustom(res.custom);
  }, [applyCustom]);

  const categories = useMemo(() => mergeCategories(customCategories), [customCategories]);

  const value = useMemo<CategoriesContextValue>(() => ({
    categories,
    customCategories,
    isLoading,
    refreshCategories,
    addCategory,
    editCategory,
    removeCategory
  }), [categories, customCategories, isLoading, refreshCategories, addCategory, editCategory, removeCategory]);

  return <CategoriesContext.Provider value={value}>{children}</CategoriesContext.Provider>;
};

export const useCategories = (): CategoriesContextValue => useContext(CategoriesContext);
