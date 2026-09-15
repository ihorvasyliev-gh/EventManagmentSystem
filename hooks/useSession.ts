import React, { useState, useEffect, useCallback } from 'react';
import { User } from '../types';
import { getCurrentUser } from '../services/authService';
import { logout as logoutService } from '../services/authService';
import { supabase } from '../lib/supabase';
import { getCachedUser, cacheUser, clearUserCache } from '../utils/sessionCache';
import { clearEventsCache, clearRsvpsCache } from '../utils/eventsCache';
import { clearRecurrenceCache } from '../utils/recurrence';

function getInitialUser(): User | null {
  if (typeof window === 'undefined') return null;
  return getCachedUser();
}

export function useSession() {
  const [user, setUser] = useState<User | null>(getInitialUser);
  const [isSessionLoading, setIsSessionLoading] = useState(() => typeof window !== 'undefined' && !getCachedUser());
  const userIdRef = React.useRef<string | null>(null);

  useEffect(() => {
    let isMounted = true;

    const fetchUserProfileFromServer = async (uid: string): Promise<User | null> => {
      try {
        const currentUser = await getCurrentUser(uid);
        if (currentUser && isMounted) {
          userIdRef.current = currentUser.id;
          setUser(currentUser);
          return currentUser;
        }
        return null;
      } catch (error) {
        console.error('Error fetching user profile from server:', error);
        return null;
      }
    };

    const restoreSessionSync = (): void => {
      const cachedUser = getCachedUser();
      if (cachedUser) {
        userIdRef.current = cachedUser.id;
        setUser(cachedUser);
        setIsSessionLoading(false);
        supabase.auth.getSession().then(({ data: { session }, error }) => {
          if (!isMounted || error || !session) {
            if (isMounted) {
              clearUserCache();
              setUser(null);
            }
            return;
          }
          fetchUserProfileFromServer(session.user.id).then(() => {});
        });
        return;
      }

      supabase.auth.getSession().then(({ data: { session }, error }) => {
        if (!isMounted) return;
        if (session && !error) {
          fetchUserProfileFromServer(session.user.id).finally(() => {
            if (isMounted) setIsSessionLoading(false);
          });
        } else {
          if (isMounted) setIsSessionLoading(false);
        }
      });
    };

    restoreSessionSync();

    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
      if (!isMounted) return;
      if (event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED') {
        if (session) await fetchUserProfileFromServer(session.user.id);
      } else if (event === 'SIGNED_OUT') {
        userIdRef.current = null;
        setUser(null);
        clearUserCache();
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
    clearRsvpsCache();
    clearRecurrenceCache();
    setUser(null);
  }, []);

  return { user, isSessionLoading, handleLogin, handleLogout };
}
