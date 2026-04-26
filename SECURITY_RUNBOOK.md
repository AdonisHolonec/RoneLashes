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
2. `lib/rls-hardening-plan.sql`

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
