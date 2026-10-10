import React from 'react';
import { CalendarDays, Clock, ImageIcon, Info, MapPin, Sparkles } from 'lucide-react';
import { getCategoryDotColor } from '../WeekView';
import { formatOccurrenceLabel } from '../../utils/digestGrouping';

interface SubmitPreviewProps {
  isAdmin: boolean;
  title: string;
  category: string;
  description: string;
  posterPreview: string | null;
  /** The picked dates, in order */
  dates: Date[];
  timeLabel: string;
  placeLabel: string;
}

/** Desktop sidebar on the submit form: the event as it will look, and what happens next */
const SubmitPreview: React.FC<SubmitPreviewProps> = ({ isAdmin, title, category, description, posterPreview, dates, timeLabel, placeLabel }) => (
  <aside className="hidden lg:block sticky top-24 space-y-4" aria-label="Preview">
    <div className="bg-white dark:bg-slate-800 rounded-leaf shadow-sm border border-slate-200 dark:border-slate-700 overflow-hidden">
      <div className="px-5 pt-4 pb-3 flex items-center gap-2 text-[11px] font-bold uppercase tracking-[0.16em] text-brand-600 dark:text-brand-300">
        <Sparkles className="w-3.5 h-3.5" /> Preview
      </div>
      {posterPreview ? (
        <img src={posterPreview} alt="" className="w-full h-40 object-cover border-y border-slate-100 dark:border-slate-700" />
      ) : (
        <div className="h-24 mx-5 mb-1 rounded-xl bg-slate-100 dark:bg-slate-900/50 flex items-center justify-center text-slate-300 dark:text-slate-600">
          <ImageIcon className="w-7 h-7" />
        </div>
      )}
      <div className="p-5 space-y-2.5">
        <span className="inline-flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
          <span className={`w-2 h-2 rounded-full ${getCategoryDotColor(category)}`} /> {category}
        </span>
        <p className={`text-lg font-bold leading-snug break-words ${title.trim() ? 'text-slate-900 dark:text-white' : 'text-slate-400'}`}>
          {title.trim() || 'Your event name'}
        </p>
        <p className="flex items-start gap-2 text-sm text-slate-600 dark:text-slate-300">
          <CalendarDays className="w-4 h-4 mt-0.5 shrink-0 text-slate-400" />
          <span>
            {dates.length === 0 ? 'No date yet' : dates.slice(0, 4).map((d) => formatOccurrenceLabel(d)).join(', ')}
            {dates.length > 4 && ` +${dates.length - 4} more`}
          </span>
        </p>
        <p className="flex items-center gap-2 text-sm text-slate-600 dark:text-slate-300">
          <Clock className="w-4 h-4 shrink-0 text-slate-400" /> {timeLabel}
        </p>
        <p className="flex items-start gap-2 text-sm text-slate-600 dark:text-slate-300">
          <MapPin className="w-4 h-4 mt-0.5 shrink-0 text-slate-400" />
          <span className="break-words">{placeLabel || <span className="text-slate-400">Venue</span>}</span>
        </p>
        {description.trim() && (
          <p className="text-sm text-slate-500 dark:text-slate-400 line-clamp-4 whitespace-pre-line">{description.trim()}</p>
        )}
      </div>
    </div>

    {!isAdmin && (
      <div className="rounded-leaf-sm border border-slate-200 dark:border-slate-700 p-5 space-y-4">
        <div>
          <p className="text-sm font-semibold text-slate-900 dark:text-white mb-1.5 flex items-center gap-2">
            <Info className="w-4 h-4 text-brand-600 dark:text-brand-400 shrink-0" />
            <span>What can be included?</span>
          </p>
          <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
            Any event held by CCP, co-hosted, or funded by CCP that colleagues, Board members, or City Hall could attend or share (from talks & festivals to local coffee mornings).
          </p>
        </div>
        <div className="border-t border-slate-100 dark:border-slate-700 pt-4">
          <p className="text-sm font-semibold text-slate-900 dark:text-white mb-3">What happens next</p>
          <ol className="space-y-3 text-sm text-slate-600 dark:text-slate-300">
            {[
              ['You submit', 'Any time — Wednesdays are best.'],
              ['Elizabeth reviews', 'Usually on Thursday.'],
              ['It’s published', 'On the calendar and in Friday’s digest.']
            ].map(([head, sub], i) => (
              <li key={head} className="flex gap-3">
                <span className="shrink-0 w-6 h-6 rounded-full bg-ccp-green-600 text-xs font-bold flex items-center justify-center text-white">{i + 1}</span>
                <span>
                  <span className="block font-medium text-slate-800 dark:text-slate-200">{head}</span>
                  <span className="text-xs text-slate-500 dark:text-slate-400">{sub}</span>
                </span>
              </li>
            ))}
          </ol>
        </div>
      </div>
    )}
  </aside>
);

export default SubmitPreview;
