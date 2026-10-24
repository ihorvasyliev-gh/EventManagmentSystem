import type { EmailRecipientSettings } from '../utils/emailRecipients.ts';

/**
 * Who the admins' emails go to until an admin changes it in "Email recipients" (account menu).
 * The "Email" button in the Events Digest and the "Reminder" button open a new email with these
 * filled in (still editable before sending).
 */
export const DEFAULT_EMAIL_RECIPIENTS: EmailRecipientSettings = {
  digest: { to: ['allstaff@partnershipcork.ie'], cc: ['martin_davoren@corkcity.ie', 'kieran_oconnell@corkcity.ie'], bcc: [] },
  // The reminder to send in events before the digest goes out: staff only, no CC
  reminder: { to: ['allstaff@partnershipcork.ie'], cc: [], bcc: [] }
};
