/**
 * The admins' weekly routine: Wednesday is for emailing staff a reminder to send in their events,
 * Friday is for emailing the two-week Upcoming Events Digest (Executive cards, flyers included).
 * Once sent (or dismissed) for the day, the prompt stays hidden until the next routine day.
 */
import { formatLocalDate } from './date.ts';

export type RoutineTask = 'reminder' | 'digest';

const WEDNESDAY = 3;
const FRIDAY = 5;

export const routineStorageKey = (task: RoutineTask): string => `ccp_routine_done_${task}`;

/** Wednesday -> reminder, Friday -> digest, every other day -> null */
export const routineTaskForDay = (today: Date = new Date()): RoutineTask | null => {
  const day = today.getDay();
  if (day === WEDNESDAY) return 'reminder';
  if (day === FRIDAY) return 'digest';
  return null;
};

const defaultStorage = (): Storage | null => {
  try {
    return typeof localStorage !== 'undefined' ? localStorage : null;
  } catch {
    return null;
  }
};

export const isRoutineDoneForDay = (
  task: RoutineTask,
  today: Date = new Date(),
  storage: Pick<Storage, 'getItem'> | null = defaultStorage()
): boolean => {
  try {
    return storage?.getItem(routineStorageKey(task)) === formatLocalDate(today);
  } catch {
    return false;
  }
};

export const markRoutineDoneForDay = (
  task: RoutineTask,
  today: Date = new Date(),
  storage: Pick<Storage, 'setItem'> | null = defaultStorage()
): void => {
  try {
    storage?.setItem(routineStorageKey(task), formatLocalDate(today));
  } catch {
    // Storage unavailable (private browsing / quota): caller tracks session dismissal in state
  }
};

/**
 * Which routine prompt (if any) should show right now. On Fridays, waits until the server check
 * for today's digest has finished (`digestChecked`) so an already-sent digest does not flash.
 */
export const activeRoutineTask = (options: {
  isAdmin: boolean;
  today?: Date;
  digestSentToday?: boolean;
  digestChecked?: boolean;
  doneInMemory?: ReadonlySet<string>;
  storage?: Pick<Storage, 'getItem'> | null;
}): RoutineTask | null => {
  if (!options.isAdmin) return null;
  const today = options.today ?? new Date();
  const task = routineTaskForDay(today);
  if (!task) return null;
  if (task === 'digest') {
    if (options.digestChecked === false) return null;
    if (options.digestSentToday) return null;
  }
  const dayKey = `${task}:${formatLocalDate(today)}`;
  if (options.doneInMemory?.has(dayKey)) return null;
  if (isRoutineDoneForDay(task, today, options.storage)) return null;
  return task;
};
