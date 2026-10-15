/**
 * Bookmarks for the PDF viewer's sidebar: each event under its month (or week), and the flyer
 * pages. They don't show on the page or in print.
 */
import { toDate, WEEKDAYS_LONG } from '../../digestText.ts';
import { monthShort } from '../../digestGrouping';
import { outlineText } from '../text';
import type { DigestContext } from './context';

export const addBookmarks = (
  { doc, groups, periodStart }: DigestContext,
  /** Page of each event's card or row, by group index */
  pageOf: Map<number, number>,
  /** The heading an event sits under (null when events have no headings) */
  sectionOf: ((group: number) => { key: number; title: string }) | null,
  flyersPage: number | null
) => {
  let parent: unknown = null;
  let lastKey: number | null = null;
  groups.forEach((g, i) => {
    const page = pageOf.get(i);
    if (!page) return;
    if (sectionOf) {
      const section = sectionOf(i);
      if (section.key !== lastKey) {
        lastKey = section.key;
        parent = doc.outline.add(null, outlineText(section.title), { pageNumber: page });
      }
    }
    const d = toDate(g.event.date) || periodStart;
    const day = `${WEEKDAYS_LONG[d.getDay()].slice(0, 3)} ${d.getDate()} ${monthShort(d)}`;
    doc.outline.add(parent, outlineText(`${day} · ${g.event.title || 'Untitled event'}`), { pageNumber: page });
  });
  if (flyersPage) doc.outline.add(null, 'Flyers to print', { pageNumber: flyersPage });
};
