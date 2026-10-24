import React, { useState, useEffect, useMemo, useRef } from 'react';
import {
  FileText, Download, Check, MessageSquare, LayoutGrid, List, Eye, AlertTriangle, Inbox, ChevronDown, CalendarPlus, Mail, Link2, MoreHorizontal,
  RefreshCw
} from 'lucide-react';
import { type Event } from '../types';
import { generateEventsDigestPDF, generateWhatsAppSummary, digestFileName } from '../utils/pdfExport';
import { generateDigestEmail, generateDigestMailto, generateDigestMailtoSubject } from '../utils/digestText';
import { generateDigestEmailHtml } from '../utils/digestEmailHtml';
import { copyFormattedEmail, PASTE_KEYS } from '../utils/copyEmail';
import { shareDigestPdf, fetchDigestIssues, type SentDigest } from '../services/digestService';
import { recipientsFor } from '../services/emailRecipientsService';
import { buildDigestList, parseDigestList, digestListChanges, markDigestUpdate, type DigestList } from '../utils/digestList';
import {
  digestKeyOf, rememberedDigestLink, rememberDigestLink, digestFromKey, digestFromPagePath, digestListUrl
} from '../utils/digestLinks';
import { calculatePresetDateRange, formatLocalDate, type DateRangePreset } from '../utils/date';
import { expandRecurringEvents } from '../utils/recurrence';
import { groupDigestOccurrences, formatAlsoOnDates, digestWeekStart, monthShort } from '../utils/digestGrouping';
import { WEEKDAYS_LONG } from '../utils/digestText';
import type { DigestPreviousIssue } from '../utils/pdf/digest/context';
import { useToast } from '../contexts/ToastContext';
import { getCategoryDotColor } from './WeekView';
import ModalShell from './ModalShell';

interface FortnightlyBulletinModalProps {
  isOpen: boolean;
  onClose: () => void;
  events: Event[];
  /** Deleted occurrences of recurring events */
  recurrenceExceptions?: Map<string, Date[]>;
  /** Admins: open the submissions inbox (shown when pending events fall in the period) */
  onOpenSubmissions?: () => void;
  /** Admins: the covering email, the WhatsApp text and a link to the PDF (staff preview and download it) */
  canShare?: boolean;
}

const PRESETS: Array<{ id: DateRangePreset; label: string }> = [
  { id: '1week', label: '1 week' },
  { id: '2weeks', label: '2 weeks' },
  { id: '1month', label: '1 month' },
  { id: 'all', label: 'All upcoming' }
];

const FORMAT_KEY = 'ccp_digest_format';
const FLYERS_KEY = 'ccp_digest_flyers';

const readPref = (key: string): string | null => {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
};
const writePref = (key: string, value: string) => {
  try {
    localStorage.setItem(key, value);
  } catch {
    // Preference just isn't remembered
  }
};

/**
 * Copies text that may still be on its way (the digest link is uploaded first). Safari only lets a
 * page write to the clipboard during the click itself, so where it can the text goes in as a promise.
 * Rejects when the text can't be had.
 */
const copyText = async (text: Promise<string>): Promise<void> => {
  if (typeof ClipboardItem !== 'undefined' && navigator.clipboard?.write) {
    try {
      await navigator.clipboard.write([new ClipboardItem({ 'text/plain': text.then((t) => new Blob([t], { type: 'text/plain' })) })]);
      return;
    } catch {
      // Not supported this way, or not allowed: the plain ways below
    }
  }
  const value = await text;
  try {
    await navigator.clipboard.writeText(value);
  } catch {
    const input = document.createElement('textarea');
    input.value = value;
    document.body.appendChild(input);
    input.select();
    document.execCommand('copy');
    document.body.removeChild(input);
  }
};

/** A digest can be updated for a week after it went out: then the next one is due */
const UPDATE_DAYS = 7;

/** A shared digest's list of events (beside its PDF), or null when it has none or can't be had */
const fetchDigestList = async (key: string): Promise<DigestList | null> => {
  const file = digestFromKey(key);
  if (!file) return null;
  try {
    const res = await fetch(digestListUrl(file));
    return res.ok ? parseDigestList(await res.json()) : null;
  } catch {
    return null;
  }
};

/** "today" or "on Fri 23 Oct" */
const sentOn = (day: Date): string =>
  formatLocalDate(day) === formatLocalDate(new Date())
    ? 'today'
    : `on ${WEEKDAYS_LONG[day.getDay()].slice(0, 3)} ${day.getDate()} ${monthShort(day)}`;

/** "Coffee morning", "Coffee morning and Job fair", "A, B, C and 2 more" */
const nameEvents = (titles: string[]): string => {
  const shown = titles.slice(0, 3);
  const more = titles.length - shown.length;
  if (more > 0) return `${shown.join(', ')} and ${more} more`;
  return shown.length > 1 ? `${shown.slice(0, -1).join(', ')} and ${shown[shown.length - 1]}` : shown.join('');
};

const spinner = <span className="w-4 h-4 shrink-0 border-2 border-current border-t-transparent rounded-full animate-spin" />;

const fmtDay = (d: Date) => d.toLocaleDateString('en-IE', { weekday: 'short', day: 'numeric', month: 'short' });
const fmtTime = (d: Date) => `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;

/** Tiny schematic of each PDF layout so the choice is visual, not just a label */
const LayoutThumb: React.FC<{ kind: 'executive' | 'compact'; active: boolean }> = ({ kind, active }) => {
  const bar = active ? 'bg-[linear-gradient(to_right,#B90B4F_72%,#609C5C_72%)]' : 'bg-slate-300 dark:bg-slate-600';
  const heading = 'bg-slate-300 dark:bg-slate-600';
  const line = 'bg-slate-200 dark:bg-slate-600';
  return (
    <div className="w-full h-20 sm:h-24 rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 p-1.5 flex flex-col gap-1 overflow-hidden" aria-hidden="true">
      <div className={`h-0.5 -mx-1.5 -mt-1.5 mb-0.5 ${bar}`} />
      <div className={`h-1.5 w-1/2 rounded-sm ${heading}`} />
      {kind === 'executive' ? (
        [0, 1].map((i) => (
          <div key={i} className="flex-1 flex gap-1 rounded-tl-[6px] rounded-br-[6px] border border-slate-200 dark:border-slate-700 p-1">
            <div className={`w-0.5 rounded-full ${i ? 'bg-cat-community-500' : 'bg-cat-enterprise-500'}`} />
            <div className="flex-1 space-y-0.5">
              <div className={`h-1 w-3/4 rounded ${line}`} />
              <div className={`h-1 w-1/2 rounded ${line}`} />
            </div>
            <div className="w-3 rounded-sm bg-slate-200 dark:bg-slate-700" />
          </div>
        ))
      ) : (
        <>
          <div className="h-1.5 rounded-sm bg-slate-200 dark:bg-slate-700" />
          {[0, 1, 2, 3, 4].map((i) => (
            <div key={i} className="flex gap-1">
              <div className={`h-1 w-2 rounded ${line}`} />
              <div className={`h-1 flex-1 rounded ${line}`} />
              <div className={`h-1 w-3 rounded ${line}`} />
            </div>
          ))}
        </>
      )}
    </div>
  );
};

const FortnightlyBulletinModal: React.FC<FortnightlyBulletinModalProps> = ({
  isOpen,
  onClose,
  events,
  recurrenceExceptions,
  onOpenSubmissions,
  canShare = false
}) => {
  const { showToast } = useToast();

  const [activePreset, setActivePreset] = useState<DateRangePreset | 'custom'>('2weeks');
  const [startDateStr, setStartDateStr] = useState(() => calculatePresetDateRange('2weeks', { events }).startDateStr);
  const [endDateStr, setEndDateStr] = useState(() => calculatePresetDateRange('2weeks', { events }).endDateStr);
  const [format, setFormat] = useState<'executive' | 'compact'>(() => (readPref(FORMAT_KEY) === 'compact' ? 'compact' : 'executive'));
  // On unless turned off on this device
  const [printFlyers, setPrintFlyers] = useState(() => readPref(FLYERS_KEY) !== 'off');
  const [busy, setBusy] = useState<'download' | 'preview' | 'email' | 'whatsapp' | 'link' | 'update' | null>(null);
  const [copied, setCopied] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);
  const moreRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!moreOpen) return;
    const close = (e: MouseEvent) => {
      if (!moreRef.current?.contains(e.target as Node)) setMoreOpen(false);
    };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, [moreOpen]);
  const [linkCopied, setLinkCopied] = useState(false);
  const [showList, setShowList] = useState(true);

  /**
   * The last digest shared before this week: the PDF marks NEW what it didn't have, so a digest
   * made earlier in the same week (by anyone) doesn't take the marks away. null: none shared yet;
   * undefined: it couldn't be looked up, and the PDF falls back to "added in the last week".
   */
  const previousIssue = useRef<Promise<DigestPreviousIssue | null | undefined>>(Promise.resolve(undefined));

  /**
   * Admins: the latest digest shared, while it can still be updated, and its events as its link
   * shows them now (null: its list can't be had). When an event in it changes, the dialog offers
   * to update it, so the email that already went out shows the change.
   */
  const [sent, setSent] = useState<{ digest: SentDigest; list: DigestList | null } | null>(null);

  // Always start from the default fortnight when the dialog opens
  useEffect(() => {
    if (!isOpen) return;
    let cancelled = false;
    const issues = fetchDigestIssues(formatLocalDate(digestWeekStart(new Date())));
    previousIssue.current = issues
      .then(({ previous }) => previous && { issued: new Date(`${previous.issued}T00:00:00`), ids: previous.ids })
      .catch((err) => {
        console.warn('Looking up the last digest failed:', err);
        return undefined;
      });
    setSent(null);
    if (canShare) {
      issues.then(async ({ latest }) => {
        if (!latest || Date.now() >= new Date(`${latest.issued}T00:00:00`).getTime() + UPDATE_DAYS * 86400000) return;
        const list = await fetchDigestList(latest.key);
        if (!cancelled) setSent({ digest: latest, list });
      }).catch(() => { /* no update offered */ });
    }
    setActivePreset('2weeks');
    const range = calculatePresetDateRange('2weeks', { events });
    setStartDateStr(range.startDateStr);
    setEndDateStr(range.endDateStr);
    return () => {
      cancelled = true;
    };
    // Reset only when the dialog opens, not on every events refresh
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen]);

  /** The sent digest's period, and the events in it that read differently now (null: can't tell) */
  const sentState = useMemo(() => {
    const file = sent && digestFromKey(sent.digest.key);
    if (!sent || !file?.start || !file.end) return null;
    const start = new Date(`${file.start}T00:00:00`);
    const end = new Date(`${file.end}T23:59:59.999`);
    if (!sent.list) return { start, end, changed: null };
    const now = buildDigestList(expandRecurringEvents(events, start, end, recurrenceExceptions), { startDate: start, endDate: end });
    const { changed, added, removed } = digestListChanges(sent.list, now);
    return { start, end, changed: [...changed, ...added, ...removed].map((e) => e.title) };
  }, [sent, events, recurrenceExceptions]);
  const offerUpdate = !!sentState && (sentState.changed === null || sentState.changed.length > 0);

  const handleSelectPreset = (preset: DateRangePreset) => {
    setActivePreset(preset);
    const range = calculatePresetDateRange(preset, { events });
    setStartDateStr(range.startDateStr);
    setEndDateStr(range.endDateStr);
  };

  const startDate = useMemo(() => new Date(`${startDateStr}T00:00:00`), [startDateStr]);
  const endDate = useMemo(() => new Date(`${endDateStr}T23:59:59.999`), [endDateStr]);
  const rangeValid = !isNaN(startDate.getTime()) && !isNaN(endDate.getTime()) && startDate <= endDate;

  // Every occurrence in the period: repeating and multi-date events are listed on each date
  const periodEvents = useMemo(
    () => (rangeValid ? expandRecurringEvents(events, startDate, endDate, recurrenceExceptions) : []),
    [rangeValid, events, startDate, endDate, recurrenceExceptions]
  );

  const { groups, pendingCount } = useMemo(() => {
    const inRange = periodEvents.filter((e) => e.date.getTime() >= startDate.getTime() && e.date.getTime() <= endDate.getTime());
    return {
      groups: groupDigestOccurrences(inRange.filter((e) => !e.status || e.status === 'published')),
      pendingCount: new Set(inRange.filter((e) => e.status === 'draft').map((e) => e.id)).size
    };
  }, [periodEvents, startDate, endDate]);

  // Admins share the PDF as a link (in the email, the WhatsApp text or copied on its own)
  const shareable = canShare && groups.length > 0;

  const flyerCount = useMemo(
    () => groups.filter((g) => g.event.posterUrl || g.event.attachments?.some((a) => a.type === 'image')).length,
    [groups]
  );

  const dayCount = rangeValid ? Math.round((endDate.getTime() - startDate.getTime()) / 86400000) : 0;

  const pdfOptions = { startDate, endDate, format, printableFlyers: printFlyers };
  const makePdf = async (output: 'save' | 'blob') =>
    generateEventsDigestPDF(periodEvents, { ...pdfOptions, output, previousIssue: await previousIssue.current });

  const handleDownloadPDF = async () => {
    setBusy('download');
    try {
      await makePdf('save');
      showToast('Digest PDF downloaded', 'success');
    } catch (err) {
      console.error('Failed to generate PDF:', err);
      showToast('Failed to generate the PDF. Please try again.', 'error');
    } finally {
      setBusy(null);
    }
  };

  const handlePreviewPDF = async () => {
    // Open the tab straight away (inside the click) so pop-up blockers allow it
    const previewWindow = window.open('', '_blank');
    setBusy('preview');
    try {
      const blob = await makePdf('blob');
      if (!blob) return;
      const url = URL.createObjectURL(blob);
      if (previewWindow) {
        previewWindow.location.href = url;
      } else {
        // Pop-ups blocked: fall back to a normal download
        const a = document.createElement('a');
        a.href = url;
        a.download = digestFileName(startDate, endDate);
        a.click();
      }
      setTimeout(() => URL.revokeObjectURL(url), 60_000);
    } catch (err) {
      previewWindow?.close();
      console.error('Failed to generate PDF preview:', err);
      showToast('Failed to generate the preview. Please try again.', 'error');
    } finally {
      setBusy(null);
    }
  };

  /**
   * The digest PDF is uploaded once and its link reused (remembered on this device) while the day,
   * period, layout and events stay the same; any change to them makes a new PDF and link.
   */
  const shared = useRef<{ key: string; link: Promise<string> } | null>(null);
  const getShareLink = (): Promise<string> => {
    const key = digestKeyOf({ start: startDateStr, end: endDateStr, format, flyers: printFlyers, events: periodEvents });
    if (shared.current?.key === key) return shared.current.link;
    const remembered = rememberedDigestLink(key);
    const link = remembered ? Promise.resolve(remembered) : (async () => {
      const blob = await makePdf('blob');
      if (!blob) throw new Error('the PDF could not be made');
      // Recorded with it: the events it carries, so next week's digest marks NEW only the rest
      // and the same events as a list, which its page shows for reading on a phone
      const list = buildDigestList(periodEvents, { startDate, endDate, previousIssue: await previousIssue.current });
      const result = await shareDigestPdf(blob, digestFileName(startDate, endDate), {
        issued: formatLocalDate(new Date()),
        ids: groups.map((g) => g.event.id)
      }, list);
      rememberDigestLink(key, result);
      // The newest digest now: what it updated earlier is behind it
      setSent(null);
      return result.url;
    })();
    shared.current = { key, link };
    // After a failure the next click tries again
    link.catch(() => {
      if (shared.current?.link === link) shared.current = null;
    });
    return link;
  };

  const handleCopyWhatsApp = async () => {
    const summary = (pdfUrl?: string) => generateWhatsAppSummary(periodEvents, startDate, endDate, window.location.origin, pdfUrl);
    let linkFailed = false;
    const text = shareable
      ? getShareLink().then(summary, (err) => {
          console.error('Sharing the digest PDF failed:', err);
          linkFailed = true;
          return summary();
        })
      : Promise.resolve(summary());
    if (shareable) setBusy('whatsapp');
    try {
      await copyText(text);
      setCopied(true);
      showToast(
        linkFailed
          ? 'WhatsApp summary copied, without the PDF link (the upload failed)'
          : 'WhatsApp summary copied — paste it into the group chat',
        linkFailed ? 'warning' : 'success'
      );
      setTimeout(() => setCopied(false), 2500);
    } catch {
      showToast('The summary could not be copied. Please try again.', 'error');
    } finally {
      setBusy(null);
    }
  };

  /**
   * New email in the email app, addressed to the digest recipients. A mailto: link only carries plain text, so the
   * formatted email (logo, a button to the PDF, the events) goes to the clipboard and is pasted
   * in, and the email opens with just the subject. Without the clipboard the plain text goes in.
   */
  const handleEmail = async () => {
    setBusy('email');
    const baseUrl = window.location.origin;
    const link: Promise<string | null> = shareable
      ? getShareLink().catch((err) => {
          console.error('Sharing the digest PDF failed:', err);
          return null;
        })
      : Promise.resolve(null);
    const recipients = recipientsFor('digest');
    // Handed over still inside the click, as promises: Safari allows nothing later
    const copied = await copyFormattedEmail(
      link.then((pdfUrl) => generateDigestEmailHtml(periodEvents, startDate, endDate, { baseUrl, pdfUrl })),
      link.then((pdfUrl) => generateDigestEmail(periodEvents, startDate, endDate, { baseUrl, pdfUrl }).body)
    );
    const [pdfUrl, to] = await Promise.all([link, recipients]);
    setBusy(null);
    window.location.href = copied
      ? generateDigestMailtoSubject(startDate, endDate, to)
      : generateDigestMailto(periodEvents, startDate, endDate, { baseUrl, pdfUrl, recipients: to });
    const failed = shareable && !pdfUrl;
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
  };

  const handleCopyLink = async () => {
    setBusy('link');
    try {
      await copyText(getShareLink());
      setLinkCopied(true);
      showToast('Link copied — anyone with it can open this PDF for six months', 'success');
      setTimeout(() => setLinkCopied(false), 2500);
    } catch (err) {
      console.error('Sharing the digest PDF failed:', err);
      const reason = err instanceof Error && err.message ? ` (${err.message})` : '';
      showToast(`The link could not be made${reason}. Please try again.`, 'error');
    } finally {
      setBusy(null);
    }
  };

  /**
   * Makes the sent digest again from the events as they are now (same period, layout and flyers,
   * same issue day) and shares it as its update: every link to it shows the new PDF, with the
   * events changed since it went out marked UPDATED. Nothing needs sending again.
   */
  const handleUpdate = async () => {
    if (!sent || !sentState) return;
    const { digest } = sent;
    const { start, end } = sentState;
    setBusy('update');
    try {
      const issued = new Date(`${digest.issued}T00:00:00`);
      const occurrences = expandRecurringEvents(events, start, end, recurrenceExceptions);
      // NEW stays as it was: what the digest before it didn't have
      const previous = await fetchDigestIssues(formatLocalDate(digestWeekStart(issued))).then(
        ({ previous: p }) => p && { issued: new Date(`${p.issued}T00:00:00`), ids: p.ids },
        () => undefined
      );
      // UPDATED: what changed since the PDF that went out (not since an earlier update)
      const wentOut = digest.base === digest.key ? sent.list : await fetchDigestList(digest.base);
      const { list, updatedIds } = markDigestUpdate(
        buildDigestList(occurrences, { startDate: start, endDate: end, previousIssue: previous }), wentOut
      );
      const layout = digest.layout ?? format;
      const flyers = digest.flyers ?? printFlyers;
      const blob = await generateEventsDigestPDF(occurrences, {
        startDate: start, endDate: end, format: layout, printableFlyers: flyers, output: 'blob',
        previousIssue: previous, issued, updated: { at: new Date(), ids: updatedIds }
      });
      if (!blob) throw new Error('the PDF could not be made');
      const result = await shareDigestPdf(blob, digestFileName(start, end), {
        issued: digest.issued,
        ids: list.entries.flatMap((e) => (e.id ? [e.id] : []))
      }, list, { layout, flyers, update: true });
      const key = digestFromPagePath(new URL(result.url).pathname)?.key;
      setSent(key ? { digest: { ...digest, key }, list } : null);
      showToast('Digest updated — the link people already have now shows the changes', 'success');
    } catch (err) {
      console.error('Updating the digest failed:', err);
      const reason = err instanceof Error && err.message ? ` (${err.message})` : '';
      showToast(`The digest could not be updated${reason}. Please try again.`, 'error');
    } finally {
      setBusy(null);
    }
  };

  const disabled = !rangeValid || busy !== null;

  // Admins mostly send the email (on Fridays): it is the main button, the rest are secondary.
  // On phones those wait in a "More" menu, so the footer is one row instead of three.
  const secondary = 'cta !text-xs tracking-[0.06em] sm:tracking-[0.1em] whitespace-nowrap inline-flex items-center justify-center gap-1.5 sm:gap-2 px-3 py-2.5 rounded text-slate-700 dark:text-slate-200 bg-white dark:bg-transparent border border-slate-300 dark:border-slate-600 hover:border-slate-400 hover:bg-slate-50 dark:hover:bg-slate-700/60 transition-colors disabled:opacity-50';
  const primary = 'cta !text-xs tracking-[0.06em] sm:tracking-[0.1em] whitespace-nowrap inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded text-white bg-brand-600 hover:bg-brand-700 shadow-sm transition-colors disabled:opacity-50';
  const downloadIcon = busy === 'download' ? spinner : <Download className="w-4 h-4 shrink-0" />;
  const downloadLabel = busy === 'download' ? 'Generating…' : 'Download PDF';
  const previewIcon = busy === 'preview' ? spinner : <Eye className="w-4 h-4 shrink-0" />;
  const whatsAppIcon = busy === 'whatsapp' ? spinner : copied ? <Check className="w-4 h-4 shrink-0" /> : <MessageSquare className="w-4 h-4 shrink-0 text-ccp-green-600 dark:text-ccp-green-400" />;
  const linkIcon = busy === 'link' ? spinner : linkCopied ? <Check className="w-4 h-4 shrink-0" /> : <Link2 className="w-4 h-4 shrink-0" />;
  const moreItems = [
    { key: 'whatsapp', label: copied ? 'Copied!' : 'Copy WhatsApp text', icon: whatsAppIcon, onClick: handleCopyWhatsApp, off: disabled },
    { key: 'link', label: linkCopied ? 'Copied!' : 'Copy link', icon: linkIcon, onClick: handleCopyLink, off: disabled || !shareable },
    { key: 'download', label: downloadLabel, icon: downloadIcon, onClick: handleDownloadPDF, off: disabled },
    { key: 'preview', label: 'Preview', icon: previewIcon, onClick: handlePreviewPDF, off: disabled }
  ];

  const footer = canShare ? (
    <div className="flex items-center gap-2">
      <div ref={moreRef} className="relative sm:hidden">
        <button
          type="button"
          onClick={() => setMoreOpen((open) => !open)}
          aria-haspopup="menu"
          aria-expanded={moreOpen}
          className={`${secondary} h-11 px-4`}
        >
          <MoreHorizontal className="w-4 h-4 shrink-0" aria-hidden="true" />
          More
        </button>
        {moreOpen && (
          <div role="menu" aria-label="More ways to share" className="absolute bottom-full left-0 mb-2 w-64 p-1.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 shadow-xl animate-scale-in origin-bottom-left">
            {moreItems.map((item) => (
              <button
                key={item.key}
                type="button"
                role="menuitem"
                disabled={item.off}
                onClick={() => { setMoreOpen(false); void item.onClick(); }}
                className="w-full flex items-center gap-2.5 px-3 py-3 min-h-[48px] rounded-lg text-sm font-medium text-left text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 disabled:opacity-50 transition-colors"
              >
                {item.icon}
                {item.label}
              </button>
            ))}
          </div>
        )}
      </div>
      <button
        type="button"
        onClick={handleCopyWhatsApp}
        disabled={disabled}
        title="Copies a plain-text summary for WhatsApp groups, with a link to the PDF"
        className={`${secondary} hidden sm:inline-flex`}
      >
        {whatsAppIcon}
        {copied ? 'Copied!' : 'WhatsApp'}
      </button>
      <button
        type="button"
        onClick={handleCopyLink}
        disabled={disabled || !shareable}
        aria-label="Copy link"
        title="Uploads this PDF and copies a link to it that anyone can open for six months"
        className={`${secondary} hidden sm:inline-flex`}
      >
        {linkIcon}
        {/* The dialog's row only fits "Link" beside the others */}
        {linkCopied ? 'Copied!' : 'Link'}
      </button>
      <button type="button" onClick={handlePreviewPDF} disabled={disabled} className={`${secondary} hidden sm:inline-flex`}>
        {previewIcon}
        Preview
      </button>
      <button type="button" onClick={handleDownloadPDF} disabled={disabled} className={`${secondary} hidden sm:inline-flex`}>
        {downloadIcon}
        {downloadLabel}
      </button>
      <button
        type="button"
        onClick={handleEmail}
        disabled={disabled}
        title="Copies a formatted email with a link to the PDF and opens a new email: paste it in, the recipients are filled in"
        className={`${primary} h-11 sm:h-auto flex-1 sm:flex-none sm:ml-auto`}
      >
        {busy === 'email' ? spinner : <Mail className="w-4 h-4 shrink-0" />}
        Email
      </button>
    </div>
  ) : (
    <div className="grid grid-cols-1 sm:flex sm:items-center sm:justify-end gap-2">
      <button type="button" onClick={handleDownloadPDF} disabled={disabled} className={`${primary} sm:order-2`}>
        {downloadIcon}
        {downloadLabel}
      </button>
      <button type="button" onClick={handlePreviewPDF} disabled={disabled} className={`${secondary} sm:order-1`}>
        {previewIcon}
        Preview
      </button>
    </div>
  );

  return (
    <ModalShell
      isOpen={isOpen}
      onClose={onClose}
      title="Upcoming Events Digest"
      subtitle={canShare ? 'A branded PDF, a link to it, plus email and WhatsApp text, for the Board & staff' : 'A branded PDF of the upcoming events'}
      icon={<FileText className="w-5 h-5" />}
      size="lg"
      footer={footer}
    >
      <div className="space-y-6">
        {offerUpdate && sent && sentState && (
          <section aria-labelledby="digest-update" className="flex items-start gap-3 p-3 rounded-xl bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800/60 text-sm text-amber-900 dark:text-amber-200">
            <RefreshCw className="w-4 h-4 mt-0.5 shrink-0 text-amber-600 dark:text-amber-400" aria-hidden="true" />
            <div className="flex-1 min-w-0">
              <h3 id="digest-update" className="font-semibold">
                {sentState.changed ? 'Changed since the digest went out ' : 'Changed an event in the digest that went out '}
                <span className="whitespace-nowrap">{sentOn(new Date(`${sent.digest.issued}T00:00:00`))}{sentState.changed ? '' : '?'}</span>
              </h3>
              <p className="mt-0.5 [overflow-wrap:anywhere]">
                {sentState.changed && `${sentState.changed.length === 1 ? '1 event' : `${sentState.changed.length} events`}: ${nameEvents(sentState.changed)}. `}
                Update it, and the link people already have shows the latest, with the changes marked. No need to send it again.
              </p>
              <button
                type="button"
                onClick={handleUpdate}
                disabled={busy !== null}
                className="cta mt-2.5 inline-flex items-center gap-2 h-10 px-4 rounded !text-xs tracking-[0.1em] text-white bg-amber-700 hover:bg-amber-800 shadow-sm transition-colors disabled:opacity-50"
              >
                {busy === 'update' ? spinner : <RefreshCw className="w-4 h-4 shrink-0" />}
                {busy === 'update' ? 'Updating…' : 'Update digest'}
              </button>
            </div>
          </section>
        )}

        {/* 1. Period */}
        <section aria-labelledby="digest-period">
          <h3 id="digest-period" className="eyebrow mb-3">
            1 · Period
          </h3>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            {PRESETS.map((p) => (
              <button
                key={p.id}
                type="button"
                onClick={() => handleSelectPreset(p.id)}
                aria-pressed={activePreset === p.id}
                className={`py-2 px-2 text-sm font-medium rounded border transition-all ${
                  activePreset === p.id
                    ? 'bg-brand-600 border-brand-600 text-white shadow-sm'
                    : 'border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:text-brand-600 dark:hover:text-brand-300 hover:border-brand-300 dark:hover:border-brand-700'
                }`}
              >
                {p.label}
              </button>
            ))}
          </div>
          <div className="grid grid-cols-2 gap-3 mt-3">
            <label className="block">
              <span className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1">From</span>
              <input
                type="date"
                value={startDateStr}
                onChange={(e) => { setStartDateStr(e.target.value); setActivePreset('custom'); }}
                className="w-full px-2 sm:px-3 py-2 text-sm rounded-xl border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-700 text-slate-900 dark:text-white focus:ring-2 focus:ring-brand-500 outline-none"
              />
            </label>
            <label className="block">
              <span className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1">To</span>
              <input
                type="date"
                value={endDateStr}
                min={startDateStr}
                onChange={(e) => { setEndDateStr(e.target.value); setActivePreset('custom'); }}
                className="w-full px-2 sm:px-3 py-2 text-sm rounded-xl border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-700 text-slate-900 dark:text-white focus:ring-2 focus:ring-brand-500 outline-none"
              />
            </label>
          </div>
          {!rangeValid && (
            <p className="mt-2 text-xs font-medium text-red-600 dark:text-red-400" role="alert">
              The “To” date must be on or after the “From” date.
            </p>
          )}
        </section>

        {/* 2. Layout */}
        <section aria-labelledby="digest-layout">
          <h3 id="digest-layout" className="eyebrow mb-3">
            2 · Layout
          </h3>
          <div className="grid grid-cols-2 gap-3">
            {([
              { id: 'executive', icon: LayoutGrid, name: 'Executive cards', hint: 'Overview of the period, full descriptions & flyers. Best for the Board.' },
              { id: 'compact', icon: List, name: 'Compact table', hint: 'A dense agenda that fits the most events per page.' }
            ] as const).map((opt) => {
              const active = format === opt.id;
              return (
                <button
                  key={opt.id}
                  type="button"
                  onClick={() => { setFormat(opt.id); writePref(FORMAT_KEY, opt.id); }}
                  aria-pressed={active}
                  className={`p-3 rounded-leaf-sm border-2 text-left transition-all ${
                    active
                      ? 'border-brand-600 dark:border-brand-400 bg-brand-50/60 dark:bg-brand-950/30'
                      : 'border-slate-200 dark:border-slate-700 hover:border-slate-300 dark:hover:border-slate-600'
                  }`}
                >
                  <LayoutThumb kind={opt.id} active={active} />
                  <span className="mt-2.5 flex items-center gap-1.5 text-sm font-semibold text-slate-900 dark:text-white">
                    <opt.icon className={`w-4 h-4 shrink-0 ${active ? 'text-brand-600 dark:text-brand-300' : 'text-slate-400'}`} />
                    {opt.name}
                  </span>
                  <span className="hidden sm:block text-xs text-slate-600 dark:text-slate-400 mt-0.5">{opt.hint}</span>
                </button>
              );
            })}
          </div>

          <label className="mt-3 flex items-start gap-2.5 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={printFlyers}
              onChange={(e) => { setPrintFlyers(e.target.checked); writePref(FLYERS_KEY, e.target.checked ? 'on' : 'off'); }}
              className="mt-0.5 w-4 h-4 shrink-0 rounded border-slate-300 dark:border-slate-600 text-brand-600 focus:ring-brand-500 accent-brand-600"
            />
            <span className="text-sm">
              <span className="font-semibold text-slate-800 dark:text-slate-200">Flyers to print at the end</span>
              <span className="block text-xs text-slate-500 dark:text-slate-400">
                Each flyer large enough to read and pin up, four to a page
                {rangeValid && ` · ${flyerCount === 0 ? 'no flyers' : flyerCount === 1 ? '1 flyer' : `${flyerCount} flyers`} in this period`}
              </span>
            </span>
          </label>

          <p className="mt-3 flex items-start gap-2 text-xs text-slate-500 dark:text-slate-400">
            <CalendarPlus className="w-4 h-4 text-slate-400 shrink-0" />
            <span>Outlook &amp; Google “add to calendar” buttons show on screen and are left out automatically when the PDF is printed.</span>
          </p>
        </section>

        {/* 3. What's included */}
        <section aria-labelledby="digest-included">
          <button
            type="button"
            onClick={() => setShowList((v) => !v)}
            aria-expanded={showList}
            className="w-full flex items-center justify-between gap-3 mb-3"
          >
            <h3 id="digest-included" className="eyebrow flex-1">
              <span>
                3 · Included — {groups.length} {groups.length === 1 ? 'event' : 'events'}
                {rangeValid && <span className="normal-case tracking-normal font-normal"> over {dayCount} {dayCount === 1 ? 'day' : 'days'}</span>}
              </span>
            </h3>
            <ChevronDown className={`w-4 h-4 text-slate-400 transition-transform ${showList ? 'rotate-180' : ''}`} />
          </button>

          {pendingCount > 0 && (
            <div className="mb-3 flex items-start gap-3 p-3 rounded-xl bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800/60 text-sm text-amber-900 dark:text-amber-200">
              <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0 text-amber-600 dark:text-amber-400" />
              <div className="flex-1">
                <strong>{pendingCount} pending {pendingCount === 1 ? 'submission is' : 'submissions are'}</strong> in this period and won’t appear until approved.
                {onOpenSubmissions && (
                  <button
                    type="button"
                    onClick={onOpenSubmissions}
                    className="mt-1.5 flex items-center gap-1.5 text-xs font-semibold text-amber-800 dark:text-amber-300 underline underline-offset-2 hover:no-underline"
                  >
                    <Inbox className="w-3.5 h-3.5" /> Review submissions
                  </button>
                )}
              </div>
            </div>
          )}

          {showList && (
            groups.length === 0 ? (
              <div className="p-6 text-center rounded-xl border border-dashed border-slate-300 dark:border-slate-600 text-sm text-slate-500 dark:text-slate-400">
                No published events in this period. Try a longer range.
              </div>
            ) : (
              <ul className="rounded-xl border border-slate-200 dark:border-slate-700 divide-y divide-slate-100 dark:divide-slate-700/70 max-h-64 overflow-y-auto">
                {groups.map((g) => (
                  <li key={g.event.id} className="flex items-center gap-3 px-3 py-2.5">
                    <span className={`w-2 h-2 rounded-full shrink-0 ${getCategoryDotColor(g.event.category)}`} aria-hidden="true" />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-slate-900 dark:text-white truncate">{g.event.title}</p>
                      {g.occurrences.length > 1 && (
                        <p className="text-xs text-slate-500 dark:text-slate-400 truncate">
                          Also on {formatAlsoOnDates(g, ', ')}
                        </p>
                      )}
                    </div>
                    <span className="shrink-0 text-right text-xs tabular-nums text-slate-500 dark:text-slate-400">
                      <span className="block font-medium text-slate-700 dark:text-slate-300">{fmtDay(g.event.date)}</span>
                      {fmtTime(g.event.date)}
                    </span>
                  </li>
                ))}
              </ul>
            )
          )}
        </section>
      </div>
    </ModalShell>
  );
};

export default FortnightlyBulletinModal;
