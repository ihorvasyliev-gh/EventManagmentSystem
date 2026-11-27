/**
 * Friday one-click digest email: generates and shares the standard two-week digest
 * (Executive cards, printable flyers included) and builds the email HTML, plain text and mailto
 * link. Kept in its own module so the PDF generator stays out of the initial calendar bundle.
 */
import type { Event } from '../types';
import { calculatePresetDateRange, formatLocalDate } from './date';
import { expandRecurringEvents } from './recurrence';
import { groupDigestOccurrences, digestWeekStart } from './digestGrouping';
import { generateEventsDigestPDF, digestFileName } from './pdfExport';
import { generateDigestEmail, generateDigestMailto, generateDigestMailtoSubject } from './digestText';
import { generateDigestEmailHtml } from './digestEmailHtml';
import { buildDigestList } from './digestList';
import { digestKeyOf, rememberedDigestLink, rememberDigestLink } from './digestLinks';
import { fetchDigestIssues, shareDigestPdf } from '../services/digestService';
import type { EmailRecipients } from './emailRecipients';
import type { DigestPreviousIssue } from './pdf/digest/context';

export interface QuickDigestPrepared {
  html: string;
  text: string;
  pdfUrl: string | null;
  shareable: boolean;
  mailto: (copied: boolean, recipients: EmailRecipients) => string;
}

export const prepareFridayDigestEmail = async (
  events: Event[],
  recurrenceExceptions: Map<string, Date[]> | undefined,
  baseUrl: string,
  today: Date = new Date()
): Promise<QuickDigestPrepared> => {
  const { startDate, endDate, startDateStr, endDateStr } = calculatePresetDateRange('2weeks', {
    referenceDate: today,
    events
  });
  const format = 'executive' as const;
  const printFlyers = true;

  const periodEvents = expandRecurringEvents(events, startDate, endDate, recurrenceExceptions);
  const inRange = periodEvents.filter(
    (e) => e.date.getTime() >= startDate.getTime() && e.date.getTime() <= endDate.getTime()
  );
  const groups = groupDigestOccurrences(inRange.filter((e) => !e.status || e.status === 'published'));
  const shareable = groups.length > 0;

  const previousIssue: DigestPreviousIssue | null | undefined = await fetchDigestIssues(
    formatLocalDate(digestWeekStart(today))
  )
    .then(({ previous }) => (previous ? { issued: new Date(`${previous.issued}T00:00:00`), ids: previous.ids } : null))
    .catch((err) => {
      console.warn('Looking up the last digest failed:', err);
      return undefined;
    });

  let pdfUrl: string | null = null;
  if (shareable) {
    try {
      const key = digestKeyOf({ start: startDateStr, end: endDateStr, format, flyers: printFlyers, events: periodEvents });
      const remembered = rememberedDigestLink(key);
      if (remembered) {
        pdfUrl = remembered;
      } else {
        const blob = await generateEventsDigestPDF(periodEvents, {
          startDate,
          endDate,
          format,
          printableFlyers: printFlyers,
          output: 'blob',
          previousIssue
        });
        if (!blob) throw new Error('the PDF could not be made');
        const list = buildDigestList(periodEvents, { startDate, endDate, previousIssue });
        const result = await shareDigestPdf(
          blob,
          digestFileName(startDate, endDate),
          { issued: formatLocalDate(today), ids: groups.map((g) => g.event.id) },
          list,
          { layout: format, flyers: printFlyers }
        );
        rememberDigestLink(key, result);
        pdfUrl = result.url;
      }
    } catch (err) {
      console.error('Sharing the digest PDF failed:', err);
      pdfUrl = null;
    }
  }

  const html = generateDigestEmailHtml(periodEvents, startDate, endDate, { baseUrl, pdfUrl, previousIssue });
  const text = generateDigestEmail(periodEvents, startDate, endDate, { baseUrl, pdfUrl }).body;

  return {
    html,
    text,
    pdfUrl,
    shareable,
    mailto: (copied, recipients) =>
      copied
        ? generateDigestMailtoSubject(startDate, endDate, recipients)
        : generateDigestMailto(periodEvents, startDate, endDate, { baseUrl, pdfUrl, recipients })
  };
};
