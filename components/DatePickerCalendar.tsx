import React, { useState, useMemo } from 'react';
import { ChevronLeft, ChevronRight, X } from 'lucide-react';
import { useTheme } from '../contexts/ThemeContext';

interface DatePickerCalendarProps {
    selectedDates: Date[];
    onChange: (dates: Date[]) => void;
    /** Reference time to copy hours/minutes from (the event's time) */
    referenceTime?: { hours: number; minutes: number };
}

const WEEKDAY_LABELS = ['Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa', 'Su'];
const MONTH_NAMES = [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December'
];

const DatePickerCalendar: React.FC<DatePickerCalendarProps> = ({ selectedDates, onChange, referenceTime }) => {
    const { theme } = useTheme();
    const isDark = theme === 'dark';

    // Start viewing the month of the first selected date or today
    const initialDate = selectedDates.length > 0 ? new Date(selectedDates[0]) : new Date();
    const [viewYear, setViewYear] = useState(initialDate.getFullYear());
    const [viewMonth, setViewMonth] = useState(initialDate.getMonth());

    // Normalize a date to YYYY-MM-DD string for comparison
    const toKey = (d: Date) => {
        const y = d.getFullYear();
        const m = String(d.getMonth() + 1).padStart(2, '0');
        const day = String(d.getDate()).padStart(2, '0');
        return `${y}-${m}-${day}`;
    };

    const selectedKeys = useMemo(() => new Set(selectedDates.map(toKey)), [selectedDates]);

    // Build calendar grid for viewMonth/viewYear
    const calendarDays = useMemo(() => {
        const firstDay = new Date(viewYear, viewMonth, 1);
        // Monday-based: 0=Mon, ..., 6=Sun
        let startDow = firstDay.getDay() - 1;
        if (startDow < 0) startDow = 6;

        const daysInMonth = new Date(viewYear, viewMonth + 1, 0).getDate();
        const daysInPrevMonth = new Date(viewYear, viewMonth, 0).getDate();

        const cells: { date: Date; inMonth: boolean }[] = [];

        // Previous month padding
        for (let i = startDow - 1; i >= 0; i--) {
            const d = new Date(viewYear, viewMonth - 1, daysInPrevMonth - i);
            cells.push({ date: d, inMonth: false });
        }

        // Current month
        for (let day = 1; day <= daysInMonth; day++) {
            cells.push({ date: new Date(viewYear, viewMonth, day), inMonth: true });
        }

        // Next month padding to fill last row
        const remaining = 7 - (cells.length % 7);
        if (remaining < 7) {
            for (let i = 1; i <= remaining; i++) {
                cells.push({ date: new Date(viewYear, viewMonth + 1, i), inMonth: false });
            }
        }

        return cells;
    }, [viewYear, viewMonth]);

    const toggleDate = (date: Date) => {
        const key = toKey(date);
        if (selectedKeys.has(key)) {
            onChange(selectedDates.filter(d => toKey(d) !== key));
        } else {
            // Add with reference time
            const newDate = new Date(date);
            if (referenceTime) {
                newDate.setHours(referenceTime.hours, referenceTime.minutes, 0, 0);
            }
            const newDates = [...selectedDates, newDate].sort((a, b) => a.getTime() - b.getTime());
            onChange(newDates);
        }
    };

    const removeDate = (date: Date) => {
        const key = toKey(date);
        onChange(selectedDates.filter(d => toKey(d) !== key));
    };

    const prevMonth = () => {
        if (viewMonth === 0) {
            setViewMonth(11);
            setViewYear(viewYear - 1);
        } else {
            setViewMonth(viewMonth - 1);
        }
    };

    const nextMonth = () => {
        if (viewMonth === 11) {
            setViewMonth(0);
            setViewYear(viewYear + 1);
        } else {
            setViewMonth(viewMonth + 1);
        }
    };

    const todayKey = toKey(new Date());

    const formatShortDate = (d: Date) => {
        return `${d.getDate()} ${MONTH_NAMES[d.getMonth()].slice(0, 3)} ${d.getFullYear()}`;
    };

    return (
        <div className="space-y-3">
            {/* Calendar Header */}
            <div className="flex items-center justify-between">
                <button
                    type="button"
                    onClick={prevMonth}
                    className={`p-1.5 rounded-lg transition-colors ${isDark ? 'hover:bg-slate-700 text-slate-400' : 'hover:bg-slate-100 text-slate-500'}`}
                >
                    <ChevronLeft className="h-4 w-4" />
                </button>
                <span className={`text-sm font-semibold ${isDark ? 'text-white' : 'text-slate-900'}`}>
                    {MONTH_NAMES[viewMonth]} {viewYear}
                </span>
                <button
                    type="button"
                    onClick={nextMonth}
                    className={`p-1.5 rounded-lg transition-colors ${isDark ? 'hover:bg-slate-700 text-slate-400' : 'hover:bg-slate-100 text-slate-500'}`}
                >
                    <ChevronRight className="h-4 w-4" />
                </button>
            </div>

            {/* Weekday Labels */}
            <div className="grid grid-cols-7 gap-0">
                {WEEKDAY_LABELS.map(label => (
                    <div key={label} className={`text-center text-[10px] font-bold uppercase py-1 ${isDark ? 'text-slate-500' : 'text-slate-400'}`}>
                        {label}
                    </div>
                ))}
            </div>

            {/* Calendar Grid */}
            <div className="grid grid-cols-7 gap-0.5">
                {calendarDays.map((cell, idx) => {
                    const key = toKey(cell.date);
                    const isSelected = selectedKeys.has(key);
                    const isToday = key === todayKey;

                    return (
                        <button
                            key={idx}
                            type="button"
                            onClick={() => toggleDate(cell.date)}
                            className={`
                relative h-8 w-full rounded-md text-xs font-medium transition-all duration-150
                flex items-center justify-center
                ${!cell.inMonth
                                    ? isDark ? 'text-slate-600' : 'text-slate-300'
                                    : isSelected
                                        ? 'bg-brand-600 text-white shadow-sm hover:bg-brand-700'
                                        : isToday
                                            ? isDark
                                                ? 'bg-slate-700 text-brand-400 font-bold hover:bg-slate-600'
                                                : 'bg-brand-50 text-brand-700 font-bold hover:bg-brand-100'
                                            : isDark
                                                ? 'text-slate-300 hover:bg-slate-700'
                                                : 'text-slate-700 hover:bg-slate-100'
                                }
              `}
                        >
                            {cell.date.getDate()}
                        </button>
                    );
                })}
            </div>

            {/* Selected Dates Summary */}
            {selectedDates.length > 0 && (
                <div className={`rounded-lg p-3 ${isDark ? 'bg-slate-800/50 border border-slate-700' : 'bg-slate-50 border border-slate-200'}`}>
                    <div className="flex items-center justify-between mb-2">
                        <span className={`text-[10px] font-bold uppercase tracking-wider ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
                            {selectedDates.length} date{selectedDates.length !== 1 ? 's' : ''} selected
                        </span>
                        <button
                            type="button"
                            onClick={() => onChange([])}
                            className={`text-[10px] font-bold uppercase tracking-wider transition-colors ${isDark ? 'text-red-400 hover:text-red-300' : 'text-red-500 hover:text-red-600'}`}
                        >
                            Clear all
                        </button>
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                        {selectedDates.map((d, idx) => (
                            <span
                                key={idx}
                                className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-xs font-medium ${isDark ? 'bg-brand-900/30 text-brand-300 border border-brand-800' : 'bg-brand-50 text-brand-700 border border-brand-200'}`}
                            >
                                {formatShortDate(d)}
                                <button
                                    type="button"
                                    onClick={(e) => { e.stopPropagation(); removeDate(d); }}
                                    className={`ml-0.5 rounded-full p-0.5 transition-colors ${isDark ? 'hover:bg-brand-800 text-brand-400' : 'hover:bg-brand-100 text-brand-500'}`}
                                >
                                    <X className="h-2.5 w-2.5" />
                                </button>
                            </span>
                        ))}
                    </div>
                </div>
            )}
        </div>
    );
};

export default DatePickerCalendar;
