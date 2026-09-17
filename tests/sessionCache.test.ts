import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { setRememberMe, REMEMBER_ME_KEY } from '../utils/authStorage.ts';
import {
  cacheUser,
  getCachedUser,
  clearUserCache,
  hasValidSession,
  USER_CACHE_KEY
} from '../utils/sessionCache.ts';
import type { User } from '../types.ts';

class MockStorage implements Storage {
  private store = new Map<string, string>();

  get length(): number {
    return this.store.size;
  }

  clear(): void {
    this.store.clear();
  }

  getItem(key: string): string | null {
    return this.store.has(key) ? this.store.get(key)! : null;
  }

  key(index: number): string | null {
    return Array.from(this.store.keys())[index] || null;
  }

  removeItem(key: string): void {
    this.store.delete(key);
  }

  setItem(key: string, value: string): void {
    this.store.set(key, String(value));
  }
}

const mockLocalStorage = new MockStorage();
const mockSessionStorage = new MockStorage();

(globalThis as any).localStorage = mockLocalStorage;
(globalThis as any).sessionStorage = mockSessionStorage;

const testUser: User = {
  id: 'user-1',
  email: 'test@partnershipcork.ie',
  fullName: 'Test User',
  role: 'staff' as any
};

beforeEach(() => {
  mockLocalStorage.clear();
  mockSessionStorage.clear();
});

test('when rememberMe is false, cacheUser stores user in sessionStorage only', () => {
  setRememberMe(false);
  cacheUser(testUser);

  assert.equal(mockLocalStorage.getItem(USER_CACHE_KEY), null);
  assert.notEqual(mockSessionStorage.getItem(USER_CACHE_KEY), null);

  const restored = getCachedUser();
  assert.deepEqual(restored, testUser);
});

test('when rememberMe is false and sessionStorage is cleared (simulating browser restart), getCachedUser returns null', () => {
  setRememberMe(false);
  cacheUser(testUser);

  // Simulate browser restart by clearing sessionStorage while localStorage remains
  mockSessionStorage.clear();

  const restored = getCachedUser();
  assert.equal(restored, null);
  assert.equal(hasValidSession(), false);
});

test('when rememberMe is true, cacheUser stores user in localStorage', () => {
  setRememberMe(true);
  cacheUser(testUser);

  assert.notEqual(mockLocalStorage.getItem(USER_CACHE_KEY), null);

  const restored = getCachedUser();
  assert.deepEqual(restored, testUser);
  assert.equal(hasValidSession(), true);
});

test('clearUserCache clears user from both storages', () => {
  mockLocalStorage.setItem(USER_CACHE_KEY, JSON.stringify({ user: testUser, timestamp: Date.now() }));
  mockSessionStorage.setItem(USER_CACHE_KEY, JSON.stringify({ user: testUser, timestamp: Date.now() }));

  clearUserCache();

  assert.equal(mockLocalStorage.getItem(USER_CACHE_KEY), null);
  assert.equal(mockSessionStorage.getItem(USER_CACHE_KEY), null);
});
