import type { Event } from '../types.ts';
import { expandRecurringEvents } from './recurrence.ts';

export interface PeriodStats {
  /** Dates and sessions held in the period (a series counts once per date) */
  occurrences: number;
  /** Different events (a series counts once) */
  events: number;
  /** Different venues */
  venues: number;
  /** Events sent in by staff through the /submit form */
  submitted: number;
  byCategory: Array<{ name: string; occurrences: number; events: number }>;
  byMonth: Array<{ key: string; label: string; occurrences: number }>;
  topVenues: Array<{ name: string; occurrences: number }>;
}

const MONTH = new Intl.DateTimeFormat('en-IE', { month: 'short', year: 'numeric' });
const venueKey = (v: string) => v.trim().toLowerCase();

/** Published events between `start` and `end` (inclusive), counted for a Board report */
export const computePeriodStats = (
  events: Event[],
  exceptions: Map<string, Date[]> | undefined,
  start: Date,
  end: Date,
  topVenueCount = 8
): PeriodStats => {
  const published = events.filter((e) => e.status === 'published');
  const occurrences = expandRecurringEvents(published, start, end, exceptions)
    .filter((o) => o.date >= start && o.date <= end);

  const categories = new Map<string, { occurrences: number; ids: Set<string> }>();
  const months = new Map<string, { label: string; occurrences: number }>();
  const venues = new Map<string, { name: string; occurrences: number }>();
  const ids = new Set<string>();
  const submittedIds = new Set<string>();

  // Every month of the period, so quiet months show as 0
  for (let d = new Date(start.getFullYear(), start.getMonth(), 1); d <= end; d = new Date(d.getFullYear(), d.getMonth() + 1, 1)) {
    months.set(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`, { label: MONTH.format(d), occurrences: 0 });
  }

  for (const o of occurrences) {
    ids.add(o.id);
    if (o.tags?.includes('staff-submission')) submittedIds.add(o.id);
    const category = o.category?.trim() || 'Uncategorised';
    const cat = categories.get(category) ?? { occurrences: 0, ids: new Set<string>() };
    cat.occurrences++;
    cat.ids.add(o.id);
    categories.set(category, cat);
    const month = months.get(`${o.date.getFullYear()}-${String(o.date.getMonth() + 1).padStart(2, '0')}`);
    if (month) month.occurrences++;
    if (o.location?.trim()) {
      const key = venueKey(o.location);
      const venue = venues.get(key) ?? { name: o.location.trim(), occurrences: 0 };
      venue.occurrences++;
      venues.set(key, venue);
    }
  }

  return {
    occurrences: occurrences.length,
    events: ids.size,
    venues: venues.size,
    submitted: submittedIds.size,
    byCategory: [...categories.entries()]
      .map(([name, c]) => ({ name, occurrences: c.occurrences, events: c.ids.size }))
      .sort((a, b) => b.occurrences - a.occurrences || a.name.localeCompare(b.name)),
    byMonth: [...months.entries()].map(([key, m]) => ({ key, ...m })),
    topVenues: [...venues.values()]
      .sort((a, b) => b.occurrences - a.occurrences || a.name.localeCompare(b.name))
      .slice(0, topVenueCount)
  };
};

/** Plain text to paste into a Board report or email */
export const statsSummaryText = (stats: PeriodStats, periodLabel: string): string => {
  const lines = [
    `CCP events, ${periodLabel}`,
    '',
    `${stats.events} ${stats.events === 1 ? 'event' : 'events'} on ${stats.occurrences} ${stats.occurrences === 1 ? 'date' : 'dates'} at ${stats.venues} ${stats.venues === 1 ? 'venue' : 'venues'}`,
    `${stats.submitted} sent in by staff through the event form`,
    '',
    'By category (dates · events):',
    ...stats.byCategory.map((c) => `- ${c.name}: ${c.occurrences} · ${c.events}`),
    '',
    'By month (dates):',
    ...stats.byMonth.map((m) => `- ${m.label}: ${m.occurrences}`)
  ];
  if (stats.topVenues.length > 0) {
    lines.push('', 'Busiest venues (dates):', ...stats.topVenues.map((v) => `- ${v.name}: ${v.occurrences}`));
  }
  return lines.join('\n');
};
