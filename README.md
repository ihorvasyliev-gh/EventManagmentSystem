<div align="center">

<img src="public/assets/ccp-logo.png" alt="Cork City Partnership" height="72" />

# CCP Event Calendar

**Cork City Partnership's shared event calendar: staff submit events, admins approve them, and the Board gets a branded digest.**

React 19 · TypeScript · Supabase · Cloudflare Pages

[Live calendar](https://ccp-event-calendar.pages.dev/) · [Submit an event](https://ccp-event-calendar.pages.dev/submit) · [Coordinator guide](docs/GUIDE_FOR_ELIZABETH.md) · [Staff guide](docs/GUIDE_FOR_STAFF.md)

</div>

---

## What it does

| | |
|---|---|
| 📝 **Staff submissions** | A public `/submit` form. Staff don't need an account to send in an event with its flyer. |
| 📥 **Review inbox** | Admins approve, edit or decline submissions, one at a time or all at once. Updates arrive in real time. |
| 📑 **Events Digest PDF** | A branded A4 digest for the Board and staff, in two layouts: *Executive cards* and *Compact table*. |
| 📲 **WhatsApp summary** | One click copies a formatted, emoji-friendly text version of the digest. |
| 📅 **Calendar views** | Month, week and agenda views, built for both desktop and mobile. |
| 🔁 **Recurring & multi-date events** | Daily, weekly, monthly and yearly repeats, or hand-picked dates. You can delete a single occurrence. |
| ✅ **RSVPs & comments** | Both are tracked per occurrence. The browser reminds you the day before an event you've joined. |
| 🔍 **Search & filters** | Filter by text, category, location, submitter, status or date range. |
| 📤 **Export & subscribe** | Download as `.ics` or `.xlsx`, or subscribe to a live ICS feed from Outlook, Google or Apple Calendar. |
| 🌙 **Comfort features** | Dark mode, keyboard shortcuts (`/` `←` `→` `T` `C` `E` `Esc`), pull-to-refresh and offline caching. |

## The fortnightly routine

```
 Wednesday              Thursday                   Friday
 ─────────              ────────                   ──────
 Staff submit events →  Admins review the inbox →  Generate the digest
 via /submit            approve · edit · decline   PDF + WhatsApp text
```

1. **Submit.** Staff open [`/submit`](https://ccp-event-calendar.pages.dev/submit) on any device. Each new event is saved as a *pending* draft.
2. **Review.** Admins see a badge on **Submissions**. From there they check the details and poster, then approve, edit or decline. An approved event appears on the calendar straight away.
3. **Circulate.** Open **Events Digest**, pick the period (the next 14 days by default) and choose a layout:
   - **Executive cards.** Page 1 has the period totals (events, days with events, venues) beside the title and an *At a glance* month grid. After that, each day gets its own cards with category colours, descriptions, contact details, flyers and add-to-calendar buttons.
   - **Compact table.** A dense day-by-day agenda that fits the most events per page.

   **Preview** opens the PDF in a new tab and **Download PDF** saves it. Only approved events are included, and the dialog flags any submissions still pending for that period.

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

Set up the database in the Supabase SQL Editor. Run `supabase-setup.sql` first, then these migrations:

| File | Adds |
|---|---|
| `recurrence-exceptions-migration.sql` | Deleting single occurrences |
| `custom-dates-migration.sql` | Hand-picked recurrence dates |
| `rsvp-occurrence-migration.sql` | RSVPs per occurrence |
| `event-comments-occurrence-migration.sql` | Comments per occurrence |
| `submission-migration.sql` | Anonymous `/submit` drafts |
| `realtime-events-migration.sql` | Live updates without refreshing |
| `fix-category-constraint.sql`, `update-categories-to-standard.sql` | The standard CCP category list |

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
| `npm test` | Runs the unit tests (Node's built-in test runner, no extra dependencies) |

## Roles

New accounts start as **staff**. To promote someone to **admin**, run this in Supabase:

```sql
UPDATE public.users SET role = 'admin' WHERE email = 'user@example.com';
```

| | Staff | Admin |
|---|:---:|:---:|
| View, search and filter published events | ✅ | ✅ |
| RSVP, comment, add to a personal calendar, export, subscribe | ✅ | ✅ |
| Submit events for review | ✅ | ✅ |
| Create, edit and delete events and occurrences | | ✅ |
| Review submissions and see drafts | | ✅ |
| Manage categories | | ✅ |

Row-level security enforces these rules in the database. Staff can only ever read published events.

## Deployment (Cloudflare Pages)

| Setting | Value |
|---|---|
| Build command | `npm run build` |
| Output directory | `dist` |
| Environment variables | `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` |
| R2 binding | Bind a bucket as **`BUCKET`** under *Settings → Functions → R2 bucket bindings* |

The Pages Functions read the same Supabase variables at runtime. If the server side needs different values, set `SUPABASE_URL` and `SUPABASE_ANON_KEY`.

### API (Pages Functions)

| Endpoint | Method | Purpose |
|---|---|---|
| `/api/upload` | `PUT` | Uploads a poster or attachment to R2 |
| `/api/file/:key` | `GET` | Serves a file from R2 |
| `/api/calendar` | `GET` | Live ICS feed of published events, with recurrences expanded (Europe/Dublin) |

**To subscribe:** paste `https://<your-site>/api/calendar` into Outlook (*Add calendar → From Internet*), Google Calendar (*Other calendars → From URL*) or Apple Calendar (*File → New Calendar Subscription*). You can also copy the link from the app's **Export → Subscribe** tab.

## Project layout

```
├── App.tsx                  App shell: session, data sync, modals
├── pages/                   Login and the public /submit form
├── components/              Calendar and week views, event modal, digest and export dialogs, inbox
├── services/                Supabase access: auth, events, RSVPs, categories
├── utils/
│   ├── pdfExport.ts         Events Digest PDF and WhatsApp text
│   ├── digestGrouping.ts    Merges repeated occurrences into one digest entry
│   ├── recurrence.ts        Expands recurring events
│   └── export.ts            ICS and Excel export
├── functions/api/           Cloudflare Pages Functions (upload, files, ICS feed)
├── public/                  Logo, Inter fonts for the PDF, PWA manifest, service worker
├── tests/                   Unit tests (node --test)
├── *.sql                    Database setup and migrations
└── docs/                    Coordinator and staff guides
```

## Tech stack

| Layer | Technology |
|---|---|
| Frontend | React 19, TypeScript, Vite 6, Tailwind CSS 3, Lucide icons |
| Backend | Supabase (PostgreSQL, Auth, Realtime, row-level security) |
| Files | Cloudflare R2 |
| Hosting | Cloudflare Pages and Pages Functions |
| Documents | jsPDF (digest), ExcelJS (`.xlsx`) |

## More docs

- [Coordinator guide](docs/GUIDE_FOR_ELIZABETH.md): the fortnightly routine, moderation and digest emails
- [Staff guide](docs/GUIDE_FOR_STAFF.md): how to submit an event
- [`DEPLOY.md`](DEPLOY.md), [`SUPABASE_SETUP.md`](SUPABASE_SETUP.md), [`CLOUDFLARE_SETUP.md`](CLOUDFLARE_SETUP.md): detailed setup (in Russian, except the Cloudflare guide)

---

<div align="center"><sub>© Cork City Partnership CLG · Education | Employment | Empowerment · Internal use only</sub></div>
