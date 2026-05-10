# Security Runbook

This project uses custom cookie-based auth for clients/admin plus server-side Supabase access for sensitive writes.

## Required Environment Variables

Set these in Vercel (Production, Preview, Development) and in local `.env.local`:

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`
- `ADMIN_LOGIN_PIN`
- `ADMIN_AUTH_SECRET`
- `CLIENT_AUTH_SECRET`
- `NEXT_PUBLIC_EMAILJS_SERVICE_ID`
- `NEXT_PUBLIC_EMAILJS_TEMPLATE_ID`
- `NEXT_PUBLIC_EMAILJS_PUBLIC_KEY`
- `NEXT_PUBLIC_SITE_URL` (canonical site URL; used for SEO and should match production host)
- `CRON_SECRET` (random string; protects `/api/internal/reminders`)
- `WHATSAPP_ACCESS_TOKEN`, `WHATSAPP_PHONE_NUMBER_ID` (Meta Cloud API)
- Optional: `WHATSAPP_API_VERSION` (default `v20.0`), `WHATSAPP_TEMPLATE_NAME`, `WHATSAPP_TEMPLATE_LANG`

## WhatsApp reminders (GitHub Actions)

Vercel Hobby allows only daily cron jobs, so **reminder pings** run from GitHub Actions (`.github/workflows/whatsapp-reminders.yml`) every 15 minutes.

**GitHub repository secrets** (must match production):

| Secret | Value |
| --- | --- |
| `CRON_SECRET` | Same as Vercel `CRON_SECRET`. |
| `PUBLIC_APP_URL` | Same **origin** as `NEXT_PUBLIC_SITE_URL` (no trailing slash), e.g. `https://ronelashes.vercel.app`. |

**Supabase:** run `lib/appointment-reminders.sql` so `appointment_reminders` exists.

**Manual test:** Actions → *WhatsApp appointment reminders* → *Run workflow*.

Reminder **„24h”** în cod = **ziua calendaristică anterioară** programării în `Europe/Bucharest` (nu fereastra fixă 23–25 ore). Reminder **„2h”** rămâne între ~90–150 minute înainte de `start_time`.

## Deployment Checklist

1. `npm run lint`
2. `npm run build`
3. Deploy (`vercel --prod` or GitHub -> Vercel)
4. Smoke test:
   - Admin login
   - Client login
   - Create booking
   - Modify/cancel booking
   - Join waitlist
   - Submit review / rate photo

## Database Security Checklist

Run SQL scripts in Supabase SQL Editor:

1. `lib/auth-events.sql`
2. `lib/auth-events-nominal.sql` (nume + telefon pentru logări reușite clienți în admin)
3. `lib/rls-hardening-plan.sql`

After applying, verify:

- `auth_events` has RLS enabled and only `service_role` insert
- `appointments`, `waitlist`, `portfolio_ratings` writes are restricted to `service_role`
- public read policies still allow booking UI data to load (`services`, `working_hours`, `salon_closures`, `portfolio`)

## Incident Response (Auth/Login Fails)

If users/admin cannot log in:

1. Check Vercel env vars are present and correct.
2. Redeploy after env changes.
3. Check latest deployment logs for:
   - `Client auth not configured.`
   - `Admin auth not configured on server.`
4. Verify Supabase keys:
   - URL and anon key match project
   - service role key is valid and active
5. Confirm RLS policies were applied as expected.

## Secret Rotation Procedure

Rotate immediately if leakage is suspected:

1. Rotate Supabase `service_role` key.
2. Generate new random values for `ADMIN_AUTH_SECRET` and `CLIENT_AUTH_SECRET`.
3. Optionally change `ADMIN_LOGIN_PIN`.
4. Update Vercel + local `.env.local`.
5. Redeploy.
6. Re-test auth and booking flows.

## Audit Monitoring

Auth events are logged to `auth_events` (best effort) and console logs.

Useful checks:

- sudden spike in `outcome = 'failure'`
- repeated `outcome = 'blocked'` for same masked phone/IP
- registration anomalies
