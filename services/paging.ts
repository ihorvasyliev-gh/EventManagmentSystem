/** Rows per request; Supabase's API returns at most `max_rows` (1000 by default) at a time */
export const PAGE_SIZE = 1000;

/** A Supabase response (its row type isn't known for a select built from a column list) */
interface Page {
  data: unknown;
  error: { message?: string } | null;
  count?: number | null;
}

/**
 * Every row of a query, page by page. One request silently stops at the API's row limit, so a
 * calendar with more events than that would lose the newest ones. Pages advance by what actually
 * came back, so a lower server limit still reads everything.
 */
export const fetchAllPages = async <T>(page: (from: number, to: number) => PromiseLike<Page>): Promise<T[]> => {
  const rows: T[] = [];
  let total = Infinity;
  while (rows.length < total) {
    const { data, error, count } = await page(rows.length, rows.length + PAGE_SIZE - 1);
    if (error) throw new Error(error.message || 'Failed to load data');
    const batch = (data ?? []) as T[];
    if (typeof count === 'number') total = count;
    else if (batch.length < PAGE_SIZE) total = rows.length + batch.length;
    if (batch.length === 0) break;
    rows.push(...batch);
  }
  return rows;
};
