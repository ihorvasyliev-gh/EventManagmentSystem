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
| 📝 **Staff submissions** | A public `/submit` form. Staff don't need an account to send in an event with its flyer (an image, or a PDF: the page they pick becomes the poster image). An optional Cloudflare Turnstile check keeps bots out. |
| 📥 **Review inbox** | Admins approve, edit or decline submissions, one at a time or all at once. A declined submission can carry a reason. Updates arrive in real time. |
| ✉️ **Emails (optional)** | Admins hear about new submissions; submitters hear when their event is approved or declined (with the reason). |
| 📑 **Events Digest PDF** | A branded A4 digest for the Board and staff, in two layouts: *Executive cards* and *Compact table*. |
| 📲 **WhatsApp & email text** | One click copies an emoji-friendly WhatsApp version of the digest, or a ready-to-send covering email for the Board that lists every event. |
| 📅 **Calendar views** | Month, week and agenda views, built for both desktop and mobile. |
| 🔁 **Recurring & multi-date events** | Daily, weekly, monthly and yearly repeats, or hand-picked dates, each with its own time if needed. You can delete a single occurrence. |
| 👥 **Staff accounts** | Admins add staff and reset forgotten passwords: the person gets a temporary password and chooses their own at the next sign-in. Everyone can change their password from the account menu. |
| 📊 **Statistics** | Events, dates and venues per period, by category and month, ready to paste into a Board report. |
| 🔍 **Search & filters** | Filter by text, category, location, submitter, status or date range. |
| 📤 **Export & subscribe** | Download as `.ics` or `.xlsx`, or subscribe to a live ICS feed from Outlook, Google or Apple Calendar, for all events or chosen categories. |
| 🎨 **Cork City Partnership look** | Colours, Lato type, buttons and leaf-shaped boxes follow [corkcitypartnership.ie](https://corkcitypartnership.ie/), in light and dark mode, on screen and in the PDF. |
| 🌙 **Comfort features** | Dark mode, keyboard shortcuts (`/` `←` `→` `T` `C` `E` `Esc`), pull-to-refresh and offline caching. |

## The fortnightly routine

```
 Wednesday              Thursday                   Friday
 ─────────              ────────                   ──────
 Staff submit events →  Admins review the inbox →  Generate the digest
 via /submit            approve · edit · decline   PDF + email / WhatsApp text
```

1. **Submit.** Staff open [`/submit`](https://ccp-event-calendar.pages.dev/submit) on any device. Each new event is saved as a *pending* draft.
2. **Review.** Admins see a badge on **Submissions**. From there they check the details and poster, then approve, edit or decline. An approved event appears on the calendar straight away.
3. **Circulate.** Open **Events Digest**, pick the period (the next 14 days by default) and choose a layout:
   - **Executive cards.** Page 1 has the period totals (events, days with events, venues) beside the title, then an overview: an *At a glance* month grid for periods up to six weeks, or an *In this digest* list with page numbers (click a row to jump to the event) for longer ones. Events follow week by week (*This week*, *Next week*, then dates), each day's date beside its cards, with category colours, descriptions, contact details, flyers and add-to-calendar buttons.
   - **Compact table.** A dense day-by-day agenda that fits the most events per page.

   **Preview** opens the PDF in a new tab and **Download PDF** saves it. **Email** (admins only) opens a new email in your email app with the subject and covering text filled in (one line per event, ending with “Kind regards,”); add the recipients and attach the PDF. **WhatsApp text** copies the group-chat version. The Outlook and Google buttons show on screen but are left out when the PDF is printed. Only approved events are included, and the dialog flags any submissions still pending for that period.

Step-by-step instructions, including email templates, are in the [coordinator guide](docs/GUIDE_FOR_ELIZABETH.md).

## Quick start

**You need:** Node.js 24+ and a [Supabase](https://supabase.com) project. [Cloudflare Pages](https://pages.cloudflare.com) is only needed for deployment.

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

Set up the database: in the Supabase SQL Editor run **`supabase/setup.sql`** (the whole schema). An existing database instead runs the files in [`supabase/migrations/`](supabase/migrations) it hasn't run yet, in order; the latest is `012_access_accounts_and_cleanup.sql`. Details: [`SUPABASE_SETUP.md`](SUPABASE_SETUP.md).

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
| Change their own password | ✅ | ✅ |
| Create, edit, duplicate and delete events and occurrences | | ✅ |
| Review submissions and see drafts | | ✅ |
| Manage categories | | ✅ |
| Add staff accounts, reset passwords, see statistics | | ✅ |

Row-level security enforces these rules in the database: staff read published events (and their own drafts) and can only create drafts. Without an account nobody can read or write anything; the public form and the calendar feed go through the Cloudflare functions.

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
| `/api/submit` | `POST` | anyone | The `/submit` form: event and flyer in one request (draft; admins can publish) |
| `/api/published-events` | `GET` | anyone | Published events without anyone's details, for the form's same-time warning |
| `/api/calendar` | `GET` | anyone | Live ICS feed (past year, recurrences expanded, Europe/Dublin; `?category=` to filter). `?event_id=…&date=…` gives one invite |
| `/api/file/:key` | `GET` | anyone | Serves a poster or attachment from R2 |
| `/api/file/:key` | `DELETE` | admins | Removes a file no event uses any more |
| `/api/upload` | `PUT` | admins | Uploads a poster or attachment to R2 |
| `/api/submissions` | `POST` | admins | Approve (and email the submitter) or decline (email the reason, delete) |
| `/api/staff` | `GET` / `POST` | admins | List accounts / create a staff account |
| `/api/staff-password` | `POST` | admins | Reset someone's password to a temporary one |
| `/api/client-error` | `POST` | anyone | Error reports from browsers (stored in `client_errors`) |

**To subscribe:** paste `https://<your-site>/api/calendar` into Outlook (*Add calendar → From Internet*), Google Calendar (*Other calendars → From URL*) or Apple Calendar (*File → New Calendar Subscription*). You can also copy the link from the app's **Export → Subscribe** tab, where you can pick categories.

**Errors in people's browsers** are reported to `/api/client-error` and land in the `client_errors` table (Supabase → Table Editor), one row per error per day with a count.

## Project layout

```
├── App.tsx                  App shell: modals and event actions
├── hooks/                   useSession, useEventsSync (load, cache, live updates), form helpers
├── pages/                   Login and the public /submit form
├── components/              Calendar and week views, event window, digest, export, inbox, staff, statistics
├── services/                Supabase and /api access: events, submissions, files, staff, auth
├── utils/
│   ├── pdf/                 Events Digest PDF (digest.ts and its parts) and WhatsApp text
│   ├── digestText.ts        Covering email for the digest (and helpers the PDF shares)
│   ├── recurrence.ts        Expands recurring events
│   └── export.ts            ICS and Excel export
├── functions/api/           Cloudflare Pages Functions (see API above)
├── server/                  What the functions share: Supabase access, emails, files, feed, checks
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
