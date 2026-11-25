/**
 * Cloudflare Pages Function — Event categories (public read, admin-only write)
 *
 *   GET    /api/categories                   →  { categories, custom, updatedAt, updatedBy }
 *   POST   /api/categories  { name, shortLabel?, icon, color }   (admin only)
 *   PATCH  /api/categories  { name, shortLabel?, icon?, color? } (admin only)
 *   DELETE /api/categories?name=…            (or JSON { name })  (admin only)
 *
 * Stored in R2 (meta/categories.json) so new categories work immediately without manual database
 * migrations and can be read on the public /submit and /subscribe pages without an account.
 */
import { json, fail, bearerToken, readJson } from '../../server/http.ts';
import { supabaseConfig, getCaller, serviceRest, type Caller, type SupabaseConfig, type SupabaseEnv } from '../../server/supabase.ts';
import type { IssueBucket } from '../../server/digestIssues.ts';
import { readCategories, writeCategories, categoriesResponsePayload } from '../../server/categories.ts';
import {
  categoryKey,
  getUnusedCategoryShapes,
  isBuiltInCategory,
  mergeCategories,
  validateCategoryInput,
  validateCategoryPatch,
  MAX_CUSTOM_CATEGORIES,
  type CategoryDefinition
} from '../../constants/categories.ts';

interface Env extends SupabaseEnv {
  BUCKET?: IssueBucket;
}

interface Context {
  request: Request;
  env: Env;
}

const requireAdmin = async ({ request, env }: Context): Promise<{ bucket: IssueBucket; cfg: SupabaseConfig; caller: Caller } | Response> => {
  if (!env.BUCKET) return fail("R2 Bucket binding 'BUCKET' not found.", 500);
  const cfg = supabaseConfig(env);
  if (!cfg) return fail('Category management is not set up on the server (missing Supabase keys).', 500);
  const caller = await getCaller(cfg, bearerToken(request));
  if (!caller) return fail('Your session has expired. Please sign in again.', 401);
  if (caller.role !== 'admin') return fail('Only admins can manage event categories.', 403);
  return { bucket: env.BUCKET, cfg, caller };
};

/** Best-effort sync to public.event_categories so the database table stays tidy too */
const syncSupabaseCategory = async (cfg: SupabaseConfig, action: 'insert' | 'delete', name: string, userId?: string): Promise<void> => {
  if (!cfg.serviceKey) return;
  try {
    if (action === 'insert') {
      await serviceRest(cfg, 'event_categories?on_conflict=name', {
        method: 'POST',
        headers: { Prefer: 'resolution=ignore-duplicates,return=minimal' },
        body: JSON.stringify({ name, ...(userId ? { created_by: userId } : {}) })
      });
    } else {
      await serviceRest(cfg, `event_categories?name=eq.${encodeURIComponent(name)}`, {
        method: 'DELETE',
        headers: { Prefer: 'return=minimal' }
      });
    }
  } catch (err) {
    console.warn(`Best-effort Supabase category ${action} failed:`, err);
  }
};

// Typed by hand (not PagesFunction) so the app's type check and tests can import it
export const onRequestGet = async ({ env }: Context): Promise<Response> => {
  try {
    const stored = await readCategories(env.BUCKET);
    return json(categoriesResponsePayload(stored), 200, { 'Cache-Control': 'no-cache' });
  } catch (err) {
    console.error('Reading categories failed:', err);
    return fail('Categories could not be loaded.', 502);
  }
};

export const onRequestPost = async (context: Context): Promise<Response> => {
  const ok = await requireAdmin(context);
  if (ok instanceof Response) return ok;

  const body = await readJson<Record<string, unknown>>(context.request);
  let stored;
  try {
    stored = await readCategories(ok.bucket);
  } catch (err) {
    console.error('Reading categories failed:', err);
    return fail('Categories could not be loaded.', 502);
  }

  if (stored.custom.length >= MAX_CUSTOM_CATEGORIES) {
    return fail(`You can add at most ${MAX_CUSTOM_CATEGORIES} custom categories.`, 400);
  }

  const existing = mergeCategories(stored.custom);
  const check = validateCategoryInput(body, existing);
  if (!check.ok) {
    const status = check.error.includes('already exists') || check.error.includes('already used') ? 409 : 400;
    return fail(check.error, status);
  }

  const now = new Date().toISOString();
  const added: CategoryDefinition = {
    ...check.category,
    createdAt: now,
    createdBy: ok.caller.fullName
  };
  const next = {
    custom: [...stored.custom, added],
    updatedAt: now,
    updatedBy: ok.caller.fullName
  };

  try {
    await writeCategories(ok.bucket, next);
  } catch (err) {
    console.error('Saving categories failed:', err);
    return fail('The category could not be saved. Please try again.', 502);
  }

  await syncSupabaseCategory(ok.cfg, 'insert', added.name, ok.caller.id);

  return json({ category: added, ...categoriesResponsePayload(next) }, 201);
};

export const onRequestPatch = async (context: Context): Promise<Response> => {
  const ok = await requireAdmin(context);
  if (ok instanceof Response) return ok;

  const body = await readJson<Record<string, unknown>>(context.request);
  const rawName = typeof body?.name === 'string' ? body.name.trim() : '';
  if (!rawName) return fail('Category name is required.', 400);
  if (isBuiltInCategory(rawName)) return fail('Standard categories cannot be changed.', 400);

  const check = validateCategoryPatch(body);
  if (!check.ok) return fail(check.error, 400);

  let stored;
  try {
    stored = await readCategories(ok.bucket);
  } catch (err) {
    console.error('Reading categories failed:', err);
    return fail('Categories could not be loaded.', 502);
  }

  const targetKey = categoryKey(rawName);
  const index = stored.custom.findIndex((c) => categoryKey(c.name) === targetKey);
  if (index < 0) return fail('Category not found.', 404);

  const current = stored.custom[index];
  if (check.patch.pdfShape !== undefined) {
    const allowedShapes = getUnusedCategoryShapes(mergeCategories(stored.custom), current.name);
    if (!allowedShapes.includes(check.patch.pdfShape)) {
      return fail('That PDF digest marker is already used by another category.', 409);
    }
  }
  const updated: CategoryDefinition = {
    ...current,
    ...(check.patch.icon !== undefined ? { icon: check.patch.icon } : {}),
    ...(check.patch.color !== undefined ? { color: check.patch.color } : {}),
    ...(check.patch.pdfShape !== undefined ? { pdfShape: check.patch.pdfShape } : {})
  };
  if (check.patch.shortLabel === null) {
    delete updated.shortLabel;
  } else if (check.patch.shortLabel !== undefined) {
    updated.shortLabel = check.patch.shortLabel;
  }

  const nextCustom = stored.custom.map((c, i) => (i === index ? updated : c));
  const now = new Date().toISOString();
  const next = { custom: nextCustom, updatedAt: now, updatedBy: ok.caller.fullName };

  try {
    await writeCategories(ok.bucket, next);
  } catch (err) {
    console.error('Updating categories failed:', err);
    return fail('The category could not be updated. Please try again.', 502);
  }

  return json({ category: updated, ...categoriesResponsePayload(next) });
};

export const onRequestDelete = async (context: Context): Promise<Response> => {
  const ok = await requireAdmin(context);
  if (ok instanceof Response) return ok;

  const url = new URL(context.request.url);
  let rawName = url.searchParams.get('name')?.trim() ?? '';
  if (!rawName) {
    const body = await readJson<{ name?: unknown }>(context.request);
    rawName = typeof body?.name === 'string' ? body.name.trim() : '';
  }
  if (!rawName) return fail('Category name is required.', 400);
  if (isBuiltInCategory(rawName)) return fail('Standard categories cannot be removed.', 400);

  let stored;
  try {
    stored = await readCategories(ok.bucket);
  } catch (err) {
    console.error('Reading categories failed:', err);
    return fail('Categories could not be loaded.', 502);
  }

  const targetKey = categoryKey(rawName);
  const removed = stored.custom.find((c) => categoryKey(c.name) === targetKey);
  if (!removed) return fail('Category not found.', 404);

  const nextCustom = stored.custom.filter((c) => categoryKey(c.name) !== targetKey);
  const now = new Date().toISOString();
  const next = { custom: nextCustom, updatedAt: now, updatedBy: ok.caller.fullName };

  try {
    await writeCategories(ok.bucket, next);
  } catch (err) {
    console.error('Removing category failed:', err);
    return fail('The category could not be removed. Please try again.', 502);
  }

  await syncSupabaseCategory(ok.cfg, 'delete', removed.name);

  return json({ deleted: removed.name, ...categoriesResponsePayload(next) });
};
