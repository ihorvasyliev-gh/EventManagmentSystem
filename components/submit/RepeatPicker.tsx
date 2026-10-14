import React, { useState } from 'react';
import { Repeat } from 'lucide-react';
import {
  type RepeatSetting, REPEAT_CHOICES, NO_REPEAT, describeRepeat, describeSeries, isRepeatChoice, ruleFromRepeat
} from '../../utils/repeat';
import { formatLocalDate } from '../../utils/date';
import { FieldError, inputClass } from './formParts';

interface RepeatPickerProps {
  value: RepeatSetting;
  onChange: (value: RepeatSetting) => void;
  /** The first picked date, with its start time (null until a date is picked) */
  firstDate: Date | null;
  /** Picked dates and times: a repeat starts from one date at one time */
  dateCount: number;
  sessionCount: number;
  error?: string;
}

const pill = (selected: boolean, disabled: boolean) =>
  `relative inline-flex items-center gap-2 px-3.5 py-2 min-h-[40px] rounded border text-sm font-medium select-none transition-all has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-brand-500 ${
    disabled ? 'cursor-not-allowed opacity-50' : 'cursor-pointer'
  } ${
    selected
      ? 'border-brand-600 bg-brand-600 text-white'
      : `border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-900/40 text-slate-700 dark:text-slate-200 ${disabled ? '' : 'hover:border-brand-300 hover:text-brand-600 dark:hover:border-brand-700 dark:hover:text-brand-300'}`
  }`;

/**
 * Under the date picker on /submit: whether the event repeats every week, every 2 weeks or
 * every month from its first date, and until when (or with no end). A repeat starts from one
 * date at one time; with more dates picked, the event runs on exactly those.
 */
const RepeatPicker: React.FC<RepeatPickerProps> = ({ value, onChange, firstDate, dateCount, sessionCount, error }) => {
  // A series an admin set up another way (e.g. every 3 days) keeps its own choice
  const [kept] = useState(() => (isRepeatChoice(value) ? null : value));
  const canRepeat = sessionCount <= 1;
  const current = canRepeat ? value : NO_REPEAT;
  const repeating = current.type !== 'none';
  const rule = ruleFromRepeat(current);
  const keptSelected = !!kept && current.type === kept.type && current.interval === kept.interval;

  const choose = (choice: Pick<RepeatSetting, 'type' | 'interval'>) =>
    onChange(choice.type === 'none' ? { ...NO_REPEAT, until: value.until } : { ...value, type: choice.type, interval: choice.interval, occurrences: undefined });

  return (
    <fieldset id="field-repeat" className="scroll-mt-24">
      <legend className="flex items-center gap-1.5 text-sm font-semibold text-slate-800 dark:text-slate-200 mb-2">
        <Repeat className="w-4 h-4 text-brand-600 dark:text-brand-400" aria-hidden="true" /> Does it repeat?
      </legend>
      <div className="flex flex-wrap gap-2">
        {REPEAT_CHOICES.map((choice) => {
          const selected = current.type === choice.type && (choice.type === 'none' || current.interval === choice.interval);
          const disabled = !canRepeat && choice.type !== 'none';
          return (
            <label key={choice.label} className={pill(selected, disabled)}>
              <input
                type="radio"
                name="repeat"
                checked={selected}
                disabled={disabled}
                onChange={() => choose(choice)}
                className="sr-only"
              />
              {choice.label}
            </label>
          );
        })}
        {kept && (
          <label className={pill(keptSelected, !canRepeat)}>
            <input
              type="radio"
              name="repeat"
              checked={keptSelected}
              disabled={!canRepeat}
              onChange={() => onChange({ ...value, type: kept.type, interval: kept.interval, occurrences: kept.occurrences })}
              className="sr-only"
            />
            {(firstDate && describeRepeat({ type: kept.type, interval: kept.interval }, firstDate)) || 'As it is now'}
          </label>
        )}
      </div>

      {!canRepeat && (
        <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">
          {value.type !== 'none' ? 'Repeating is off while more than one date or time is picked. ' : ''}
          To repeat it every week or month, keep just its first date and one time.{' '}
          {dateCount > 1 ? `With ${dateCount} dates picked, it runs on exactly those.` : ''}
        </p>
      )}

      {repeating && (
        <div className="mt-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50/70 dark:bg-slate-900/30 p-3 sm:p-4 space-y-3">
          <p className="text-sm font-medium text-slate-800 dark:text-slate-100" aria-live="polite">
            {firstDate ? describeSeries(rule, firstDate) : 'Pick the first date in the calendar above.'}
          </p>
          <div>
            <label htmlFor="field-repeat-until" className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
              Last date <span className="font-normal text-slate-500 dark:text-slate-400">(optional)</span>
            </label>
            <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
              <input
                id="field-repeat-until"
                type="date"
                value={value.until}
                min={firstDate ? formatLocalDate(firstDate) : undefined}
                onChange={(e) => onChange({ ...value, until: e.target.value, occurrences: undefined })}
                aria-invalid={!!error}
                aria-describedby={error ? 'err-repeat' : 'hint-repeat'}
                className={`${inputClass(!!error)} max-w-[13rem] px-3 py-2.5`}
              />
              {value.until && (
                <button
                  type="button"
                  onClick={() => onChange({ ...value, until: '' })}
                  className="text-xs font-semibold text-brand-600 dark:text-brand-400 hover:underline min-h-[32px]"
                >
                  No end date
                </button>
              )}
            </div>
            {error ? (
              <FieldError id="err-repeat" message={error} />
            ) : (
              <p id="hint-repeat" className="mt-1.5 text-xs text-slate-500 dark:text-slate-400">
                Leave it empty if it carries on. You can change it later.
              </p>
            )}
          </div>
        </div>
      )}
    </fieldset>
  );
};

export default RepeatPicker;
