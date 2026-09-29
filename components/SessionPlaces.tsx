import React from 'react';
import { MapPin } from 'lucide-react';
import {
  formatDateChipLabel,
  formatTimeRange,
  type Session,
  type SessionPlaces as SessionPlacesMap,
} from '../utils/multiDateUtils';
import { formatLocalDate } from '../utils/date';

interface SessionPlacesProps {
  /** Every session of the event (from `listSessions`) */
  sessions: Session[];
  samePlace: boolean;
  onChangeSamePlace: (same: boolean) => void;
  places: SessionPlacesMap;
  onChangePlaces: (places: SessionPlacesMap) => void;
  /** Addresses offered while typing */
  suggestions?: string[];
  disabled?: boolean;
  error?: string;
  /** Id of the list wrapper, so the form can scroll to it */
  id?: string;
}

/**
 * "Same place for all dates" toggle and, while it is off, an address for every session.
 * The shared address field itself stays in the form (it is shown while the toggle is on).
 */
export const SessionPlaces: React.FC<SessionPlacesProps> = ({
  sessions,
  samePlace,
  onChangeSamePlace,
  places,
  onChangePlaces,
  suggestions = [],
  disabled = false,
  error,
  id,
}) => {
  // Offered once there is more than one occurrence (kept visible after switching to it)
  if (sessions.length < 2 && samePlace) return null;
  const listId = id ? `${id}-suggestions` : 'session-place-suggestions';

  const days: { key: string; day: Date; items: Session[] }[] = [];
  for (const s of sessions) {
    const key = formatLocalDate(s.day);
    const last = days[days.length - 1];
    if (last && last.key === key) last.items.push(s);
    else days.push({ key, day: s.day, items: [s] });
  }

  const setPlace = (key: string, value: string) => onChangePlaces({ ...places, [key]: value });
  const applyToAll = (value: string) => {
    const next = { ...places };
    sessions.forEach((s) => { next[s.key] = value; });
    onChangePlaces(next);
  };

  return (
    <div className="space-y-2">
      <label className="inline-flex items-center gap-2 cursor-pointer select-none min-h-[32px] text-xs font-semibold text-slate-700 dark:text-slate-300">
        <input
          type="checkbox"
          checked={samePlace}
          disabled={disabled}
          onChange={(e) => onChangeSamePlace(e.target.checked)}
          className="w-4 h-4 rounded border-slate-300 dark:border-slate-600 text-brand-600 focus:ring-brand-500 accent-brand-600"
        />
        Same place for all dates
      </label>

      {!samePlace && (
        <div id={id} tabIndex={-1} className="outline-none scroll-mt-24 space-y-2">
          <p className="text-[11px] text-slate-500 dark:text-slate-400">Set the address for each date and time.</p>
          {suggestions.length > 0 && (
            <datalist id={listId}>
              {suggestions.map((v) => <option key={v} value={v} />)}
            </datalist>
          )}
          <ul className="space-y-2">
            {days.map(({ key, day, items }) => (
              <li
                key={key}
                className="rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50/60 dark:bg-slate-900/30 p-2.5 sm:p-3 space-y-2"
              >
                <span className="block text-xs font-bold text-slate-800 dark:text-slate-100">{formatDateChipLabel(day)}</span>
                {items.map((s) => {
                  const value = places[s.key] ?? '';
                  const missing = !!error && !value.trim();
                  const timeLabel = s.slot.start ? formatTimeRange(s.slot) : 'Time not set';
                  return (
                    <div key={s.key}>
                      <div className="flex items-center justify-between gap-2 mb-1">
                        <span className="text-[11px] font-semibold text-slate-600 dark:text-slate-400">{timeLabel}</span>
                        {sessions.length > 1 && value.trim() && (
                          <button
                            type="button"
                            disabled={disabled}
                            onClick={() => applyToAll(value)}
                            className="text-[11px] font-semibold text-brand-600 dark:text-brand-400 hover:underline disabled:opacity-40 min-h-[28px]"
                          >
                            Use for all
                          </button>
                        )}
                      </div>
                      <div className="relative">
                        <MapPin className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                        <input
                          type="text"
                          list={suggestions.length > 0 ? listId : undefined}
                          value={value}
                          disabled={disabled}
                          onChange={(e) => setPlace(s.key, e.target.value)}
                          placeholder="e.g. Heron House, Room 4"
                          autoComplete="off"
                          aria-label={`Address for ${formatDateChipLabel(day)}, ${timeLabel}`}
                          aria-invalid={missing}
                          className={`block w-full pl-9 pr-3 py-2.5 sm:py-2 rounded-lg bg-white dark:bg-slate-800 dark:text-white text-sm min-h-[44px] sm:min-h-0 focus:ring-2 focus:ring-brand-500/20 transition-all disabled:opacity-50 ${
                            missing
                              ? 'border-2 border-red-500 dark:border-red-500'
                              : 'border border-slate-200 dark:border-slate-700 focus:border-brand-500'
                          }`}
                        />
                      </div>
                    </div>
                  );
                })}
              </li>
            ))}
          </ul>
        </div>
      )}

      {error && (
        <p className="text-red-500 dark:text-red-400 text-xs" role="alert">{error}</p>
      )}
    </div>
  );
};

export default SessionPlaces;
