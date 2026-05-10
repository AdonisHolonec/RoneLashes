-- Public review links for post-visit WhatsApp requests.
-- Run in Supabase SQL Editor before enabling review-link reminders.

create table if not exists public.review_tokens (
  id uuid primary key default gen_random_uuid(),
  appointment_id uuid not null references public.appointments(id) on delete cascade,
  token text not null unique,
  expires_at timestamptz not null,
  used_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists review_tokens_token_idx
  on public.review_tokens (token);

create index if not exists review_tokens_appointment_id_idx
  on public.review_tokens (appointment_id);

alter table public.review_tokens enable row level security;

drop policy if exists review_tokens_no_public_select on public.review_tokens;
create policy review_tokens_no_public_select
  on public.review_tokens
  for select
  to anon, authenticated
  using (false);

drop policy if exists review_tokens_service_role_all on public.review_tokens;
create policy review_tokens_service_role_all
  on public.review_tokens
  for all
  to service_role
  using (true)
  with check (true);

-- Extend appointment reminder log type with post-visit review requests.
alter table public.appointment_reminders
  drop constraint if exists appointment_reminders_reminder_type_check;

alter table public.appointment_reminders
  add constraint appointment_reminders_reminder_type_check
  check (reminder_type in ('24h', '2h', 'review'));
