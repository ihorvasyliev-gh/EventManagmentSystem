# Cloudflare setup

The site runs on **Cloudflare Pages**: the built app from `dist/` plus the Pages Functions in `functions/api/`.
Flyers and attachments live in an **R2** bucket. The order for a first deployment and for this release is in
[`DEPLOY.md`](DEPLOY.md); the database is in [`SUPABASE_SETUP.md`](SUPABASE_SETUP.md).

## 1. R2 bucket

1. Cloudflare Dashboard → **R2** → **Create bucket**, e.g. `ccp-event-calendar-assets`.
2. Leave public access **off**. Files are served by `/api/file/...`, which also lets admins delete them.

## 2. Bind the bucket to the Pages project

1. **Workers & Pages** → your project → **Settings** → **Bindings** (older dashboards: **Settings → Functions → R2 bucket bindings**).
2. **Add** → **R2 bucket**:
   - **Variable name:** `BUCKET` (exactly this — the code uses it)
   - **R2 bucket:** the bucket from step 1
3. Do it for **Production** and **Preview**, then redeploy.

Without the binding, flyer uploads and `/api/file/*` answer 500.

## 3. Variables and secrets

**Workers & Pages** → your project → **Settings** → **Variables and Secrets**, for **Production** and **Preview**.
Anything marked *secret* must be added as an **encrypted secret**. Changes take effect on the next deployment.

| Name | Type | Required | Used for |
|---|---|---|---|
| `VITE_SUPABASE_URL` | variable | yes | Supabase project URL — built into the app and read by the functions |
| `VITE_SUPABASE_ANON_KEY` | variable | yes | Supabase anon key |
| `SUPABASE_SERVICE_ROLE_KEY` | **secret** | yes | Every function that reads or writes for someone: submissions, approve/decline, staff accounts, password resets, files, calendar feeds |
| `VITE_TURNSTILE_SITE_KEY` | variable | no | Shows the Turnstile check on `/submit` (section 4) |
| `TURNSTILE_SECRET_KEY` | **secret** | no | Verifies the Turnstile check on the server |
| `RESEND_API_KEY` | **secret** | no | Sends emails through Resend (section 5) |
| `NOTIFY_FROM` | variable | no | Sender, e.g. `CCP Calendar <calendar@partnershipcork.ie>` |
| `NOTIFY_ADMIN_EMAILS` | variable | no | Comma-separated addresses told about new submissions; default: every admin account |
| `APP_URL` | variable | no | Site address used in email links; default: the address the request came to |
| `VITE_SUPABASE_REALTIME` | variable | no | `false` makes the app poll every minute instead of using Supabase Realtime |

The functions also accept `SUPABASE_URL` / `SUPABASE_ANON_KEY` if you prefer names without the `VITE_` prefix.

> ⚠️ The **service_role** key bypasses every database rule. Keep it in Cloudflare as a secret only — never in
> `.env.local`, in a `VITE_*` variable or in the code.

## 4. Turnstile (optional bot check on the public form)

The submission form is open to anyone, so bots can find it. Turnstile adds an invisible-or-one-click check.

1. Cloudflare Dashboard → **Turnstile** → **Add widget**.
2. **Hostnames:** your site, e.g. `ccp-event-calendar.pages.dev` (and your own domain, if any).
3. **Widget mode:** *Managed*.
4. Copy the **Site key** → `VITE_TURNSTILE_SITE_KEY`, and the **Secret key** → `TURNSTILE_SECRET_KEY` (secret).
5. Redeploy.

Set **both** or **neither**: with only the secret, every submission is refused; with only the site key, the
check shows but nothing verifies it. Signed-in admins and staff skip the check. The Content-Security-Policy
in `public/_headers` already allows `challenges.cloudflare.com`.

## 5. Emails with Resend (optional)

With email set up:

- admins get an email for every new submission, with a link straight to the inbox (`/?inbox`);
- the person who submitted gets an email when their event is approved, or declined (with the reason, if given).

Without it, everything works the same, just without emails.

1. Create an account at [resend.com](https://resend.com).
2. **Domains** → **Add domain** (e.g. `partnershipcork.ie`) and add the DNS records Resend shows. Wait until it is *Verified*.
3. **API Keys** → **Create API key** (permission *Sending access*) → `RESEND_API_KEY` (secret).
4. Set `NOTIFY_FROM` to an address on the verified domain, e.g. `CCP Calendar <calendar@partnershipcork.ie>`.
5. Optionally set `NOTIFY_ADMIN_EMAILS` and `APP_URL`, then redeploy.

Send failures never block a submission or a review; they are written to the function logs
(**Workers & Pages** → project → **Functions** → **Real-time logs**).

## 6. Rate limit for the form (optional, own domain only)

`/api/submit` already rejects oversized and malformed requests, and Turnstile stops most bots. If the site is on
your own domain proxied by Cloudflare (rate-limiting rules are not available on `*.pages.dev`), you can add:

**Security** → **WAF** → **Rate limiting rules** → **Create rule**

- **If incoming requests match:** URI Path equals `/api/submit` and Request Method equals `POST`
- **Characteristics:** IP
- **When rate exceeds:** 10 requests per 1 minute
- **Then:** Block for 10 minutes

## 7. Staff accounts and password resets

Admins create accounts and reset passwords from the app (account menu → **Staff accounts**). The requests go to
`/api/staff` and `/api/staff-password`, which check that the caller is an admin and use the service role key.

- New accounts are always **staff** (the `handle_new_user` trigger enforces it). To make someone an admin,
  change `role` in the `users` table in Supabase (see `SUPABASE_SETUP.md`).
- A reset generates a temporary password, shown to the admin once; the person must choose a new password at their next sign-in.

## 8. Local development

`npm run dev` runs the app only (Vite); the `/api/*` functions are not available there. To run the functions
locally with R2:

```bash
npm run build
npx wrangler pages dev dist --r2=BUCKET
```

Put the variables and secrets for the functions in a `.dev.vars` file in the project root (it is git-ignored):

```
VITE_SUPABASE_URL=https://xxxxx.supabase.co
VITE_SUPABASE_ANON_KEY=...
SUPABASE_SERVICE_ROLE_KEY=...
```

## 9. Troubleshooting

- **"Flyer uploads are not set up on the server"** / 500 on `/api/file/*`: the `BUCKET` binding is missing or misnamed.
- **"Submissions are not set up on the server (missing Supabase keys)"**: `SUPABASE_SERVICE_ROLE_KEY` is missing — add it and redeploy.
- **"We couldn't confirm the form was sent by a person"**: Turnstile keys don't match the hostname, or only one of the two keys is set.
- **Blocked by Content-Security-Policy** in the browser console: a new external service must also be added to `public/_headers` (and it is mirrored for `vite preview` in `vite.config.ts`).
