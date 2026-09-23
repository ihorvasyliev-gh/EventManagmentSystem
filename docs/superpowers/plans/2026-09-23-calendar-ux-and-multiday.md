# Calendar UX Modernization & Multi-Day Date Selection Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Modernize the CCP Flow Calendar UX for mobile and desktop (responsive Month Grid, new Week View, and Agenda with past events at the bottom) and replace single start/end date inputs with an interactive multi-date picker in all event submission and edit forms.

**Architecture:** We use native React 19 + Tailwind CSS without heavy third-party calendar packages. Multi-day events store individual occurrences via the existing Supabase `recurrence_custom_dates` column. A unified `MultiDatePicker` manages date selection and daily start/end times with instant conflict checking, while `CalendarView` coordinates Month, Week, and Agenda presentations.

**Tech Stack:** React 19, TypeScript, Tailwind CSS, Lucide React, Supabase JS, Node Test Runner (`node:test`, `node:assert`).

**Spec:** [docs/superpowers/specs/2026-09-23-calendar-ux-and-multiday-design.md](file:///c:/Users/ivasyliev/OneDrive%20-%20Cork%20City%20Partnership/Documents/Personal/CCPFlowCalendar-main/docs/superpowers/specs/2026-09-23-calendar-ux-and-multiday-design.md)

## Global Constraints

- No external calendar libraries (FullCalendar, etc.); keep bundle lightweight and React 19 native.
- Store multi-day dates using `recurrence_type = 'custom'` and `recurrence_custom_dates TIMESTAMP WITH TIME ZONE[]`.
- Minimum 44px touch targets on mobile viewports (`< 640px`).
- When a schedule conflict occurs, highlight: "At this time: [Event Title]".
- All existing and new tests must pass (`cmd /c npm test`).
- Production build must succeed (`cmd /c npm run build`).

---

### Task 1: Recurrence Duration Handling for Custom Multi-Date Events

**Files:**
- Test: `tests/recurrenceCustom.test.ts`
- Modify: `utils/recurrence.ts`

**Interfaces:**
- Consumes: `Event`, `RecurrenceRule` from `types.ts`
- Produces: `expandRecurringEvents(events, rangeStart, rangeEnd, exceptionsMap)` where each generated custom instance has its proper `endDate` matching the duration of the parent event (`instance.date + durationMs`).

- [ ] **Step 1: Write the failing unit test**

Create `tests/recurrenceCustom.test.ts`:
```ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { expandRecurringEvents } from '../utils/recurrence.ts';
import { Event } from '../types.ts';

test('expandRecurringEvents preserves duration and calculates correct endDate for custom recurring dates', () => {
  const baseStart = new Date('2026-10-12T10:00:00');
  const baseEnd = new Date('2026-10-12T11:30:00'); // 90 minutes duration
  const customDates = [
    new Date('2026-10-12T00:00:00'),
    new Date('2026-10-14T00:00:00'),
    new Date('2026-10-16T00:00:00')
  ];

  const multiDayEvent: Event = {
    id: 'evt-multi-1',
    title: 'Yoga Series',
    description: 'Weekly sessions',
    date: baseStart,
    endDate: baseEnd,
    location: 'Main Hall',
    status: 'published',
    createdAt: new Date(),
    recurrence: {
      type: 'custom',
      customDates
    }
  };

  const rangeStart = new Date('2026-10-01T00:00:00');
  const rangeEnd = new Date('2026-10-31T23:59:59');

  const expanded = expandRecurringEvents([multiDayEvent], rangeStart, rangeEnd);
  assert.equal(expanded.length, 3);

  // Check Wednesday Oct 14 instance
  const wedInstance = expanded.find(e => e.date.getDate() === 14);
  assert.ok(wedInstance, 'October 14 instance must exist');
  assert.equal(wedInstance.date.getHours(), 10);
  assert.equal(wedInstance.date.getMinutes(), 0);
  assert.ok(wedInstance.endDate, 'Instance must have endDate');
  assert.equal(wedInstance.endDate.getDate(), 14);
  assert.equal(wedInstance.endDate.getHours(), 11);
  assert.equal(wedInstance.endDate.getMinutes(), 30);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cmd /c "npm test"`
Expected: FAIL on `assert.equal(wedInstance.endDate.getDate(), 14)` because previously `endDate` was not calculated per instance for `custom` recurrence.

- [ ] **Step 3: Update `utils/recurrence.ts` to compute instance `endDate`**

In `utils/recurrence.ts`, when iterating `rule.customDates`:
Calculate duration:
```ts
const durationMs = event.endDate
  ? event.endDate.getTime() - event.date.getTime()
  : 0;
```
For each expanded instance:
```ts
const instanceEndDate = durationMs > 0 ? new Date(d.getTime() + durationMs) : undefined;
expandedEvents.push({
  ...event,
  instanceKey,
  date: new Date(d),
  endDate: instanceEndDate
});
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cmd /c "npm test"`
Expected: PASS (all tests pass).

- [ ] **Step 5: Commit**

```bash
git add tests/recurrenceCustom.test.ts utils/recurrence.ts
git commit -m "feat(recurrence): preserve duration and calculate endDate on custom recurring instances"
```

---

### Task 2: Multi-Date Schedule Conflict Detection

**Files:**
- Test: `tests/conflictDetection.test.ts`
- Modify: `utils/conflictDetection.ts`

**Interfaces:**
- Consumes: `ConflictEvent`
- Produces:
  ```ts
  export interface MultiDateConflictResult {
    hasConflict: boolean;
    conflicts: {
      date: Date;
      conflictingEvents: ConflictEvent[];
      message: string;
    }[];
  }

  export function detectMultiDateConflicts(
    dates: Date[],
    startTimeStr: string,
    endTimeStr: string,
    existingEvents: ConflictEvent[],
    excludeEventId?: string
  ): MultiDateConflictResult;
  ```

- [ ] **Step 1: Write unit tests for multi-date conflicts**

Add to `tests/conflictDetection.test.ts`:
```ts
import { detectMultiDateConflicts } from '../utils/conflictDetection.ts';

test('detectMultiDateConflicts detects conflicts on specific dates in a multi-date series', () => {
  const existing = [
    createMockEvent('1', 'Digital Skills', new Date('2026-10-14T10:00:00'), new Date('2026-10-14T11:00:00'))
  ];

  const dates = [
    new Date('2026-10-12'),
    new Date('2026-10-14'),
    new Date('2026-10-16')
  ];

  const result = detectMultiDateConflicts(dates, '10:30', '11:30', existing);
  assert.equal(result.hasConflict, true);
  assert.equal(result.conflicts.length, 1);
  assert.equal(result.conflicts[0].date.getDate(), 14);
  assert.match(result.conflicts[0].message, /At this time: "Digital Skills"/);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cmd /c "npm test"`
Expected: FAIL because `detectMultiDateConflicts` is not yet defined in `utils/conflictDetection.ts`.

- [ ] **Step 3: Implement `detectMultiDateConflicts` in `utils/conflictDetection.ts`**

Implement helper:
- Iterates over each date in `dates`.
- Combines date with `startTimeStr` and `endTimeStr`.
- Uses `detectConflicts` on that time window.
- Formats warning: `At this time: "${ev.title}"`.

- [ ] **Step 4: Run test to verify it passes**

Run: `cmd /c "npm test"`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add tests/conflictDetection.test.ts utils/conflictDetection.ts
git commit -m "feat(conflicts): add multi-date conflict detection with concurrent event title formatting"
```

---

### Task 3: Interactive `MultiDatePicker` Component

**Files:**
- Create: `components/MultiDatePicker.tsx`
- Modify: `components/DatePickerCalendar.tsx` (or deprecate in favor of `MultiDatePicker`)

**Interfaces:**
- Produces: `components/MultiDatePicker.tsx`
  ```ts
  interface MultiDatePickerProps {
    selectedDates: Date[];
    onChangeDates: (dates: Date[]) => void;
    startTime: string;
    onChangeStartTime: (time: string) => void;
    endTime: string;
    onChangeEndTime: (time: string) => void;
    disabled?: boolean;
    error?: string;
  }
  ```

- [ ] **Step 1: Create `MultiDatePicker.tsx`**

Implement:
- Interactive month calendar (Monday-first grid, next/prev month navigation).
- Date toggle: clicking a day adds/removes it from `selectedDates`.
- Selected dates chips: formatted as `Mon, 12 Oct [✕]` with click-to-remove, and a `Clear all` button when `selectedDates.length > 1`.
- Time inputs:
  - `Start Time` and `End Time` via `TimePickerInput`.
  - Quick duration chips: `+30m`, `+1h`, `+1.5h`, `+2h`.
  - Auto-shift: changing Start Time preserves chosen duration and updates End Time.
- Responsive styling: works smoothly on mobile (`w-full`, touch padding >= 44px) and desktop.
- Dark mode support using `useTheme`.

- [ ] **Step 2: Verify `MultiDatePicker` compilation and export**

Run: `cmd /c "npm run build"` to verify TypeScript types and syntax compile cleanly.

- [ ] **Step 3: Commit**

```bash
git add components/MultiDatePicker.tsx
git commit -m "feat(ui): create reusable interactive MultiDatePicker component"
```

---

### Task 4: Integrate `MultiDatePicker` in `SubmitEventPage` & Update `submitEvent` Service

**Files:**
- Modify: `services/eventService.ts`
- Modify: `pages/SubmitEventPage.tsx`

**Interfaces:**
- `submitEvent`: Add support for `recurrence?: RecurrenceRule` in `eventData` parameter, persisting `recurrence_type = 'custom'` and `recurrence_custom_dates`.
- `SubmitEventPage`: Uses `MultiDatePicker`, validates `selectedDates.length >= 1`, shows `detectMultiDateConflicts` alert chips.

- [ ] **Step 1: Update `submitEvent` in `services/eventService.ts`**

Update `submitEvent`:
- Allow `recurrence?: RecurrenceRule` in payload.
- In `insertPayload`:
  - `recurrence_type: eventData.recurrence?.type || 'none'`
  - `recurrence_custom_dates: eventData.recurrence?.customDates?.map(d => d.toISOString()) || null`

- [ ] **Step 2: Update `pages/SubmitEventPage.tsx`**

Replace separate Start Date / End Date with `MultiDatePicker`:
- Replace state: `selectedDates: Date[]` (defaults to tomorrow's date).
- Connect `startTimeStr` and `endTimeStr`.
- Hook up `detectMultiDateConflicts`: if conflicts exist, display an alert banner:
  - `Schedule Notice: On Wednesday, 14 Oct: At this time: "Digital Skills Workshop"`
- Update `handleSubmit`:
  - Validate `selectedDates.length > 0`.
  - Prepare `recurrence`: if `selectedDates.length > 1`, set `{ type: 'custom', customDates: selectedDates }`.
  - Call `submitEvent`.

- [ ] **Step 3: Run tests & verify build**

Run: `cmd /c "npm test"` and `cmd /c "npm run build"`
Expected: All pass without errors.

- [ ] **Step 4: Commit**

```bash
git add services/eventService.ts pages/SubmitEventPage.tsx
git commit -m "feat(submit): integrate MultiDatePicker and multi-date conflicts in public submission form"
```

---

### Task 5: Integrate `MultiDatePicker` in `EventModal` (Admin Create & Edit)

**Files:**
- Modify: `components/EventModal.tsx`

**Interfaces:**
- `EventModal`: Both Create and Edit modes use `MultiDatePicker`.
- When opening an existing event:
  - If `event.recurrence?.type === 'custom'` and `event.recurrence.customDates`, initialize `selectedDates` with `event.recurrence.customDates`.
  - Otherwise, initialize with `[event.date]`.
- When saving:
  - If `selectedDates.length > 1`: set `recurrence: { type: 'custom', customDates: selectedDates }`.
  - If `selectedDates.length === 1`: standard event without custom recurrence.

- [ ] **Step 1: Update `EventModal.tsx` state and initialization**

- Add `selectedDates: Date[]` state.
- In `useEffect` on `event` change:
  - If `event?.recurrence?.type === 'custom'` and `event.recurrence.customDates`:
    `setSelectedDates(event.recurrence.customDates)`.
  - Else if `event`:
    `setSelectedDates([new Date(event.date)])`.
  - Else if `initialDate`:
    `setSelectedDates([new Date(initialDate)])`.
  - Else:
    `setSelectedDates([new Date()])`.

- [ ] **Step 2: Replace form date inputs in `EventModal.tsx`**

- In Edit / Create form sections: render `MultiDatePicker`.
- Update `handleSave`:
  - Set `date` to earliest selected date with `startTime`.
  - Set `endDate` to earliest selected date with `endTime`.
  - Set `recurrence: selectedDates.length > 1 ? { type: 'custom', customDates: selectedDates } : undefined`.

- [ ] **Step 3: Run tests & verify build**

Run: `cmd /c "npm test"` and `cmd /c "npm run build"`
Expected: Build passes cleanly.

- [ ] **Step 4: Commit**

```bash
git add components/EventModal.tsx
git commit -m "feat(modal): integrate MultiDatePicker in EventModal for create and edit flows"
```

---

### Task 6: Week View & Modernized Calendar View Architecture

**Files:**
- Modify: `types.ts` (`ViewMode = 'grid' | 'week' | 'agenda'`)
- Create: `components/WeekView.tsx`
- Modify: `components/CalendarView.tsx`

**Interfaces:**
- `WeekView`:
  ```ts
  interface WeekViewProps {
    currentDate: Date;
    events: Event[];
    onEventClick: (event: Event) => void;
    onAddEventForDate?: (date: Date) => void;
    userRole?: UserRole;
  }
  ```
- `CalendarView`:
  - View switcher: `[ Month | Week | Agenda ]`
  - Agenda: Past events moved to bottom into collapsible section; no 3-letter truncations.
  - Month Grid: Mobile shows category dots + tapping day shows events below in drawer/sheet; desktop shows event cards + `+N more` popover.

- [ ] **Step 1: Update `types.ts`**

Update `ViewMode`:
```ts
export type ViewMode = 'grid' | 'week' | 'agenda';
```

- [ ] **Step 2: Create `components/WeekView.tsx`**

Implement:
- Compute Monday–Sunday dates for `currentDate`.
- 7-column layout on desktop, or scrollable/tabbed day view on mobile.
- Render events for each day of the week with time badges, category color strips, and click handler.
- If today is in the week, highlight today's column.

- [ ] **Step 3: Update `components/CalendarView.tsx`**

- Update segmented switcher to include `Week`.
- On mobile (`isMobile` is true), auto-default to `'agenda'`.
- In `agenda` view:
  - Separate events into `upcomingEvents` (today & future) and `pastEvents` (strictly before today).
  - Render `upcomingEvents` first in chronological order.
  - Render `pastEvents` at the bottom inside an expandable `<details>` or toggle button: `Past Events (${pastEvents.length})`.
- In `grid` view:
  - On mobile: remove the `slice(0, 3)` text cutoffs. Instead, render colored category indicator dots with count badge. When a day is clicked, display an inline day event list below the calendar grid or open day details.
  - On desktop: keep event pills with full titles and tooltip, and show `+N more` when >3 events.

- [ ] **Step 4: Run tests & verify build**

Run: `cmd /c "npm test"` and `cmd /c "npm run build"`
Expected: Build passes cleanly with no type errors.

- [ ] **Step 5: Commit**

```bash
git add types.ts components/WeekView.tsx components/CalendarView.tsx
git commit -m "feat(calendar): implement WeekView, mobile touch optimization, and past events bottom grouping"
```

---

### Task 7: Comprehensive Verification & Walkthrough

**Files:**
- Documentation: `docs/superpowers/plans/2026-09-23-calendar-ux-and-multiday.md`

- [ ] **Step 1: Run complete test suite**

Run: `cmd /c "npm test"`
Verify 100% of tests pass.

- [ ] **Step 2: Run production build**

Run: `cmd /c "npm run build"`
Verify zero TypeScript or Vite bundle errors.

- [ ] **Step 3: End-to-end user experience checks**

- Public submit page: multi-date calendar picker, duration chips, conflict warnings.
- Event modal: create & edit multi-day series.
- Calendar view: Month, Week, Agenda views; mobile agenda default, past events below.

- [ ] **Step 4: Final commit**

```bash
git commit --allow-empty -m "chore: complete calendar UX modernization and multi-day date picker verification"
```
