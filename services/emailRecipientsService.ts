import { ApiError, callApi } from './apiClient';
import { DEFAULT_EMAIL_RECIPIENTS } from '../constants/digestRecipients';
import { parseRecipientSettings, type EmailKind, type EmailRecipients, type EmailRecipientSettings } from '../utils/emailRecipients';

export interface SavedEmailRecipients {
  recipients: EmailRecipientSettings;
  /** When an admin last changed them, and who (null: still the defaults) */
  updatedAt: string | null;
  updatedBy: string | null;
}

const PATH = '/api/email-recipients';
/** The last recipients the server gave, for an email opened while it can't be reached */
const LAST_KEY = 'ccp_email_recipients';
/** The email app should open without a long wait: past this, the last recipients known are used */
const LOAD_TIMEOUT_MS = 4000;

const remember = (recipients: EmailRecipientSettings) => {
  try {
    localStorage.setItem(LAST_KEY, JSON.stringify(recipients));
  } catch {
    // Just not remembered
  }
};

const lastKnown = (): EmailRecipientSettings | null => {
  try {
    return parseRecipientSettings(JSON.parse(localStorage.getItem(LAST_KEY) ?? 'null'));
  } catch {
    return null;
  }
};

const checked = (saved: Partial<SavedEmailRecipients>): SavedEmailRecipients => {
  const recipients = parseRecipientSettings(saved.recipients);
  if (!recipients) throw new ApiError('The email recipients could not be loaded.', 502);
  remember(recipients);
  return { recipients, updatedAt: saved.updatedAt ?? null, updatedBy: saved.updatedBy ?? null };
};

/** Who the digest and reminder emails go to (admins only) */
export const fetchEmailRecipients = async (): Promise<SavedEmailRecipients> =>
  checked(await callApi<Partial<SavedEmailRecipients>>(PATH));

export const saveEmailRecipients = async (recipients: EmailRecipientSettings): Promise<SavedEmailRecipients> =>
  checked(await callApi<Partial<SavedEmailRecipients>>(PATH, { method: 'PUT', body: { recipients } }));

/**
 * The recipients to fill in when an email opens. Asked fresh each time, so a change another admin
 * made counts; when the server can't answer in time, the last ones it gave, or the defaults.
 */
export const recipientsFor = async (kind: EmailKind): Promise<EmailRecipients> => {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error('timed out')), LOAD_TIMEOUT_MS);
  });
  try {
    return (await Promise.race([fetchEmailRecipients(), timeout])).recipients[kind];
  } catch (err) {
    console.warn('Using the last known email recipients:', err);
    return (lastKnown() ?? DEFAULT_EMAIL_RECIPIENTS)[kind];
  } finally {
    clearTimeout(timer);
  }
};
