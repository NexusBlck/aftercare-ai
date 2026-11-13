-- AFTERCARE AI — two-factor authentication (TOTP) for clinic staff.
--
-- Additive. Enforced in the database, not only in the app: every staff check (private.has_role,
-- private.is_reviewer, used by RLS, storage policies and the clinic RPCs) now also requires the session
-- to satisfy the clinic's two-factor rules. Patients are unaffected.
--   * A staff member who has enrolled a factor must have completed it in this session (aal2).
--   * A clinic can require two-factor for all staff; members without a factor then see nothing until
--     they enrol (they can still read their own membership and the clinic's name to be told why).

alter table public.organizations add column if not exists require_mfa boolean not null default false;

create or replace function private.mfa_satisfied(org uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select coalesce(auth.jwt() ->> 'aal', 'aal1') = 'aal2'
      or (not exists (select 1 from auth.mfa_factors f where f.user_id = auth.uid() and f.status::text = 'verified')
          and not coalesce((select o.require_mfa from public.organizations o where o.id = org), false));
$$;
revoke all on function private.mfa_satisfied(uuid) from public;

-- Active membership, without the two-factor condition: only for reading one's own clinic's basic record.
create or replace function private.is_member(org uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.organization_memberships m
    where m.organization_id = org and m.user_id = auth.uid() and m.status = 'active'
  );
$$;
revoke all on function private.is_member(uuid) from public;
-- Policies run as the calling user, so the read-only checks they use must be executable.
grant execute on function private.is_member(uuid), private.mfa_satisfied(uuid) to authenticated;

create or replace function private.has_role(org uuid, roles text[]) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.organization_memberships m
    where m.organization_id = org and m.user_id = auth.uid() and m.status = 'active' and m.role = any (roles)
  ) and private.mfa_satisfied(org);
$$;

create or replace function private.is_reviewer(org uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.organization_memberships m
    where m.organization_id = org and m.user_id = auth.uid() and m.status = 'active' and m.clinical_reviewer
  ) and private.mfa_satisfied(org);
$$;

drop policy if exists organizations_select on public.organizations;
create policy organizations_select on public.organizations for select to authenticated
  using (private.is_member(id) or exists (
    select 1 from public.clinic_patients p where p.organization_id = organizations.id and p.user_id = auth.uid() and p.status = 'active'));

-- Turning the requirement on needs a two-factor session, so an administrator cannot lock the clinic
-- (themselves included) out by switching it on without having set it up.
create or replace function private.guard_organization() returns trigger
language plpgsql set search_path = '' as $$
begin
  if current_user in ('authenticated', 'anon') and new.require_mfa and not old.require_mfa
     and coalesce(auth.jwt() ->> 'aal', 'aal1') <> 'aal2' then
    raise exception 'mfa_required_first' using errcode = 'P0001',
      hint = 'Set up two-factor authentication for your own account before requiring it for the clinic.';
  end if;
  return new;
end $$;
revoke all on function private.guard_organization() from public;
drop trigger if exists organizations_guard on public.organizations;
create trigger organizations_guard before update on public.organizations for each row execute function private.guard_organization();
