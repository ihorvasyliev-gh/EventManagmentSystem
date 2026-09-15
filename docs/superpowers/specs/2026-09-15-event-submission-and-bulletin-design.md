# Design Specification: CCP Event Submission Form, Admin Inbox & Fortnightly PDF Bulletin

**Date:** 2026-09-15  
**Project:** Cork City Partnership Events Calendar (CCPFlowCalendar)  
**Author:** Antigravity & Igor  

---

## 1. Context & Business Goal

Cork City Partnership (CCP) staff regularly organize a variety of events, including enterprise network meetings, family fun days in estates, Lord Mayor project visits, graduation & certificate ceremonies, and public information sessions. Currently, upcoming events are shared via WhatsApp and internal emails, but get lost in the volume of ongoing chatter.

**Key Requirements from Management (Brenda's directive):**
1. **Wednesday Afternoon Cadence:** Elizabeth sends out an email/form link to all staff to gather details on events happening in the next two weeks.
2. **Staff Submission Needs:** Staff need a clean, frictionless way to submit event details: Name, Short description, Date & Time, Venue/Location, Category, Poster/Flyer attachment, and Submitter contact details.
3. **Admin Moderation:** Elizabeth/Admins need to review submissions on Thursday, verify details or correct typos, and approve them.
4. **Friday Morning Cadence:** A professional 2-week upcoming events bulletin (PDF) is circulated to the Board and all staff, along with a formatted summary for WhatsApp.

---

## 2. Branding & Visual Identity

Based on official Cork City Partnership guidelines and logo:
- **Primary Brand Color (Magenta / Berry):** `#B30066`
- **Secondary Brand Color (Vivid Green):** `#39B54A`
- **Dark Neutral (Slate/Charcoal):** `#1E293B`
- **Light Neutral / Background:** `#F8FAFC` / `#FFFFFF`
- **Official Logo:** Cork City Partnership Clg (*Comhar Chathair Chorcaí Ctr — Education | Employment | Empowerment*).
- Integrated across:
  - The public submission form header
  - The calendar navbar
  - The generated PDF header and cards

---

## 3. Architecture & Subsystems

```
┌─────────────────────────────────────────────────────────────┐
│                       STAFF USER                            │
│  Visits /submit (Direct Link from Wednesday Email)          │
│  - No login required                                        │
│  - Fills title, dates, venue, summary, attaches poster       │
│  - Submits to Supabase (Status: 'draft', tag: 'submission') │
└──────────────────────────────┬──────────────────────────────┘
                               │
                               ▼
┌─────────────────────────────────────────────────────────────┐
│                    SUPABASE DATABASE                        │
│  Table: events                                              │
│  Storage: event-attachments (posters / flyers)              │
└──────────────────────────────┬──────────────────────────────┘
                               │
                               ▼
┌─────────────────────────────────────────────────────────────┐
│                   ADMIN / ELIZABETH                         │
│  1. Logged in Admin sees Navbar Badge: "Submissions (3)"   │
│  2. Opens Submissions Modal / Inbox                         │
│  3. Reviews details, edits if needed, clicks "Approve"     │
│  4. Status becomes 'published' -> visible in main calendar  │
└──────────────────────────────┬──────────────────────────────┘
                               │
                               ▼
┌─────────────────────────────────────────────────────────────┐
│              FORTNIGHTLY BULLETIN GENERATOR                 │
│  1. Export Modal -> "Fortnightly Bulletin (Next 2 Weeks)"  │
│  2. Date window auto-defaults to next 14 days               │
│  3. Layout selection: "Executive Digest" vs "Compact Table" │
│  4. Action A: Download PDF (A4, branded, high-res)          │
│  5. Action B: "Copy WhatsApp Summary" (1-click clipboard)   │
└─────────────────────────────────────────────────────────────┘
```

---

## 4. Subsystem Specifications

### 4.1. Public Submission Form (`/submit`)
- **Route / Trigger:** Direct URL access `/submit` or `?mode=submit`, plus a "Submit Event" button in the app header for easy navigation.
- **Access:** Public (no Supabase authentication guard).
- **Form Fields:**
  1. `title` (text, required): Event title.
  2. `category` (dropdown, required): e.g. *Enterprise & Employment*, *Community & Family*, *Education & Training*, *Special Visits & Celebrations*, *Public Information*, *Other*.
  3. `date` & `endDate` (datetime pickers, required): Event start and end time.
  4. `location` (text, required): Venue and room/address.
  5. `description` (textarea, required): 2–4 concise lines describing the event.
  6. `poster` (file input, optional): Drag-and-drop or mobile photo upload with immediate thumbnail preview. Stored in Supabase `event-attachments`.
  7. `submitterName` & `submitterEmail` (text, required): Name and email of the staff member submitting the event.
- **Submission Feedback:** Animated success screen with confirmation message: *"Thank you! Your event has been submitted for Elizabeth's review."* and a button to submit another event.

### 4.2. Admin Submissions Inbox
- **Location:** Integrated into `Navbar.tsx` and admin navigation.
- **Badge:** Displays count of events with `status === 'draft'` (or tagged as submissions).
- **Inbox Drawer/Modal:**
  - Lists pending submissions chronologically.
  - Shows submitter information (*"Submitted by Sarah Murphy (sarah@corkcitypartnership.ie) on 15 Sep"*).
  - Quick actions per submission:
    - **Approve & Publish:** Sets `status = 'published'`, instantly making it live on the calendar and eligible for the PDF bulletin.
    - **Edit:** Opens the event in `EventModal` for quick adjustments before publishing.
    - **Reject / Delete:** Prompts confirmation and removes the draft.
    - **Approve All:** Batch publishes all valid pending items.

### 4.3. Fortnightly PDF Bulletin & WhatsApp Generator
- **Location:** Integrated into `ExportModal.tsx` and accessible via a prominent button *"Fortnightly Bulletin"* in the main header/export tools.
- **Date Range:** Defaults to the next 14 days (e.g. from current date / upcoming Monday + 14 days), with interactive date pickers to adjust if needed.
- **Layout Options:**
  1. **Executive Digest (Cards with Posters):**
     - Full A4 document format.
     - CCP official logo in header with title *"FORTNIGHTLY UPCOMING EVENTS BULLETIN"* and circulation dates.
     - Chronologically grouped by *Week 1* and *Week 2*, and subdivided by day.
     - Event cards with:
       - Category pill badge in CCP brand colors.
       - Date & Time badge.
       - Venue & Location with map pin icon.
       - Bold title and concise multi-line description.
       - Embedded flyer/poster thumbnail (if attached).
     - Clean pagination and CCP footer.
  2. **Compact Table:**
     - Clean corporate agenda table: Columns for Date/Time, Event Title & Category, Venue, Description, and Contact.
- **WhatsApp Summary Generator:**
  - Generates WhatsApp Markdown formatted text with emojis:
    - Bold titles, calendar icons `🗓`, clock `⏰`, venue `📍`, summary `ℹ️`.
  - 1-click **"Copy to Clipboard"** with visual toast notification.

---

## 5. Technical Implementation Details

1. **Libraries to Add:**
   - `jspdf` & `jspdf-autotable` (or `html2pdf.js` / vector rendering) for high-performance, crisp client-side PDF rendering.
2. **Supabase Integration:**
   - Ensure `events` table permits inserting drafts without requiring an authenticated session (or via public anon key with `status = 'draft'`), or update RLS policy if needed.
   - Attachments bucket `event-attachments` upload handling for public submissions.
3. **Tailwind Styling:**
   - Update `tailwind.config.js` with official Cork City Partnership colors:
     - `brand.magenta`: `#B30066`
     - `brand.green`: `#39B54A`
     - Extended brand palette for badges, buttons, borders, and PDF styling.
4. **Logo Asset:**
   - Embed official high-resolution logo in `public/assets/ccp-logo.png` for both Web UI and PDF rendering.

---

## 6. Verification & Test Plan

1. **Submission Form Flow:**
   - Navigate to `/submit` as an unauthenticated user.
   - Fill out all required fields, attach a flyer image, submit.
   - Verify event is inserted into Supabase with `draft` status and poster is accessible.
2. **Admin Moderation Flow:**
   - Log in as admin.
   - Confirm the badge displays the new pending submission.
   - Open Submissions Inbox, inspect details, edit description, click "Approve".
   - Confirm event switches to `published` and appears in the calendar grid.
3. **Fortnightly PDF & WhatsApp Flow:**
   - Click "Fortnightly Bulletin".
   - Test "Executive Digest" PDF generation: check logo, colors, text layout, poster thumbnails, and page breaks.
   - Test "Compact Table" PDF generation.
   - Click "Copy WhatsApp Summary" and verify clipboard content formatting.
