-- Run in Supabase SQL editor.
create table if not exists public.analytics_events (
  id uuid primary key default gen_random_uuid(),
  event_name text not null,
  event_category text not null,
  client_id uuid,
  metadata jsonb,
  created_at timestamptz not null default now()
);

create index if not exists analytics_events_created_at_idx on public.analytics_events (created_at desc);
create index if not exists analytics_events_name_idx on public.analytics_events (event_name);
create index if not exists analytics_events_category_idx on public.analytics_events (event_category);

alter table public.analytics_events enable row level security;

drop policy if exists analytics_events_no_select on public.analytics_events;
drop policy if exists analytics_events_no_update on public.analytics_events;
drop policy if exists analytics_events_no_delete on public.analytics_events;
drop policy if exists analytics_events_service_insert on public.analytics_events;

create policy analytics_events_no_select
  on public.analytics_events
  for select
  using (false);

create policy analytics_events_no_update
  on public.analytics_events
  for update
  using (false)
  with check (false);

create policy analytics_events_no_delete
  on public.analytics_events
  for delete
  using (false);

create policy analytics_events_service_insert
  on public.analytics_events
  for insert
  to service_role
  with check (true);
