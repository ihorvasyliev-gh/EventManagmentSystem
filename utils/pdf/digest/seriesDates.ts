/**
 * "Also on" for a long series: the pattern ("every Thursday until 17 Dec") beside the label, and
 * the other dates by month ("22, 29 Oct · 5, 12, 19, 26 Nov", as in the email and WhatsApp text),
 * a row per venue, wrapped to the width. No calendar buttons per date: a pair for every date is
 * what made these cards long.
 */
import type { SeriesSummary } from '../../digestGrouping';
import { createGoogleMapsUrl } from '../links';
import { INK, MUTED, PLACE } from '../theme';
import type { DigestContext } from './context';

const PIN_W = 3.4;

/**
 * Lays out the dates in `width`. `draw` writes the pattern from `patternX` on the "ALSO ON"
 * label's baseline `labelY` (the caller draws the label) and the date rows `rowH` apart from `firstRowY`.
 */
export const seriesDates = (ctx: DigestContext, series: SeriesSummary, width: number, fs: number) => {
  const { doc, kit: { font, txt, color, truncate, drawPin } } = ctx;

  font('semibold', fs);
  // Days of a month apart by ", ", months by " · "
  const spaceW = doc.getTextWidth(' ');
  const dotGap = doc.getTextWidth(' · ');
  const dayW = (s: string) => {
    font('semibold', fs);
    return doc.getTextWidth(s);
  };
  const monthW = (s: string) => {
    font('bold', fs);
    return doc.getTextWidth(` ${s}`);
  };

  // Each date is placed whole, with its comma; a month's name follows its last day
  const items: Array<{ text: string; month?: string; x: number; row: number; dot: boolean }> = [];
  const places: Array<{ text: string; full: string; row: number }> = [];
  let row = -1;
  series.venues.forEach((venue) => {
    row++;
    let indent = 0;
    if (venue.place) {
      font('medium', fs);
      const shown = truncate(txt(venue.place), width * 0.4);
      places.push({ text: shown, full: venue.place, row });
      indent = PIN_W + doc.getTextWidth(shown) + 3;
    }
    let x = indent;
    venue.months.forEach((m) => {
      m.days.forEach((day, di) => {
        const last = di === m.days.length - 1;
        const text = last ? day : `${day},`;
        const month = last ? m.month : undefined;
        const w = dayW(text) + (month ? monthW(month) : 0);
        const gap = x === indent ? 0 : di === 0 ? dotGap : spaceW;
        if (x > indent && x + gap + w > width) {
          row++;
          x = indent;
        } else {
          x += gap;
        }
        // A dot before a new month, unless it starts a row
        items.push({ text, month, x, row, dot: x > indent && di === 0 });
        x += w;
      });
    });
  });

  return {
    rows: row + 1,
    draw: (left: number, labelY: number, patternX: number, firstRowY: number, rowH: number) => {
      if (series.pattern) {
        font('semibold', fs);
        color(INK);
        doc.text(truncate(series.pattern, left + width - patternX), patternX, labelY);
      }
      places.forEach((p) => {
        const y = firstRowY + p.row * rowH;
        drawPin(left, y, PLACE);
        font('medium', fs);
        color(PLACE);
        doc.text(p.text, left + PIN_W, y);
        doc.link(left, y - 2.8, PIN_W + doc.getTextWidth(p.text), 3.6, { url: createGoogleMapsUrl(p.full) });
      });
      items.forEach((it) => {
        const x = left + it.x;
        const y = firstRowY + it.row * rowH;
        if (it.dot) {
          font('semibold', fs);
          color(MUTED);
          doc.text('·', x - dotGap / 2, y, { align: 'center' });
        }
        font('semibold', fs);
        color(INK);
        doc.text(it.text, x, y);
        if (it.month) {
          const dw = doc.getTextWidth(it.text);
          font('bold', fs);
          color(MUTED);
          doc.text(` ${it.month}`, x + dw, y);
        }
      });
    }
  };
};
