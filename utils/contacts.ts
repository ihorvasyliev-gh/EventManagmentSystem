/**
 * An event's contact people: the first is the person who sent it in (submitter_name /
 * submitter_email), any more are kept in extra_contacts. Everywhere contacts are shown
 * (the event window, the inbox, the digest, WhatsApp text, Excel) they come from here.
 */
import type { Event, EventContact } from '../types.ts';

/** Contacts an event can have in all, the first one included (the server allows no more) */
export const MAX_CONTACTS = 5;

const clean = (value: unknown): string => (typeof value === 'string' ? value.trim() : '');

/** Contacts from stored data (extra_contacts), without blank entries */
export const readContacts = (value: unknown): EventContact[] => {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item) => {
    if (!item || typeof item !== 'object') return [];
    const name = clean((item as EventContact).name);
    const email = clean((item as EventContact).email);
    return name || email ? [email ? { name, email } : { name }] : [];
  });
};

/** Every contact of an event, the person who sent it in first */
export const eventContacts = (ev: Pick<Event, 'submitterName' | 'submitterEmail' | 'extraContacts'>): EventContact[] =>
  readContacts([{ name: ev.submitterName, email: ev.submitterEmail }, ...(ev.extraContacts ?? [])]);

/** "Sarah Murphy · sarah@x.ie" (or just the name, or just the email) */
export const formatContact = (contact: EventContact, separator = ' · '): string =>
  [contact.name, contact.email].filter(Boolean).join(separator);

/** One row of a contact form (`key` keeps React rows apart while people add and remove them) */
export interface ContactRow {
  key: string;
  name: string;
  email: string;
}

let nextRowKey = 0;

export const newContactRow = (contact?: Partial<EventContact>): ContactRow => ({
  key: `contact-${++nextRowKey}`,
  name: contact?.name ?? '',
  email: contact?.email ?? ''
});

export const toContactRows = (contacts?: EventContact[]): ContactRow[] => readContacts(contacts).map(newContactRow);

/** The rows as contacts to save: trimmed, rows left blank dropped */
export const fromContactRows = (rows: ContactRow[]): EventContact[] => readContacts(rows);
