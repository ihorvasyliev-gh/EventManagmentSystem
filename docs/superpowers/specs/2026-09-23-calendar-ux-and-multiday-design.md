# Technical Design: Calendar UX Modernization & Multi-Day Date Selection

**Date:** 2026-09-23  
**Status:** Approved by User  
**Target Repository:** CCPFlowCalendar (`ccp-event-calendar`)

---

## 1. Executive Summary & Goals

The goal of this project is to modernize the user experience of the CCP Flow Calendar across desktop and mobile devices, and to replace single start/end date inputs with an interactive multi-day event picker across all event submission and editing forms (`SubmitEventPage`, `EventModal`).

### Key Objectives:
1. **Interactive Multi-Day Date Selection**: Users can choose multiple discrete dates (e.g., Monday, Wednesday, Friday) using an interactive mini-calendar picker, with shared Start Time and End Time per day (e.g., 10:00 – 11:30).
2. **Superior Mobile & Desktop UX**:
   - **Month Grid**: Clean desktop cells with readable badges and `+N more` popover; mobile cells show clean category indicator dots and an expandable day-event drawer/sheet upon tap instead of 3-letter truncations.
   - **Week View (New)**: A dedicated 7-day schedule view (Monday–Sunday) showing daily event distributions for fast weekly planning.
   - **Agenda View**: Default view on mobile screens (`< 640px`), grouping events into **Today & Upcoming** at the top, while **Past Events** move to the bottom in a collapsible section.
   - Touch-friendly UI with >= 44px touch targets.
3. **Robust Schedule Conflict Detection**: Warns if any selected day overlaps in time with an existing event, indicating which event is taking place at that time.
4. **Backward Compatibility**: Fully compatible with existing Supabase schema using `recurrence_type = 'custom'` and `recurrence_custom_dates TIMESTAMP WITH TIME ZONE[]`.

---

## 2. Architecture & Data Model

### 2.1 Multi-Day Event Representation
- **Single-Day Event** (User selects 1 date):
  - `date`: `selectedDate` at `startTime`
  - `endDate`: `selectedDate` at `endTime`
  - `recurrence`: `{ type: 'none' }` (or `undefined`)
  - Supabase columns: `date`, `end_date`, `recurrence_type = 'none'`.
- **Multi-Day Event** (User selects 2 or more dates):
  - `date`: First chronological date at `startTime`
  - `endDate`: First chronological date at `endTime`
  - `recurrence`: `{ type: 'custom', customDates: selectedDates }`
  - Supabase columns:
    - `date`: First date ISO string
    - `end_date`: First date + end time ISO string
    - `recurrence_type`: `'custom'`
    - `recurrence_custom_dates`: Array of ISO timestamps for each selected date
- **Daily Duration**:
  - Daily duration is calculated as `endTime - startTime`.
  - In `utils/recurrence.ts`, when expanding `custom` recurrence, each instance date `d` gets:
    - `instance.date = new Date(d)` (with hours & minutes set to start time)
    - `instance.endDate = new Date(d.getTime() + durationMs)`
    - `instance.instanceKey = `${event.id}_${d.getTime()}``

### 2.2 Schema & Database Compatibility
- The Supabase database table `events` already possesses the `recurrence_custom_dates TIMESTAMP WITH TIME ZONE[]` column (added via migration `custom-dates-migration.sql`).
- Existing events are untouched. Single-day events continue to work seamlessly.
- Deleting an instance of a multi-day event uses the existing `recurrence_exceptions` table to exclude that specific day.

---

## 3. Component Architecture & UI Design

### 3.1 `MultiDatePicker` Component (`components/MultiDatePicker.tsx`)
A new, dedicated, reusable date-and-time selector component replacing old start/end date inputs:
- **Interactive Mini-Calendar**:
  - Month view with prev/next controls and month/year display.
  - Tapping/clicking a date toggles selection in `selectedDates: Date[]`.
  - Selected dates are highlighted with active brand colors.
  - Quick action chips below: e.g., badge per date (`Mon, 12 May ✕`) and `Clear all` button.
- **Time Controls**:
  - `Start Time` (using `TimePickerInput`).
  - `End Time` (using `TimePickerInput`).
  - Quick duration chips (`+30m`, `+1h`, `+1.5h`, `+2h`).
  - Automatic end-time adjustment when start-time changes, maintaining selected duration.
- **Props**:
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

### 3.2 Form Integrations
1. **`pages/SubmitEventPage.tsx`**:
   - Replaces the separate start/end date and time inputs with `MultiDatePicker`.
   - In `handleSubmit`, validates that at least 1 date is selected.
   - Passes all selected dates to `submitEvent` in `eventService.ts`.
   - Conflict detection: runs `detectMultiDateConflicts`, displaying a warning message if any date has a time overlap:
     - Warning text format: `Conflict detected on [Date]: At this time: [Event Title]`.
2. **`components/EventModal.tsx`**:
   - Replaces manual recurrence custom picker and date inputs with the unified `MultiDatePicker`.
   - On opening an existing event:
     - If `event.recurrence?.type === 'custom'` and `event.recurrence.customDates`, initializes with `customDates`.
     - Otherwise, initializes with `[event.date]`.
   - When saving, serializes multi-day events with `recurrence: { type: 'custom', customDates }`.

### 3.3 `CalendarView.tsx` Modernization
1. **View Modes**:
   - `ViewMode` expanded in `types.ts` to `'grid' | 'week' | 'agenda'`.
   - Segmented control in the top bar: `[ Month | Week | Agenda ]`.
   - On mobile (`< 640px`), defaults to `'agenda'`.
2. **Agenda View (Mobile Default)**:
   - **Section 1: Today & Upcoming**:
     - All events today or in the future for the selected month/period, sorted chronologically ascending.
     - Displayed with full title, time range badge (`10:00 – 11:30`), category pill, and location.
     - Touch target >= 44px.
   - **Section 2: Past Events**:
     - Placed at the bottom of the list.
     - Collapsible container: `Past Events (N) [Show/Hide]`, muted styling (`opacity-70`).
3. **Month Grid View**:
   - **Desktop**:
     - Spacious cells.
     - Event chips with category background, time prefix, full title tooltip.
     - If more than 3 events in a cell, shows `+N more` button opening a day popover modal.
   - **Mobile**:
     - Clean compact cell layout.
     - Rather than chopping titles to 3 characters (`ABC`), renders colored category indicator dots with count badge.
     - Tapping a day opens a slide-up drawer / bottom sheet showing the complete event cards for that day.
4. **Week View (New)**:
   - 7 columns representing Monday through Sunday for the currently active week.
   - Header shows day names and date numbers, with `Today` highlighted.
   - Displays all events on their respective days with times, category colors, and click-to-open details.
   - Navigation: `Previous Week`, `Next Week`, `This Week`.

---

## 4. Conflict Detection Enhancements (`utils/conflictDetection.ts`)

- Function `detectConflictsForDates`:
  - Iterates over each date in `selectedDates`.
  - Tests against active events for time overlaps (`start < existingEnd && end > existingStart`).
  - Formats user-friendly warning:
    *«Schedule conflict on Wednesday, 14 May (10:00 – 11:30): At this time: "Digital Skills Workshop"»*.
  - Conforms to the user's specific requirement: displays that an event is taking place at that time.

---

## 5. Error Handling & Edge Cases

1. **No Date Selected**: Form validation prevents submission if `selectedDates.length === 0`.
2. **Invalid Time Duration**: Validation prevents `endTime <= startTime`.
3. **Single-Day Submission**: If only 1 date is picked, cleanly saves as a standard non-recurring event without overhead.
4. **Midnight / Next-Day Overlaps**: End time after 23:59 wraps or warns gracefully.
5. **Exception Handling**: If a recurring custom event has instances removed via `recurrence_exceptions`, `expandRecurringEvents` respects the exception map and hides that specific date.

---

## 6. Verification & Testing Plan

### 6.1 Automated Tests
- `tests/recurrence.test.ts`:
  - Test expanding custom multi-day events (`customDates`).
  - Verify start date, end date, and duration are preserved on each instance.
  - Verify exception filtering excludes deleted dates.
- `tests/conflictDetection.test.ts`:
  - Test conflict detection across multiple dates with time overlaps.
  - Verify warning message includes the conflicting event title.
- Build & Lint check:
  - Run `npm run test`
  - Run `npm run build`

### 6.2 Manual Verification Scenarios
- **Scenario A (Public Submission)**:
  - Open `/submit`.
  - In `MultiDatePicker`, pick 3 dates (e.g., Monday, Wednesday, Friday).
  - Set 10:00 – 11:30.
  - Fill title & submit.
  - Verify draft event is created in Supabase with `recurrence_custom_dates`.
- **Scenario B (Admin Approval & Calendar Display)**:
  - Log in as admin. Open Submissions modal, approve the event.
  - Verify the event appears in `CalendarView` on all 3 selected days at 10:00 – 11:30.
- **Scenario C (Calendar Views & Responsiveness)**:
  - Desktop: Test switching between Month, Week, and Agenda views.
  - Mobile (<640px): Verify Agenda is default; verify past events are at the bottom; verify Month view taps show day events without text truncations.
