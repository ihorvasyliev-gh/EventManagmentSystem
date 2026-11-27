import { useCallback, useState } from 'react';
import type { Event } from '../types';
import { useToast } from '../contexts/ToastContext';
import { copyFormattedEmail, PASTE_KEYS } from '../utils/copyEmail';
import { loadOrReload } from '../utils/staleChunk';
import { recipientsFor } from '../services/emailRecipientsService';

/**
 * Admins: one-click Friday email for the standard two-week digest (Executive cards, flyers
 * included). Loads the PDF code on click so it stays out of the initial bundle, and passes
 * promises to the clipboard inside the click so Safari accepts it. Returns true when sent cleanly.
 */
export const useQuickDigestEmail = (
  events: Event[],
  recurrenceExceptions: Map<string, Date[]> | undefined,
  onShared?: () => void
) => {
  const { showToast } = useToast();
  const [sending, setSending] = useState(false);

  const send = useCallback(async (): Promise<boolean> => {
    setSending(true);
    const today = new Date();
    const baseUrl = window.location.origin;
    const prepared = loadOrReload(() => import('../utils/quickDigestEmail')).then((m) =>
      m.prepareFridayDigestEmail(events, recurrenceExceptions, baseUrl, today)
    );
    const recipients = recipientsFor('digest');

    const copied = await copyFormattedEmail(
      prepared.then((p) => p.html),
      prepared.then((p) => p.text)
    );

    try {
      const [result, to] = await Promise.all([prepared, recipients]);
      window.location.href = result.mailto(copied, to);
      const failed = result.shareable && !result.pdfUrl;
      if (copied) {
        showToast(
          `Email copied — click into the new message and press ${PASTE_KEYS} to paste it` +
            (failed ? '. The PDF could not be uploaded: attach it by hand.' : ''),
          failed ? 'warning' : 'success',
          12000
        );
      } else if (failed) {
        showToast('The PDF could not be uploaded — attach it to the email by hand', 'warning');
      } else {
        showToast('Opening your email app', 'info');
      }
      if (!failed) onShared?.();
      return !failed;
    } catch (err) {
      console.error('Sending the digest email failed:', err);
      showToast('The digest email could not be prepared. Please try again.', 'error');
      return false;
    } finally {
      setSending(false);
    }
  }, [events, recurrenceExceptions, onShared, showToast]);

  return { send, sending };
};
