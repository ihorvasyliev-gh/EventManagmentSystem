import React, { useMemo, useState } from 'react';
import { CalendarCheck, Clock, CheckCircle2, PlusCircle, Repeat, MapPin } from 'lucide-react';
import ModalShell from './ModalShell';
import { type Event } from '../types';
import { ownsEvent } from '../utils/eventOwnership';
import { resultInstances } from '../utils/agenda';
import { isRecurringEvent } from '../utils/recurrence';
import { getStartOfToday, formatClock, APP_LOCALE } from '../utils/date';
import { getCategoryDotColor } from './WeekView';

interface MyEventsModalProps {
  isOpen: boolean;
  onClose: () => void;
  events: Event[];
  user: { id: string; email: string };
  recurrenceExceptions: Map<string, Date[]>;
  onOpenEvent: (event: Event) => void;
  onSubmitEvent: () => void;
}

const DAY = new Intl.DateTimeFormat(APP_LOCALE, { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' });

const StatusBadge: React.FC<{ event: Event }> = ({ event }) =>
  event.status === 'draft' ? (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-bold bg-amber-100 text-amber-800 dark:bg-amber-900/50 dark:text-amber-200">
      <Clock className="h-3 w-3" aria-hidden="true" /> Pending review
    </span>
  ) : (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-bold bg-ccp-green-50 text-ccp-green-800 dark:bg-ccp-green-900/50 dark:text-ccp-green-100">
      <CheckCircle2 className="h-3 w-3" aria-hidden="true" /> On the calendar
    </span>
  );

const Row: React.FC<{ event: Event; onOpen: () => void }> = ({ event, onOpen }) => (
  <li>
    <button
      type="button"
      onClick={onOpen}
      className="w-full text-left flex gap-3 px-3 py-3 rounded-leaf-xs border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-700/50 transition-colors"
    >
      <span className={`mt-1.5 w-2.5 h-2.5 rounded-full shrink-0 ${getCategoryDotColor(event.category)}`} aria-hidden="true" />
      <span className="flex-1 min-w-0">
        <span className="block text-sm font-semibold text-slate-900 dark:text-white [overflow-wrap:anywhere]">{event.title}</span>
        <span className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-slate-500 dark:text-slate-400">
          <span>{DAY.format(event.date)}, {formatClock(event.date)}</span>
          {isRecurringEvent(event) && (
            <span className="inline-flex items-center gap-1"><Repeat className="h-3 w-3" aria-hidden="true" /> Repeats</span>
          )}
          {event.location && (
            <span className="inline-flex items-center gap-1 min-w-0"><MapPin className="h-3 w-3 shrink-0" aria-hidden="true" /><span className="truncate">{event.location}</span></span>
          )}
        </span>
        <span className="mt-1.5 block"><StatusBadge event={event} /></span>
      </span>
    </button>
  </li>
);

/**
 * Staff: the events they sent in or are the contact for, with whether each is still waiting for
 * review or already on the calendar ("did it get through?")
 */
const MyEventsModal: React.FC<MyEventsModalProps> = ({ isOpen, onClose, events, user, recurrenceExceptions, onOpenEvent, onSubmitEvent }) => {
  const [showPast, setShowPast] = useState(false);
  const { upcoming, past } = useMemo(() => {
    const own = events.filter((e) => ownsEvent(e, user));
    return resultInstances(own, { today: getStartOfToday(), exceptions: recurrenceExceptions });
  }, [events, user, recurrenceExceptions]);
  const pending = upcoming.filter((e) => e.status === 'draft').length + past.filter((e) => e.status === 'draft').length;

  const open = (event: Event) => {
    onClose();
    onOpenEvent(event);
  };

  return (
    <ModalShell
      isOpen={isOpen}
      onClose={onClose}
      title="My events"
      subtitle={
        upcoming.length + past.length === 0
          ? 'Events you send in, or that name you as the contact'
          : pending > 0
          ? `${pending} waiting for review`
          : 'Everything you sent in is on the calendar'
      }
      icon={<CalendarCheck className="w-5 h-5" />}
      footer={
        <button
          type="button"
          onClick={() => { onClose(); onSubmitEvent(); }}
          className="cta w-full sm:w-auto inline-flex items-center justify-center gap-2 bg-brand-600 hover:bg-brand-700 text-white px-5 h-10 rounded transition-colors"
        >
          <PlusCircle className="h-4 w-4" /> Submit an event
        </button>
      }
    >
      {upcoming.length + past.length === 0 ? (
        <p className="py-6 text-center text-sm text-slate-500 dark:text-slate-400">
          You haven’t sent in any events yet. Events you submit, or that list your email as the contact, show here with their status.
        </p>
      ) : (
        <div className="space-y-5">
          <section>
            <h3 className="text-[11px] font-bold uppercase tracking-[0.14em] text-brand-600 dark:text-brand-300">Coming up</h3>
            {upcoming.length > 0 ? (
              <ul className="mt-2 space-y-2">
                {upcoming.map((e) => <Row key={e.instanceKey ?? e.id} event={e} onOpen={() => open(e)} />)}
              </ul>
            ) : (
              <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">Nothing coming up.</p>
            )}
          </section>
          {past.length > 0 && (
            <section>
              <button
                type="button"
                onClick={() => setShowPast((v) => !v)}
                aria-expanded={showPast}
                className="text-[11px] font-bold uppercase tracking-[0.14em] text-slate-500 dark:text-slate-400 hover:text-brand-600"
              >
                {showPast ? 'Hide' : 'Show'} past events ({past.length})
              </button>
              {showPast && (
                <ul className="mt-2 space-y-2">
                  {past.map((e) => <Row key={e.instanceKey ?? e.id} event={e} onOpen={() => open(e)} />)}
                </ul>
              )}
            </section>
          )}
        </div>
      )}
    </ModalShell>
  );
};

export default MyEventsModal;
