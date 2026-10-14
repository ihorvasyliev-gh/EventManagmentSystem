import { supabase } from '../lib/supabase';
import { type EventCategoryItem } from '../types';

/**
 * Every event category
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
 * Adds a category (admins)
 */
export const createCategory = async (name: string, userId: string): Promise<EventCategoryItem> => {
  // Not if one with this name exists already
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

