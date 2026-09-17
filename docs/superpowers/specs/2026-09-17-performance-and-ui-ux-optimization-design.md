# Specification: Performance and UI/UX Optimization

- **Author**: Antigravity & Team
- **Date**: 2026-09-17
- **Status**: Approved
- **Branch**: main

---

## 1. Overview & Objectives

This specification details targeted architectural and interface improvements for the **CCP Event Calendar** application to achieve:
1. **Zero Network Waterfalls**: Elimination of N+1 database queries for recurring events.
2. **Instant Calendar Renders**: Reduction of grid event lookup complexity from $O(\text{days} \times \text{events})$ with thousands of date instantiations to $O(1)$ pre-indexed lookups.
3. **Lean Initial Bundles**: Over 1.5 MB in heavy vendor libraries (`exceljs`, `jspdf`, `html2canvas`) moved to lazy-loaded, on-demand dynamic chunks.
4. **Enhanced Staff UI/UX**: Proactive conflict detection warnings, quick duration chips, instant category pill filters, hotkeys, and reliable notification badge indicators.

---

## 2. Technical Architecture & Changes

### Phase 1: Performance & Network Architecture

#### 1.1 Batch Recurrence Exceptions (`services/eventService.ts`)
- **Problem**: When fetching events in `App.tsx` and `ExportModal.tsx`, a loop over recurring events triggered $N$ separate network requests:
  `Promise.all(recurringIds.map(id => getRecurrenceExceptions(id)))`.
- **Solution**:
  Introduce a batch method in `services/eventService.ts`:
  ```typescript
  export const getRecurrenceExceptionsBatch = async (eventIds: string[]): Promise<Map<string, Date[]>> => {
    if (!eventIds.length) return new Map();
    const { data, error } = await supabase
      .from('recurrence_exceptions')
      .select('event_id, exception_date')
      .in('event_id', eventIds);

    if (error) {
      console.error('Error fetching batch recurrence exceptions:', error);
      return new Map();
    }

    const map = new Map<string, Date[]>();
    for (const row of data || []) {
      const dates = map.get(row.event_id) || [];
      dates.push(new Date(row.exception_date));
      map.set(row.event_id, dates);
    }
    return map;
  };
  ```
- **Consumer Updates**:
  - `App.tsx`: Replace the `Promise.all` loop with `await getRecurrenceExceptionsBatch(recurringEventIds)`.
  - `components/ExportModal.tsx`: Replace the `Promise.all` loop with `await getRecurrenceExceptionsBatch(recurringIds)`.

#### 1.2 $O(1)$ Indexed Calendar Rendering (`components/CalendarView.tsx`)
- **Problem**: For every rendered day in the calendar grid (35 to 42 cells), `displayEvents.filter(e => isEventOnDay(e, day))` ran. With multi-day events and frequent re-renders, this created thousands of `Date` objects and string comparisons per second.
- **Solution**:
  Pre-index all `displayEvents` into a date-keyed dictionary or map once when `displayEvents` changes:
  ```typescript
  const eventsByDayKey = useMemo(() => {
    const map = new Map<string, Event[]>();
    const toKey = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

    for (const ev of displayEvents) {
      const start = new Date(ev.date);
      start.setHours(0, 0, 0, 0);

      const end = ev.endDate && isMultiDayEvent(ev) ? new Date(ev.endDate) : new Date(start);
      end.setHours(0, 0, 0, 0);

      const curr = new Date(start);
      while (curr <= end) {
        const key = toKey(curr);
        let list = map.get(key);
        if (!list) {
          list = [];
          map.set(key, list);
        }
        list.push(ev);
        curr.setDate(curr.getDate() + 1);
      }
    }
    return map;
  }, [displayEvents]);
  ```
  In the cell rendering loop:
  `const dayEvents = day ? (eventsByDayKey.get(toKey(day)) || []) : [];`
  This delivers $O(1)$ lookup per day cell.

#### 1.3 Lazy Dynamic Imports for Heavy Libraries
- **ExcelJS (939.81 kB)**:
  - In `utils/export.ts`: remove top-level `import ExcelJS from 'exceljs'`.
  - Inside `exportToExcel`, dynamically import:
    `const ExcelJS = (await import('exceljs')).default;`
- **jsPDF & html2canvas (~620 kB)**:
  - In `utils/pdfExport.ts`: remove top-level `import jsPDF from 'jspdf'`.
  - Inside `generateFortnightlyPDF`, dynamically import `jsPDF`.
  - WhatsApp summary generator remains pure text and executes instantly with zero dependency weight.
- **SubmitEventPage (583 lines)**:
  - In `App.tsx`: convert static import to `const SubmitEventPage = lazy(() => import('./pages/SubmitEventPage'));`.

#### 1.4 Agenda View Batching Fix (`components/CalendarView.tsx`)
- Point the agenda day grouping reduction to `visibleListEvents` rather than `listViewEvents`:
  `visibleListEvents.reduce(...)`.
  This restores pagination/batching with the "Show more" button for months with high event volumes.

---

### Phase 2: UI & UX Enhancements

#### 2.1 Notification Center Unread Badge Mount Fix (`components/NotificationCenter.tsx`)
- Trigger `loadNotifications()` on component mount:
  ```typescript
  useEffect(() => {
    loadNotifications();
  }, [userId]);
  ```
- This ensures the red unread badge with exact count is visible immediately upon user login.

#### 2.2 Proactive Schedule Conflict Detection (`components/EventModal.tsx`)
- Import `detectConflicts` and `formatConflictMessage` from `utils/conflictDetection.ts`.
- Calculate potential conflicts whenever `startDateStr`, `startTimeStr`, `endDateStr`, `endTimeStr`, or `location` changes in the form.
- Render a warning alert box when `conflictInfo.hasConflict` is true:
  ```tsx
  {conflictInfo.hasConflict && (
    <div className="bg-amber-50 dark:bg-amber-900/30 border border-amber-200 dark:border-amber-700 rounded-lg p-3 flex items-start gap-2 text-amber-800 dark:text-amber-200 text-xs">
      <AlertTriangle className="h-4 w-4 text-amber-600 dark:text-amber-400 mt-0.5 flex-shrink-0" />
      <div>
        <p className="font-semibold">Schedule Warning:</p>
        <p>{conflictInfo.message}</p>
      </div>
    </div>
  )}
  ```

#### 2.3 Quick Duration Chips (`components/EventModal.tsx`)
- Under the time inputs in `EventModal`, display quick duration preset buttons:
  `['30m', '1h', '1.5h', '2h']`.
- Clicking a duration automatically updates `endTimeStr` using `startTimeStr + durationMinutes`.

#### 2.4 Category Pill Bar (`App.tsx` & `components/EventFilters.tsx`)
- Add a category pill scrollbar under the search bar:
  Pills: `All`, `Enterprise & Employment`, `Community & Family`, `Education & Training`, `Special Visits & Celebrations`, `Public Information Session`, `Health & Wellbeing`, `Other`.
- Selecting a category applies the filter immediately; clicking `All` or clicking the active pill clears it.

#### 2.5 Keyboard Navigation Shortcuts (`App.tsx` / `components/CalendarView.tsx`)
- Listen to global `keydown` events when target element is not an `INPUT`, `TEXTAREA`, or `SELECT`:
  - `t` or `T`: Navigate to current month / today.
  - `ArrowLeft`: Previous month.
  - `ArrowRight`: Next month.
  - `/`: Focus search input (`e.preventDefault()`).
  - `c` or `C`: Open Create Event modal (if admin).
  - `Escape`: Close active modal.

---

## 3. Verification & Testing Plan

### Automated Tests
- Add unit tests in `tests/eventServiceBatch.test.ts` or `tests/recurrenceBatch.test.ts` to test `getRecurrenceExceptionsBatch` grouping and edge cases.
- Run `npm.cmd test` to verify zero test regressions across existing suite.

### Build Verification
- Execute `npm.cmd run build` to confirm:
  1. No build errors or type discrepancies.
  2. Main chunk size decreases.
  3. `vendor-exceljs` and `jspdf` are deferred to dynamic lazy chunks.

### Manual / Browser Verification
1. **Network**: Verify with Network devtools that opening calendar does not issue multiple `recurrence_exceptions` calls.
2. **Notification**: Verify bell icon displays count badge without clicking it first.
3. **Modal**: Verify conflict alert appears when creating an event with overlapping time/date.
4. **Duration**: Test quick duration chips update the end time appropriately.
5. **Shortcuts**: Test `T`, Arrow keys, and `/` shortcuts.
