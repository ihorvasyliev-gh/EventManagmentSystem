<div align="center">

<img src="public/assets/ccp-logo-v2.png" alt="Cork City Partnership" height="72" />

# CCP Event Calendar

**Cork City Partnership's shared event calendar: staff submit events, admins approve them, and the Board gets a branded digest.**

React 19 · TypeScript · Supabase · Cloudflare Pages

[Live calendar](https://ccp-event-calendar.pages.dev/) · [Submit an event](https://ccp-event-calendar.pages.dev/submit) · [Coordinator guide](docs/GUIDE_FOR_ELIZABETH.md) · [Staff guide](docs/GUIDE_FOR_STAFF.md)

</div>

---

## What it does

| | |
|---|---|
| 📝 **Staff submissions** | A public `/submit` form. Staff don't need an account to send in an event with its flyer (an image, or a PDF: the page they pick becomes the poster image). Each network can send up to 30 events in 15 minutes, and an optional Cloudflare Turnstile check keeps bots out. |
| 📥 **Review inbox** | Admins approve, edit or decline submissions, one at a time or all at once (*Approve all* always asks first). A declined submission can carry a reason. After each decision the inbox says whether the submitter was emailed; when the server sends no emails, an *Email Sam* link opens the same message in the admin's own mail. Updates arrive in real time. |
| ✉️ **Emails (optional)** | Admins hear about new submissions; submitters hear when their event is approved or declined (with the reason). |
| 📑 **Events Digest PDF** | A branded A4 digest for the Board and staff, in two layouts: *Executive cards* and *Compact table*. Events that last week's digest didn't have are marked *New*, every flyer can follow at the end large enough to print and pin up, and the viewer's sidebar lists every event as a bookmark. |
| 📲 **WhatsApp, email & a link** | Admins open a ready-to-send covering email for the Board that lists every event (the main button), or copy an emoji-friendly WhatsApp version. Both carry a link to the digest's page (uploaded once, open to anyone with the link for six months), which shows the events as an easy-to-read list on a phone, with the PDF a tab away. Nothing needs attaching. |
| 📅 **Calendar views** | Month, week and agenda views, built for both desktop and mobile. Agenda is one list from today on that loads more as you scroll. Staff have **My events** in the top bar (the tab bar on a phone): what they sent in, and whether it is published yet. |
| 🔁 **Recurring & multi-date events** | Hand-picked dates, each with its own time if needed, or a repeat: under the date picker the event form offers *every week*, *every 2 weeks* and *every month*, with an optional last date (older daily and yearly series still work). You can delete a single occurrence. |
| ✏️ **One event form** | Events are created and edited in the same full-screen form, by everyone: admins edit any event (and set it to *Published* or *Draft*; a new event saved as a draft stays off the calendar), signed-in staff the ones they sent in (signed in, or naming their email as the contact) without changing whether it's published. A new event needs a category. Every change is saved through `/api/edit-event` and logged field by field; admins see staff changes in the **Change log**, with a count of new ones, and can search it by event name or person. |
| 👥 **Staff accounts** | Admins add staff and reset forgotten passwords: the person gets a temporary password and chooses their own at the next sign-in. Everyone can change their password from the account menu. |
| 🗑️ **Undo & restore** | A deleted event can be put back with *Undo* for 10 seconds, and later with *Restore* under **Deleted** in the change log (with its flyer and files while they are still stored). |
| 📊 **Statistics** | Events, dates and venues per period, by category and month, ready to paste into a Board report or download as an Excel workbook (a summary and every date held). |
| 🔍 **Search & filters** | Filter by text, category, location, submitter, status (including *Pending review*) or date range. A search shows its results as one list across every date; a date filter moves the calendar to its period. |
| 📤 **Export & subscribe** | Download as `.ics` or `.xlsx` (with a search or filters on, just the matching events or all of them), or subscribe to a live ICS feed from Outlook, Google or Apple Calendar, for all events or chosen categories. |
| 🎨 **Cork City Partnership look** | Colours, Lato type, buttons and leaf-shaped boxes follow [corkcitypartnership.ie](https://corkcitypartnership.ie/), in light and dark mode, on screen and in the PDF. |
| 🌙 **Comfort features** | Dark mode, keyboard shortcuts (`/` `←` `→` `T` `C` `E` `Esc`), pull-to-refresh and offline caching. |

## The fortnightly routine

```
 Wednesday              Thursday                   Friday
 ─────────              ────────                   ──────
 Staff submit events →  Admins review the inbox →  Generate the digest
 via /submit            approve · edit · decline   PDF + email / WhatsApp text
```

1. **Submit.** Staff open [`/submit`](https://ccp-event-calendar.pages.dev/submit) on any device. Each new event is saved as a *pending* draft. To ask for them, an admin clicks **Reminder** (top bar; on a phone or tablet, in the menu): a formatted email in the digest's look, asking for events before Friday with a button to the form and who to write to about the site, is copied to paste into the new email that opens to allstaff@partnershipcork.ie (no CC; the address is in `constants/digestRecipients.ts`).
2. **Review.** Admins see a badge on **Submissions**. From there they check the details and poster, then approve, edit or decline. An approved event appears on the calendar straight away.
3. **Circulate.** Open **Events Digest**, pick the period (the next 14 days by default) and choose a layout:
   - **Executive cards.** Page 1 has the period totals (events, days with events, and how many are new since the last digest shared before this week) beside the title, then an overview: an *At a glance* month grid for periods up to six weeks, or an *In this digest* list with page numbers (click a row to jump to the event) for longer ones. Events follow week by week (headed by their dates), or month by month for periods over six weeks, each day's date beside its cards, with category colours, descriptions, contact people (an event can list several), flyers and add-to-calendar buttons. Nothing says *today* or *this week*: a shared digest is read for months after it is issued.
   - **Compact table.** A dense day-by-day agenda that fits the most events per page, headed by week or month the same way.

   Both layouts mark **New** the events that the last digest shared before this week (from its Monday) didn't carry, so a digest shared earlier the same week doesn't take the marks away; the very first digest marks everything New. Each share records the day and its events' ids in R2 (`meta/digest-issues.json`, never served as a file); if that can't be read, events added in the last week are marked instead. **Flyers to print at the end** (on by default, remembered per device) adds pages with every flyer four to a page, about A6 each, captioned with the event and the page of its card; on the cards, *Flyer · p. 5* under the thumbnail links there. The PDF's bookmarks list each event under its month or week, and the flyer pages.

   **Preview** opens the PDF in a new tab and **Download PDF** saves it; staff see only these two. Admins also get **Email**, **WhatsApp** and **Link**: the PDF is uploaded to R2 (`/api/digest`, kept six months; the link opens its page `/digest/…`, which lists the events in text that reads well on a phone and has the PDF a tab away, drawn with pdf.js with a download button, so it works in phone email apps' built-in browsers) and its link goes into a formatted covering email in plain words (logo, a “Click here for details” button, every event, no sign-off so your email signature follows) that is copied to paste into the new email your email app opens with the subject filled in, into the group-chat text, or on its own to the clipboard. The same digest (same day, period, layout, flyer pages and events) reuses its link; any change to the events makes a new one. The Outlook and Google buttons show on screen but are left out when the PDF is printed. Only approved events are included, and the dialog flags any submissions still pending for that period.

Step-by-step instructions, including email templates, are in the [coordinator guide](docs/GUIDE_FOR_ELIZABETH.md).

## Quick start

**You need:** Node.js 24.22.1 or newer (pinned in `.nvmrc`) and a [Supabase](https://supabase.com) project. [Cloudflare Pages](https://pages.cloudflare.com) is only needed for deployment.

```bash
git clone https://github.com/ihorvasyliev-gh/EventManagmentSystem.git
cd EventManagmentSystem
npm install
```

Create `.env.local` in the project root:

```env
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-key
# Optional: set to false to turn off live updates (the app falls back to polling)
# VITE_SUPABASE_REALTIME=false
```

Set up the database: in the Supabase SQL Editor run **`supabase/setup.sql`** (the whole schema). An existing database instead runs the files in [`supabase/migrations/`](supabase/migrations) it hasn't run yet, in order; the latest is `019_restore_deleted_events.sql`. Details: [`SUPABASE_SETUP.md`](SUPABASE_SETUP.md).

Start the dev server:

```bash
npm run dev
```

The app runs at <http://localhost:3000>.

### Scripts

| Command | What it does |
|---|---|
| `npm run dev` | Starts the Vite dev server on port 3000 |
| `npm run build` | Builds for production into `dist/` |
| `npm run preview` | Serves the production build |
| `npm test` | Unit tests (Node's built-in test runner): the app's logic and the Cloudflare functions |
| `npm run test:e2e` | End-to-end tests (Playwright) on the production build, with Supabase mocked: submitting, reviewing, passwords, the event window, accessibility (axe) and the Content-Security-Policy |
| `npm run lint` | ESLint |
| `npm run typecheck` | TypeScript for the app and for the functions (Workers types) |

## Roles

New accounts start as **staff**. To promote someone to **admin**, run this in Supabase:

```sql
UPDATE public.users SET role = 'admin' WHERE email = 'user@example.com';
```

| | Staff | Admin |
|---|:---:|:---:|
| View, search and filter published events | ✅ | ✅ |
| Add to a personal calendar, export, subscribe | ✅ | ✅ |
| Submit events for review | ✅ | ✅ |
| See their own submissions on the calendar, marked *Pending review*, until they're approved | ✅ | ✅ |
| Change their own events (each change is logged for the admins) | ✅ | ✅ |
| Change their own password | ✅ | ✅ |
| Create, edit, duplicate and delete events and occurrences | | ✅ |
| Review submissions and see everyone's drafts | | ✅ |
| Add staff accounts, reset passwords, see statistics and the change log | | ✅ |
| Preview and download the Events Digest | ✅ | ✅ |
| Share the digest: covering email, WhatsApp text, link to the PDF | | ✅ |

Row-level security enforces these rules in the database: staff read published events (and their own drafts) and write nothing directly: drafts go through `/api/submit`, and changes to events (staff's own, or any for admins) through `/api/edit-event`, which checks who may change the event and writes the change to its history. Without an account nobody can read or write anything; the public form and the calendar feed go through the Cloudflare functions. The database itself logs every deleted event (who deleted it, and what it was, with a copy to restore it from) in the change log, whichever way it was deleted, and nobody can change or remove history from the app.

**Forgotten password:** the person emails the contact on the login page (*Forgot your password?* fills in the email). An admin opens **account menu → Staff accounts → Reset password** and passes on the temporary password shown; at their next sign-in they choose a new one.

## Deployment (Cloudflare Pages)

| Setting | Value |
|---|---|
| Build command | `npm run build` |
| Output directory | `dist` |
| Build variables | `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` (required); `VITE_TURNSTILE_SITE_KEY` (bot check, optional) |
| Secrets | `SUPABASE_SERVICE_ROLE_KEY` (required); `TURNSTILE_SECRET_KEY`, `RESEND_API_KEY` (optional) |
| Other variables | `NOTIFY_FROM`, `NOTIFY_ADMIN_EMAILS`, `APP_URL` (for the emails, optional) |
| R2 binding | A bucket bound as **`BUCKET`** |

Step by step, including the order for this release (deploy first, then run migration 012): [`DEPLOY.md`](DEPLOY.md) and [`CLOUDFLARE_SETUP.md`](CLOUDFLARE_SETUP.md).

Every page gets security headers from `public/_headers`: a Content-Security-Policy (scripts only from the site and Turnstile, data only from the site and Supabase), HSTS and no framing.

### API (Pages Functions)

| Endpoint | Method | Who | Purpose |
|---|---|---|---|
| `/api/submit` | `POST` | anyone | The `/submit` form: event and flyer in one request (draft; admins can publish). Up to 30 per network in 15 minutes (admins unlimited) |
| `/api/edit-event` | `POST` | admins, staff (own events) | Saves changes to an event (and a new flyer) in one request, checked like `/api/submit`; only admins change the status. Refuses if someone saved the event meanwhile, and logs what changed |
| `/api/published-events` | `GET` | anyone | Published events without anyone's details, for the form's same-time warning |
| `/api/calendar` | `GET` | anyone | Live ICS feed (past year, recurrences expanded, Europe/Dublin; `?category=` to filter). `?event_id=…&date=…` gives one invite |
| `/api/file/:key` | `GET` | anyone | Serves a poster, attachment or shared digest from R2 |
| `/api/file/:key` | `DELETE` | admins | Removes a file no event uses any more |
| `/api/upload` | `PUT` | admins | Uploads a poster or attachment to R2 |
| `/api/digest` | `POST` | admins | Uploads the digest PDF under `digests/`, with its events as a list for the digest's page, and returns its link (kept six months; older digests are deleted); records which events it carried |
| `/api/digest-issues?before=YYYY-MM-DD` | `GET` | signed in | The last digest shared before that day (its day and event ids), for the *New* marks |
| `/api/submissions` | `POST` | admins | Approve (publish) or decline (delete) submissions; says whether the submitters were emailed |
| `/api/staff` | `GET` / `POST` | admins | List accounts / create a staff account |
| `/api/staff-password` | `POST` | admins | Reset someone's password to a temporary one |
| `/api/client-error` | `POST` | anyone | Error reports from browsers (stored in `client_errors`) |

**To subscribe:** paste `https://<your-site>/api/calendar` into Outlook (*Add calendar → From Internet*), Google Calendar (*Other calendars → From URL*) or Apple Calendar (*File → New Calendar Subscription*). You can also copy the link from the app's **Export → Subscribe** tab, where you can pick categories.

**Errors in people's browsers** are reported to `/api/client-error` and land in the `client_errors` table (Supabase → Table Editor), one row per error per day with a count.

## Project layout

```
├── App.tsx                  App shell: page layout and which window is open
├── hooks/                   Session, events sync (load, cache, live updates), event and inbox actions,
│                            links into the app, the /submit route, form helpers
├── pages/                   Login and the /submit form
├── components/
│   ├── calendar/            Month grid, agenda, day popover, header (CalendarView puts them together)
│   ├── event-modal/         Event details, their buttons and the delete dialog (events are edited in the event form)
│   ├── submit/              /submit form sections, review and thank-you screens, saved draft
│   └── …                    Week view, digest, export, inbox, staff, statistics, navigation
├── services/                Supabase and /api access: events, submissions, files, staff, auth
├── utils/
│   ├── pdf/                 Events Digest PDF (digest/: layouts, page parts) and WhatsApp text
│   ├── digestText.ts        Covering email for the digest (and helpers the PDF shares)
│   ├── recurrence.ts        Expands recurring events
│   ├── repeat.ts            Repeats in words, and the form's every week / 2 weeks / month
│   ├── eventChanges.ts      What changed in an event, for its history (app and /api/edit-event)
│   └── export.ts            ICS and Excel export
├── functions/api/           Cloudflare Pages Functions (see API above)
├── server/                  What the functions share: Supabase access, emails, files, feed, checks,
│                            the /api/submit limit
├── supabase/                setup.sql (new projects) and migrations/ (existing ones)
├── public/                  Icons, Lato fonts, PWA manifest, service worker, _headers
├── tests/                   Unit tests (node --test)
├── e2e/                     End-to-end tests (Playwright)
└── docs/                    Coordinator and staff guides
```

## Tech stack

| Layer | Technology |
|---|---|
| Frontend | React 19, TypeScript, Vite 6, Tailwind CSS 3, Lucide icons |
| Backend | Supabase (PostgreSQL, Auth, Realtime, row-level security) |
| Files | Cloudflare R2 |
| Hosting | Cloudflare Pages and Pages Functions |
| Documents | jsPDF (digest), ExcelJS (`.xlsx`), PDF.js (PDF flyers → print-quality PNG) |
| Optional services | Cloudflare Turnstile (bot check), Resend (emails) |
| Tests | Node test runner, Playwright with axe, ESLint |

## Support

If something in the app breaks, email [ivasyliev@partnershipcork.ie](mailto:ivasyliev@partnershipcork.ie). Error messages in the app show the same address, with a link that fills in the error details.

## More docs

- [Coordinator guide](docs/GUIDE_FOR_ELIZABETH.md): the fortnightly routine, moderation and digest emails
- [Staff guide](docs/GUIDE_FOR_STAFF.md): how to submit an event
- [`DEPLOY.md`](DEPLOY.md), [`SUPABASE_SETUP.md`](SUPABASE_SETUP.md), [`CLOUDFLARE_SETUP.md`](CLOUDFLARE_SETUP.md): detailed setup (in Russian, except the Cloudflare guide)

---

<div align="center"><sub>© Cork City Partnership CLG · Education | Employment | Empowerment · Internal use only</sub></div>
