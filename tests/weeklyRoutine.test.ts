import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  activeRoutineTask,
  isRoutineDoneForDay,
  markRoutineDoneForDay,
  routineTaskForDay
} from '../utils/weeklyRoutine.ts';

const memoryStorage = () => {
  const data = new Map<string, string>();
  return {
    getItem: (key: string) => data.get(key) ?? null,
    setItem: (key: string, value: string) => {
      data.set(key, value);
    }
  };
};

// Week of Mon 19 Oct 2026 .. Sun 25 Oct 2026
const monday = new Date(2026, 9, 19, 10, 0);
const tuesday = new Date(2026, 9, 20, 10, 0);
const wednesday = new Date(2026, 9, 21, 14, 0);
const thursday = new Date(2026, 9, 22, 10, 0);
const friday = new Date(2026, 9, 23, 9, 0);
const saturday = new Date(2026, 9, 24, 10, 0);
const sunday = new Date(2026, 9, 25, 10, 0);
const nextWednesday = new Date(2026, 9, 28, 9, 0);
const nextFriday = new Date(2026, 9, 30, 9, 0);

test('Wednesday is the reminder day, Friday is the digest day, and other days have no routine prompt', () => {
  assert.equal(routineTaskForDay(monday), null);
  assert.equal(routineTaskForDay(tuesday), null);
  assert.equal(routineTaskForDay(wednesday), 'reminder');
  assert.equal(routineTaskForDay(thursday), null);
  assert.equal(routineTaskForDay(friday), 'digest');
  assert.equal(routineTaskForDay(saturday), null);
  assert.equal(routineTaskForDay(sunday), null);
});

test('marking a routine task done hides it for the rest of that day, and lets it return next week', () => {
  const storage = memoryStorage();
  assert.equal(isRoutineDoneForDay('reminder', wednesday, storage), false);

  markRoutineDoneForDay('reminder', wednesday, storage);
  assert.equal(isRoutineDoneForDay('reminder', wednesday, storage), true);
  assert.equal(isRoutineDoneForDay('reminder', nextWednesday, storage), false);
  // Marking Wednesday done never affects Friday
  assert.equal(isRoutineDoneForDay('digest', friday, storage), false);

  markRoutineDoneForDay('digest', friday, storage);
  assert.equal(isRoutineDoneForDay('digest', friday, storage), true);
  assert.equal(isRoutineDoneForDay('digest', nextFriday, storage), false);
});

test('only admins see the weekly routine prompt, and Friday waits for and respects today’s sent digest', () => {
  const storage = memoryStorage();
  assert.equal(activeRoutineTask({ isAdmin: false, today: wednesday, storage }), null);
  assert.equal(activeRoutineTask({ isAdmin: false, today: friday, digestChecked: true, storage }), null);

  assert.equal(activeRoutineTask({ isAdmin: true, today: wednesday, storage }), 'reminder');
  assert.equal(activeRoutineTask({ isAdmin: true, today: thursday, storage }), null);

  // Friday waits until the server check finishes so an already-sent digest does not flash
  assert.equal(activeRoutineTask({ isAdmin: true, today: friday, digestChecked: false, storage }), null);
  assert.equal(activeRoutineTask({ isAdmin: true, today: friday, digestChecked: true, digestSentToday: true, storage }), null);
  assert.equal(activeRoutineTask({ isAdmin: true, today: friday, digestChecked: true, digestSentToday: false, storage }), 'digest');

  // Marking done in memory still hides it even if storage is unavailable
  const brokenStorage = {
    getItem: () => {
      throw new Error('blocked');
    },
    setItem: () => {
      throw new Error('blocked');
    }
  };
  markRoutineDoneForDay('reminder', wednesday, brokenStorage);
  assert.equal(
    activeRoutineTask({
      isAdmin: true,
      today: wednesday,
      doneInMemory: new Set(['reminder:2026-10-21']),
      storage: brokenStorage
    }),
    null
  );
});
