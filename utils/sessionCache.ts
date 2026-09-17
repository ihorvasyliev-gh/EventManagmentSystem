import type { User } from '../types.ts';
import { isRememberMeEnabled, getActiveAuthStorage } from './authStorage.ts';

export const USER_CACHE_KEY = 'ccp_user_cache';
export const USER_CACHE_TIMESTAMP_KEY = 'ccp_user_cache_timestamp';
const CACHE_DURATION_MS = 24 * 60 * 60 * 1000; // 24 hours

export interface CachedUser {
  user: User;
  timestamp: number;
}

const getStorage = (type: 'local' | 'session'): Storage | null => {
  try {
    if (typeof window !== 'undefined' || typeof globalThis !== 'undefined') {
      const g = (typeof window !== 'undefined' ? window : globalThis) as any;
      return type === 'local' ? g.localStorage : g.sessionStorage;
    }
    return null;
  } catch {
    return null;
  }
};

/**
 * Сохранить пользователя в кэш активного хранилища (sessionStorage для одноразового входа, localStorage для Remember Me)
 */
export const cacheUser = (user: User): void => {
  try {
    const cached: CachedUser = {
      user,
      timestamp: Date.now()
    };
    const serialized = JSON.stringify(cached);
    const ts = cached.timestamp.toString();
    const activeStorage = getActiveAuthStorage();

    activeStorage?.setItem(USER_CACHE_KEY, serialized);
    activeStorage?.setItem(USER_CACHE_TIMESTAMP_KEY, ts);

    // Если Remember Me выключен, убеждаемся, что в постоянном localStorage нет данных пользователя
    if (!isRememberMeEnabled()) {
      const ls = getStorage('local');
      ls?.removeItem(USER_CACHE_KEY);
      ls?.removeItem(USER_CACHE_TIMESTAMP_KEY);
    }
  } catch (error) {
    console.error('Failed to cache user:', error);
  }
};

/**
 * Получить пользователя из кэша (синхронно)
 */
export const getCachedUser = (): User | null => {
  try {
    const activeStorage = getActiveAuthStorage();
    let cachedStr = activeStorage?.getItem(USER_CACHE_KEY);

    // Если Remember Me включен, но в активном хранилище еще нет, проверяем localStorage напрямую
    if (!cachedStr && isRememberMeEnabled()) {
      const ls = getStorage('local');
      cachedStr = ls?.getItem(USER_CACHE_KEY);
    }

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
 * Очистить кэш пользователя из обоих хранилищ
 */
export const clearUserCache = (): void => {
  try {
    const ls = getStorage('local');
    const ss = getStorage('session');

    ls?.removeItem(USER_CACHE_KEY);
    ls?.removeItem(USER_CACHE_TIMESTAMP_KEY);
    ss?.removeItem(USER_CACHE_KEY);
    ss?.removeItem(USER_CACHE_TIMESTAMP_KEY);
  } catch (error) {
    console.error('Failed to clear user cache:', error);
  }
};

/**
 * Проверить, есть ли валидная сессия (синхронно)
 */
export const hasValidSession = (): boolean => {
  try {
    const cachedUser = getCachedUser();
    if (cachedUser) {
      return true;
    }

    const storage = getActiveAuthStorage();
    if (storage) {
      for (let i = 0; i < storage.length; i++) {
        const key = storage.key(i);
        if (key && (key.includes('auth-token') || key.startsWith('sb-'))) {
          const value = storage.getItem(key);
          if (value) {
            try {
              const parsed = JSON.parse(value);
              if (parsed?.access_token) {
                if (parsed.expires_at) {
                  const expiresAt = parsed.expires_at * 1000;
                  if (expiresAt > Date.now()) {
                    return true;
                  }
                } else {
                  return true;
                }
              }
            } catch {
              // Игнорируем ошибки парсинга
            }
          }
          break;
        }
      }
    }
    return false;
  } catch (error) {
    return false;
  }
};
