import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  console.error('Missing Supabase environment variables:', {
    hasUrl: !!supabaseUrl,
    hasKey: !!supabaseAnonKey
  });
  throw new Error('Missing Supabase environment variables. Please check your .env.local file.');
}

// Проверяем, что URL и ключ не являются placeholder значениями
if (supabaseUrl.includes('your-project') || supabaseAnonKey.includes('your-anon')) {
  console.error('Supabase configuration appears to use placeholder values. Please update your .env.local file.');
  throw new Error('Invalid Supabase configuration. Please check your .env.local file.');
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: true
  }
});
