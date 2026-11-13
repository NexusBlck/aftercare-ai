-- Undo 0004_staff_mfa.sql (emergency use only). Restores the 0003 staff checks and organizations policy.
-- Keeps the require_mfa column (harmless when unused) so no data is dropped.

begin;

drop trigger if exists organizations_guard on public.organizations;
drop function if exists private.guard_organization();

create or replace function private.has_role(org uuid, roles text[]) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.organization_memberships m
    where m.organization_id = org and m.user_id = auth.uid() and m.status = 'active' and m.role = any (roles)
  );
$$;

create or replace function private.is_reviewer(org uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.organization_memberships m
    where m.organization_id = org and m.user_id = auth.uid() and m.status = 'active' and m.clinical_reviewer
  );
$$;

drop policy if exists organizations_select on public.organizations;
create policy organizations_select on public.organizations for select to authenticated
  using (private.is_staff(id) or exists (
    select 1 from public.clinic_patients p where p.organization_id = organizations.id and p.user_id = auth.uid() and p.status = 'active'));

commit;
