/**
 * The look the app's formatted emails share (the Events Digest's covering email and the reminder
 * to send in events): the site's colours and logo, a band with a heading, the text, a grey note and
 * the footer. A mailto: link can only carry plain text, so the app copies these to the clipboard and
 * they are pasted into the new email. Built from tables with inline styles, which Outlook, Gmail and
 * Apple Mail all keep. A pasted email keeps no <style> block, so there are no media queries:
 * everything stacks and nothing sits side by side that would squeeze on a phone.
 *
 * The new Outlook pastes with "merge formatting": every text colour and font size becomes the
 * sender's default and a background on a table or div is dropped, while bold, link colours, images,
 * borders and the background of a table cell stay. So the emails read well in that state too: the
 * order and bold carry the hierarchy, and colour comes from cell backgrounds (the bars, the band,
 * the date tiles, the button), never from a table's background or only from text colour.
 */
import { toAbsoluteHttpUrl } from './digestText.ts';

export const BRAND = '#B90B4F';
export const GREEN = '#609C5C';
export const PLACE = '#436F40';
export const INK = '#222222';
export const BODY = '#424242';
export const MUTED = '#737373';
export const BORDER = '#E6E6E6';
const SOFT = '#F6F6F6';
/** The brand colour, faded, behind the heading */
const BRAND_TINT = '#F9E9EF';
export const FONT = "Lato, 'Segoe UI', Arial, Helvetica, sans-serif";

/** Side padding: room on a desktop without wasting a phone's narrow screen */
const SIDE = 24;

export const esc = (text: string): string =>
  text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');

export const nowrap = (html: string): string => `<span style="white-space:nowrap;">${html}</span>`;

export const p = (html: string, style = '') =>
  `<p style="margin:0 0 14px;font-family:${FONT};font-size:15px;line-height:23px;color:${BODY};${style}">${html}</p>`;

/** Small grey text, under a button */
export const smallPrint = (html: string) => p(html, `font-size:13px;line-height:19px;color:${MUTED};`);

/**
 * Bulletproof button: Outlook ignores padding and most styling on a link (pasted in, it showed
 * a tight box in one Outlook and a stretched, underlined one in another), so the cell carries
 * the colour and padding, and the inner span keeps the text white and not underlined
 */
export const emailButton = (href: string, label: string): string => `
<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:6px 0 10px;">
  <tr>
    <td bgcolor="${BRAND}" style="background:${BRAND};border-radius:4px;padding:12px 24px;">
      <a href="${esc(href)}" target="_blank" style="font-family:${FONT};font-size:16px;line-height:20px;font-weight:bold;color:#ffffff;text-decoration:none;"><span style="color:#ffffff;text-decoration:none;">${esc(label)}</span></a>
    </td>
  </tr>
</table>`;

/**
 * The whole email: the brand bars, the logo, the band with `eyebrow` (small capitals) over `heading`,
 * then `body` (HTML, one block per item), `note` (HTML) in a grey box, and the footer
 */
export const emailShell = ({ baseUrl, eyebrow, heading, body, note }: {
  baseUrl?: string;
  eyebrow: string;
  heading: string;
  body: string[];
  note?: string;
}): string => {
  const logo = toAbsoluteHttpUrl('/assets/ccp-logo-v2.png', baseUrl);
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
    <td style="padding:20px ${SIDE}px 0;">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr>
        <td bgcolor="${BRAND_TINT}" style="background:${BRAND_TINT};border-left:4px solid ${BRAND};border-radius:0 8px 8px 0;padding:12px 16px;font-family:${FONT};">
          <div style="font-size:11px;line-height:16px;font-weight:bold;letter-spacing:2px;color:${BRAND};">${eyebrow}</div>
          <div style="margin-top:2px;font-size:22px;line-height:28px;font-weight:bold;color:${INK};">${heading}</div>
        </td>
      </tr></table>
    </td>
  </tr>
  <tr>
    <td style="padding:18px ${SIDE}px 8px;">
      ${body.join('\n      ')}
    </td>
  </tr>
  ${note ? `<tr>
    <td style="padding:8px ${SIDE}px 24px;">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr>
        <td bgcolor="${SOFT}" style="background:${SOFT};border-radius:8px;padding:14px 16px;font-family:${FONT};font-size:14px;line-height:21px;color:${BODY};">
          ${note}
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
