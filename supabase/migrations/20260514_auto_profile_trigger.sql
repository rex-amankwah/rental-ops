-- ============================================================
-- Auto-profile trigger
-- Run in: Supabase Dashboard → SQL Editor
-- Effect: Every new auth.users row gets a matching public.profiles row.
--         role defaults to 'staff'. company_id is read from user metadata
--         (set during invite) or falls back to the first active company.
-- ============================================================

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_company_id uuid;
begin
  -- Prefer company_id embedded in invite metadata
  v_company_id := (new.raw_user_meta_data->>'company_id')::uuid;

  -- Fallback: single-tenant — use the first active company
  if v_company_id is null then
    select id into v_company_id
    from public.companies
    where active = true
    limit 1;
  end if;

  -- Only insert if we can resolve a company
  if v_company_id is not null then
    insert into public.profiles (
      id,
      company_id,
      email,
      full_name,
      role,
      is_active,
      created_at,
      updated_at
    )
    values (
      new.id,
      v_company_id,
      new.email,
      coalesce(
        new.raw_user_meta_data->>'full_name',
        split_part(new.email, '@', 1)
      ),
      'staff',
      true,
      now(),
      now()
    )
    on conflict (id) do nothing; -- Never overwrite existing profiles
  end if;

  return new;
end;
$$;

-- Attach trigger (drop first to avoid duplicates on re-run)
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();
