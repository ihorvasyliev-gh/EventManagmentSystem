import React, { useState } from 'react';
import { X, Check, Trash2, Pencil, CalendarDays, Clock, MapPin, Mail, CheckCheck, Inbox, AlertTriangle } from 'lucide-react';
import { Event } from '../types';
import ModalShell from './ModalShell';
import { getCategoryDotColor } from './WeekView';
import { formatOccurrenceLabel } from '../utils/digestGrouping';
import { detectMultiDateConflicts, getOccurrencesAroundDates } from '../utils/conflictDetection';

interface SubmissionsModalProps {
  isOpen: boolean;
  onClose: () => void;
  submissions: Event[];
  /** Published events, used to flag clashes before approving */
  events?: Event[];
  onApprove: (event: Event) => Promise<void>;
  onEdit: (event: Event) => void;
  onReject: (eventId: string) => Promise<void>;
  onApproveAll?: () => Promise<void>;
}

const pad2 = (n: number) => String(n).padStart(2, '0');
const clock = (d: Date) => `${pad2(d.getHours())}:${pad2(d.getMinutes())}`;

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
  onApproveAll
}) => {
  const [processingId, setProcessingId] = useState<string | null>(null);
  const [isApprovingAll, setIsApprovingAll] = useState(false);
  const [rejectConfirmId, setRejectConfirmId] = useState<string | null>(null);
  const [expandedImage, setExpandedImage] = useState<string | null>(null);

  const handleSingleApprove = async (event: Event) => {
    setProcessingId(event.id);
    try {
      await onApprove(event);
    } finally {
      setProcessingId(null);
    }
  };

  const handleSingleReject = async (eventId: string) => {
    setProcessingId(eventId);
    try {
      await onReject(eventId);
      setRejectConfirmId(null);
    } finally {
      setProcessingId(null);
    }
  };

  const handleBatchApprove = async () => {
    if (!onApproveAll) return;
    setIsApprovingAll(true);
    try {
      await onApproveAll();
    } finally {
      setIsApprovingAll(false);
    }
  };

  const published = events.filter((e) => e.status !== 'draft');

  const footer = (
    <div className="flex flex-col-reverse sm:flex-row sm:items-center gap-2 sm:gap-4">
      <p className="text-xs text-slate-500 dark:text-slate-400 sm:flex-1">
        Approved events appear on the calendar and in the next digest straight away.
      </p>
      {submissions.length > 1 && onApproveAll && (
        <button
          type="button"
          onClick={handleBatchApprove}
          disabled={isApprovingAll || processingId !== null}
          className="inline-flex items-center justify-center gap-2 px-4 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-sm font-semibold shadow-sm transition-colors disabled:opacity-50"
        >
          <CheckCheck className="w-4 h-4" />
          {isApprovingAll ? 'Approving…' : `Approve all ${submissions.length}`}
        </button>
      )}
    </div>
  );

  return (
    <>
      <ModalShell
        isOpen={isOpen}
        onClose={onClose}
        title="Submissions inbox"
        subtitle={submissions.length === 0
          ? 'Nothing waiting for review'
          : `${submissions.length} ${submissions.length === 1 ? 'event' : 'events'} waiting for review`}
        icon={<Inbox className="w-5 h-5" />}
        size="lg"
        footer={submissions.length > 0 ? footer : undefined}
      >
        {submissions.length === 0 ? (
          <div className="py-10 text-center">
            <div className="w-16 h-16 bg-emerald-50 dark:bg-emerald-950/30 text-emerald-500 rounded-full flex items-center justify-center mx-auto mb-4">
              <Check className="w-8 h-8" />
            </div>
            <h3 className="text-base font-semibold text-slate-900 dark:text-white">All caught up</h3>
            <p className="text-sm text-slate-500 dark:text-slate-400 mt-1 max-w-sm mx-auto">
              When staff submit events through the form, they’ll appear here for you to approve.
            </p>
          </div>
        ) : (
          <ul className="space-y-3">
            {submissions.map((event) => {
              const isProcessing = processingId === event.id;
              const isConfirmingReject = rejectConfirmId === event.id;
              const imgUrl = event.posterUrl || event.attachments?.find((a) => a.type === 'image')?.url;
              const dates = event.recurrence?.type === 'custom' && event.recurrence.customDates?.length
                ? [...event.recurrence.customDates].sort((a, b) => a.getTime() - b.getTime())
                : [event.date];
              const conflict = detectMultiDateConflicts(
                dates,
                clock(event.date),
                event.endDate ? clock(event.endDate) : '',
                getOccurrencesAroundDates(published, dates)
              );

              return (
                <li key={event.id} className="rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800/60 overflow-hidden">
                  <div className="p-4 sm:p-5 flex gap-4">
                    <div className="flex-1 min-w-0 space-y-2">
                      <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                        <span className={`w-2 h-2 rounded-full ${getCategoryDotColor(event.category)}`} aria-hidden="true" />
                        <span className="truncate">{event.category || 'Event'}</span>
                      </div>
                      <h3 className="text-base sm:text-lg font-bold text-slate-900 dark:text-white leading-snug break-words">{event.title}</h3>

                      <div className="space-y-1 text-sm text-slate-600 dark:text-slate-300">
                        <p className="flex items-start gap-2">
                          <CalendarDays className="w-4 h-4 mt-0.5 shrink-0 text-slate-400" />
                          <span>{dates.map((d) => formatOccurrenceLabel(d)).join(', ')}</span>
                        </p>
                        <p className="flex items-center gap-2">
                          <Clock className="w-4 h-4 shrink-0 text-slate-400" />
                          {clock(event.date)}{event.endDate ? ` – ${clock(event.endDate)}` : ''}
                        </p>
                        {event.location && (
                          <p className="flex items-start gap-2">
                            <MapPin className="w-4 h-4 mt-0.5 shrink-0 text-slate-400" />
                            <span className="break-words">{event.location}</span>
                          </p>
                        )}
                      </div>

                      {event.description && (
                        <p className="text-sm text-slate-500 dark:text-slate-400 whitespace-pre-line line-clamp-4">{event.description}</p>
                      )}

                      {conflict.hasConflict && (
                        <p className="flex items-start gap-2 text-xs text-amber-800 dark:text-amber-300 bg-amber-50 dark:bg-amber-950/30 rounded-lg px-2.5 py-2">
                          <AlertTriangle className="w-3.5 h-3.5 mt-0.5 shrink-0" />
                          {conflict.summaryMessage}
                        </p>
                      )}

                      <p className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-slate-500 dark:text-slate-400 pt-1">
                        <span className="font-medium text-slate-700 dark:text-slate-300">{event.submitterName || 'Staff member'}</span>
                        {event.submitterEmail && (
                          <a href={`mailto:${event.submitterEmail}`} className="inline-flex items-center gap-1 hover:text-brand-600 dark:hover:text-brand-400 hover:underline">
                            <Mail className="w-3 h-3" /> {event.submitterEmail}
                          </a>
                        )}
                        {event.createdAt && <span>· {submittedAgo(event.createdAt)}</span>}
                      </p>
                    </div>

                    {imgUrl && (
                      <button
                        type="button"
                        onClick={() => setExpandedImage(imgUrl)}
                        className="shrink-0 self-start group relative rounded-xl overflow-hidden border border-slate-200 dark:border-slate-700 w-20 h-24 sm:w-28 sm:h-36 bg-slate-100 dark:bg-slate-700"
                        aria-label="View poster"
                      >
                        <img src={imgUrl} alt="" className="w-full h-full object-cover group-hover:scale-105 transition-transform" />
                      </button>
                    )}
                  </div>

                  {/* Actions */}
                  <div className="px-4 sm:px-5 py-3 bg-slate-50 dark:bg-slate-900/40 border-t border-slate-100 dark:border-slate-700">
                    {isConfirmingReject ? (
                      <div className="flex flex-wrap items-center justify-end gap-2">
                        <span className="text-sm text-red-700 dark:text-red-300 font-medium mr-auto">Decline and delete this submission?</span>
                        <button
                          type="button"
                          onClick={() => setRejectConfirmId(null)}
                          className="px-3 py-2 rounded-xl text-sm font-medium text-slate-700 dark:text-slate-200 bg-white dark:bg-slate-700 border border-slate-200 dark:border-slate-600"
                        >
                          Keep
                        </button>
                        <button
                          type="button"
                          onClick={() => handleSingleReject(event.id)}
                          disabled={isProcessing}
                          className="px-3 py-2 rounded-xl text-sm font-semibold text-white bg-red-600 hover:bg-red-700 disabled:opacity-50"
                        >
                          {isProcessing ? 'Deleting…' : 'Yes, decline'}
                        </button>
                      </div>
                    ) : (
                      <div className="grid grid-cols-[auto_1fr_1.4fr] sm:flex sm:justify-end gap-2">
                        <button
                          type="button"
                          onClick={() => setRejectConfirmId(event.id)}
                          disabled={isProcessing}
                          className="inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl text-sm font-medium text-slate-500 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-950/30 transition-colors sm:mr-auto"
                          title="Decline / delete submission"
                        >
                          <Trash2 className="w-4 h-4" />
                          <span className="hidden sm:inline">Decline</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            onEdit(event);
                            onClose();
                          }}
                          disabled={isProcessing}
                          className="inline-flex items-center justify-center gap-1.5 px-4 py-2 rounded-xl text-sm font-medium text-slate-700 dark:text-slate-200 bg-white dark:bg-slate-700 border border-slate-200 dark:border-slate-600 hover:bg-slate-50 dark:hover:bg-slate-600 transition-colors"
                        >
                          <Pencil className="w-4 h-4" />
                          Edit
                        </button>
                        <button
                          type="button"
                          onClick={() => handleSingleApprove(event)}
                          disabled={isProcessing || isApprovingAll}
                          className="inline-flex items-center justify-center gap-1.5 px-4 py-2 rounded-xl text-sm font-semibold text-white bg-emerald-600 hover:bg-emerald-700 shadow-sm transition-colors disabled:opacity-50"
                        >
                          <Check className="w-4 h-4" />
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
        <div
          className="fixed inset-0 z-[70] bg-black/85 flex items-center justify-center p-4"
          onClick={() => setExpandedImage(null)}
          role="presentation"
        >
          <img src={expandedImage} alt="Poster" className="max-w-full max-h-[88vh] object-contain rounded-xl shadow-2xl" />
          <button
            type="button"
            onClick={() => setExpandedImage(null)}
            aria-label="Close poster"
            className="absolute top-4 right-4 p-2 bg-white/15 text-white rounded-full hover:bg-white/25"
          >
            <X className="w-5 h-5" />
          </button>
        </div>
      )}
    </>
  );
};

export default SubmissionsModal;
