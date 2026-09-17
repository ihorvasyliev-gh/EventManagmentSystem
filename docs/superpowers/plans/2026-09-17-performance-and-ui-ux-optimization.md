# Performance and UI/UX Optimization Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Eliminate N+1 database queries, optimize calendar rendering from $O(D \times N)$ to $O(1)$, dynamically code-split >1.5 MB of heavy vendor libraries, and deliver key UI/UX improvements (schedule conflict warnings, duration chips, category pills, keyboard shortcuts, and persistent notification badges).

**Architecture:** 
1. Database layer: Single batch query `.in('event_id', ids)` replaces N individual recurrence queries.
2. View layer: Pre-indexed date map `Map<string, Event[]>` memoized per month for $O(1)$ day lookups.
3. Bundle layer: Dynamic lazy imports (`await import('exceljs')`, `await import('jspdf')`, `lazy(() => import('./pages/SubmitEventPage'))`).
4. UX layer: `detectConflicts` warning banner in `EventModal`, quick duration chips, category pill bar in `App.tsx`, global keyboard shortcuts, and `loadNotifications()` on mount.

**Tech Stack:** React 19, TypeScript 5.8, Vite 6, Supabase JS, TailwindCSS, Lucide React, ExcelJS, jsPDF.

**Spec:** [docs/superpowers/specs/2026-09-17-performance-and-ui-ux-optimization-design.md](file:///c:/Users/ivasyliev/OneDrive%20-%20Cork%20City%20Partnership/Documents/Personal/CCPFlowCalendar-main/docs/superpowers/specs/2026-09-17-performance-and-ui-ux-optimization-design.md)

## Global Constraints
- Preserve all existing interfaces in `services/eventService.ts` and `types.ts`.
- Node test runner (`node --experimental-strip-types --test`) must pass after every task.
- Zero regression on existing Supabase Realtime subscriptions, offline caching, and permissions.
- Build must run cleanly via `npm.cmd run build`.

---

### Task 1: Batch Recurrence Exceptions Query in `eventService.ts` and Wire Up Consumers

**Files:**
- Modify: `services/eventService.ts`
- Modify: `App.tsx`
- Modify: `components/ExportModal.tsx`
- Create: `tests/recurrenceBatch.test.ts`

**Interfaces:**
- Produces: `getRecurrenceExceptionsBatch(eventIds: string[]): Promise<Map<string, Date[]>>`

- [ ] **Step 1: Write the failing unit test for batch grouping logic**

Create `tests/recurrenceBatch.test.ts`:
```typescript
import { test } from 'node:test';
import assert from 'node:assert';

test('groupRecurrenceExceptions groups rows by event_id correctly', () => {
  const rows = [
    { event_id: 'ev-1', exception_date: '2026-09-20T10:00:00.000Z' },
    { event_id: 'ev-1', exception_date: '2026-09-27T10:00:00.000Z' },
    { event_id: 'ev-2', exception_date: '2026-10-04T10:00:00.000Z' }
  ];

  const map = new Map<string, Date[]>();
  for (const row of rows) {
    const dates = map.get(row.event_id) || [];
    dates.push(new Date(row.exception_date));
    map.set(row.event_id, dates);
  }

  assert.strictEqual(map.size, 2);
  assert.strictEqual(map.get('ev-1')?.length, 2);
  assert.strictEqual(map.get('ev-2')?.length, 1);
  assert.strictEqual(map.get('ev-1')?.[0].toISOString(), '2026-09-20T10:00:00.000Z');
});
```

- [ ] **Step 2: Run test to verify it passes**

Run: `node --experimental-strip-types --test tests/recurrenceBatch.test.ts`
Expected: PASS

- [ ] **Step 3: Implement `getRecurrenceExceptionsBatch` in `services/eventService.ts`**

In `services/eventService.ts`:
```typescript
/**
 * Получить список исключений для группы событий одним пакетным запросом (1 запрос вместо N)
 */
export const getRecurrenceExceptionsBatch = async (eventIds: string[]): Promise<Map<string, Date[]>> => {
  const map = new Map<string, Date[]>();
  if (!eventIds || eventIds.length === 0) {
    return map;
  }

  const { data, error } = await supabase
    .from('recurrence_exceptions')
    .select('event_id, exception_date')
    .in('event_id', eventIds);

  if (error) {
    console.error('Error fetching batch recurrence exceptions:', error);
    return map;
  }

  for (const item of data || []) {
    const list = map.get(item.event_id) || [];
    list.push(new Date(item.exception_date));
    map.set(item.event_id, list);
  }

  return map;
};
```

- [ ] **Step 4: Update `App.tsx` to use `getRecurrenceExceptionsBatch`**

In `App.tsx`:
Replace:
```typescript
      // Load recurrence exceptions for recurring events
      const recurringEventIds = data
        .filter(e => e.recurrence && e.recurrence.type !== 'none')
        .map(e => e.id);

      if (recurringEventIds.length > 0) {
        const exceptionsMap = new Map<string, Date[]>();
        await Promise.all(
          recurringEventIds.map(async (eventId) => {
            try {
              const exceptions = await getRecurrenceExceptions(eventId);
              if (exceptions.length > 0) {
                exceptionsMap.set(eventId, exceptions);
              }
            } catch (err) {
              console.error(`Error loading exceptions for event ${eventId}:`, err);
            }
          })
        );
        setRecurrenceExceptions(exceptionsMap);
        cacheExceptions(exceptionsMap);
      }
```
With:
```typescript
      // Load recurrence exceptions for recurring events in one batch
      const recurringEventIds = data
        .filter(e => e.recurrence && e.recurrence.type !== 'none')
        .map(e => e.id);

      if (recurringEventIds.length > 0) {
        try {
          const exceptionsMap = await getRecurrenceExceptionsBatch(recurringEventIds);
          setRecurrenceExceptions(exceptionsMap);
          cacheExceptions(exceptionsMap);
        } catch (err) {
          console.error('Error loading batch exceptions:', err);
        }
      }
```

- [ ] **Step 5: Update `components/ExportModal.tsx` to use `getRecurrenceExceptionsBatch`**

In `components/ExportModal.tsx`:
Replace the `Promise.all` loop with:
```typescript
      const exceptionsMap = await getRecurrenceExceptionsBatch(recurringIds);
```

- [ ] **Step 6: Run full test suite to ensure no regressions**

Run: `npm.cmd test`
Expected: 18 tests PASS

- [ ] **Step 7: Commit**

```bash
git add services/eventService.ts App.tsx components/ExportModal.tsx tests/recurrenceBatch.test.ts
git commit -m "perf: batch recurrence exceptions query to eliminate N+1 roundtrips"
```

---

### Task 2: Optimize CalendarView with $O(1)$ Pre-Indexed Day Lookup and Fix Agenda Pagination

**Files:**
- Modify: `components/CalendarView.tsx`
- Create: `tests/calendarIndex.test.ts`

**Interfaces:**
- Produces: `eventsByDayKey` memoized map in `CalendarView.tsx`

- [ ] **Step 1: Write test for date index mapping**

Create `tests/calendarIndex.test.ts`:
```typescript
import { test } from 'node:test';
import assert from 'node:assert';

function toDateKey(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

test('indexEventsByDay indexes single-day and multi-day events correctly', () => {
  const singleDay = {
    id: '1',
    date: new Date('2026-09-17T10:00:00Z'),
    endDate: new Date('2026-09-17T12:00:00Z')
  };
  const multiDay = {
    id: '2',
    date: new Date('2026-09-18T10:00:00Z'),
    endDate: new Date('2026-09-20T18:00:00Z')
  };

  const map = new Map<string, typeof singleDay[]>();

  const indexEvent = (ev: typeof singleDay) => {
    const s = new Date(ev.date);
    s.setHours(0, 0, 0, 0);
    const e = new Date(ev.endDate);
    e.setHours(0, 0, 0, 0);

    const curr = new Date(s);
    while (curr <= e) {
      const k = toDateKey(curr);
      const list = map.get(k) || [];
      list.push(ev);
      map.set(k, list);
      curr.setDate(curr.getDate() + 1);
    }
  };

  indexEvent(singleDay);
  indexEvent(multiDay);

  assert.strictEqual(map.get('2026-09-17')?.length, 1);
  assert.strictEqual(map.get('2026-09-18')?.length, 1);
  assert.strictEqual(map.get('2026-09-19')?.length, 1);
  assert.strictEqual(map.get('2026-09-20')?.length, 1);
  assert.strictEqual(map.get('2026-09-21'), undefined);
});
```

- [ ] **Step 2: Run test to verify it passes**

Run: `node --experimental-strip-types --test tests/calendarIndex.test.ts`
Expected: PASS

- [ ] **Step 3: Implement `eventsByDayKey` in `components/CalendarView.tsx`**

In `components/CalendarView.tsx`:
Add memoized index:
```typescript
  const toDayKey = (d: Date): string => {
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  };

  const eventsByDayKey = useMemo(() => {
    const map = new Map<string, Event[]>();
    for (const ev of displayEvents) {
      const s = new Date(ev.date);
      s.setHours(0, 0, 0, 0);
      const isMulti = isMultiDayEvent(ev);
      const e = ev.endDate && isMulti ? new Date(ev.endDate) : new Date(s);
      e.setHours(0, 0, 0, 0);

      const curr = new Date(s);
      while (curr <= e) {
        const key = toDayKey(curr);
        const list = map.get(key) || [];
        list.push(ev);
        map.set(key, list);
        curr.setDate(curr.getDate() + 1);
      }
    }
    return map;
  }, [displayEvents]);
```

In the grid rendering:
Replace:
```typescript
const dayEvents = displayEvents.filter(e => isEventOnDay(e, day));
```
With:
```typescript
const dayEvents = eventsByDayKey.get(toDayKey(day)) || [];
```

- [ ] **Step 4: Fix Agenda View virtualization**

In `components/CalendarView.tsx`:
Change `listViewEvents.reduce(...)` on line ~394 to `visibleListEvents.reduce(...)`.
Ensure the "Show more" button appears when `hasMoreListEvents` is true:
```tsx
{hasMoreListEvents && (
  <div className="p-4 text-center">
    <button
      onClick={showMoreListEvents}
      className="px-4 py-2 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 rounded-lg text-sm font-medium transition-colors"
    >
      Show more events ({listViewEvents.length - visibleListCount} remaining)
    </button>
  </div>
)}
```

- [ ] **Step 5: Run tests and build**

Run: `npm.cmd test; npm.cmd run build`
Expected: Build passes, tests pass.

- [ ] **Step 6: Commit**

```bash
git add components/CalendarView.tsx tests/calendarIndex.test.ts
git commit -m "perf: O(1) day event lookup index for calendar grid and fix agenda virtualization"
```

---

### Task 3: Dynamic Lazy Imports for Heavy Libraries (ExcelJS, jsPDF, SubmitEventPage)

**Files:**
- Modify: `utils/export.ts`
- Modify: `utils/pdfExport.ts`
- Modify: `App.tsx`

**Interfaces:**
- `exportToExcel` loads `exceljs` on demand.
- `generateFortnightlyPDF` loads `jspdf` on demand.
- `SubmitEventPage` is wrapped in React lazy Suspense.

- [ ] **Step 1: Make `exceljs` dynamic in `utils/export.ts`**

Remove top-level `import ExcelJS from 'exceljs';`.
Inside `exportToExcel`:
```typescript
export const exportToExcel = async (events: Event[]): Promise<Blob> => {
  const ExcelJS = (await import('exceljs')).default;
  const workbook = new ExcelJS.Workbook();
  // ... rest of exportToExcel unchanged
```

- [ ] **Step 2: Make `jspdf` dynamic in `utils/pdfExport.ts`**

Remove top-level `import jsPDF from 'jspdf';`.
Inside `generateFortnightlyPDF`:
```typescript
export const generateFortnightlyPDF = async (
  events: Event[],
  options: BulletinOptions
): Promise<void> => {
  const jsPDF = (await import('jspdf')).default;
  const doc = new jsPDF({
    orientation: 'portrait',
    unit: 'pt',
    format: 'a4'
  });
  // ... rest of generateFortnightlyPDF unchanged
```

- [ ] **Step 3: Lazy-load `SubmitEventPage` in `App.tsx`**

In `App.tsx`:
Replace:
```typescript
import SubmitEventPage from './pages/SubmitEventPage';
```
With:
```typescript
const SubmitEventPage = lazy(() => import('./pages/SubmitEventPage'));
```
And in render wrap `<SubmitEventPage ... />` in `<Suspense fallback={<div className="min-h-screen flex items-center justify-center"><div className="animate-spin rounded-full h-10 w-10 border-b-2 border-brand-600"></div></div>}>`.

- [ ] **Step 4: Verify build chunk splitting**

Run: `npm.cmd run build`
Verify `dist/assets`:
- `vendor-exceljs` chunk is only loaded asynchronously.
- Main entry size is reduced.

- [ ] **Step 5: Run tests**

Run: `npm.cmd test`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add utils/export.ts utils/pdfExport.ts App.tsx
git commit -m "perf: defer loading of exceljs, jspdf and submit page via dynamic imports"
```

---

### Task 4: Notification Center Unread Badge Mount Fix

**Files:**
- Modify: `components/NotificationCenter.tsx`

**Interfaces:**
- `NotificationCenter` loads unread count on mount.

- [ ] **Step 1: Load notifications on mount in `NotificationCenter.tsx`**

In `components/NotificationCenter.tsx`:
Change:
```typescript
  useEffect(() => {
    if (isOpen) {
      loadNotifications();
    }
  }, [isOpen, userId]);
```
To:
```typescript
  useEffect(() => {
    loadNotifications();
  }, [userId]);

  useEffect(() => {
    if (isOpen) {
      loadNotifications();
    }
  }, [isOpen]);
```

- [ ] **Step 2: Run tests and build**

Run: `npm.cmd test; npm.cmd run build`
Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add components/NotificationCenter.tsx
git commit -m "fix(ui): load notification count on mount so unread badge displays immediately"
```

---

### Task 5: Proactive Conflict Detection & Quick Duration Chips in `EventModal.tsx`

**Files:**
- Modify: `components/EventModal.tsx`

**Interfaces:**
- Consumes: `detectConflicts`, `formatConflictMessage` from `utils/conflictDetection.ts`
- Renders: Conflict warning alert box when overlapping event detected
- Renders: Quick duration chips `['30m', '1h', '1.5h', '2h']`

- [ ] **Step 1: Add conflict detection in `components/EventModal.tsx`**

Import:
```typescript
import { detectConflicts, formatConflictMessage } from '../utils/conflictDetection';
```
Compute conflict info:
```typescript
  // Conflict detection
  const conflictInfo = useMemo(() => {
    if (!startDateStr || !startTimeStr || !isOpen || !showForm) {
      return { hasConflict: false, conflictingEvents: [] };
    }
    const start = new Date(`${startDateStr}T${startTimeStr}:00`);
    if (isNaN(start.getTime())) {
      return { hasConflict: false, conflictingEvents: [] };
    }
    const partialEvent: Partial<Event> = {
      date: start,
      location: location.trim() || undefined
    };
    return detectConflicts(partialEvent, events || [], event?.id);
  }, [startDateStr, startTimeStr, location, isOpen, showForm, events, event?.id]);
```

Render conflict alert in JSX right after Date/Time section:
```tsx
{conflictInfo.hasConflict && (
  <div className="bg-amber-50 dark:bg-amber-900/30 border border-amber-200 dark:border-amber-700/50 rounded-lg p-3 flex items-start gap-2.5 text-amber-800 dark:text-amber-200 text-xs animate-fade-in">
    <AlertCircle className="h-4 w-4 text-amber-600 dark:text-amber-400 mt-0.5 flex-shrink-0" />
    <div>
      <span className="font-semibold block">Schedule Warning</span>
      <span>{formatConflictMessage(conflictInfo.conflictingEvents)}</span>
    </div>
  </div>
)}
```

- [ ] **Step 2: Add quick duration chips in `components/EventModal.tsx`**

Under the time pickers, add:
```tsx
<div className="flex items-center gap-1.5 mt-1.5 flex-wrap">
  <span className="text-[11px] text-slate-400 dark:text-slate-500 font-medium mr-1">Duration:</span>
  {[
    { label: '30m', mins: 30 },
    { label: '1h', mins: 60 },
    { label: '1.5h', mins: 90 },
    { label: '2h', mins: 120 },
    { label: '3h', mins: 180 }
  ].map(({ label, mins }) => (
    <button
      key={label}
      type="button"
      onClick={() => {
        const startM = timeToMinutes(startTimeStr);
        setEndDateStr(startDateStr);
        setEndTimeStr(minutesToTime(startM + mins));
        clearFieldError('endDate');
      }}
      className="px-2 py-0.5 text-xs font-medium bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-600 dark:text-slate-300 rounded-md transition-colors"
    >
      {label}
    </button>
  ))}
</div>
```

- [ ] **Step 3: Run tests and build**

Run: `npm.cmd test; npm.cmd run build`
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add components/EventModal.tsx
git commit -m "feat(ui): add schedule conflict warnings and quick duration presets in event modal"
```

---

### Task 6: Quick Category Filter Pills and Global Keyboard Shortcuts

**Files:**
- Modify: `App.tsx`
- Modify: `components/SearchBar.tsx`

**Interfaces:**
- Renders: Quick category pills under search bar in `App.tsx`
- Handles: Hotkeys (`T` for today, Left/Right for month, `/` for search, `C` for create, `Esc` for modals)

- [ ] **Step 1: Add keyboard shortcuts listener in `App.tsx`**

In `App.tsx`:
```typescript
  // Keyboard Shortcuts
  useEffect(() => {
    if (!user) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      // Don't trigger shortcuts when typing in an input or textarea
      const target = e.target as HTMLElement;
      if (['INPUT', 'TEXTAREA', 'SELECT'].includes(target?.tagName) || target?.isContentEditable) {
        if (e.key === 'Escape') {
          target.blur();
        }
        return;
      }

      if (e.key === 'Escape') {
        if (isModalOpen) handleCloseModal();
        if (isExportModalOpen) setIsExportModalOpen(false);
        if (isSubmissionsModalOpen) setIsSubmissionsModalOpen(false);
        if (isBulletinModalOpen) setIsBulletinModalOpen(false);
      } else if (e.key === '/' && !e.metaKey && !e.ctrlKey) {
        e.preventDefault();
        const searchInput = document.querySelector('input[type="text"][placeholder*="Search"]') as HTMLInputElement;
        if (searchInput) searchInput.focus();
      } else if ((e.key === 'c' || e.key === 'C') && !e.metaKey && !e.ctrlKey) {
        if (user.role === UserRole.ADMIN) {
          e.preventDefault();
          handleCreateClick();
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [user, isModalOpen, isExportModalOpen, isSubmissionsModalOpen, isBulletinModalOpen, handleCloseModal, handleCreateClick]);
```

- [ ] **Step 2: Add category pill bar in `App.tsx`**

Above the calendar view and under the search bar:
```tsx
<div className="mb-4 flex items-center gap-1.5 overflow-x-auto pb-1 no-scrollbar">
  <button
    onClick={() => setFilters(prev => ({ ...prev, category: undefined }))}
    className={`px-3 py-1 rounded-full text-xs font-medium whitespace-nowrap transition-all ${
      !filters.category
        ? 'bg-brand-600 text-white shadow-sm'
        : 'bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700 border border-slate-200 dark:border-slate-700'
    }`}
  >
    All Categories
  </button>
  {EVENT_CATEGORIES.map(cat => {
    const isSelected = filters.category === cat;
    return (
      <button
        key={cat}
        onClick={() => setFilters(prev => ({ ...prev, category: isSelected ? undefined : cat }))}
        className={`px-3 py-1 rounded-full text-xs font-medium whitespace-nowrap transition-all ${
          isSelected
            ? 'bg-brand-600 text-white shadow-sm ring-2 ring-brand-400'
            : 'bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700 border border-slate-200 dark:border-slate-700'
        }`}
      >
        {cat}
      </button>
    );
  })}
</div>
```

- [ ] **Step 3: Run full verification suite**

Run: `npm.cmd test`
Run: `npm.cmd run build`
Expected: All tests pass, build produces optimized split bundles.

- [ ] **Step 4: Commit**

```bash
git add App.tsx
git commit -m "feat(ui): add category quick filter pills and keyboard navigation shortcuts"
```
