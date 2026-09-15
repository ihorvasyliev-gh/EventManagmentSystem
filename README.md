# CCP Event Calendar

A full-featured corporate event calendar for **Cork City Partnership** — built with React, TypeScript, Supabase, and deployed on Cloudflare Pages.

## ✨ Feature Highlights

| Feature | Description |
|---------|-------------|
| 🔐 **Auth & Roles** | Email/password sign-in via Supabase Auth. Staff and Admin roles |
| 📅 **Calendar Views** | Month grid and agenda views with responsive mobile layout |
| 🔁 **Recurring Events** | Daily, weekly, monthly, yearly, or custom date picks; delete single occurrences |
| ✅ **RSVP** | Join/cancel per occurrence; |
| 💬 **Comments** | Per-occurrence comment threads on events |
| 🔍 **Search & Filters** | By title, description, location, tags, category, creator, date range, status |
| 📎 **Attachments** | Posters, PDFs, documents, images — stored on Cloudflare R2 |
| 📤 **Export** | Download events as iCal (`.ics`) or Excel (`.xlsx`) with recurring expansion |
| 🔗 **Subscribe (ICS Feed)** | Live calendar feed URL — auto-syncs with Outlook, Google Calendar, Apple Calendar |
| 🗓️ **Add to Calendar** | Per-event: Google Calendar, Outlook.com, Office 365, or `.ics` download |
| 🔔 **Notifications** | Bell icon with upcoming RSVP'd events; |
| 🌙 **Dark Mode** | Light/dark theme toggle, persisted |
| ⚡ **PWA & Offline** | Service Worker for fast loads and offline support |

---

## Tech Stack

| Layer | Technology |
|-------|------------|
| Frontend | React 19, TypeScript, Vite 6, Tailwind CSS 3 |
| Backend | Supabase (PostgreSQL, Auth, Row-Level Security) |
| Storage | Cloudflare R2 (posters, attachments) |
| Hosting | Cloudflare Pages (with Pages Functions) |
| Icons | Lucide React |
| Export | ExcelJS (`.xlsx`), ICS generation |

---

## Quick Start

### Prerequisites

- Node.js 18+
- npm
- [Supabase](https://supabase.com) project (Auth + Database)
- [Cloudflare Pages](https://pages.cloudflare.com) project (optional for local dev)

### 1. Clone & Install

```bash
git clone https://github.com/ihorvasyliev-gh/CCPFlowCalendar.git
cd CCPFlowCalendar
npm install
```

### 2. Environment Variables

Create `.env.local` in the project root:

```env
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-key
VITE_CLOUDFLARE_R2_PUBLIC_URL=https://pub-xxxxx.r2.dev
```

### 3. Database Setup

Run `supabase-setup.sql` in Supabase SQL Editor. Then apply migrations if needed:

- `event-comments-occurrence-migration.sql`
- `rsvp-occurrence-migration.sql`
- `recurrence-exceptions-migration.sql`
- `custom-dates-migration.sql`
- `fix-category-constraint.sql`

### 4. Run Locally

```bash
npm run dev
```

App runs at `http://localhost:3000`.

---

## Deployment (Cloudflare Pages)

### Build Settings

| Setting | Value |
|---------|-------|
| Build command | `npm run build` |
| Build output directory | `dist` |
| Root directory | `/` |

### Environment Variables (Cloudflare Pages Dashboard)

Set in **Pages → Settings → Environment Variables**:

| Variable | Description |
|----------|-------------|
| `VITE_SUPABASE_URL` | Supabase project URL |
| `VITE_SUPABASE_ANON_KEY` | Supabase anonymous/public key |
| `VITE_CLOUDFLARE_R2_PUBLIC_URL` | R2 public URL for file serving |
| `SUPABASE_URL` | Same as `VITE_SUPABASE_URL` — used by Pages Functions |
| `SUPABASE_ANON_KEY` | Same as `VITE_SUPABASE_ANON_KEY` — used by Pages Functions |

> **Note:** `VITE_*` variables are injected at build time by Vite. `SUPABASE_URL` and `SUPABASE_ANON_KEY` (without `VITE_` prefix) are required at runtime by Cloudflare Pages Functions (e.g. the ICS calendar feed).

### R2 Bucket

Bind an R2 bucket named `BUCKET` in **Pages → Settings → Functions → R2 Bucket Bindings** for file uploads.

See `DEPLOY.md` and `CLOUDFLARE_SETUP.md` for detailed instructions.

---

## Cloudflare Pages Functions

Server-side endpoints powered by [Pages Functions](https://developers.cloudflare.com/pages/functions/):

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/upload` | `PUT` | Upload files to R2 (posters, attachments) |
| `/api/file/:key` | `GET` | Serve files from R2 |
| `/api/calendar` | `GET` | Live ICS calendar feed for subscription |

### Calendar Subscription (ICS Feed)

The `/api/calendar` endpoint returns a live RFC 5545 ICS feed of all published events (with recurring expansion). Calendar apps auto-refresh every ~6 hours.

**How to subscribe:**

- **Outlook:** Add Calendar → From Internet → paste `https://your-site.pages.dev/api/calendar`
- **Google Calendar:** Other calendars (+) → From URL → paste URL
- **Apple Calendar:** File → New Calendar Subscription → paste URL
- **In-app:** Open Export & Subscribe modal → Subscribe tab → Copy URL or click "Open in Calendar App"

---

## Database Schema

| Table | Description |
|-------|-------------|
| `users` | User profiles and roles (staff / admin) |
| `events` | Events with recurrence, RSVP settings, status |
| `event_attachments` | File attachments linked to events |
| `event_comments` | Comments per event occurrence |
| `event_history` | Audit trail of event changes |
| `event_categories` | Reusable event categories |
| `rsvps` | RSVP records per event occurrence |
| `recurrence_exceptions` | Deleted occurrences of recurring events |

Row-Level Security (RLS) enforces that staff see only published events; admins have full access.

---

## User Roles

### Staff (default)

- View published events in calendar/list/agenda
- Search and filter events
- RSVP to events (per occurrence)
- Add/delete own comments
- Add events to personal calendar (Google, Outlook, Apple)
- Export events (iCal, Excel)
- Subscribe to live ICS feed
- Receive notifications for upcoming RSVP'd events

### Admin

Everything staff can do, plus:

- Create, edit, and delete events
- Set event status (Draft / Published)
- Create event categories
- View draft events and filter by status
- Delete single occurrences or entire recurring series

---

## Project Structure

```
├── App.tsx                     # Main application component
├── index.html                  # Entry HTML
├── index.tsx                   # React entry point
├── index.css                   # Global styles (Tailwind)
├── types.ts                    # TypeScript type definitions
├── components/
│   ├── CalendarView.tsx        # Month grid and list views
│   ├── EventModal.tsx          # Event detail/edit modal
│   ├── EventFilters.tsx        # Search and filter panel
│   ├── ExportModal.tsx         # Export & Subscribe modal
│   ├── Navbar.tsx              # Top navigation bar
│   ├── NotificationCenter.tsx  # Notification bell dropdown
│   ├── EventComments.tsx       # Comment thread component
│   ├── EventHistory.tsx        # Change history display
│   ├── DatePickerCalendar.tsx  # Custom date picker for recurrence
│   ├── SearchBar.tsx           # Search input
│   ├── BottomNavigation.tsx    # Mobile bottom nav
│   ├── ErrorBoundary.tsx       # Error boundary wrapper
│   ├── LazyImage.tsx           # Lazy-loaded image component
│   └── SkeletonLoader.tsx      # Loading skeleton
├── services/
│   ├── authService.ts          # Authentication (Supabase Auth)
│   ├── eventService.ts         # Event CRUD, file upload
│   ├── categoryService.ts      # Category management
│   ├── rsvpService.ts          # RSVP operations
│   └── notificationService.ts  # Notification logic
├── utils/
│   ├── recurrence.ts           # Recurring event expansion
│   ├── export.ts               # ICS and Excel export
│   ├── eventsCache.ts          # Client-side event caching
│   ├── sessionCache.ts         # Session storage cache
│   ├── filterEvents.ts         # Event filtering logic
│   ├── conflictDetection.ts    # Event conflict checks
│   ├── date.ts                 # Date utilities
│   └── validation.ts           # Form validation
├── hooks/                      # React custom hooks
├── contexts/                   # React context providers
├── lib/
│   └── supabase.ts             # Supabase client initialization
├── functions/
│   ├── api/
│   │   ├── upload.ts           # R2 file upload (Pages Function)
│   │   ├── calendar.ts         # ICS feed (Pages Function)
│   │   └── file/[[key]].ts     # R2 file serving (Pages Function)
│   └── tsconfig.json           # Functions TypeScript config
├── public/
│   └── manifest.json           # PWA manifest
├── vite.config.ts              # Vite build configuration
├── tailwind.config.js          # Tailwind CSS configuration
└── package.json
```

---

## Creating an Admin User

New sign-ups default to **staff**. To promote a user to admin, update the `role` column in the `public.users` table:

```sql
UPDATE public.users SET role = 'admin' WHERE email = 'user@example.com';
```

See `CREATE_ADMIN_USER.md` for detailed instructions.

---

## Additional Documentation

| File | Description |
|------|-------------|
| `DEPLOY.md` | Full deployment guide |
| `CLOUDFLARE_SETUP.md` | Cloudflare Pages & R2 setup |
| `SUPABASE_SETUP.md` | Supabase database & auth setup |
| `CREATE_ADMIN_USER.md` | How to create an admin user |
| `QUICKSTART.md` | Quick setup reference |
| `PERFORMANCE_SETUP.md` | Performance optimization notes |
| `DOCUMENTATION.md` | Comprehensive internal documentation |

---

© Cork City Partnership. Internal use only.
