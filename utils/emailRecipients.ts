/**
 * Who the admins' two emails go to, the Events Digest's and the Reminder's, each with its own To,
 * CC and BCC. Admins change them in "Email recipients" (account menu); until then the addresses in
 * constants/digestRecipients.ts are used. Shared by the app and /api/email-recipients, which both
 * check what they are given with parseRecipientSettings.
 */
export type EmailKind = 'digest' | 'reminder';
export type RecipientField = 'to' | 'cc' | 'bcc';

export interface EmailRecipients {
  to: string[];
  cc: string[];
  bcc: string[];
}

export type EmailRecipientSettings = Record<EmailKind, EmailRecipients>;

export const EMAIL_KINDS: EmailKind[] = ['digest', 'reminder'];
export const RECIPIENT_FIELDS: RecipientField[] = ['to', 'cc', 'bcc'];
/** Far more than either email needs; keeps the mailto: link (and the stored file) small */
export const MAX_RECIPIENTS = 50;

const ADDRESS_RE =
  /^[A-Za-z0-9.!#$%&'*+/=?^_`{|}~-]+@[A-Za-z0-9](?:[A-Za-z0-9-]*[A-Za-z0-9])?(?:\.[A-Za-z0-9](?:[A-Za-z0-9-]*[A-Za-z0-9])?)+$/;

export const isEmailAddress = (value: string): boolean => value.length <= 254 && ADDRESS_RE.test(value);

/**
 * The addresses in typed or pasted text: separated by commas, semicolons, spaces or new lines, as
 * Outlook copies them too ("Ada Admin <ada@x.ie>; bob@x.ie"). What isn't an address comes back in
 * `invalid`, to be shown rather than dropped.
 */
export const splitAddresses = (text: string): { addresses: string[]; invalid: string[] } => {
  const addresses: string[] = [];
  const invalid: string[] = [];
  // A quoted name may hold a comma ("Admin, Ada" <ada@x.ie>): it is never part of the address
  for (const part of text.replace(/"[^"]*"/g, ' ').split(/[,;\n]+/)) {
    const bracketed = part.match(/<([^<>]*)>/);
    for (const word of (bracketed ? bracketed[1] : part).split(/\s+/)) {
      const address = word.trim().replace(/^mailto:/i, '');
      if (!address) continue;
      (isEmailAddress(address) ? addresses : invalid).push(address);
    }
  }
  return { addresses, invalid };
};

/** Each address once (compared without case), in the order first given */
export const uniqueAddresses = (addresses: string[]): string[] => {
  const seen = new Set<string>();
  return addresses.filter((a) => {
    const key = a.toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
};

export const recipientCount = (r: EmailRecipients): number => r.to.length + r.cc.length + r.bcc.length;

/**
 * Chrome and Edge on Windows don't open a mailto: link over 2,048 characters, and the link carries
 * every address: past about this many characters of them, the email may not open.
 */
export const MAX_ADDRESS_CHARS = 1500;
export const addressChars = (r: EmailRecipients): number => [...r.to, ...r.cc, ...r.bcc].join(',').length;

const parseList = (value: unknown): string[] | null => {
  if (!Array.isArray(value) || value.length > MAX_RECIPIENTS) return null;
  const list = value.map((a) => (typeof a === 'string' ? a.trim() : ''));
  return list.every(isEmailAddress) ? uniqueAddresses(list) : null;
};

const parseRecipients = (value: unknown): EmailRecipients | null => {
  if (!value || typeof value !== 'object') return null;
  const v = value as Record<string, unknown>;
  const to = parseList(v.to ?? []);
  const cc = parseList(v.cc ?? []);
  const bcc = parseList(v.bcc ?? []);
  if (!to || !cc || !bcc) return null;
  const recipients = { to, cc, bcc };
  return recipientCount(recipients) > 0 ? recipients : null;
};

/** Both emails' recipients from untrusted input (a request, the stored file), or null if any part isn't right */
export const parseRecipientSettings = (value: unknown): EmailRecipientSettings | null => {
  if (!value || typeof value !== 'object') return null;
  const v = value as Record<string, unknown>;
  const digest = parseRecipients(v.digest);
  const reminder = parseRecipients(v.reminder);
  return digest && reminder ? { digest, reminder } : null;
};

const sameList = (a: string[], b: string[]): boolean =>
  a.length === b.length && a.every((x, i) => x.toLowerCase() === b[i].toLowerCase());

export const sameRecipients = (a: EmailRecipients, b: EmailRecipients): boolean =>
  RECIPIENT_FIELDS.every((field) => sameList(a[field], b[field]));
