export const REMEMBER_ME_KEY = 'ccp_remember_me';

/** localStorage / sessionStorage, or null where access throws (e.g. blocked site data) */
export const safeGetStorage = (type: 'local' | 'session'): Storage | null => {
  try {
    return globalThis[type === 'local' ? 'localStorage' : 'sessionStorage'] ?? null;
  } catch {
    return null;
  }
};

/**
 * Checks whether persistent "Remember Me" mode is enabled.
 */
export const isRememberMeEnabled = (): boolean => {
  try {
    const ls = safeGetStorage('local');
    return ls ? ls.getItem(REMEMBER_ME_KEY) === 'true' : false;
  } catch {
    return false;
  }
};

/**
 * Clears any Supabase auth tokens stored in a given Web Storage instance.
 */
const clearTokensFromStorage = (storage: Storage | null) => {
  if (!storage) return;
  try {
    const keysToRemove: string[] = [];
    for (let i = 0; i < storage.length; i++) {
      const key = storage.key(i);
      if (key && (key.includes('auth-token') || key.startsWith('sb-'))) {
        keysToRemove.push(key);
      }
    }
    keysToRemove.forEach((key) => storage.removeItem(key));
  } catch (error) {
    console.error('Failed to clear tokens from storage:', error);
  }
};

/**
 * Sets the "Remember Me" preference.
 * - true: persistently saves preference in localStorage so future browser launches remember the session.
 * - false: marks session as temporary in sessionStorage and removes any persisted tokens from localStorage.
 */
export const setRememberMe = (enabled: boolean): void => {
  try {
    const ls = safeGetStorage('local');
    const ss = safeGetStorage('session');

    if (enabled) {
      ls?.setItem(REMEMBER_ME_KEY, 'true');
      ss?.removeItem(REMEMBER_ME_KEY);
    } else {
      ls?.removeItem(REMEMBER_ME_KEY);
      ss?.setItem(REMEMBER_ME_KEY, 'false');
      // Clear persistent tokens from localStorage so no one-time session leaks into localStorage
      clearTokensFromStorage(ls);
    }
  } catch (error) {
    console.error('Failed to set remember me preference:', error);
  }
};

/**
 * Returns the currently active storage (localStorage for Remember Me, sessionStorage for temporary/one-time).
 */
export const getActiveAuthStorage = (): Storage | null => {
  return isRememberMeEnabled() ? safeGetStorage('local') : safeGetStorage('session');
};

/**
 * Storage adapter implementing Supabase SupportedStorage.
 * Routes session tokens to localStorage if Remember Me is checked, or sessionStorage if unchecked.
 */
export const authStorageAdapter = {
  getItem: (key: string): string | null => {
    try {
      const storage = getActiveAuthStorage();
      const item = storage?.getItem(key);
      if (item) return item;

      // Fallback check: if remember me is false but session storage doesn't have it yet,
      // or during initial transition, check localStorage only if remember me is enabled.
      if (isRememberMeEnabled()) {
        return safeGetStorage('local')?.getItem(key) ?? null;
      }
      return null;
    } catch {
      return null;
    }
  },
  setItem: (key: string, value: string): void => {
    try {
      const storage = getActiveAuthStorage();
      storage?.setItem(key, value);
    } catch (error) {
      console.error('Failed to set auth token in storage:', error);
    }
  },
  removeItem: (key: string): void => {
    try {
      safeGetStorage('local')?.removeItem(key);
      safeGetStorage('session')?.removeItem(key);
    } catch (error) {
      console.error('Failed to remove auth token from storage:', error);
    }
  }
};

/**
 * Clears all auth tokens and Remember Me flags from both localStorage and sessionStorage.
 */
export const clearAllAuthTokens = (): void => {
  try {
    const ls = safeGetStorage('local');
    const ss = safeGetStorage('session');

    ls?.removeItem(REMEMBER_ME_KEY);
    ss?.removeItem(REMEMBER_ME_KEY);

    clearTokensFromStorage(ls);
    clearTokensFromStorage(ss);
  } catch (error) {
    console.error('Failed to clear all auth tokens:', error);
  }
};
