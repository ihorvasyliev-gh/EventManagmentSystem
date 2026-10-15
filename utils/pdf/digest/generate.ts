/**
 * The Upcoming Events Digest PDF: loads what it needs, lays the events out at the density
 * that leaves the smallest gaps, then draws page 1, the cards or table rows, the flyers to
 * print, the footers and the bookmarks.
 */
import type jsPDF from 'jspdf';
import { createScreenOnlyLayer } from '../../pdfScreenOnly.ts';
import { paginate, pickLayout } from '../../pdfLayout.ts';
import { type Event } from '../../../types';
import { formatLocalDate } from '../../date';
import { toDate, startOfLocalDay } from '../../digestText.ts';
import { loadImageCached } from '../images';
import { loadFontData } from '../fonts';
import { registerLato, createPdfKit } from '../kit';
import { MONTHS_LONG } from '../../digestText.ts';
import { formatDateRange, dayKeyOf } from '../dates';
import { DENSITIES, type Density } from '../theme';
import { type Block, type BulletinOptions, type DigestContext, type PdfFlyer, collectDigestData, pageGeometry } from './context';
import { drawHero, drawStats, drawPageHeader, drawFooters, drawNoEvents } from './frame';
import { showsGlance, glanceCellH, glanceHeight, drawGlance, legendHeight, drawLegend } from './glance';
import {
  showsWeekBanners, weekIndexOf, weekRange, weekBanner, monthIndexOf, monthOf, monthBanner, dayHeader, continuedHeader
} from './headings';
import { executiveCard } from './executiveCard';
import { TABLE_HEAD_H, drawTableHead, compactRow } from './compactRow';
import { planContents, drawContents } from './contents';
import { FLYERS_PER_PAGE, flyerItems, drawFlyerPage } from './flyers';
import { addBookmarks } from './outline';

export type { BulletinOptions } from './context';

/** File name used for a digest covering the given period */
export const digestFileName = (startDate: Date, endDate: Date): string =>
  `CCP-Upcoming-Events-${formatLocalDate(startDate)}-to-${formatLocalDate(endDate)}.pdf`;

/**
 * Generate the Upcoming Events Digest PDF.
 * Occurrences of the same event (recurring / multi-date) are merged into one entry
 * shown on its first date, with the remaining dates listed as "Also on".
 */
export const generateEventsDigestPDF = async (
  events: Event[],
  options: BulletinOptions
): Promise<Blob | void> => {
  const { jsPDF: JsPDF } = await import('jspdf');
  const doc: jsPDF = new JsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4', compress: true });
  const screenOnly = createScreenOnlyLayer(doc);
  const geo = pageGeometry(doc);
  const hasLato = registerLato(doc, await loadFontData());
  const kit = createPdfKit(doc, hasLato);
  const data = collectDigestData(events, options);
  const { groups, isExecutive, periodStart, periodEnd, longPeriod } = data;
  const printFlyers = options.printableFlyers !== false;

  const [logo, flyers] = await Promise.all([
    // Printed about 55 mm wide: 600 px is still well over 250 dpi
    loadImageCached('/assets/ccp-logo-v2.png', 600),
    (async () => {
      // Keyed by event; the alias is per image, so a flyer shared by several events is embedded once
      // (the card's thumbnail and the large copy at the end are the same image)
      const map = new Map<string, PdfFlyer>();
      if (!isExecutive && !printFlyers) return map;
      // Printed large (about 82 x 111 mm), 1000 px is over 200 dpi; thumbnails alone (at most 42 mm
      // tall) need 600 px to stay sharp, QR codes included. JPEG keeps a PNG flyer from adding a
      // few hundred KB to the file
      const maxSide = printFlyers ? 1000 : 600;
      await Promise.all(groups.map(async ({ event: ev }) => {
        const url = ev.posterUrl || ev.attachments?.find((a) => a.type === 'image')?.url;
        if (!url) return;
        const flyer = await loadImageCached(url, maxSide, true);
        if (flyer) map.set(ev.id, { ...flyer, alias: `flyer-${url}` });
      }));
      return map;
    })()
  ]);
  const ctx: DigestContext = { ...data, doc, kit, screenOnly, geo, logo, flyers, printFlyers, flyerPages: new Map() };

  // --- Blocks ------------------------------------------------------------
  // Long periods are headed by month, others over a week by week
  const dayOf = (group: number) => startOfLocalDay(toDate(groups[group].event.date) || periodStart);
  const showWeekBanners = showsWeekBanners(ctx);
  const sectionOf = longPeriod
    ? (group: number) => {
        const key = monthIndexOf(ctx, dayOf(group));
        const month = monthOf(ctx, key);
        return { key, title: `${MONTHS_LONG[month.getMonth()]} ${month.getFullYear()}` };
      }
    : showWeekBanners
      ? (group: number) => {
          const key = weekIndexOf(ctx, dayOf(group));
          return { key, title: weekRange(ctx, key) };
        }
      : null;
  const dayCounts = new Map<string, number>();
  const monthCounts = new Map<number, number>();
  groups.forEach((_, i) => {
    const key = dayKeyOf(dayOf(i));
    dayCounts.set(key, (dayCounts.get(key) ?? 0) + 1);
    const month = monthIndexOf(ctx, dayOf(i));
    monthCounts.set(month, (monthCounts.get(month) ?? 0) + 1);
  });

  const buildBlocks = (density: Density): Block[] => {
    const blocks: Block[] = [];
    let lastSection: number | null = null;
    let lastDay = '';
    groups.forEach((group, i) => {
      const day = dayOf(i);
      const key = dayKeyOf(day);
      const section = sectionOf?.(i).key;
      if (section !== undefined && section !== lastSection) {
        lastSection = section;
        blocks.push(longPeriod
          ? monthBanner(ctx, monthOf(ctx, section), monthCounts.get(section) ?? 1, density.monthBannerH)
          : weekBanner(ctx, section, density.weekBannerH));
      }
      if (isExecutive) {
        // The date sits beside the card (no header row of its own)
        blocks.push(executiveCard(ctx, group, i, density));
        return;
      }
      if (key !== lastDay) {
        lastDay = key;
        blocks.push(dayHeader(ctx, day, dayCounts.get(key) ?? 1));
      }
      blocks.push(compactRow(ctx, group, i, key));
    });
    return blocks;
  };

  // --- Layout ------------------------------------------------------------
  const { HERO_BOTTOM, PAGE_TOP, PAGE_BOTTOM } = geo;
  const showGlance = showsGlance(ctx);
  const contents = planContents(ctx, showGlance);
  const listTop = (density: Density) =>
    showGlance ? HERO_BOTTOM + glanceHeight(ctx, density) + 2 + legendHeight(ctx) + 5 : HERO_BOTTOM + contents.height;
  const tableHeadSpace = isExecutive ? 0 : TABLE_HEAD_H + 1;

  const layoutFor = (density: Density) => paginate(buildBlocks(density), {
    firstTop: listTop(density) + tableHeadSpace,
    pageTop: PAGE_TOP + tableHeadSpace,
    pageBottom: PAGE_BOTTOM,
    gapAfter: (block, next) => {
      // Executive: a little more air before the first card of the next day
      if (isExecutive) {
        return block.group !== undefined && next?.group !== undefined && next.dayKey !== block.dayKey ? density.dayGap : 0;
      }
      if (!next?.isDayHeader) return 0;
      return block.dayKey && !block.isDayHeader ? 1.5 : 0;
    },
    continued: isExecutive ? undefined : (dayKey) => continuedHeader(ctx, dayKey)
  });

  // The compact table has short rows, so it never leaves much of a gap
  const candidates = isExecutive ? DENSITIES : DENSITIES.slice(0, 1);
  const layouts = candidates.map(layoutFor);
  const chosen = pickLayout(layouts);
  const density = candidates[chosen];
  const { pages } = layouts[chosen];

  // Where each event's card or row landed; on the cards, each day's date goes beside its
  // first card, and again on a page the day carries over onto
  const cardAt = new Map<number, { page: number; y: number }>();
  let prevDay = '';
  pages.forEach((placements, p) => {
    let firstOnPage = true;
    placements.forEach(({ block, y }) => {
      if (block.group === undefined) return;
      cardAt.set(block.group, { page: p + 1, y });
      if (!isExecutive) return;
      block.tile = block.dayKey !== prevDay ? 'first' : firstOnPage ? 'continued' : undefined;
      prevDay = block.dayKey ?? '';
      firstOnPage = false;
    });
  });
  const pageOf = new Map(Array.from(cardAt, ([group, at]) => [group, at.page]));

  // The flyers to print follow the events, four to a page; the cards say which page
  const flyerList = printFlyers && groups.length > 0 ? flyerItems(ctx) : [];
  const flyersPage = flyerList.length ? pages.length + 1 : null;
  if (flyersPage) {
    const pageOfAlias = new Map(flyerList.map((it, k) => [it.flyer.alias, flyersPage + Math.floor(k / FLYERS_PER_PAGE)]));
    flyers.forEach((flyer, eventId) => {
      const page = pageOfAlias.get(flyer.alias);
      if (page) ctx.flyerPages.set(eventId, page);
    });
  }

  // --- Render ------------------------------------------------------------
  drawHero(ctx);
  drawStats(ctx);
  if (showGlance) {
    drawGlance(ctx, HERO_BOTTOM, glanceCellH(ctx, density));
    drawLegend(ctx, HERO_BOTTOM + glanceHeight(ctx, density) + 2);
  }

  if (groups.length === 0) {
    drawNoEvents(ctx, listTop(density));
  } else {
    pages.forEach((placements, p) => {
      if (p > 0) {
        doc.addPage();
        drawPageHeader(ctx);
      }
      // A page without event rows gets no table header
      if (!isExecutive && placements.some(({ block }) => block.dayKey)) drawTableHead(ctx, p === 0 ? listTop(density) : PAGE_TOP);
      placements.forEach(({ block, y }) => block.draw(y));
    });
    for (let k = 0; k < flyerList.length; k += FLYERS_PER_PAGE) {
      doc.addPage();
      drawPageHeader(ctx);
      drawFlyerPage(ctx, flyerList.slice(k, k + FLYERS_PER_PAGE), pageOf);
    }
    if (contents.show) {
      // Drawn last: it needs the page each card landed on
      doc.setPage(1);
      drawContents(ctx, contents, HERO_BOTTOM, cardAt);
    }
  }

  drawFooters(ctx);
  if (groups.length > 0) addBookmarks(ctx, pageOf, sectionOf, flyersPage);

  doc.setProperties({
    title: `Upcoming Events — ${formatDateRange(periodStart, periodEnd)}`,
    subject: 'Cork City Partnership events digest',
    author: 'Cork City Partnership',
    creator: 'CCP Event Calendar'
  });

  if (options.output === 'blob') {
    return doc.output('blob');
  }
  doc.save(digestFileName(periodStart, periodEnd));
};
