import { supabase } from '../lib/supabase';
import { EventCategoryItem } from '../types';

/**
 * Получить все категории событий
 */
export const getCategories = async (): Promise<EventCategoryItem[]> => {
  const { data, error } = await supabase
    .from('event_categories')
    .select('*')
    .order('name', { ascending: true });

  if (error) {
    console.error('Error fetching categories:', error);
    throw new Error(error.message || 'Failed to fetch categories');
  }

  if (!data || data.length === 0) {
    return [];
  }

  return data.map((cat: any) => ({
    id: cat.id,
    name: cat.name,
    createdAt: new Date(cat.created_at),
    createdBy: cat.created_by || undefined
  }));
};

/**
 * Создать новую категорию
 */
export const createCategory = async (name: string, userId: string): Promise<EventCategoryItem> => {
  // Проверяем, не существует ли уже категория с таким именем
  const { data: existing } = await supabase
    .from('event_categories')
    .select('id')
    .eq('name', name.trim())
    .single();

  if (existing) {
    throw new Error('Category with this name already exists');
  }

  const { data, error } = await supabase
    .from('event_categories')
    .insert({
      name: name.trim(),
      created_by: userId
    })
    .select()
    .single();

  if (error || !data) {
    console.error('Error creating category:', error);
    throw new Error(error?.message || 'Failed to create category');
  }

  return {
    id: data.id,
    name: data.name,
    createdAt: new Date(data.created_at),
    createdBy: data.created_by || undefined
  };
};

/**
 * Удалить категорию (только для админов)
 */
export const deleteCategory = async (id: string): Promise<void> => {
  const { error } = await supabase
    .from('event_categories')
    .delete()
    .eq('id', id);

  if (error) {
    console.error('Error deleting category:', error);
    throw new Error(error.message || 'Failed to delete category');
  }
};
