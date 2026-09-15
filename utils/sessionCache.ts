import { User } from '../types';

const USER_CACHE_KEY = 'ccp_user_cache';
const USER_CACHE_TIMESTAMP_KEY = 'ccp_user_cache_timestamp';
const CACHE_DURATION_MS = 24 * 60 * 60 * 1000; // 24 hours

export interface CachedUser {
  user: User;
  timestamp: number;
}

/**
 * Сохранить пользователя в кэш
 */
export const cacheUser = (user: User): void => {
  try {
    const cached: CachedUser = {
      user,
      timestamp: Date.now()
    };
    localStorage.setItem(USER_CACHE_KEY, JSON.stringify(cached));
    localStorage.setItem(USER_CACHE_TIMESTAMP_KEY, cached.timestamp.toString());
  } catch (error) {
    console.error('Failed to cache user:', error);
  }
};

/**
 * Получить пользователя из кэша (синхронно)
 */
export const getCachedUser = (): User | null => {
  try {
    const cachedStr = localStorage.getItem(USER_CACHE_KEY);
    if (!cachedStr) return null;

    const cached: CachedUser = JSON.parse(cachedStr);
    
    // Проверяем, не устарел ли кэш
    const age = Date.now() - cached.timestamp;
    if (age > CACHE_DURATION_MS) {
      clearUserCache();
      return null;
    }

    return cached.user;
  } catch (error) {
    console.error('Failed to read cached user:', error);
    clearUserCache();
    return null;
  }
};

/**
 * Очистить кэш пользователя
 */
export const clearUserCache = (): void => {
  try {
    localStorage.removeItem(USER_CACHE_KEY);
    localStorage.removeItem(USER_CACHE_TIMESTAMP_KEY);
  } catch (error) {
    console.error('Failed to clear user cache:', error);
  }
};

/**
 * Проверить, есть ли валидная сессия в localStorage (синхронно)
 * Упрощенная проверка: если есть кэш пользователя, значит сессия была валидной
 * Также проверяем наличие токена Supabase напрямую
 */
export const hasValidSession = (): boolean => {
  try {
    // Быстрая проверка: если есть кэш пользователя, значит сессия была валидной
    const cachedUser = getCachedUser();
    if (cachedUser) {
      return true;
    }

    // Дополнительная проверка: ищем токен Supabase в localStorage
    // Supabase хранит сессию в ключе вида: sb-<project-ref>-auth-token
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key && key.includes('auth-token')) {
        const value = localStorage.getItem(key);
        if (value) {
          try {
            const parsed = JSON.parse(value);
            // Проверяем наличие access_token
            if (parsed?.access_token) {
              // Проверяем expires_at если есть
              if (parsed.expires_at) {
                const expiresAt = parsed.expires_at * 1000;
                if (expiresAt > Date.now()) {
                  return true;
                }
              } else {
                // Если нет expires_at, считаем что токен валиден
                return true;
              }
            }
          } catch {
            // Игнорируем ошибки парсинга
          }
        }
        // Нашли ключ с auth-token, дальше не ищем
        break;
      }
    }
    return false;
  } catch (error) {
    return false;
  }
};
