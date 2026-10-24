import { useCallback } from 'react';
import { useToast } from '../contexts/ToastContext';
import { copyFormattedEmail, PASTE_KEYS } from '../utils/copyEmail';
import { loadOrReload } from '../utils/staleChunk';
import { recipientsFor } from '../services/emailRecipientsService';

/**
 * Admins: a new email to all staff reminding them to send in their events before Friday's digest,
 * sent like the digest's: the formatted email is copied to be pasted in, and the email app opens
 * with the recipients (Email recipients, in the account menu) and subject filled in. Without the
 * clipboard the plain text goes in.
 */
export const useReminderEmail = (): (() => Promise<void>) => {
  const { showToast } = useToast();
  return useCallback(async () => {
    const today = new Date();
    const baseUrl = window.location.origin;
    // The email's code loads on the first click, so the clipboard gets it as promises, still
    // inside the click: Safari allows nothing later
    const reminder = loadOrReload(() => import('../utils/reminderEmail'));
    const recipients = recipientsFor('reminder');
    const copied = await copyFormattedEmail(
      reminder.then((r) => r.generateReminderEmailHtml(today, { baseUrl })),
      reminder.then((r) => r.generateReminderEmail(today, { baseUrl }).body)
    );
    try {
      const [r, to] = await Promise.all([reminder, recipients]);
      window.location.href = copied
        ? r.generateReminderMailtoSubject(today, to)
        : r.generateReminderMailto(today, { baseUrl, recipients: to });
    } catch (err) {
      console.error('Opening the reminder failed:', err);
      showToast('The reminder could not be opened. Please try again.', 'error');
      return;
    }
    if (copied) showToast(`Reminder copied — click into the new message and press ${PASTE_KEYS} to paste it`, 'success', 12000);
    else showToast('Opening your email app', 'info');
  }, [showToast]);
};
