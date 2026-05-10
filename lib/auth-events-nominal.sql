-- Nominal client auth rows for admin visibility (run after lib/auth-events.sql).
-- Stores full name + phone only on successful client login/register (server-side).

alter table public.auth_events
  add column if not exists client_id uuid references public.clients(id) on delete set null;

alter table public.auth_events
  add column if not exists client_full_name text;

alter table public.auth_events
  add column if not exists client_phone text;

create index if not exists auth_events_client_id_idx on public.auth_events (client_id);
