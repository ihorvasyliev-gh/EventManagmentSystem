import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import {
  isRememberMeEnabled,
  setRememberMe,
  authStorageAdapter,
  clearAllAuthTokens,
  REMEMBER_ME_KEY
} from '../utils/authStorage.ts';

// Mock Web Storage for testing in Node.js
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

// Set up global localStorage and sessionStorage mocks
const mockLocalStorage = new MockStorage();
const mockSessionStorage = new MockStorage();

(globalThis as any).localStorage = mockLocalStorage;
(globalThis as any).sessionStorage = mockSessionStorage;

beforeEach(() => {
  mockLocalStorage.clear();
  mockSessionStorage.clear();
});

test('isRememberMeEnabled defaults to false when not set', () => {
  assert.equal(isRememberMeEnabled(), false);
});

test('setRememberMe(true) enables remember me and stores in localStorage', () => {
  setRememberMe(true);
  assert.equal(isRememberMeEnabled(), true);
  assert.equal(mockLocalStorage.getItem(REMEMBER_ME_KEY), 'true');
});

test('setRememberMe(false) stores preference in sessionStorage and disables remember me', () => {
  setRememberMe(true);
  assert.equal(isRememberMeEnabled(), true);

  setRememberMe(false);
  assert.equal(isRememberMeEnabled(), false);
  assert.equal(mockLocalStorage.getItem(REMEMBER_ME_KEY), null);
  assert.equal(mockSessionStorage.getItem(REMEMBER_ME_KEY), 'false');
});

test('authStorageAdapter writes to sessionStorage when rememberMe is false', () => {
  setRememberMe(false);
  authStorageAdapter.setItem('supabase-token', 'token-123');

  assert.equal(mockSessionStorage.getItem('supabase-token'), 'token-123');
  assert.equal(mockLocalStorage.getItem('supabase-token'), null);
  assert.equal(authStorageAdapter.getItem('supabase-token'), 'token-123');
});

test('authStorageAdapter writes to localStorage when rememberMe is true', () => {
  setRememberMe(true);
  authStorageAdapter.setItem('supabase-token', 'persistent-token-456');

  assert.equal(mockLocalStorage.getItem('supabase-token'), 'persistent-token-456');
  assert.equal(authStorageAdapter.getItem('supabase-token'), 'persistent-token-456');
});

test('clearAllAuthTokens removes tokens and rememberMe from both storages', () => {
  mockLocalStorage.setItem('sb-test-auth-token', 'local-token');
  mockSessionStorage.setItem('sb-test-auth-token', 'session-token');
  setRememberMe(true);

  clearAllAuthTokens();

  assert.equal(mockLocalStorage.getItem('sb-test-auth-token'), null);
  assert.equal(mockSessionStorage.getItem('sb-test-auth-token'), null);
  assert.equal(isRememberMeEnabled(), false);
});
