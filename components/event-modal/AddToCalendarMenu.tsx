import React from 'react';
import { Calendar as CalendarIcon, ChevronDown, Download, ExternalLink } from 'lucide-react';
import type { Event } from '../../types';
import { exportToICal, downloadFile } from '../../utils/export';

/** Event end for calendar invites: the real end time, or 1 hour when none is set */
const getEventEnd = (ev: Event): Date =>
  ev.endDate && ev.endDate > ev.date ? ev.endDate : new Date(ev.date.getTime() + 60 * 60 * 1000);

/** Links that open a new calendar entry for the event in Google, Outlook.com and Office 365 */
export const calendarLinks = (event: Event) => {
  const title = encodeURIComponent(event.title || '');
  const description = encodeURIComponent(event.description || '');
  const location = encodeURIComponent(event.location || '');

  // Format dates (UTC)
  const formatDate = (date: Date) => {
    return date.toISOString().replace(/-|:|\.\d+/g, '');
  };

  const endDate = getEventEnd(event);
  const start = formatDate(event.date);
  const end = formatDate(endDate);

  return {
    google: `https://calendar.google.com/calendar/render?action=TEMPLATE&text=${title}&dates=${start}/${end}&details=${description}&location=${location}`,
    outlook: `https://outlook.live.com/calendar/0/deeplink/compose?subject=${title}&body=${description}&location=${location}&startdt=${event.date.toISOString()}&enddt=${endDate.toISOString()}`,
    office365: `https://outlook.office.com/calendar/0/deeplink/compose?subject=${title}&body=${description}&location=${location}&startdt=${event.date.toISOString()}&enddt=${endDate.toISOString()}`,
  };
};

interface AddToCalendarMenuProps {
  event: Event;
  open: boolean;
  onToggle: () => void;
  onClose: () => void;
}

/** "Add to Calendar" with Office 365, Outlook.com, Google and an .ics download */
const AddToCalendarMenu: React.FC<AddToCalendarMenuProps> = ({ event, open, onToggle, onClose }) => {
  const links = calendarLinks(event);
  const downloadIcs = () => {
    downloadFile(exportToICal([{ ...event, endDate: getEventEnd(event) }]), `${(event.title || 'event').replace(/[^a-z0-9]/gi, '_')}.ics`, 'text/calendar;charset=utf-8');
    onClose();
  };

  return (
    <div className="relative">
      <button
        onClick={onToggle}
        aria-expanded={open}
        className="cta w-full py-3 sm:py-2.5 min-h-[44px] sm:min-h-0 border border-brand-600 dark:border-brand-400 rounded text-brand-600 dark:text-brand-300 hover:bg-brand-50 dark:hover:bg-brand-950/40 transition-colors flex items-center justify-center gap-2"
      >
        <CalendarIcon className="h-4 w-4" />
        Add to Calendar
        <ChevronDown className={`h-4 w-4 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-10" onClick={onClose} />
          <div className="absolute bottom-full left-0 right-0 mb-2 p-1.5 bg-white dark:bg-slate-800 rounded-xl shadow-xl border border-slate-100 dark:border-slate-700 z-20 animate-scale-in origin-bottom">
            <a
              href={links.office365}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center w-full px-3 py-2.5 text-sm text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-700 rounded-lg transition-colors group"
            >
              <span className="flex-1 font-medium">Office 365</span>
              <ExternalLink className="h-3.5 w-3.5 text-slate-400 group-hover:text-brand-500" />
            </a>
            <a
              href={links.outlook}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center w-full px-3 py-2.5 text-sm text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-700 rounded-lg transition-colors group"
            >
              <span className="flex-1">Outlook.com</span>
              <ExternalLink className="h-3.5 w-3.5 text-slate-400 group-hover:text-brand-500" />
            </a>
            <a
              href={links.google}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center w-full px-3 py-2.5 text-sm text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-700 rounded-lg transition-colors group"
            >
              <span className="flex-1">Google Calendar</span>
              <ExternalLink className="h-3.5 w-3.5 text-slate-400 group-hover:text-brand-500" />
            </a>
            <div className="h-px bg-slate-100 dark:bg-slate-700 my-1" />
            <button
              onClick={downloadIcs}
              className="flex items-center w-full px-3 py-2.5 text-sm text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-700 rounded-lg transition-colors group text-left"
            >
              <span className="flex-1">Download .ics File</span>
              <Download className="h-3.5 w-3.5 text-slate-400 group-hover:text-brand-500" />
            </button>
          </div>
        </>
      )}
    </div>
  );
};

export default AddToCalendarMenu;
