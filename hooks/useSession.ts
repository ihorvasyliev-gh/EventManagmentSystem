import { useState, useEffect, useCallback } from 'react';
import { User } from '../types';
import { supabase } from '../lib/supabase';
import { logout as logoutService, getCurrentUser } from '../services/authService';
import { getCachedUser, cacheUser, clearUserCache } from '../utils/sessionCache';
import { clearEventsCache } from '../utils/eventsCache';

/**
 * The signed-in user: restored at once from the local cache, then checked with Supabase in the
 * background, and kept in step with sign-in / sign-out / token refresh.
 */
export function useSession() {
  const [user, setUser] = useState<User | null>(null);
  const [isSessionLoading, setIsSessionLoading] = useState(true);

  useEffect(() => {
    let isMounted = true;

    const fetchUserProfileFromServer = async (uid: string): Promise<User | null> => {
      try {
        const currentUser = await getCurrentUser(uid);
        if (currentUser && isMounted) {
          setUser(currentUser);
          return currentUser;
        }
        return null;
      } catch (error) {
        console.error('Error fetching user profile from server:', error);
        return null;
      }
    };

    const cachedUser = getCachedUser();
    if (cachedUser) {
      // Shown straight away; the session and profile are checked in the background
      setUser(cachedUser);
      setIsSessionLoading(false);
      supabase.auth.getSession().then(({ data: { session }, error }) => {
        if (!isMounted) return;
        if (error || !session) {
          clearUserCache();
          setUser(null);
          return;
        }
        void fetchUserProfileFromServer(session.user.id);
      });
    } else {
      supabase.auth.getSession().then(({ data: { session }, error }) => {
        if (!isMounted) return;
        if (session && !error) {
          fetchUserProfileFromServer(session.user.id).finally(() => {
            if (isMounted) setIsSessionLoading(false);
          });
        } else {
          setIsSessionLoading(false);
        }
      });
    }

    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
      if (!isMounted) return;
      if (event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED') {
        if (session) await fetchUserProfileFromServer(session.user.id);
      } else if (event === 'SIGNED_OUT') {
        setUser(null);
        clearUserCache();
        clearEventsCache();
      }
    });

    return () => {
      isMounted = false;
      subscription.unsubscribe();
    };
  }, []);

  const handleLogin = useCallback((loggedInUser: User) => {
    cacheUser(loggedInUser);
    setUser(loggedInUser);
  }, []);

  const handleLogout = useCallback(async () => {
    await logoutService();
    clearUserCache();
    clearEventsCache();
    setUser(null);
  }, []);

  /** Local change to the signed-in user (e.g. the password was just changed) */
  const updateUser = useCallback((patch: Partial<User>) => {
    setUser((prev) => {
      if (!prev) return prev;
      const next = { ...prev, ...patch };
      cacheUser(next);
      return next;
    });
  }, []);

  return { user, isSessionLoading, handleLogin, handleLogout, updateUser };
}
