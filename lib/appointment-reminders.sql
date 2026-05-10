-- Reminder logs for WhatsApp automation (24h / 2h / review).
-- Run in Supabase SQL editor before enabling cron in production.

create table if not exists public.appointment_reminders (
  id uuid primary key default gen_random_uuid(),
  appointment_id uuid not null references public.appointments(id) on delete cascade,
  reminder_type text not null check (reminder_type in ('24h', '2h', 'review')),
  status text not null check (status in ('sent', 'failed')),
  provider_message_id text,
  error_message text,
  created_at timestamptz not null default now()
);

create index if not exists idx_appointment_reminders_appointment_id
  on public.appointment_reminders (appointment_id);

create index if not exists idx_appointment_reminders_created_at
  on public.appointment_reminders (created_at desc);

create index if not exists idx_appointment_reminders_type_status
  on public.appointment_reminders (reminder_type, status);

alter table public.appointment_reminders enable row level security;

drop policy if exists "appointment_reminders_no_public_select" on public.appointment_reminders;
create policy "appointment_reminders_no_public_select"
  on public.appointment_reminders
  for select
  to anon, authenticated
  using (false);

drop policy if exists "appointment_reminders_service_role_insert" on public.appointment_reminders;
create policy "appointment_reminders_service_role_insert"
  on public.appointment_reminders
  for insert
  to service_role
  with check (true);

drop policy if exists "appointment_reminders_service_role_select" on public.appointment_reminders;
create policy "appointment_reminders_service_role_select"
  on public.appointment_reminders
  for select
  to service_role
  using (true);
