-- Run this in Supabase SQL Editor.
alter table if exists public.services
add column if not exists subcategory text;
