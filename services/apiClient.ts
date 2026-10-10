import { supabase } from '../lib/supabase';

/** An error from one of the app's /api functions, with its HTTP status */
export class ApiError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
  }
}

interface CallOptions {
  method?: string;
  /** Sent as JSON */
  body?: unknown;
  /** Sent as multipart form data (files) */
  form?: FormData;
  /** 'optional': also works signed out (the public submission form) */
  auth?: 'required' | 'optional';
}

/** Calls one of the app's Cloudflare functions as the signed-in user; throws ApiError with the server's message */
export const callApi = async <T>(path: string, { method = 'GET', body, form, auth = 'required' }: CallOptions = {}): Promise<T> => {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  if (!token && auth === 'required') throw new ApiError('Your session has expired. Please sign in again.', 401);

  const headers: Record<string, string> = {};
  if (token) headers.Authorization = `Bearer ${token}`;
  if (body !== undefined) headers['Content-Type'] = 'application/json';

  let res: Response;
  try {
    res = await fetch(path, { method, headers, body: form ?? (body !== undefined ? JSON.stringify(body) : undefined) });
  } catch {
    throw new ApiError('Could not reach the server. Please check your connection and try again.', 0);
  }
  const payload = (await res.json().catch(() => ({}))) as T & { error?: string };
  if (!res.ok) throw new ApiError(payload.error || `The server could not do that (error ${res.status}).`, res.status);
  return payload;
};
