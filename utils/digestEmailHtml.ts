/**
 * The covering email for the Events Digest as formatted HTML: the site's colours and logo, a
 * "Click here for details" button to the PDF and the events as date-tile rows, like the PDF. A
 * mailto: link can only carry plain text, so the app copies this to the clipboard and it is pasted
 * into the new email. Built from tables with inline styles, which Outlook, Gmail and Apple Mail all keep.
 * A pasted email keeps no <style> block, so there are no media queries: everything stacks (logo
 * over the title, category over the event name) and nothing sits side by side that would squeeze
 * on a phone, with only the date tile a fixed width.
 * Plain words for every reader: no "digest", "PDF" or "download" when there is a link.
 */
import type { Event } from '../types.ts';
import { isMultiDayEvent } from './date.ts';
import { formatAlsoOnDates, formatSeriesDates, summarizeSeries, monthShort } from './digestGrouping.ts';
import {
  digestGroupsFor, formatPeriodShort, toAbsoluteHttpUrl, toDate, clock, isAllDay, WEEKDAYS_LONG
} from './digestText.ts';
import { getCategoryRgb } from '../constants/categoryColors.ts';

const BRAND = '#B90B4F';
const GREEN = '#609C5C';
const PLACE = '#436F40';
const INK = '#222222';
const BODY = '#424242';
const MUTED = '#737373';
const BORDER = '#E6E6E6';
const SOFT = '#F6F6F6';
const FONT = "Lato, 'Segoe UI', Arial, Helvetica, sans-serif";

/** Side padding: room on a desktop without wasting a phone's narrow screen */
const SIDE = 24;

/** Most events listed in the email; the rest are counted ("…and 4 more in the PDF") */
const LIST_LIMIT = 40;

const esc = (text: string): string =>
  text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');

const nowrap = (html: string): string => `<span style="white-space:nowrap;">${html}</span>`;

const hex = ([r, g, b]: [number, number, number]) => `#${[r, g, b].map((n) => n.toString(16).padStart(2, '0')).join('')}`;

const mapsUrl = (place: string) => `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(place)}`;

/** "13:00 – 15:00", "All day" or "10:00 until Sun 18 Oct" (as on the PDF's cards) */
const whenOf = (start: Date, end: Date | null): string => {
  if (isAllDay(start, end)) return 'All day';
  if (!end) return clock(start);
  if (isMultiDayEvent(start, end)) return `${clock(start)} until ${WEEKDAYS_LONG[end.getDay()].slice(0, 3)} ${end.getDate()} ${monthShort(end)}`;
  return `${clock(start)} – ${clock(end)}`;
};

const p = (html: string, style = '') =>
  `<p style="margin:0 0 14px;font-family:${FONT};font-size:15px;line-height:23px;color:${BODY};${style}">${html}</p>`;

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
  const logo = toAbsoluteHttpUrl('/assets/ccp-logo-v2.png', options.baseUrl);
  const submitUrl = toAbsoluteHttpUrl('/submit', options.baseUrl);
  const pdfUrl = options.pdfUrl ? esc(options.pdfUrl) : null;
  const upcoming = groups.length === 1 ? 'one upcoming event' : `${groups.length} upcoming events`;

  // The period is already beside the logo, so the intro doesn't repeat it
  const intro = groups.length === 0
    ? p('There are no events scheduled for this period yet.')
    : pdfUrl
      ? p(`Here ${groups.length === 1 ? 'is' : 'are'} our ${upcoming}.`)
      : p(`Please find attached our ${upcoming}.`);

  // Bulletproof button: Outlook ignores padding and most styling on a link (pasted in, it showed
  // a tight box in one Outlook and a stretched, underlined one in another), so the cell carries
  // the colour and padding, and the inner span keeps the text white and not underlined
  const button = groups.length > 0 && pdfUrl ? `
<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:6px 0 10px;">
  <tr>
    <td bgcolor="${BRAND}" style="background:${BRAND};border-radius:4px;padding:12px 24px;">
      <a href="${pdfUrl}" target="_blank" style="font-family:${FONT};font-size:16px;line-height:20px;font-weight:bold;color:#ffffff;text-decoration:none;"><span style="color:#ffffff;text-decoration:none;">Click here for details</span></a>
    </td>
  </tr>
</table>
${p(`Opens on your phone or computer. For each event you'll see the description, the venue with a map, contacts, and buttons to add it to your Outlook or Google calendar.`, `font-size:13px;line-height:19px;color:${MUTED};`)}` : '';

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
          <table role="presentation" width="56" cellpadding="0" cellspacing="0" border="0" bgcolor="${tint}" style="width:56px;background:${tint};border-radius:10px 0 10px 0;text-align:center;">
            <tr><td style="padding:8px 0 0;font-family:${FONT};font-size:10px;line-height:12px;font-weight:bold;letter-spacing:1px;color:${cat};">${WEEKDAYS_LONG[start.getDay()].slice(0, 3).toUpperCase()}</td></tr>
            <tr><td style="font-family:${FONT};font-size:24px;line-height:28px;font-weight:bold;color:${INK};">${start.getDate()}</td></tr>
            <tr><td style="padding:0 0 8px;font-family:${FONT};font-size:10px;line-height:12px;font-weight:bold;letter-spacing:1px;color:${cat};">${monthShort(start).toUpperCase()}</td></tr>
          </table>
        </td>
        <td valign="top" style="font-family:${FONT};">
          <div style="font-size:11px;line-height:15px;font-weight:bold;letter-spacing:0.5px;text-transform:uppercase;color:${cat};">${esc(ev.category || 'Event')}</div>
          <div style="margin-top:3px;font-size:17px;line-height:22px;font-weight:bold;color:${INK};">${esc(ev.title.trim() || 'Untitled event')}</div>
          <div style="margin-top:5px;font-size:14px;line-height:19px;font-weight:bold;color:${BODY};">${esc(whenOf(start, end))}</div>
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

  return `<div style="margin:0;padding:0;">
<table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" align="center" style="width:100%;max-width:600px;margin:0 auto;background:#ffffff;border:1px solid ${BORDER};">
  <tr>
    <td style="padding:0;">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr>
        <td width="72%" height="6" bgcolor="${BRAND}" style="height:6px;line-height:6px;font-size:0;background:${BRAND};">&nbsp;</td>
        <td width="28%" height="6" bgcolor="${GREEN}" style="height:6px;line-height:6px;font-size:0;background:${GREEN};">&nbsp;</td>
      </tr></table>
    </td>
  </tr>
  <tr>
    <td style="padding:24px ${SIDE}px 0;">
      ${logo ? `<img src="${esc(logo)}" width="190" height="45" alt="Cork City Partnership" style="display:block;border:0;width:190px;max-width:100%;height:auto;">` : ''}
    </td>
  </tr>
  <tr>
    <td style="padding:20px ${SIDE}px 0;font-family:${FONT};">
      <div style="font-size:11px;line-height:16px;font-weight:bold;letter-spacing:2px;color:${BRAND};">UPCOMING EVENTS</div>
      <div style="margin-top:2px;font-size:22px;line-height:28px;font-weight:bold;color:${INK};">${period}</div>
    </td>
  </tr>
  <tr>
    <td style="padding:18px ${SIDE}px 8px;">
      ${p('Dear Board Members and Colleagues,')}
      ${intro}
      ${button}
      ${list}
    </td>
  </tr>
  ${submitUrl ? `<tr>
    <td style="padding:8px ${SIDE}px 24px;">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr>
        <td bgcolor="${SOFT}" style="background:${SOFT};border-radius:8px;padding:14px 16px;font-family:${FONT};font-size:14px;line-height:21px;color:${BODY};">
          <strong style="color:${INK};">Running an event?</strong> <a href="${esc(submitUrl)}" target="_blank" style="color:${BRAND};font-weight:bold;">Send it in</a> (no login needed) and it will be in the next update.
        </td>
      </tr></table>
    </td>
  </tr>` : ''}
  <tr>
    <td style="padding:14px ${SIDE}px;border-top:1px solid ${BORDER};font-family:${FONT};font-size:12px;line-height:18px;color:${MUTED};">
      ${nowrap('Cork City Partnership CLG &nbsp;·')}&nbsp; <span style="color:${PLACE};">${nowrap('Education | Employment | Empowerment')}</span>
    </td>
  </tr>
</table>
</div>`;
};
