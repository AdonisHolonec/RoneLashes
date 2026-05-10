-- Personal data consent proof for client account registration.
-- Run in Supabase SQL Editor before deploying the consent-required registration flow.

alter table public.clients
  add column if not exists personal_data_consent_at timestamptz;

alter table public.clients
  add column if not exists personal_data_consent_version text;

alter table public.clients
  add column if not exists personal_data_consent_ip text;

create index if not exists clients_personal_data_consent_at_idx
  on public.clients (personal_data_consent_at desc);
