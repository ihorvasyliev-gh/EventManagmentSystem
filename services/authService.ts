import { type User, UserRole } from '../types';
import { supabase } from '../lib/supabase';
import { cacheUser, clearUserCache } from '../utils/sessionCache';
import { setRememberMe, clearAllAuthTokens } from '../utils/authStorage';

// A users row as the app's User
const mapSupabaseUserToUser = (supabaseUser: any): User => {
  return {
    id: supabaseUser.id,
    email: supabaseUser.email,
    fullName: supabaseUser.full_name || supabaseUser.email,
    role: (supabaseUser.role as UserRole) || UserRole.STAFF,
    mustChangePassword: !!supabaseUser.must_change_password
  };
};

export const MIN_PASSWORD_LENGTH = 8;

/** Plain-language version of Supabase's password errors */
const passwordErrorMessage = (message?: string): string => {
  if (!message) return 'The password could not be changed. Please try again.';
  if (/different from the old/i.test(message)) return 'Please choose a password you haven’t used for this account before.';
  if (/weak|characters|length|should contain/i.test(message)) return `That password is too weak: ${message}`;
  if (/reauthenticat|recent login/i.test(message)) return 'For security, please sign out, sign in again and then change your password.';
  return message;
};

/** Saves a new password for the signed-in user and clears the "must change password" flag */
export const setNewPassword = async (newPassword: string): Promise<void> => {
  if (newPassword.length < MIN_PASSWORD_LENGTH) {
    throw new Error(`The password must be at least ${MIN_PASSWORD_LENGTH} characters.`);
  }
  const { data, error } = await supabase.auth.updateUser({ password: newPassword });
  if (error || !data.user) throw new Error(passwordErrorMessage(error?.message));
  // The database clears the flag itself when the password changes (migration 014), and since then
  // refuses this update (42501): it is only for a database that hasn't run 014 yet
  const { error: flagError } = await supabase.from('users').update({ must_change_password: false }).eq('id', data.user.id);
  if (flagError && flagError.code !== '42501') console.error('Could not clear must_change_password:', flagError);
};

/** Changes the password after checking the current one (so an unattended open session can't) */
export const changePassword = async (email: string, currentPassword: string, newPassword: string): Promise<void> => {
  const { error } = await supabase.auth.signInWithPassword({ email, password: currentPassword });
  if (error) {
    throw new Error(error.status === 429 ? 'Too many attempts. Please wait a moment and try again.' : 'Your current password is not right.');
  }
  await setNewPassword(newPassword);
};

// Rejects when a request takes longer than timeoutMs
const withTimeout = <T>(promise: PromiseLike<T>, timeoutMs: number = 10000): Promise<T> => {
  let timeoutId: NodeJS.Timeout;
  const timeoutPromise = new Promise<T>((_, reject) => {
    timeoutId = setTimeout(() => {
      reject(new Error('Request timeout. Please check your connection and try again.'));
    }, timeoutMs);
  });

  return Promise.race([
    Promise.resolve(promise)
      .then(result => {
        clearTimeout(timeoutId);
        return result;
      })
      .catch(error => {
        clearTimeout(timeoutId);
        // A cancelled request: pass it on with a clearer message
        if (error?.name === 'AbortError' || error?.message?.includes('aborted')) {
          throw new Error('Request was cancelled. Please try again.');
        }
        throw error;
      }),
    timeoutPromise
  ]);
};

// Sign in
export const login = async (email: string, password: string, rememberMe: boolean = true): Promise<User> => {
  try {
    // Where the session is kept ("Remember me") must be set before signing in
    setRememberMe(rememberMe);

    // Don't wait for ever on a bad connection
    const authPromise = supabase.auth.signInWithPassword({
      email,
      password
    });

    const { data: authData, error: authError } = await withTimeout(authPromise, 10000);

    if (authError) {
      // Supabase's errors in plain words
      let errorMessage = authError.message || 'Invalid email or password';

      // The errors people actually meet
      if (authError.status === 400) {
        if (authError.message?.includes('Email not confirmed')) {
          errorMessage = 'Please confirm your email address before signing in. Check your inbox for a confirmation email.';
        } else if (authError.message?.includes('Invalid login credentials')) {
          errorMessage = 'Invalid email or password. Please check your credentials or confirm your email.';
        } else if (authError.message?.includes('User not found')) {
          errorMessage = 'User not found. Please contact ivasyliev@partnershipcork.ie or your administrator.';
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

    // The person's profile (role, name) from public.users
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
    // Cached, so the next visit shows the calendar straight away
    cacheUser(user);
    return user;
  } catch (error: any) {
    // For debugging (stripped from production builds)
    console.error('Login error:', error);

    // A cancelled request
    if (error?.name === 'AbortError' || error?.message?.includes('aborted') || error?.message?.includes('cancelled')) {
      throw new Error('Request was cancelled. Please try again.', { cause: error });
    }

    // Already in plain words (a timeout or a cancelled request)
    if (error.message && (error.message.includes('timeout') || error.message.includes('Request was cancelled'))) {
      throw error;
    }

    // Anything else, with its message
    throw new Error(error.message || 'Login failed. Please check your connection and try again.', { cause: error });
  }
};

// Sign out
export const logout = async (): Promise<void> => {
  const { error } = await supabase.auth.signOut();
  // Nothing of the session stays on the device
  clearUserCache();
  clearAllAuthTokens();
  if (error) {
    throw new Error(error.message || 'Failed to logout');
  }
};

// The signed-in user's profile, or null
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
    // Cached for the next visit
    cacheUser(user);
    return user;
  } catch (error: any) {
    // A cancelled or slow check is normal (e.g. the tab was closed): no user for now
    if (error?.name === 'AbortError' || error?.message?.includes('aborted') || error?.message?.includes('cancelled') || error?.message?.includes('timeout')) {
      return null;
    }
    console.error('Error getting current user:', error);
    return null;
  }
};

// The current Supabase session
export const getSession = async () => {
  const { data: { session } } = await supabase.auth.getSession();
  return session;
};
