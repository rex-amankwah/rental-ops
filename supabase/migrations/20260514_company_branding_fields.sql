-- ============================================================
-- Company branding fields
-- Run in: Supabase Dashboard → SQL Editor
-- Adds optional branding columns to the companies table.
-- All nullable — existing rows unaffected.
-- ============================================================

alter table public.companies
  add column if not exists primary_color  text default null,
  add column if not exists support_email  text default null,
  add column if not exists support_phone  text default null;

comment on column public.companies.primary_color  is 'Hex colour for company brand (e.g. #4F46E5). Nullable — app falls back to default primary.';
comment on column public.companies.support_email  is 'Support contact email shown to users. Falls back to companies.email.';
comment on column public.companies.support_phone  is 'Support contact phone shown to users. Falls back to companies.phone.';
