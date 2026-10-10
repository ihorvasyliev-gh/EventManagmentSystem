import { callApi } from './apiClient';

export interface NewStaffAccount {
  fullName: string;
  email: string;
  password: string;
}

export interface StaffAccount {
  id: string;
  email: string;
  fullName: string;
  role: 'staff' | 'admin';
  mustChangePassword: boolean;
  createdAt: string;
}

/** Every account (admins only) */
export const listStaff = async (): Promise<StaffAccount[]> => {
  const { staff } = await callApi<{ staff: StaffAccount[] }>('/api/staff');
  return staff;
};

/** Creates a staff account through the admin-only /api/staff function */
export const createStaffAccount = async (account: NewStaffAccount): Promise<{ email: string; fullName: string; mustChangePassword: boolean }> => {
  const body = await callApi<{ email?: string; fullName?: string; mustChangePassword?: boolean }>('/api/staff', { method: 'POST', body: account });
  return { email: body.email ?? account.email, fullName: body.fullName ?? account.fullName, mustChangePassword: !!body.mustChangePassword };
};

/** Gives someone who forgot their password a temporary one (shown once to the admin) */
export const resetStaffPassword = async (userId: string): Promise<{ tempPassword: string; mustChangePassword: boolean }> =>
  callApi<{ tempPassword: string; mustChangePassword: boolean }>('/api/staff-password', { method: 'POST', body: { userId } });
