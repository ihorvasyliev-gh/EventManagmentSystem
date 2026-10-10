/**
 * What the submission form keeps on this device: the unsent event (so a closed tab or a lost
 * connection doesn't cost the typing) and the submitter's name and email (staff submit most weeks).
 */
import { useEffect } from 'react';
import {
  type TimeRange, type TimeSlot, type SessionPlaces as SessionPlacesMap, type ScheduleState, makeSlot
} from '../../utils/multiDateUtils.ts';
import { type EventCategoryName } from '../../constants/categories.ts';

const SUBMITTER_STORAGE_KEY = 'ccp_submitter_details';
const DRAFT_STORAGE_KEY = 'ccp_submit_draft';

export const readSavedSubmitter = (): { name: string; email: string } => {
  try {
    const parsed = JSON.parse(localStorage.getItem(SUBMITTER_STORAGE_KEY) || '{}');
    return { name: typeof parsed.name === 'string' ? parsed.name : '', email: typeof parsed.email === 'string' ? parsed.email : '' };
  } catch {
    return { name: '', email: '' };
  }
};

export const saveSubmitter = (name: string, email: string) => {
  try {
    localStorage.setItem(SUBMITTER_STORAGE_KEY, JSON.stringify({ name, email }));
  } catch {
    // Storage unavailable — details just won't be prefilled next time
  }
};

export interface SavedDraft {
  title: string;
  category: EventCategoryName;
  dates: string[];
  /** Times used on every day (older drafts have one `startTime`/`endTime` instead) */
  sharedTimes?: TimeSlot[];
  startTime?: string;
  endTime?: string;
  /** false when each date has its own time (older drafts don't have it) */
  sameTime?: boolean;
  /** Each date's own times (older drafts hold one time range per date) */
  perDateTimes?: Record<string, TimeSlot[] | TimeRange>;
  /** false when each date and time has its own address */
  samePlace?: boolean;
  places?: SessionPlacesMap;
  location: string;
  description: string;
  submitterName?: string;
  submitterEmail?: string;
}

/** The unsent event, if one was saved with anything typed in it */
export const readDraft = (): SavedDraft | null => {
  try {
    const parsed = JSON.parse(localStorage.getItem(DRAFT_STORAGE_KEY) || 'null');
    if (!parsed || typeof parsed !== 'object') return null;
    const places = parsed.places && typeof parsed.places === 'object' ? Object.values(parsed.places) : [];
    const hasContent = [parsed.title, parsed.location, parsed.description, ...places].some((v) => typeof v === 'string' && v.trim());
    return hasContent ? parsed as SavedDraft : null;
  } catch {
    return null;
  }
};

export const clearDraft = () => {
  try {
    localStorage.removeItem(DRAFT_STORAGE_KEY);
  } catch {
    // Nothing to clear
  }
};

/**
 * Saves the form a moment after typing stops (text only — files can't be stored), while
 * anything is typed in it and it hasn't been sent.
 */
export const useDraftAutosave = (draft: SavedDraft, hasContent: boolean, enabled: boolean) => {
  const json = JSON.stringify(draft);
  useEffect(() => {
    if (!enabled) return;
    const timer = setTimeout(() => {
      try {
        if (hasContent) localStorage.setItem(DRAFT_STORAGE_KEY, json);
      } catch {
        // Storage unavailable — no autosave
      }
    }, 600);
    return () => clearTimeout(timer);
  }, [json, hasContent, enabled]);
};

const isSlot = (v: unknown): v is TimeRange =>
  !!v && typeof v === 'object' && typeof (v as TimeRange).start === 'string' && typeof (v as TimeRange).end === 'string';

/** Draft times, in the current shape */
const readDraftSlots = (value: unknown): TimeSlot[] => {
  const list = Array.isArray(value) ? value : [value];
  return list.filter(isSlot).map((s, i) => makeSlot(s.start, s.end, typeof (s as TimeSlot).id === 'string' ? (s as TimeSlot).id : `t${i + 1}`));
};

/** The form's dates, times and places from a draft (any saved shape), or empty with `defaultDate` */
export const scheduleFromDraft = (draft: SavedDraft | null, defaultDate: Date | null): ScheduleState => {
  const startOfToday = new Date();
  startOfToday.setHours(0, 0, 0, 0);
  // Dates that have passed since the draft was saved are dropped
  const future = (draft?.dates || [])
    .map((s) => new Date(s))
    .filter((d) => !isNaN(d.getTime()) && d >= startOfToday);
  const shared = readDraftSlots(draft?.sharedTimes);
  const perDate: Record<string, TimeSlot[]> = {};
  if (draft?.perDateTimes && typeof draft.perDateTimes === 'object') {
    Object.entries(draft.perDateTimes).forEach(([key, value]) => {
      const slots = readDraftSlots(value);
      if (slots.length > 0) perDate[key] = slots;
    });
  }
  return {
    dates: future.length ? future : defaultDate ? [defaultDate] : [],
    shared: shared.length ? shared : [makeSlot(draft?.startTime || '10:00', draft?.endTime ?? '11:30', 't1')],
    sameTime: draft?.sameTime ?? true,
    perDate,
    samePlace: draft?.samePlace ?? true,
    location: draft?.location ?? '',
    places: draft?.places && typeof draft.places === 'object' ? draft.places : {},
  };
};
