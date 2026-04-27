-- Client profile preferences (MVP)
-- Run in Supabase SQL Editor.

create table if not exists public.client_preferences (
  client_id uuid primary key references public.clients(id) on delete cascade,
  preferred_style text,
  sensitivity_notes text,
  appointment_notes text,
  updated_at timestamptz not null default now()
);

alter table public.client_preferences enable row level security;

drop policy if exists client_preferences_no_public_select on public.client_preferences;
create policy client_preferences_no_public_select
  on public.client_preferences
  for select
  to anon, authenticated
  using (false);

drop policy if exists client_preferences_service_role_write on public.client_preferences;
create policy client_preferences_service_role_write
  on public.client_preferences
  for all
  to service_role
  using (true)
  with check (true);
