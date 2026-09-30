import { supabase } from '../lib/supabase';

export interface NewStaffAccount {
  fullName: string;
  email: string;
  password: string;
}

/** Creates a staff account through the admin-only /api/staff function */
export const createStaffAccount = async (account: NewStaffAccount): Promise<{ email: string; fullName: string }> => {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  if (!token) throw new Error('Your session has expired. Please sign in again.');

  let res: Response;
  try {
    res = await fetch('/api/staff', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify(account)
    });
  } catch {
    throw new Error('Could not reach the server. Please check your connection and try again.');
  }
  const body = await res.json().catch(() => ({})) as { error?: string; email?: string; fullName?: string };
  if (!res.ok) throw new Error(body.error || `Could not create the account (error ${res.status}).`);
  return { email: body.email ?? account.email, fullName: body.fullName ?? account.fullName };
};
