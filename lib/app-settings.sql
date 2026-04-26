-- Run this in Supabase SQL Editor.
create table if not exists public.app_settings (
  key text primary key,
  value jsonb not null,
  updated_at timestamptz not null default now()
);

alter table public.app_settings enable row level security;

drop policy if exists app_settings_public_read on public.app_settings;
create policy app_settings_public_read
  on public.app_settings
  for select
  to anon, authenticated
  using (true);

drop policy if exists app_settings_service_write on public.app_settings;
create policy app_settings_service_write
  on public.app_settings
  for all
  to service_role
  using (true)
  with check (true);
