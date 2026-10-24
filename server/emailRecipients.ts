/**
 * The recipients admins set for the digest and reminder emails, kept in R2 as one small JSON file
 * beside the digest issues (meta/ is never served by /api/file). Without the file, the defaults.
 */
import type { IssueBucket } from './digestIssues.ts';
import { DEFAULT_EMAIL_RECIPIENTS } from '../constants/digestRecipients.ts';
import { parseRecipientSettings, type EmailRecipientSettings } from '../utils/emailRecipients.ts';

export const RECIPIENTS_KEY = 'meta/email-recipients.json';

export interface StoredRecipients {
  recipients: EmailRecipientSettings;
  /** When an admin last saved them, and who (null: still the defaults) */
  updatedAt: string | null;
  updatedBy: string | null;
}

export const readRecipients = async (bucket: IssueBucket): Promise<StoredRecipients> => {
  const defaults = { recipients: DEFAULT_EMAIL_RECIPIENTS, updatedAt: null, updatedBy: null };
  const object = await bucket.get(RECIPIENTS_KEY);
  if (!object) return defaults;
  try {
    const data = JSON.parse(await object.text()) as Partial<Record<keyof StoredRecipients, unknown>>;
    const recipients = parseRecipientSettings(data.recipients);
    if (!recipients) return defaults;
    return {
      recipients,
      updatedAt: typeof data.updatedAt === 'string' ? data.updatedAt : null,
      updatedBy: typeof data.updatedBy === 'string' ? data.updatedBy : null
    };
  } catch {
    return defaults;
  }
};

export const writeRecipients = async (bucket: IssueBucket, stored: StoredRecipients): Promise<void> => {
  await bucket.put(RECIPIENTS_KEY, new Blob([JSON.stringify(stored)]), { httpMetadata: { contentType: 'application/json' } });
};
