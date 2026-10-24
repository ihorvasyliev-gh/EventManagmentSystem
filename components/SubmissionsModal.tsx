import React, { useState } from 'react';
import { Check, Trash2, Pencil, CalendarDays, Clock, MapPin, Mail, CheckCheck, Inbox, Copy, Repeat, X, RefreshCw } from 'lucide-react';
import { type Event } from '../types';
import ModalShell from './ModalShell';
import PosterLightbox from './PosterLightbox';
import { getCategoryDotColor } from './WeekView';
import { formatOccurrenceLabel } from '../utils/digestGrouping';
import { detectOccurrenceConflicts, getOccurrencesAroundDates } from '../utils/conflictDetection';
import { groupOverlaps, type OverlapEntry } from '../utils/duplicateDetection';
import OverlapList from './OverlapList';
import { eventContacts } from '../utils/contacts';
import { readScheduleFromEvent, formatTimeRange, listSessions, buildOccurrences } from '../utils/multiDateUtils';
import { describeSeries } from '../utils/repeat';
import { posterVariantUrl } from '../utils/posterVariants';
import { approvedMailto, declinedMailto, firstName } from '../utils/authorEmail';
import { eventShareLink } from '../hooks/useDeepLinks';
import type { ReviewOutcome } from '../hooks/useSubmissionActions';
import type { DigestChange } from '../hooks/useSentDigest';
import { DigestChangeLine } from './DigestChangedBanner';
import { nameEvents } from '../utils/sentDigest';

interface SubmissionsModalProps {
  isOpen: boolean;
  onClose: () => void;
  submissions: Event[];
  /** Published events, used to flag clashes before approving */
  events?: Event[];
  onApprove: (event: Event) => Promise<ReviewOutcome | void>;
  onEdit: (event: Event) => void;
  /** Declines (deletes) a submission; the reason goes in the email to the submitter */
  onReject: (eventId: string, reason?: string) => Promise<ReviewOutcome | void>;
  onApproveAll?: () => Promise<ReviewOutcome | void>;
  /** Opens an existing event in full (to compare with a submission) */
  onOpenEvent?: (event: Event) => void;
  /** Events in the digest that went out have changed since: the inbox says so first */
  digestChange?: DigestChange | null;
  /** Opens the digest, which updates the one that went out */
  onOpenDigest?: () => void;
}

/** A submission just approved or declined: whether its sender was told, or a link to tell them */
interface ReviewNote {
  key: string;
  approved: boolean;
  title: string;
  name: string;
  emailed: boolean;
  mailto: string | null;
}

const noteFor = (event: Event, approved: boolean, outcome: ReviewOutcome | void, reason = ''): ReviewNote | null => {
  if (!outcome) return null;
  const emailed = outcome.authorsEmailed && !!event.submitterEmail?.trim();
  return {
    key: `${event.id}-${approved}`,
    approved,
    title: event.title,
    name: firstName(event.submitterName) || 'the submitter',
    emailed,
    mailto: emailed ? null : approved ? approvedMailto(event, eventShareLink(event)) : declinedMailto(event, reason)
  };
};

const submittedAgo = (d?: Date): string => {
  if (!d || isNaN(d.getTime())) return '';
  const mins = Math.round((Date.now() - d.getTime()) / 60000);
  if (mins < 60) return mins <= 1 ? 'just now' : `${mins} min ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  return days === 1 ? 'yesterday' : `${days} days ago`;
};

const SubmissionsModal: React.FC<SubmissionsModalProps> = ({
  isOpen,
  onClose,
  submissions,
  events = [],
  onApprove,
  onEdit,
  onReject,
  onApproveAll,
  onOpenEvent,
  digestChange,
  onOpenDigest
}) => {
  const [processingId, setProcessingId] = useState<string | null>(null);
  const [isApprovingAll, setIsApprovingAll] = useState(false);
  const [rejectConfirmId, setRejectConfirmId] = useState<string | null>(null);
  const [rejectReason, setRejectReason] = useState('');
  const [notes, setNotes] = useState<ReviewNote[]>([]);
  // Two columns on larger screens when there are several (kept while they are approved one by one)
  const [wide] = useState(submissions.length > 1);
  const addNotes = (added: Array<ReviewNote | null>) => {
    const fresh = added.filter((n): n is ReviewNote => !!n);
    if (fresh.length) setNotes((prev) => [...fresh, ...prev.filter((n) => !fresh.some((f) => f.key === n.key))]);
  };
  // Approving something that looks like an existing event needs a second click
  const [approveConfirmId, setApproveConfirmId] = useState<string | null>(null);
  const [confirmApproveAll, setConfirmApproveAll] = useState(false);
  const [expandedImage, setExpandedImage] = useState<{ url: string; title: string } | null>(null);

  const handleSingleApprove = async (event: Event) => {
    setProcessingId(event.id);
    try {
      addNotes([noteFor(event, true, await onApprove(event))]);
    } finally {
      setProcessingId(null);
    }
  };

  const handleSingleReject = async (event: Event) => {
    setProcessingId(event.id);
    const reason = rejectReason.trim();
    try {
      addNotes([noteFor(event, false, await onReject(event.id, reason || undefined), reason)]);
      setRejectConfirmId(null);
      setRejectReason('');
    } finally {
      setProcessingId(null);
    }
  };

  const handleBatchApprove = async () => {
    if (!onApproveAll) return;
    setIsApprovingAll(true);
    const approving = [...submissions];
    try {
      const outcome = await onApproveAll();
      addNotes(approving.map((event) => noteFor(event, true, outcome)));
    } finally {
      setIsApprovingAll(false);
    }
  };

  const published = events.filter((e) => e.status !== 'draft');

  /** Events at the same time as a submission, likely duplicates first */
  const overlapsOf = (event: Event): OverlapEntry[] => {
    const schedule = readScheduleFromEvent(event, null);
    const perDate = schedule.sameTime ? null : schedule.perDate;
    const conflict = detectOccurrenceConflicts(
      buildOccurrences(schedule.dates, schedule.shared, perDate),
      getOccurrencesAroundDates(published, schedule.dates)
    );
    return groupOverlaps(conflict.conflicts, { id: event.id, title: event.title, location: event.location });
  };
  const overlapsById = new Map(submissions.map((s) => [s.id, overlapsOf(s)]));
  const duplicateOf = (id: string) => overlapsById.get(id)?.find((o) => o.duplicate === 'title');
  const duplicateCount = submissions.filter((s) => duplicateOf(s.id)).length;

  // Approving everything at once always asks first, and says so when some look like duplicates
  const footer = (
    <div className="flex flex-col-reverse sm:flex-row sm:items-center gap-2 sm:gap-4">
      <p className="text-xs text-slate-500 dark:text-slate-400 sm:flex-1">
        Approved events appear on the calendar and in the next digest straight away.
      </p>
      {submissions.length > 1 && onApproveAll && confirmApproveAll && (
        <div role="group" aria-label="Approve all" className="flex flex-wrap items-center justify-end gap-2">
          <span className={`text-sm font-medium mr-auto sm:mr-0 ${duplicateCount > 0 ? 'text-red-700 dark:text-red-300' : 'text-slate-700 dark:text-slate-200'}`}>
            {duplicateCount > 0
              ? `${duplicateCount === 1 ? '1 submission looks' : `${duplicateCount} submissions look`} like a duplicate. Approve all ${submissions.length} anyway?`
              : `Approve all ${submissions.length} events?`}
          </span>
          <button type="button" onClick={() => setConfirmApproveAll(false)} className="cta px-3 py-2 rounded text-slate-700 dark:text-slate-200 bg-white dark:bg-slate-700 border border-slate-200 dark:border-slate-600">
            Cancel
          </button>
          <button
            type="button"
            onClick={() => { setConfirmApproveAll(false); void handleBatchApprove(); }}
            className="cta px-3 py-2 rounded text-white bg-ccp-green-600 hover:bg-ccp-green-700"
          >
            Approve all
          </button>
        </div>
      )}
      {submissions.length > 1 && onApproveAll && !confirmApproveAll && (
        <button
          type="button"
          onClick={() => setConfirmApproveAll(true)}
          disabled={isApprovingAll || processingId !== null}
          className="cta inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded border border-ccp-green-600/60 dark:border-ccp-green-500/60 text-ccp-green-700 dark:text-ccp-green-300 bg-white dark:bg-slate-800 hover:bg-ccp-green-50 dark:hover:bg-ccp-green-950/30 transition-colors disabled:opacity-50"
        >
          <CheckCheck className="w-4 h-4" />
          {isApprovingAll ? 'Approving…' : `Approve all ${submissions.length}`}
        </button>
      )}
    </div>
  );

  // What was just approved or declined: the sender was emailed, or a link writes to them
  const reviewNotes = notes.length > 0 && (
    <ul aria-label="Just reviewed" className="mb-4 space-y-2">
      {notes.map((note) => (
        <li
          key={note.key}
          className={`flex flex-wrap items-center gap-x-3 gap-y-2 pl-3 pr-1.5 py-2 rounded-leaf-xs border text-sm ${
            note.approved
              ? 'border-ccp-green-200 dark:border-ccp-green-800/60 bg-ccp-green-50 dark:bg-ccp-green-950/30'
              : 'border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900/40'
          }`}
        >
          {note.approved
            ? <Check className="w-4 h-4 shrink-0 text-ccp-green-600 dark:text-ccp-green-400" aria-hidden="true" />
            : <Trash2 className="w-4 h-4 shrink-0 text-slate-500" aria-hidden="true" />}
          <span className="flex-1 min-w-[12rem] text-slate-700 dark:text-slate-200">
            <span className="font-semibold">{note.approved ? 'Approved' : 'Declined'}</span> “{note.title}”.{' '}
            {note.emailed ? `${note.name} has been emailed.` : note.mailto ? `Let ${note.name} know:` : ''}
          </span>
          {note.mailto && (
            <a
              href={note.mailto}
              className="cta inline-flex items-center gap-1.5 px-3 py-1.5 rounded bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-600 text-brand-700 dark:text-brand-300 hover:border-brand-300"
            >
              <Mail className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
              Email {note.name}
            </a>
          )}
          <button
            type="button"
            onClick={() => setNotes((prev) => prev.filter((n) => n.key !== note.key))}
            className="p-1.5 rounded text-slate-400 hover:text-slate-700 dark:hover:text-slate-200"
            aria-label="Dismiss"
            title="Dismiss"
          >
            <X className="w-4 h-4" />
          </button>
        </li>
      ))}
    </ul>
  );

  // The digest that went out no longer matches the calendar: it opens the digest to update it
  const digestNotice = digestChange && onOpenDigest && (
    <div
      role="status"
      className="mb-4 flex flex-wrap items-center gap-x-3 gap-y-2 pl-3 pr-2 py-2.5 rounded-leaf-xs border border-amber-200 dark:border-amber-800/60 bg-amber-50 dark:bg-amber-950/30 text-sm"
    >
      <RefreshCw className="w-4 h-4 shrink-0 text-amber-700 dark:text-amber-300" aria-hidden="true" />
      <span className="flex-1 min-w-[12rem] text-amber-900 dark:text-amber-100">
        <span className="font-semibold"><DigestChangeLine change={digestChange} />:</span>{' '}
        {nameEvents(digestChange.titles)}. Update it, and the link people already have shows the change.
      </span>
      <button
        type="button"
        onClick={onOpenDigest}
        className="cta inline-flex items-center gap-1.5 px-3 py-1.5 rounded bg-white dark:bg-slate-800 border border-amber-300 dark:border-amber-700 text-amber-900 dark:text-amber-100 hover:bg-amber-100 dark:hover:bg-amber-900/40"
      >
        <RefreshCw className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
        Update digest
      </button>
    </div>
  );

  const waiting = submissions.length === 0
    ? 'Nothing waiting for review'
    : `${submissions.length} ${submissions.length === 1 ? 'event' : 'events'} waiting for review`;

  return (
    <>
      <ModalShell
        isOpen={isOpen}
        onClose={onClose}
        title="Submissions inbox"
        subtitle={digestNotice ? `${waiting} · the digest needs an update` : waiting}
        icon={<Inbox className="w-5 h-5" />}
        size={wide ? 'xl' : 'lg'}
        footer={submissions.length > 0 ? footer : undefined}
      >
        {digestNotice}
        {reviewNotes}
        {submissions.length === 0 ? (
          <div className="py-10 text-center">
            <div className="w-16 h-16 bg-ccp-green-50 dark:bg-ccp-green-950/30 text-ccp-green-500 rounded-full flex items-center justify-center mx-auto mb-4">
              <Check className="w-8 h-8" />
            </div>
            <h3 className="text-base font-semibold text-slate-900 dark:text-white">{digestNotice ? 'No submissions waiting' : 'All caught up'}</h3>
            <p className="text-sm text-slate-500 dark:text-slate-400 mt-1 max-w-sm mx-auto">
              When staff submit events through the form, they’ll appear here for you to approve.
            </p>
          </div>
        ) : (
          <ul className={`grid gap-3 items-start ${wide ? 'md:grid-cols-2' : ''}`}>
            {submissions.map((event) => {
              const isProcessing = processingId === event.id;
              const isConfirmingReject = rejectConfirmId === event.id;
              const imgUrl = event.posterUrl || event.attachments?.find((a) => a.type === 'image')?.url;
              // The small copy in the list; the full poster opens large
              const thumbUrl = event.posterUrl ? posterVariantUrl(event.posterUrl, 'thumb') : imgUrl;
              const schedule = readScheduleFromEvent(event, null);
              const dates = schedule.dates;
              const perDate = schedule.sameTime ? null : schedule.perDate;
              const places = schedule.samePlace ? null : schedule.places;
              const sessions = listSessions(dates, schedule.shared, perDate);
              const overlaps = overlapsById.get(event.id) ?? [];
              const duplicate = duplicateOf(event.id);
              const isConfirmingApprove = approveConfirmId === event.id;
              const repeat = describeSeries(event.recurrence, event.date);
              // Each date and time on its own line when times or places differ
              const listEach = !!perDate || schedule.shared.length > 1 || !!places;

              return (
                <li key={event.id} className="rounded-leaf-sm border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800/60 overflow-hidden">
                  <div className="p-4 sm:p-5 flex gap-4">
                    <div className="flex-1 min-w-0 space-y-2">
                      <div className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-[0.14em] text-slate-500 dark:text-slate-400">
                        <span className={`w-2 h-2 rounded-full ${getCategoryDotColor(event.category)}`} aria-hidden="true" />
                        <span className="truncate">{event.category || 'Event'}</span>
                      </div>
                      <h3 className="text-base sm:text-lg font-semibold text-slate-900 dark:text-white leading-snug break-words">{event.title}</h3>

                      <div className="space-y-1 text-sm text-slate-600 dark:text-slate-300">
                        {listEach ? (
                          <div className="flex items-start gap-2">
                            <CalendarDays className="w-4 h-4 mt-0.5 shrink-0 text-slate-400" />
                            <ul className="space-y-0.5 min-w-0">
                              {sessions.map((s) => (
                                <li key={s.key} className="break-words">
                                  {formatOccurrenceLabel(s.day)}{' '}
                                  <span className="text-slate-400 dark:text-slate-500">·</span>{' '}
                                  {formatTimeRange(s.slot)}
                                  {places && (
                                    <>
                                      {' '}<span className="text-slate-400 dark:text-slate-500">·</span>{' '}
                                      {places[s.key]}
                                    </>
                                  )}
                                </li>
                              ))}
                            </ul>
                          </div>
                        ) : (
                          <>
                            <p className="flex items-start gap-2">
                              <CalendarDays className="w-4 h-4 mt-0.5 shrink-0 text-slate-400" />
                              <span>{dates.map((d) => formatOccurrenceLabel(d)).join(', ')}</span>
                            </p>
                            <p className="flex items-center gap-2">
                              <Clock className="w-4 h-4 shrink-0 text-slate-400" />
                              {formatTimeRange(schedule.shared[0])}
                            </p>
                          </>
                        )}
                        {repeat && (
                          <p className="flex items-start gap-2 font-medium text-brand-700 dark:text-brand-300">
                            <Repeat className="w-4 h-4 mt-0.5 shrink-0" />
                            <span>{repeat}</span>
                          </p>
                        )}
                        {!places && event.location && (
                          <p className="flex items-start gap-2">
                            <MapPin className="w-4 h-4 mt-0.5 shrink-0 text-slate-400" />
                            <span className="break-words">{event.location}</span>
                          </p>
                        )}
                      </div>

                      {event.description && (
                        <p className="text-sm text-slate-500 dark:text-slate-400 whitespace-pre-line line-clamp-4">{event.description}</p>
                      )}

                      <OverlapList
                        entries={overlaps}
                        formatWhen={(d) => formatOccurrenceLabel(d)}
                        onOpenEvent={onOpenEvent ? (ev) => { onOpenEvent(ev as Event); onClose(); } : undefined}
                      />

                      <p className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-slate-500 dark:text-slate-400 pt-1">
                        <span className="font-medium text-slate-700 dark:text-slate-300">{event.submitterName || 'Staff member'}</span>
                        {event.submitterEmail && (
                          <a href={`mailto:${event.submitterEmail}`} className="inline-flex items-center gap-1 hover:text-brand-600 dark:hover:text-brand-400 hover:underline">
                            <Mail className="w-3 h-3" /> {event.submitterEmail}
                          </a>
                        )}
                        {event.createdAt && <span>sent {submittedAgo(event.createdAt)}</span>}
                      </p>
                      {eventContacts(event).length > 1 && (
                        <p className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-slate-500 dark:text-slate-400">
                          <span>Also contact:</span>
                          {eventContacts(event).slice(1).map((contact, i) => (
                            <span key={i} className="inline-flex flex-wrap items-center gap-x-1.5">
                              {contact.name && <span className="font-medium text-slate-700 dark:text-slate-300">{contact.name}</span>}
                              {contact.email && (
                                <a href={`mailto:${contact.email}`} className="inline-flex items-center gap-1 hover:text-brand-600 dark:hover:text-brand-400 hover:underline">
                                  <Mail className="w-3 h-3" /> {contact.email}
                                </a>
                              )}
                            </span>
                          ))}
                        </p>
                      )}
                    </div>

                    {imgUrl && (
                      <button
                        type="button"
                        onClick={() => setExpandedImage({ url: imgUrl, title: event.title })}
                        className="shrink-0 self-start group relative rounded-xl overflow-hidden border border-slate-200 dark:border-slate-700 w-20 h-24 sm:w-28 sm:h-36 bg-slate-100 dark:bg-slate-700"
                        aria-label="View poster"
                      >
                        <img src={thumbUrl} alt="" loading="lazy" decoding="async" className="w-full h-full object-cover group-hover:scale-105 transition-transform" />
                      </button>
                    )}
                  </div>

                  {/* Actions */}
                  <div className="px-4 sm:px-5 py-3 bg-slate-50 dark:bg-slate-900/40 border-t border-slate-100 dark:border-slate-700">
                    {isConfirmingApprove && duplicate ? (
                      <div className="flex flex-wrap items-center justify-end gap-2">
                        <span className="text-sm text-red-700 dark:text-red-300 font-medium mr-auto inline-flex items-start gap-1.5">
                          <Copy className="w-4 h-4 mt-0.5 shrink-0" />
                          <span>Looks like a duplicate of “{duplicate.event.title}”. Approve anyway?</span>
                        </span>
                        <button
                          type="button"
                          onClick={() => setApproveConfirmId(null)}
                          className="cta px-3 py-2 rounded text-slate-700 dark:text-slate-200 bg-white dark:bg-slate-700 border border-slate-200 dark:border-slate-600"
                        >
                          Cancel
                        </button>
                        <button
                          type="button"
                          onClick={() => { setApproveConfirmId(null); void handleSingleApprove(event); }}
                          disabled={isProcessing}
                          className="cta px-3 py-2 rounded text-white bg-ccp-green-600 hover:bg-ccp-green-700 disabled:opacity-50"
                        >
                          Approve anyway
                        </button>
                      </div>
                    ) : isConfirmingReject ? (
                      <div className="space-y-2">
                        <p className="text-sm text-red-700 dark:text-red-300 font-medium">
                          Decline and delete this submission?
                        </p>
                        <label className="block">
                          <span className="text-xs font-medium text-slate-600 dark:text-slate-300">
                            Reason for {firstName(event.submitterName) || 'the submitter'} (optional, goes in the email)
                          </span>
                          <textarea
                            value={rejectReason}
                            onChange={(e) => setRejectReason(e.target.value)}
                            rows={2}
                            maxLength={1000}
                            placeholder="For example: it is already on the calendar"
                            className="mt-1 block w-full px-3 py-2 text-sm rounded border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-900/40 text-slate-800 dark:text-slate-100 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-brand-500"
                          />
                        </label>
                        <div className="flex justify-end gap-2">
                          <button
                            type="button"
                            onClick={() => { setRejectConfirmId(null); setRejectReason(''); }}
                            className="cta px-3 py-2 rounded text-slate-700 dark:text-slate-200 bg-white dark:bg-slate-700 border border-slate-200 dark:border-slate-600"
                          >
                            Keep
                          </button>
                          <button
                            type="button"
                            onClick={() => handleSingleReject(event)}
                            disabled={isProcessing}
                            className="cta px-3 py-2 rounded text-white bg-red-600 hover:bg-red-700 disabled:opacity-50"
                          >
                            {isProcessing ? 'Deleting…' : 'Yes, decline'}
                          </button>
                        </div>
                      </div>
                    ) : (
                      <div className="grid grid-cols-[1fr_1fr_1.3fr] sm:flex sm:justify-end gap-2">
                        <button
                          type="button"
                          onClick={() => { setRejectConfirmId(event.id); setRejectReason(''); }}
                          disabled={isProcessing}
                          className="cta inline-flex items-center justify-center gap-1.5 px-2 min-[400px]:px-3 py-2 rounded text-slate-600 dark:text-slate-300 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-950/30 transition-colors sm:mr-auto"
                          title="Decline and delete this submission"
                        >
                          <Trash2 className="hidden min-[400px]:block w-4 h-4 shrink-0" />
                          Decline
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            onEdit(event);
                            onClose();
                          }}
                          disabled={isProcessing}
                          className="cta inline-flex items-center justify-center gap-1.5 px-3 min-[400px]:px-4 py-2 rounded text-slate-700 dark:text-slate-200 bg-white dark:bg-slate-700 border border-slate-200 dark:border-slate-600 hover:bg-slate-50 dark:hover:bg-slate-600 transition-colors"
                        >
                          {/* Words only under 400px, where the icons were squeezed to dots */}
                          <Pencil className="hidden min-[400px]:block w-4 h-4 shrink-0" />
                          Edit
                        </button>
                        <button
                          type="button"
                          onClick={() => (duplicate ? setApproveConfirmId(event.id) : handleSingleApprove(event))}
                          disabled={isProcessing || isApprovingAll}
                          className="cta inline-flex items-center justify-center gap-1.5 px-3 min-[400px]:px-4 py-2 rounded text-white bg-ccp-green-600 hover:bg-ccp-green-700 shadow-sm transition-colors disabled:opacity-50"
                        >
                          <Check className="hidden min-[400px]:block w-4 h-4 shrink-0" />
                          {isProcessing ? 'Publishing…' : 'Approve'}
                        </button>
                      </div>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </ModalShell>

      {expandedImage && (
        <PosterLightbox src={expandedImage.url} title={expandedImage.title} onClose={() => setExpandedImage(null)} />
      )}
    </>
  );
};

export default SubmissionsModal;
