-- Run this in Supabase SQL editor to enable persistent auth audit logs.
create table if not exists public.auth_events (
  id uuid primary key default gen_random_uuid(),
  area text not null,
  action text not null,
  outcome text not null,
  phone_masked text,
  ip_address text,
  reason text,
  created_at timestamptz not null default now()
);

-- Optional indexes for faster filtering.
create index if not exists auth_events_created_at_idx on public.auth_events (created_at desc);
create index if not exists auth_events_area_idx on public.auth_events (area);
create index if not exists auth_events_outcome_idx on public.auth_events (outcome);

-- RLS hardening: deny everything by default, then allow only service role.
alter table public.auth_events enable row level security;

-- Cleanup in case script is re-run.
drop policy if exists auth_events_no_select on public.auth_events;
drop policy if exists auth_events_no_update on public.auth_events;
drop policy if exists auth_events_no_delete on public.auth_events;
drop policy if exists auth_events_service_insert on public.auth_events;

-- Explicitly block client reads/mutations.
create policy auth_events_no_select
  on public.auth_events
  for select
  using (false);

create policy auth_events_no_update
  on public.auth_events
  for update
  using (false)
  with check (false);

create policy auth_events_no_delete
  on public.auth_events
  for delete
  using (false);

-- Allow inserts only when using service role (server-side key).
create policy auth_events_service_insert
  on public.auth_events
  for insert
  to service_role
  with check (true);
