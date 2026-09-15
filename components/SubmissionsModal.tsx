import React, { useState, useRef } from 'react';
import { X, Check, Trash2, Edit3, Calendar, Clock, MapPin, Tag, User, Mail, AlertTriangle, ExternalLink, CheckCheck } from 'lucide-react';
import { Event } from '../types';
import { useModalFocusTrap } from '../hooks/useModalFocusTrap';

interface SubmissionsModalProps {
  isOpen: boolean;
  onClose: () => void;
  submissions: Event[];
  onApprove: (event: Event) => Promise<void>;
  onEdit: (event: Event) => void;
  onReject: (eventId: string) => Promise<void>;
  onApproveAll?: () => Promise<void>;
}

const SubmissionsModal: React.FC<SubmissionsModalProps> = ({
  isOpen,
  onClose,
  submissions,
  onApprove,
  onEdit,
  onReject,
  onApproveAll
}) => {
  const modalPanelRef = useRef<HTMLDivElement>(null);
  useModalFocusTrap(isOpen, onClose, modalPanelRef);

  const [processingId, setProcessingId] = useState<string | null>(null);
  const [isApprovingAll, setIsApprovingAll] = useState(false);
  const [rejectConfirmId, setRejectConfirmId] = useState<string | null>(null);
  const [expandedImage, setExpandedImage] = useState<string | null>(null);

  if (!isOpen) return null;

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

  const formatDate = (d: Date | string) => {
    const date = d instanceof Date ? d : new Date(d);
    if (isNaN(date.getTime())) return '';
    return date.toLocaleDateString('en-IE', {
      weekday: 'short',
      day: 'numeric',
      month: 'short',
      year: 'numeric'
    });
  };

  const formatTime = (d: Date | string) => {
    const date = d instanceof Date ? d : new Date(d);
    if (isNaN(date.getTime())) return '';
    return date.toLocaleTimeString('en-IE', {
      hour: '2-digit',
      minute: '2-digit',
      hour12: false
    });
  };

  return (
    <div
      className="fixed inset-0 z-50 overflow-y-auto"
      aria-labelledby="submissions-modal-title"
      role="dialog"
      aria-modal="true"
    >
      <div className="flex items-center justify-center min-h-screen pt-4 px-4 pb-20 text-center sm:block sm:p-0">
        <div
          className="fixed inset-0 bg-slate-900 bg-opacity-75 transition-opacity"
          aria-hidden="true"
          onClick={onClose}
        ></div>
        <span className="hidden sm:inline-block sm:align-middle sm:h-screen" aria-hidden="true">
          &#8203;
        </span>

        <div
          ref={modalPanelRef}
          className="inline-block align-bottom bg-white dark:bg-slate-800 rounded-2xl text-left overflow-hidden shadow-2xl transform transition-all sm:my-8 sm:align-middle sm:max-w-3xl w-full border border-slate-200 dark:border-slate-700"
        >
          {/* Header */}
          <div className="bg-slate-50 dark:bg-slate-850 px-6 py-4 border-b border-slate-200 dark:border-slate-700 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-xl bg-brand-50 dark:bg-brand-950/60 text-brand-600 dark:text-brand-400">
                <Calendar className="w-5 h-5" />
              </div>
              <div>
                <h2 className="text-lg font-bold text-slate-900 dark:text-white" id="submissions-modal-title">
                  Staff Submissions Inbox
                </h2>
                <p className="text-xs text-slate-500 dark:text-slate-300">
                  Review upcoming events submitted by staff for the Fortnightly Bulletin
                </p>
              </div>
            </div>

            <div className="flex items-center gap-3">
              {submissions.length > 1 && onApproveAll && (
                <button
                  onClick={handleBatchApprove}
                  disabled={isApprovingAll || processingId !== null}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-green-600 hover:bg-green-700 text-white rounded-lg text-xs font-semibold shadow-sm transition-colors disabled:opacity-50"
                >
                  <CheckCheck className="w-4 h-4" />
                  {isApprovingAll ? 'Approving All…' : `Approve All (${submissions.length})`}
                </button>
              )}
              <button
                onClick={onClose}
                className="p-1.5 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
          </div>

          {/* Submissions List */}
          <div className="p-6 max-h-[70vh] overflow-y-auto space-y-4">
            {submissions.length === 0 ? (
              <div className="py-12 text-center">
                <div className="w-16 h-16 bg-green-50 dark:bg-green-950/30 text-green-500 rounded-full flex items-center justify-center mx-auto mb-4">
                  <Check className="w-8 h-8" />
                </div>
                <h3 className="text-base font-semibold text-slate-900 dark:text-white">
                  No Pending Submissions
                </h3>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 max-w-sm mx-auto">
                  All submitted events have been reviewed. When staff submit events via the Wednesday link, they will appear here.
                </p>
              </div>
            ) : (
              submissions.map((event) => {
                const isProcessing = processingId === event.id;
                const isConfirmingReject = rejectConfirmId === event.id;

                return (
                  <div
                    key={event.id}
                    className="p-5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800/80 hover:shadow-md transition-shadow relative overflow-hidden"
                  >
                    <div className="flex flex-col md:flex-row md:items-start justify-between gap-4">
                      {/* Left: Info */}
                      <div className="flex-1 min-w-0 space-y-2">
                        {/* Submitter attribution */}
                        <div className="flex flex-wrap items-center gap-2 text-xs">
                          {event.submitterName && (
                            <span className="inline-flex items-center gap-1 font-medium text-slate-700 dark:text-slate-300 bg-slate-100 dark:bg-slate-700 px-2.5 py-1 rounded-md">
                              <User className="w-3 h-3 text-slate-400" />
                              {event.submitterName}
                            </span>
                          )}
                          {event.submitterEmail && (
                            <span className="inline-flex items-center gap-1 text-slate-500 dark:text-slate-400">
                              <Mail className="w-3 h-3 text-slate-400" />
                              {event.submitterEmail}
                            </span>
                          )}
                          <span className="text-[11px] text-slate-400">
                            • Submitted {event.createdAt ? formatDate(event.createdAt) : ''}
                          </span>
                        </div>

                        {/* Title & Category */}
                        <div className="flex flex-wrap items-center gap-2 pt-1">
                          <h3 className="text-base font-bold text-slate-900 dark:text-white">
                            {event.title}
                          </h3>
                          {event.category && (
                            <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold bg-brand-50 dark:bg-brand-950/40 text-brand-700 dark:text-brand-300 border border-brand-200 dark:border-brand-800">
                              {event.category}
                            </span>
                          )}
                        </div>

                        {/* Date, Time & Venue */}
                        <div className="flex flex-wrap items-center gap-4 text-xs text-slate-600 dark:text-slate-300 font-medium">
                          <span className="inline-flex items-center gap-1.5">
                            <Calendar className="w-3.5 h-3.5 text-brand-600 dark:text-brand-400" />
                            {formatDate(event.date)}
                          </span>
                          <span className="inline-flex items-center gap-1.5">
                            <Clock className="w-3.5 h-3.5 text-brand-600 dark:text-brand-400" />
                            {formatTime(event.date)}
                            {event.endDate ? ` – ${formatTime(event.endDate)}` : ''}
                          </span>
                          <span className="inline-flex items-center gap-1.5">
                            <MapPin className="w-3.5 h-3.5 text-brand-600 dark:text-brand-400" />
                            {event.location}
                          </span>
                        </div>

                        {/* Description */}
                        <p className="text-xs sm:text-sm text-slate-600 dark:text-slate-300 whitespace-pre-line pt-1">
                          {event.description}
                        </p>
                      </div>

                      {/* Right: Poster Thumbnail */}
                      {(event.posterUrl || event.attachments?.some(a => a.type === 'image')) && (
                        <div className="flex-shrink-0">
                          {(() => {
                            const imgUrl = event.posterUrl || event.attachments?.find(a => a.type === 'image')?.url;
                            if (!imgUrl) return null;
                            return (
                              <div
                                onClick={() => setExpandedImage(imgUrl)}
                                className="cursor-pointer group relative rounded-lg overflow-hidden border border-slate-200 dark:border-slate-700 w-24 h-24 sm:w-28 sm:h-28 bg-slate-100 dark:bg-slate-700"
                              >
                                <img
                                  src={imgUrl}
                                  alt="Flyer thumbnail"
                                  className="w-full h-full object-cover group-hover:scale-105 transition-transform"
                                />
                                <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center text-white text-[10px] font-medium">
                                  View
                                </div>
                              </div>
                            );
                          })()}
                        </div>
                      )}
                    </div>

                    {/* Actions Bar */}
                    <div className="mt-4 pt-3 border-t border-slate-100 dark:border-slate-700 flex flex-wrap items-center justify-between gap-3">
                      <div className="text-[11px] text-amber-600 dark:text-amber-400 font-medium flex items-center gap-1.5">
                        <span className="w-2 h-2 rounded-full bg-amber-500 animate-pulse"></span>
                        <span>Pending Review</span>
                      </div>

                      <div className="flex items-center gap-2">
                        {isConfirmingReject ? (
                          <div className="flex items-center gap-1.5 bg-red-50 dark:bg-red-950/40 p-1 rounded-lg border border-red-200 dark:border-red-900">
                            <span className="text-[11px] text-red-600 dark:text-red-400 font-medium px-2">
                              Confirm delete?
                            </span>
                            <button
                              onClick={() => handleSingleReject(event.id)}
                              disabled={isProcessing}
                              className="px-2 py-1 bg-red-600 hover:bg-red-700 text-white rounded text-xs font-semibold"
                            >
                              Yes
                            </button>
                            <button
                              onClick={() => setRejectConfirmId(null)}
                              className="px-2 py-1 bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-200 rounded text-xs"
                            >
                              No
                            </button>
                          </div>
                        ) : (
                          <button
                            onClick={() => setRejectConfirmId(event.id)}
                            disabled={isProcessing}
                            className="p-2 text-slate-400 hover:text-red-600 dark:hover:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/30 rounded-lg transition-colors"
                            title="Decline / Delete submission"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        )}

                        <button
                          onClick={() => {
                            onEdit(event);
                            onClose();
                          }}
                          disabled={isProcessing}
                          className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-lg transition-colors border border-slate-200 dark:border-slate-700"
                        >
                          <Edit3 className="w-3.5 h-3.5 text-slate-500" />
                          <span>Edit</span>
                        </button>

                        <button
                          onClick={() => handleSingleApprove(event)}
                          disabled={isProcessing}
                          className="inline-flex items-center gap-1.5 px-4 py-1.5 text-xs font-semibold text-white bg-green-600 hover:bg-green-700 rounded-lg shadow-sm transition-colors disabled:opacity-50"
                        >
                          <Check className="w-4 h-4" />
                          <span>{isProcessing ? 'Publishing…' : 'Approve & Publish'}</span>
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })
            )}
          </div>

          {/* Footer */}
          <div className="bg-slate-50 dark:bg-slate-850 px-6 py-3 border-t border-slate-200 dark:border-slate-700 flex items-center justify-between">
            <span className="text-xs text-slate-500 dark:text-slate-400">
              Approved events will automatically appear on the calendar and in the Fortnightly Bulletin.
            </span>
            <button
              onClick={onClose}
              className="px-4 py-2 bg-white dark:bg-slate-750 hover:bg-slate-100 dark:hover:bg-slate-700 border border-slate-300 dark:border-slate-600 text-slate-700 dark:text-slate-200 rounded-xl text-xs font-semibold transition-colors shadow-xs"
            >
              Close
            </button>
          </div>
        </div>
      </div>

      {/* Expanded Image Modal */}
      {expandedImage && (
        <div
          className="fixed inset-0 z-60 bg-black/80 flex items-center justify-center p-4 cursor-pointer"
          onClick={() => setExpandedImage(null)}
        >
          <div className="relative max-w-2xl max-h-[85vh] bg-white rounded-xl overflow-hidden shadow-2xl">
            <img
              src={expandedImage}
              alt="Expanded poster"
              className="max-w-full max-h-[85vh] object-contain"
            />
            <button
              onClick={() => setExpandedImage(null)}
              className="absolute top-3 right-3 p-1.5 bg-black/50 text-white rounded-full hover:bg-black/70"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default SubmissionsModal;
