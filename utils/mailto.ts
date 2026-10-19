/** Addresses for a mailto: link, comma-separated, the "@" kept as is (RFC 6068) */
const addressList = (addresses: string[]): string =>
  addresses.map((a) => encodeURIComponent(a).replace(/%40/g, '@')).join(',');

/**
 * Link that opens a new email with the recipients, the subject and (when given) the text filled in,
 * line breaks as CRLF (RFC 6068). Spaces are %20: a "+" would show up in the email.
 */
export const mailtoLink = ({ to, cc = [], subject, body }: { to: string[]; cc?: string[]; subject: string; body?: string }): string =>
  `mailto:${addressList(to)}?` + (cc.length ? `cc=${addressList(cc)}&` : '') + `subject=${encodeURIComponent(subject)}` +
  (body === undefined ? '' : `&body=${encodeURIComponent(body.replace(/\n/g, '\r\n'))}`);
