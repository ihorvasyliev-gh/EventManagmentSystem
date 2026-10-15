/**
 * "Flyers to print": pages at the end with each event's flyer four to a page, about A6 each, large
 * enough to read and pin up (the thumbnails on the cards are too small to read on paper).
 */
import { toAbsoluteHttpUrl, toDate, WEEKDAYS_LONG, clock, isAllDay } from '../../digestText.ts';
import { monthShort } from '../../digestGrouping';
import { INK, MUTED, BORDER, LINK } from '../theme';
import type { DigestContext, PdfFlyer } from './context';

export const FLYERS_PER_PAGE = 4;

const COL_W = 82;
const CAPTION_H = 9;
const ROW_GAP = 5;
// "FLYERS TO PRINT" above the grid
const LABEL_H = 8;

export interface FlyerItem {
  /** Index of the event group the flyer belongs to */
  group: number;
  flyer: PdfFlyer;
}

/** Each flyer once, in the order of the events (a flyer shared by several events goes with the first) */
export const flyerItems = ({ groups, flyers }: DigestContext): FlyerItem[] => {
  const seen = new Set<string>();
  return groups.flatMap((g, group) => {
    const flyer = flyers.get(g.event.id);
    if (!flyer || seen.has(flyer.alias)) return [];
    seen.add(flyer.alias);
    return [{ group, flyer }];
  });
};

/**
 * One page of up to four flyers on a page already added (with its header). `pageOf` gives the
 * page of each event's card or row, named under its flyer and linked.
 */
export const drawFlyerPage = (ctx: DigestContext, items: FlyerItem[], pageOf: Map<number, number>) => {
  const { doc, groups, geo: { W, M, PAGE_TOP, PAGE_BOTTOM }, kit: { font, color, stroke, txt, truncate, eyebrow } } = ctx;
  eyebrow('FLYERS TO PRINT', M, PAGE_TOP + 3, W - M);

  const top = PAGE_TOP + LABEL_H;
  const rowH = (PAGE_BOTTOM - top - ROW_GAP) / 2;
  const boxH = rowH - CAPTION_H;
  items.forEach(({ group, flyer }, i) => {
    const ev = groups[group].event;
    const colX = i % 2 === 0 ? M : W - M - COL_W;
    const rowY = top + Math.floor(i / 2) * (rowH + ROW_GAP);
    // As large as the box allows, keeping its shape
    let w = COL_W;
    let h = w / flyer.aspectRatio;
    if (h > boxH) {
      h = boxH;
      w = h * flyer.aspectRatio;
    }
    const x = colX + (COL_W - w) / 2;
    try {
      doc.addImage(flyer.dataUrl, flyer.format, x, rowY, w, h, flyer.alias, 'FAST');
      stroke(BORDER, 0.3);
      doc.rect(x, rowY, w, h, 'S');
      const posterLink = toAbsoluteHttpUrl(ev.posterUrl);
      if (posterLink) doc.link(x, rowY, w, h, { url: posterLink });
    } catch (err) {
      console.warn('Could not embed a flyer in the PDF:', err);
    }

    // Caption: the event, its date and time, and the page of its card
    const s = toDate(ev.date) || ctx.periodStart;
    const when = `${WEEKDAYS_LONG[s.getDay()].slice(0, 3)} ${s.getDate()} ${monthShort(s)} · ${isAllDay(s, toDate(ev.endDate)) ? 'All day' : clock(s)}`;
    const page = pageOf.get(group);
    font('semibold', 8);
    color(INK);
    doc.text(truncate(txt(ev.title) || 'Untitled event', w), x, rowY + h + 4);
    font('regular', 7);
    color(MUTED);
    doc.text(when, x, rowY + h + 7.6);
    if (page) {
      const label = `page ${page}`;
      const lx = x + w - doc.getTextWidth(label);
      color(LINK);
      doc.text(label, lx, rowY + h + 7.6);
      doc.link(lx, rowY + h + 5, doc.getTextWidth(label), 3.4, { pageNumber: page, top: 0 });
    }
  });
};
