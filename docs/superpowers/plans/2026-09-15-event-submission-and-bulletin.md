# CCP Event Submission Form, Admin Inbox & Fortnightly PDF Bulletin Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a frictionless public event submission form for CCP staff, an admin moderation inbox for Elizabeth, and an automated 2-week Fortnightly PDF bulletin + WhatsApp summary generator with official Cork City Partnership branding.

**Architecture:**
- Add a public `/submit` or `?mode=submit` route with responsive form, flyer image upload to Supabase storage, and status `draft`.
- Extend Admin Navbar and application state with a Submissions Inbox modal for 1-click approvals and edits.
- Implement a client-side Fortnightly Bulletin engine in `utils/pdfExport.ts` and `components/FortnightlyBulletinModal.tsx` generating branded A4 PDFs (Executive Digest & Compact Table) and WhatsApp text digest.
- Update Tailwind configuration with official Cork City Partnership colors (Magenta `#B30066`, Green `#39B54A`).

**Tech Stack:** React 19, TypeScript, Vite, Tailwind CSS, Supabase (JS Client & Storage), jsPDF, html2canvas, Lucide React.

**Spec:** `docs/superpowers/specs/2026-09-15-event-submission-and-bulletin-design.md`

## Global Constraints

- Primary Brand Magenta: `#B30066`
- Primary Brand Green: `#39B54A`
- Official Logo Asset: `public/assets/ccp-logo.png`
- Public submission must not require login credentials.
- Fortnight default window: 14 days from current date / upcoming Monday.
- Backward compatibility: Existing calendar views, auth, and exports must remain fully functional.

---

### Task 1: Brand Theme, Assets & Dependencies Installation

**Files:**
- Modify: `package.json`
- Modify: `tailwind.config.js:22-38`
- Verify: `public/assets/ccp-logo.png`

**Interfaces:**
- Produces: `jspdf`, `html2canvas` packages installed.
- Produces: Tailwind colors `brand.magenta` (`#B30066`), `brand.green` (`#39B54A`), and extended palette.

- [ ] **Step 1: Install `jspdf` and `html2canvas`**
Run: `npm install jspdf html2canvas @types/jspdf`
Expected: Packages installed successfully in `package.json`.

- [ ] **Step 2: Update `tailwind.config.js` with CCP colors**
Add official CCP colors (`magenta`: `#B30066`, `green`: `#39B54A` and shades) to `theme.extend.colors.brand` and `theme.extend.colors.ccp`.

- [ ] **Step 3: Verify build**
Run: `npm run build`
Expected: Build passes without errors.

---

### Task 2: Data Types and Event Service Extensions for Submissions

**Files:**
- Modify: `types.ts:65-88`
- Modify: `services/eventService.ts`

**Interfaces:**
- Produces:
  - Extended `Event` type:
    ```typescript
    submitterName?: string;
    submitterEmail?: string;
    endDate?: Date;
    ```
  - `submitEvent(eventData: Omit<Event, 'id' | 'createdAt'>): Promise<Event>`
  - `getPendingSubmissions(): Promise<Event[]>`
  - `approveSubmission(id: string): Promise<Event>`
  - `rejectSubmission(id: string): Promise<void>`

- [ ] **Step 1: Update `types.ts`**
Add `submitterName`, `submitterEmail`, and optional `endDate` to `Event` interface. Ensure `EventStatus` supports `'draft' | 'published'`.

- [ ] **Step 2: Extend `services/eventService.ts`**
Implement `submitEvent` (inserts with `status: 'draft'` and stores submitter metadata), `getPendingSubmissions` (queries `status = 'draft'`), `approveSubmission` (updates `status = 'published'`), and `rejectSubmission` (deletes or flags rejected).

- [ ] **Step 3: Verify TypeScript compilation**
Run: `npx tsc --noEmit`
Expected: No type errors.

---

### Task 3: Public Event Submission Page (`pages/SubmitEventPage.tsx`)

**Files:**
- Create: `pages/SubmitEventPage.tsx`
- Modify: `App.tsx:710-726`

**Interfaces:**
- Consumes: `submitEvent` and `uploadAttachment` from `services/eventService.ts`.
- Produces: `SubmitEventPage` component accessible at `/submit` or `?mode=submit` or via button without login.

- [ ] **Step 1: Create `pages/SubmitEventPage.tsx`**
Build a responsive, mobile-first form with:
- Cork City Partnership logo and header explanation.
- Inputs: Event Title, Category dropdown, Date & Time (Start & End), Venue & Location, Short Description, Submitter Name, Submitter Email.
- Poster / flyer file drop zone with image preview.
- Client-side validation and friendly error messages.
- Success state screen with confirmation message: *"Thank you! Your event has been submitted for Elizabeth's review."* and a button to submit another event.

- [ ] **Step 2: Connect route in `App.tsx`**
Check `window.location.pathname.startsWith('/submit')` or `window.location.search.includes('mode=submit')`. If active, render `<SubmitEventPage />` directly, bypassing `<LoginPage />`.

- [ ] **Step 3: Add navigation link to Submit Form on Login and Navbar**
Add a convenient "Submit an Event" button for staff who arrive at the login screen or main navbar.

- [ ] **Step 4: Verify in browser**
Test navigating to `/?mode=submit` and check form appearance and validation.

---

### Task 4: Admin Submissions Inbox (`components/SubmissionsModal.tsx`)

**Files:**
- Create: `components/SubmissionsModal.tsx`
- Modify: `components/Navbar.tsx`
- Modify: `App.tsx`

**Interfaces:**
- Consumes: `getPendingSubmissions`, `approveSubmission`, `rejectSubmission`.
- Produces: `SubmissionsModal` with batch & single approvals, editing trigger, and notification badge.

- [ ] **Step 1: Create `components/SubmissionsModal.tsx`**
- Modal showing all pending submissions (`status === 'draft'`).
- Shows submitter details (name, email, submission date).
- Event details: title, date & time, venue, description, category badge, flyer thumbnail preview.
- Actions: "Approve & Publish", "Edit in Modal", "Decline", and "Approve All".

- [ ] **Step 2: Add Submissions Badge to `Navbar.tsx`**
For `user.role === UserRole.ADMIN`:
- Add "Submissions" button with count badge (e.g. `📥 Submissions (2)`).
- When count > 0, show amber/magenta badge.

- [ ] **Step 3: Connect Submissions state in `App.tsx`**
Fetch pending submissions count on load and after changes. Trigger modal open/close and handle approval updates with toast notifications.

- [ ] **Step 4: Verify admin inbox workflow**
Verify submitting a draft appears in the admin inbox and approving moves it to published status.

---

### Task 5: Fortnightly PDF Bulletin & WhatsApp Generator

**Files:**
- Create: `utils/pdfExport.ts`
- Create: `components/FortnightlyBulletinModal.tsx`
- Modify: `components/ExportModal.tsx`
- Modify: `components/Navbar.tsx`

**Interfaces:**
- Produces:
  - `generateFortnightlyPDF(events: Event[], options: BulletinOptions): Promise<void>`
  - `generateWhatsAppSummary(events: Event[], startDate: Date, endDate: Date): string`
  - `FortnightlyBulletinModal` component.

- [ ] **Step 1: Create `utils/pdfExport.ts`**
- Implement PDF generation using jsPDF with Cork City Partnership styling:
  - Official logo in header (`/assets/ccp-logo.png`).
  - Brand header with dates and "FORTNIGHTLY UPCOMING EVENTS BULLETIN".
  - Layout Mode 1: **Executive Digest**:
    - Grouped by Week 1 and Week 2, subdivided by day.
    - Card style with category badge (CCP Magenta/Green), time pill, venue with pin icon, bold title, description, and flyer image if present.
  - Layout Mode 2: **Compact Table**:
    - Clean corporate table layout (Date/Time, Event, Venue, Description, Submitter).
  - Page numbering and CCP footer.

- [ ] **Step 2: Implement WhatsApp Summary Generator**
Build `generateWhatsAppSummary` producing clean markdown with emojis:
```text
📅 *CORK CITY PARTNERSHIP — UPCOMING EVENTS*
*Period: 20 Oct – 02 Nov*
------------------------------------
🗓 *Monday, 20 Oct*
⏰ 10:00 – 12:00 | *Enterprise Network Meeting*
📍 Venue: Heron House, Room 4
ℹ️ Networking session for enterprise clients.
```

- [ ] **Step 3: Create `components/FortnightlyBulletinModal.tsx`**
Interactive modal allowing:
- Date range selection (defaults to 14 days ahead).
- Radio toggle: "Executive Cards (with Flyers)" vs "Compact Table".
- Quick preview of included events count.
- Buttons: "Download PDF" (with loading state) and "Copy WhatsApp Summary" (with copy confirmation toast).

- [ ] **Step 4: Integrate into Export tools & Navbar**
Add "Fortnightly Bulletin" tab or dedicated action button in `ExportModal` and Navbar for immediate 1-click access.

---

### Task 6: Verification, Polishing & Build Check

**Files:**
- Modify: `README.md` (documenting the new workflow for Elizabeth and staff)

- [ ] **Step 1: Run TypeScript checks and build**
Run: `npm run build`
Expected: Clean build without errors or warnings.

- [ ] **Step 2: Test End-to-End User Flow**
1. Visit `/?mode=submit`: Submit a test event with a flyer image.
2. Log in as admin: Verify submission badge appears in Navbar.
3. Open Submissions Inbox: Review the test event and approve it.
4. Verify event is now visible on the main calendar.
5. Open Fortnightly Bulletin: Generate both Executive PDF and Compact Table PDF; test copying WhatsApp summary.
6. Verify output PDFs open cleanly and have sharp branding, logo, and text.
