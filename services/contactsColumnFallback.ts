/**
 * events.extra_contacts arrives with migration 013. A database that hasn't run it yet refuses
 * any request naming the column, which would leave the calendar empty if the app is deployed
 * first. Such requests are sent again without the column, so everything keeps working (more
 * contact people just aren't saved) until the migration runs. Can go once every database has 013.
 */
export const CONTACTS_COLUMN = 'extra_contacts';

/** The URL with the column taken out of its select list */
export const withoutContactsInUrl = (url: string): string =>
  url.replace(/(,|%2C)extra_contacts(?=&|,|%2C|$)/gi, '').replace(/([=,]|%2C)extra_contacts(,|%2C)/gi, '$1');

/** A JSON body (one row or several) without the column */
export const withoutContactsInBody = (body: string): string => {
  try {
    const data: unknown = JSON.parse(body);
    const drop = (row: unknown) => {
      if (row && typeof row === 'object') delete (row as Record<string, unknown>)[CONTACTS_COLUMN];
    };
    if (Array.isArray(data)) data.forEach(drop);
    else drop(data);
    return JSON.stringify(data);
  } catch {
    return body;
  }
};

/** fetch for the Supabase client: events requests are retried without the column while the database lacks it */
export const withContactsColumnFallback = (baseFetch: typeof fetch): typeof fetch => {
  let missing = false;
  return async (input, init) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : null;
    const body = typeof init?.body === 'string' ? init.body : null;
    if (!url || !url.includes('/rest/v1/events') || !(url.includes(CONTACTS_COLUMN) || body?.includes(CONTACTS_COLUMN))) {
      return baseFetch(input, init);
    }
    const retry = () => baseFetch(withoutContactsInUrl(url), body === null ? init : { ...init, body: withoutContactsInBody(body) });
    if (missing) return retry();
    const res = await baseFetch(input, init);
    // PostgREST answers 400 naming the column (42703 on reads, PGRST204 on writes)
    if (res.status !== 400 || !(await res.clone().text()).includes(CONTACTS_COLUMN)) return res;
    missing = true;
    console.warn('The database has no events.extra_contacts yet: run supabase/migrations/013_extra_contacts.sql. More contact people are not saved until then.');
    return retry();
  };
};
