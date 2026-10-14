import type { User } from '../types.ts';
import { isRememberMeEnabled, getActiveAuthStorage, safeGetStorage } from './authStorage.ts';

export const USER_CACHE_KEY = 'ccp_user_cache';
export const USER_CACHE_TIMESTAMP_KEY = 'ccp_user_cache_timestamp';
const CACHE_DURATION_MS = 24 * 60 * 60 * 1000; // 24 hours

export interface CachedUser {
  user: User;
  timestamp: number;
}

/**
 * Caches the user where the session is (sessionStorage for a one-time sign-in, localStorage with Remember Me)
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

    // Without Remember Me, nothing about the user stays in localStorage
    if (!isRememberMeEnabled()) {
      const ls = safeGetStorage('local');
      ls?.removeItem(USER_CACHE_KEY);
      ls?.removeItem(USER_CACHE_TIMESTAMP_KEY);
    }
  } catch (error) {
    console.error('Failed to cache user:', error);
  }
};

/**
 * The cached user, read synchronously
 */
export const getCachedUser = (): User | null => {
  try {
    const activeStorage = getActiveAuthStorage();
    let cachedStr = activeStorage?.getItem(USER_CACHE_KEY);

    // With Remember Me, also look in localStorage directly
    if (!cachedStr && isRememberMeEnabled()) {
      const ls = safeGetStorage('local');
      cachedStr = ls?.getItem(USER_CACHE_KEY);
    }

    if (!cachedStr) return null;

    const cached: CachedUser = JSON.parse(cachedStr);

    // Too old: sign in again
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
 * Clears the cached user from both storages
 */
export const clearUserCache = (): void => {
  try {
    const ls = safeGetStorage('local');
    const ss = safeGetStorage('session');

    ls?.removeItem(USER_CACHE_KEY);
    ls?.removeItem(USER_CACHE_TIMESTAMP_KEY);
    ss?.removeItem(USER_CACHE_KEY);
    ss?.removeItem(USER_CACHE_TIMESTAMP_KEY);
  } catch (error) {
    console.error('Failed to clear user cache:', error);
  }
};

