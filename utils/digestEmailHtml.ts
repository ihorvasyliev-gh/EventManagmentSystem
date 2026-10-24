/**
 * The covering email for the Events Digest as formatted HTML, in the look the app's emails share
 * (emailHtml.ts): a "Click here for details" button to the PDF and the events as date-tile rows,
 * like the PDF. Everything stacks (the event name over its time) with only the date tile a fixed
 * width, and colour comes from cell backgrounds, so the email survives the new Outlook's paste.
 * Plain words for every reader: no "digest", "PDF" or "download" when there is a link.
 */
import type { Event } from '../types.ts';
import { isMultiDayEvent } from './date.ts';
import { formatAlsoOnDates, formatSeriesDates, summarizeSeries, monthShort } from './digestGrouping.ts';
import {
  digestGroupsFor, formatPeriodShort, toAbsoluteHttpUrl, toDate, clock, isAllDay, WEEKDAYS_LONG
} from './digestText.ts';
import { getCategoryRgb } from '../constants/categoryColors.ts';
import { BRAND, PLACE, INK, BODY, MUTED, BORDER, FONT, esc, nowrap, p, smallPrint, emailButton, emailShell } from './emailHtml.ts';

/** Most events listed in the email; the rest are counted ("…and 4 more in the PDF") */
const LIST_LIMIT = 40;

const hex = ([r, g, b]: [number, number, number]) => `#${[r, g, b].map((n) => n.toString(16).padStart(2, '0')).join('')}`;

const mapsUrl = (place: string) => `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(place)}`;

/** "13:00 – 15:00", "All day" or "10:00 until Sun 18 Oct" (as on the PDF's cards) */
const whenOf = (start: Date, end: Date | null): string => {
  if (isAllDay(start, end)) return 'All day';
  if (!end) return clock(start);
  if (isMultiDayEvent(start, end)) return `${clock(start)} until ${WEEKDAYS_LONG[end.getDay()].slice(0, 3)} ${end.getDate()} ${monthShort(end)}`;
  return `${clock(start)} – ${clock(end)}`;
};

export const generateDigestEmailHtml = (
  events: Event[],
  startDate: Date,
  endDate: Date,
  options: { baseUrl?: string; pdfUrl?: string | null } = {}
): string => {
  const groups = digestGroupsFor(events, startDate, endDate);
  // On a phone the period wraps only after the dash between two months ("23 October –" / "6 November
  // 2026"), never as "13 –" or with the year on its own line
  const [from, to] = esc(formatPeriodShort(startDate, endDate)).split(' – ');
  const period = !to ? nowrap(from) : from.includes(' ') ? `${nowrap(`${from} –`)} ${nowrap(to)}` : nowrap(`${from} – ${to}`);
  const submitUrl = toAbsoluteHttpUrl('/submit', options.baseUrl);
  const pdfUrl = options.pdfUrl || null;
  const upcoming = groups.length === 1 ? 'one upcoming event' : `${groups.length} upcoming events`;

  // The period is already beside the logo, so the intro doesn't repeat it
  const intro = groups.length === 0
    ? p('There are no events scheduled for this period yet.')
    : pdfUrl
      ? p(`Here ${groups.length === 1 ? 'is' : 'are'} our ${upcoming}.`)
      : p(`Please find attached our ${upcoming}.`);

  const button = groups.length > 0 && pdfUrl ? `${emailButton(pdfUrl, 'Click here for details')}
${smallPrint(`Opens on your phone or computer. For each event you'll see the description, the venue with a map, contacts, and buttons to add it to your Outlook or Google calendar. If anything changes after this email, the link always shows the latest version.`)}` : '';

  const rows = groups.slice(0, LIST_LIMIT).map((group) => {
    const ev = group.event;
    const start = toDate(ev.date) || startDate;
    const end = toDate(ev.endDate);
    const { accent, tint: tintRgb } = getCategoryRgb(ev.category);
    const cat = hex(accent);
    const tint = hex(tintRgb);
    const venue = ev.location?.trim().replace(/\s+/g, ' ');
    // A long series: "every Thursday" in bold, then its dates by month
    const series = summarizeSeries(group);
    const alsoOn = series
      ? `${series.pattern ? `<strong style="color:${INK};">${esc(series.pattern)}</strong>: ` : ''}${esc(formatSeriesDates(series.venues))}`
      : esc(formatAlsoOnDates(group, ', '));
    return `
<tr>
  <td style="padding:16px 0;border-top:1px solid ${BORDER};">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
      <tr>
        <td width="56" valign="top" style="width:56px;padding-right:14px;">
          <table role="presentation" width="56" cellpadding="0" cellspacing="0" border="0" style="width:56px;">
            <tr><td height="4" bgcolor="${cat}" style="height:4px;line-height:4px;font-size:0;background:${cat};border-radius:6px 6px 0 0;">&nbsp;</td></tr>
            <tr><td bgcolor="${tint}" align="center" style="background:${tint};padding:6px 0 0;text-align:center;font-family:${FONT};font-size:10px;line-height:12px;font-weight:bold;letter-spacing:1px;color:${cat};">${WEEKDAYS_LONG[start.getDay()].slice(0, 3).toUpperCase()}</td></tr>
            <tr><td bgcolor="${tint}" align="center" style="background:${tint};text-align:center;font-family:${FONT};font-size:24px;line-height:28px;font-weight:bold;color:${INK};">${start.getDate()}</td></tr>
            <tr><td bgcolor="${tint}" align="center" style="background:${tint};padding:0 0 7px;text-align:center;border-radius:0 0 6px 6px;font-family:${FONT};font-size:10px;line-height:12px;font-weight:bold;letter-spacing:1px;color:${cat};">${monthShort(start).toUpperCase()}</td></tr>
          </table>
        </td>
        <td valign="top" style="font-family:${FONT};">
          <div style="font-size:17px;line-height:22px;font-weight:bold;color:${INK};">${esc(ev.title.trim() || 'Untitled event')}</div>
          <div style="margin-top:4px;font-size:14px;line-height:19px;color:${BODY};">${nowrap(esc(whenOf(start, end)))}<span style="color:${MUTED};"> &nbsp;·&nbsp; </span><span style="color:${cat};white-space:nowrap;">${esc(ev.category || 'Event')}</span></div>
          ${venue ? `<div style="margin-top:3px;font-size:14px;line-height:19px;"><a href="${esc(mapsUrl(venue))}" target="_blank" style="color:${PLACE};text-decoration:none;">&#128205;&nbsp;${esc(venue)}</a></div>` : ''}
          ${alsoOn ? `<div style="margin-top:5px;font-size:12px;line-height:17px;color:${MUTED};">Also on ${alsoOn}</div>` : ''}
        </td>
      </tr>
    </table>
  </td>
</tr>`;
  }).join('');
  const more = groups.length - LIST_LIMIT;
  const list = groups.length === 0 ? '' : `
<p style="margin:22px 0 4px;font-family:${FONT};font-size:11px;font-weight:bold;letter-spacing:2px;color:${BRAND};">COMING UP</p>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">${rows}
${more > 0 ? `<tr><td style="padding:12px 0;border-top:1px solid ${BORDER};font-family:${FONT};font-size:13px;color:${MUTED};">…and ${more} more ${more === 1 ? 'event' : 'events'}${pdfUrl ? ': click the button above for details' : ' in the attached PDF'}</td></tr>` : ''}
</table>`;

  return emailShell({
    baseUrl: options.baseUrl,
    eyebrow: 'UPCOMING EVENTS',
    heading: period,
    body: [p('Dear Board Members and Colleagues,'), intro, button, list],
    note: submitUrl
      ? `<strong style="color:${INK};">Running an event?</strong> <a href="${esc(submitUrl)}" target="_blank" style="color:${BRAND};font-weight:bold;">Send it in</a> (no login needed) and it will be in the next update.`
      : undefined
  });
};
