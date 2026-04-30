-- RLS hardening plan for current architecture (phone login + custom cookie auth).
-- IMPORTANT:
-- 1) Apply in a staging database first.
-- 2) This script keeps public read access for booking data used by frontend.
-- 3) Strong isolation by real user identity requires migrating client mutations to server endpoints only.

-- ============================================================================
-- Phase 1: Enable RLS and define explicit baseline policies
-- ============================================================================

-- Public read tables used to render booking UI.
alter table if exists public.services enable row level security;
alter table if exists public.working_hours enable row level security;
alter table if exists public.salon_closures enable row level security;
alter table if exists public.portfolio enable row level security;

drop policy if exists services_public_read on public.services;
create policy services_public_read on public.services
  for select
  to anon, authenticated
  using (true);

drop policy if exists working_hours_public_read on public.working_hours;
create policy working_hours_public_read on public.working_hours
  for select
  to anon, authenticated
  using (true);

drop policy if exists salon_closures_public_read on public.salon_closures;
create policy salon_closures_public_read on public.salon_closures
  for select
  to anon, authenticated
  using (true);

drop policy if exists portfolio_public_read on public.portfolio;
create policy portfolio_public_read on public.portfolio
  for select
  to anon, authenticated
  using (true);

-- Admin/service-role write access for catalog/config tables.
drop policy if exists services_service_write on public.services;
create policy services_service_write on public.services
  for all
  to service_role
  using (true)
  with check (true);

drop policy if exists working_hours_service_write on public.working_hours;
create policy working_hours_service_write on public.working_hours
  for all
  to service_role
  using (true)
  with check (true);

drop policy if exists salon_closures_service_write on public.salon_closures;
create policy salon_closures_service_write on public.salon_closures
  for all
  to service_role
  using (true)
  with check (true);

drop policy if exists portfolio_service_write on public.portfolio;
create policy portfolio_service_write on public.portfolio
  for all
  to service_role
  using (true)
  with check (true);

-- ============================================================================
-- Appointments and waitlist (temporary compatibility mode)
-- ============================================================================
-- NOTE: Because current client auth is not Supabase Auth-based (auth.uid()),
-- strict per-user RLS cannot be enforced only with anon policies.
-- These policies keep app functional while limiting some dangerous operations.

alter table if exists public.appointments enable row level security;
alter table if exists public.waitlist enable row level security;
alter table if exists public.portfolio_ratings enable row level security;
alter table if exists public.clients enable row level security;

-- Required for calendar/availability in current frontend.
drop policy if exists appointments_public_read on public.appointments;
create policy appointments_public_read on public.appointments
  for select
  to anon, authenticated
  using (true);

-- Allow creating appointments from public app, with basic constraints.
drop policy if exists appointments_public_insert on public.appointments;
create policy appointments_public_insert on public.appointments
  for insert
  to anon, authenticated
  with check (
    client_id is not null
    and client_phone is not null
    and status in ('confirmed', 'canceled', 'rejected', 'completed')
  );

-- Allow updates needed by current app (modify booking / cancel / review).
drop policy if exists appointments_public_update on public.appointments;
create policy appointments_public_update on public.appointments
  for update
  to anon, authenticated
  using (true)
  with check (
    status in ('confirmed', 'canceled', 'rejected', 'completed')
    and (rating is null or (rating >= 0 and rating <= 5))
  );

-- Block hard deletes from public clients.
drop policy if exists appointments_service_delete on public.appointments;
create policy appointments_service_delete on public.appointments
  for delete
  to service_role
  using (true);

-- Waitlist public insert/read, no public delete.
drop policy if exists waitlist_public_read on public.waitlist;
create policy waitlist_public_read on public.waitlist
  for select
  to anon, authenticated
  using (true);

drop policy if exists waitlist_public_insert on public.waitlist;
create policy waitlist_public_insert on public.waitlist
  for insert
  to anon, authenticated
  with check (
    client_id is not null
    and client_phone is not null
    and desired_date is not null
  );

drop policy if exists waitlist_service_delete on public.waitlist;
create policy waitlist_service_delete on public.waitlist
  for delete
  to service_role
  using (true);

-- Portfolio ratings: allow read and controlled write from app.
drop policy if exists portfolio_ratings_public_read on public.portfolio_ratings;
create policy portfolio_ratings_public_read on public.portfolio_ratings
  for select
  to anon, authenticated
  using (true);

drop policy if exists portfolio_ratings_public_insert on public.portfolio_ratings;
create policy portfolio_ratings_public_insert on public.portfolio_ratings
  for insert
  to anon, authenticated
  with check (
    client_id is not null
    and photo_id is not null
    and rating between 1 and 5
  );

drop policy if exists portfolio_ratings_public_update on public.portfolio_ratings;
create policy portfolio_ratings_public_update on public.portfolio_ratings
  for update
  to anon, authenticated
  using (true)
  with check (rating between 1 and 5);

drop policy if exists portfolio_ratings_service_delete on public.portfolio_ratings;
create policy portfolio_ratings_service_delete on public.portfolio_ratings
  for delete
  to service_role
  using (true);

-- Clients table: block public full reads/writes; allow service role only.
drop policy if exists clients_service_all on public.clients;
create policy clients_service_all on public.clients
  for all
  to service_role
  using (true)
  with check (true);

-- ============================================================================
-- Phase 2 target (recommended)
-- ============================================================================
-- Move ALL client mutations to server endpoints (using service role + cookie session checks),
-- remove public reads that expose operational/customer data,
-- then remove public INSERT/UPDATE policies from:
--   appointments, waitlist, portfolio_ratings
-- and allow only service_role writes.

-- ============================================================================
-- Phase 3 (now applicable after server-endpoint migration)
-- ============================================================================
-- Run this block after confirming frontend no longer writes directly to Supabase.

drop policy if exists appointments_public_insert on public.appointments;
drop policy if exists appointments_public_update on public.appointments;
drop policy if exists appointments_public_read on public.appointments;
drop policy if exists waitlist_public_read on public.waitlist;
drop policy if exists waitlist_public_insert on public.waitlist;
drop policy if exists portfolio_ratings_public_read on public.portfolio_ratings;
drop policy if exists portfolio_ratings_public_insert on public.portfolio_ratings;
drop policy if exists portfolio_ratings_public_update on public.portfolio_ratings;

drop policy if exists appointments_service_read on public.appointments;
create policy appointments_service_read on public.appointments
  for select
  to service_role
  using (true);

drop policy if exists appointments_service_write on public.appointments;
create policy appointments_service_write on public.appointments
  for all
  to service_role
  using (true)
  with check (true);

drop policy if exists waitlist_service_read on public.waitlist;
create policy waitlist_service_read on public.waitlist
  for select
  to service_role
  using (true);

drop policy if exists waitlist_service_write on public.waitlist;
create policy waitlist_service_write on public.waitlist
  for all
  to service_role
  using (true)
  with check (true);

drop policy if exists portfolio_ratings_service_read on public.portfolio_ratings;
create policy portfolio_ratings_service_read on public.portfolio_ratings
  for select
  to service_role
  using (true);

drop policy if exists portfolio_ratings_service_write on public.portfolio_ratings;
create policy portfolio_ratings_service_write on public.portfolio_ratings
  for all
  to service_role
  using (true)
  with check (true);
