import { User, UserRole } from '../types';
import { supabase } from '../lib/supabase';
import { cacheUser, clearUserCache } from '../utils/sessionCache';

// Преобразуем данные пользователя из Supabase в наш формат
const mapSupabaseUserToUser = (supabaseUser: any): User => {
  return {
    id: supabaseUser.id,
    email: supabaseUser.email,
    fullName: supabaseUser.full_name || supabaseUser.email,
    role: (supabaseUser.role as UserRole) || UserRole.STAFF
  };
};

// Вспомогательная функция для таймаута запросов с поддержкой отмены
const withTimeout = <T>(promise: Promise<T>, timeoutMs: number = 10000): Promise<T> => {
  let timeoutId: NodeJS.Timeout;
  const timeoutPromise = new Promise<T>((_, reject) => {
    timeoutId = setTimeout(() => {
      reject(new Error('Request timeout. Please check your connection and try again.'));
    }, timeoutMs);
  });

  return Promise.race([
    promise
      .then(result => {
        clearTimeout(timeoutId);
        return result;
      })
      .catch(error => {
        clearTimeout(timeoutId);
        // Если это AbortError, пробрасываем его как есть, но с более понятным сообщением
        if (error?.name === 'AbortError' || error?.message?.includes('aborted')) {
          throw new Error('Request was cancelled. Please try again.');
        }
        throw error;
      }),
    timeoutPromise
  ]);
};

// Регистрация нового пользователя
export const signUp = async (
  email: string,
  password: string,
  fullName: string,
  role: UserRole = UserRole.STAFF
): Promise<User> => {
  try {
    // Регистрация БЕЗ подтверждения почты
    // ВАЖНО: Подтверждение email должно быть отключено в Supabase Dashboard:
    // Authentication → Settings → Email Auth → Confirm email (OFF)
    // Это позволяет пользователям сразу входить после регистрации
    // Если Confirm email = OFF, signUp() автоматически вернет session
    const signUpPromise = supabase.auth.signUp({
      email,
      password,
      options: {
        data: {
          full_name: fullName,
          role: role
        },
        emailRedirectTo: undefined // Не отправляем email для подтверждения
      }
    });

    const { data: authData, error: authError } = await withTimeout(signUpPromise, 10000);

    if (authError) {
      throw new Error(authError.message || 'Failed to sign up');
    }

    if (!authData.user) {
      throw new Error('Failed to create user');
    }

    // Если подтверждение email отключено в Dashboard, authData.session будет создана автоматически
    // Если включено - сессии не будет, но пользователь все равно будет создан

    // Получаем профиль пользователя из public.users
    // Триггер должен был создать запись автоматически, но подождем немного
    await new Promise(resolve => setTimeout(resolve, 500));

    const userQueryPromise = supabase
      .from('users')
      .select('*')
      .eq('id', authData.user.id)
      .single();

    const { data: userData, error: userError } = await withTimeout(userQueryPromise, 10000);

    if (userError || !userData) {
      // Если профиль еще не создан, создаем вручную
      const insertPromise = supabase
        .from('users')
        .insert({
          id: authData.user.id,
          email: authData.user.email!,
          full_name: fullName,
          role: role
        })
        .select()
        .single();

      const { data: newUserData, error: insertError } = await withTimeout(insertPromise, 10000);

      if (insertError || !newUserData) {
        throw new Error(insertError?.message || 'Failed to create user profile');
      }

      const user = mapSupabaseUserToUser(newUserData);
      cacheUser(user);
      return user;
    }

    const user = mapSupabaseUserToUser(userData);
    cacheUser(user);
    return user;
  } catch (error: any) {
    console.error('Sign up error:', error);

    // Обрабатываем AbortError отдельно
    if (error?.name === 'AbortError' || error?.message?.includes('aborted') || error?.message?.includes('cancelled')) {
      throw new Error('Request was cancelled. Please try again.');
    }

    // Обрабатываем таймауты
    if (error?.message?.includes('timeout')) {
      throw new Error('Request timed out. Please check your connection and try again.');
    }

    throw new Error(error.message || 'Registration failed. Please check your connection and try again.');
  }
};

// Вход пользователя
export const login = async (email: string, password: string): Promise<User> => {
  try {
    // Добавляем таймаут для запроса аутентификации
    const authPromise = supabase.auth.signInWithPassword({
      email,
      password
    });

    const { data: authData, error: authError } = await withTimeout(authPromise, 10000);

    if (authError) {
      // Улучшенная обработка ошибок с более понятными сообщениями
      let errorMessage = authError.message || 'Invalid email or password';

      // Парсим специфичные ошибки Supabase
      if (authError.status === 400) {
        if (authError.message?.includes('Invalid login credentials') ||
          authError.message?.includes('Email not confirmed')) {
          errorMessage = 'Invalid email or password. Please check your credentials or confirm your email.';
        } else if (authError.message?.includes('Email not confirmed')) {
          errorMessage = 'Please confirm your email address before signing in. Check your inbox for a confirmation email.';
        } else if (authError.message?.includes('User not found')) {
          errorMessage = 'User not found. Please sign up first or contact your administrator.';
        } else {
          errorMessage = `Authentication failed: ${authError.message}. Please check your credentials or contact support.`;
        }
      } else if (authError.status === 429) {
        errorMessage = 'Too many login attempts. Please wait a moment and try again.';
      }

      throw new Error(errorMessage);
    }

    if (!authData.user) {
      throw new Error('Failed to sign in. Please try again.');
    }

    // Проверяем, подтвержден ли email (если требуется)
    // ВАЖНО: Если в Supabase Dashboard отключено подтверждение email, 
    // эта проверка может блокировать вход. Комментируем её, если подтверждение отключено.
    // if (authData.user.email_confirmed_at === null) {
    //   throw new Error('Please confirm your email address before signing in. Check your inbox for a confirmation email.');
    // }

    // Получаем профиль пользователя из public.users с таймаутом
    const userQueryPromise = supabase
      .from('users')
      .select('*')
      .eq('id', authData.user.id)
      .single();

    const { data: userData, error: userError } = await withTimeout(userQueryPromise, 10000);

    if (userError) {
      console.error('Error fetching user profile:', userError);
      throw new Error(`User profile not found: ${userError.message}. Please contact administrator.`);
    }

    if (!userData) {
      throw new Error('User profile not found. Please contact administrator.');
    }

    const user = mapSupabaseUserToUser(userData);
    // Кэшируем пользователя для быстрого восстановления сессии
    cacheUser(user);
    return user;
  } catch (error: any) {
    // Логируем ошибку для отладки
    console.error('Login error:', error);

    // Обрабатываем AbortError отдельно
    if (error?.name === 'AbortError' || error?.message?.includes('aborted') || error?.message?.includes('cancelled')) {
      throw new Error('Request was cancelled. Please try again.');
    }

    // Если это уже наша ошибка (таймаут или другая обработанная), просто пробрасываем её
    if (error.message && (error.message.includes('timeout') || error.message.includes('Request was cancelled'))) {
      throw error;
    }

    // Для других ошибок пробрасываем с понятным сообщением
    throw new Error(error.message || 'Login failed. Please check your connection and try again.');
  }
};

// Выход пользователя
export const logout = async (): Promise<void> => {
  const { error } = await supabase.auth.signOut();
  // Очищаем кэш пользователя при выходе
  clearUserCache();
  if (error) {
    throw new Error(error.message || 'Failed to logout');
  }
};

// Получить текущего пользователя
export const getCurrentUser = async (userId?: string): Promise<User | null> => {
  try {
    let currentUserId = userId;

    if (!currentUserId) {
      const { data: { session }, error: sessionError } = await withTimeout(
        supabase.auth.getSession(),
        5000
      );

      if (sessionError || !session?.user) {
        return null;
      }
      currentUserId = session.user.id;
    }

    const { data: userData, error } = await withTimeout(
      supabase
        .from('users')
        .select('*')
        .eq('id', currentUserId)
        .single(),
      5000
    );

    if (error || !userData) {
      return null;
    }

    const user = mapSupabaseUserToUser(userData);
    // Кэшируем пользователя при получении
    cacheUser(user);
    return user;
  } catch (error: any) {
    // Игнорируем AbortError и таймауты при проверке сессии - это нормально
    if (error?.name === 'AbortError' || error?.message?.includes('aborted') || error?.message?.includes('cancelled') || error?.message?.includes('timeout')) {
      return null;
    }
    console.error('Error getting current user:', error);
    return null;
  }
};

// Получить текущую сессию
export const getSession = async () => {
  const { data: { session } } = await supabase.auth.getSession();
  return session;
};

// Получить список пользователей по ID
export const getUsersByIds = async (userIds: string[]): Promise<User[]> => {
  if (!userIds || userIds.length === 0) {
    return [];
  }

  // Убираем дубликаты
  const uniqueIds = Array.from(new Set(userIds));

  try {
    const { data: usersData, error } = await withTimeout(
      supabase
        .from('users')
        .select('*')
        .in('id', uniqueIds),
      10000
    );

    if (error) {
      console.error('Error fetching users by IDs:', error);
      return [];
    }

    if (!usersData) {
      return [];
    }

    return usersData.map(mapSupabaseUserToUser);
  } catch (error) {
    console.error('Error in getUsersByIds:', error);
    return [];
  }
};
