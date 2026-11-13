-- AFTERCARE AI: brings a database that already has the ORIGINAL 0003_clinic_portal.sql up to the version in
-- the security-audit branch (plus 0002b). For the TEST project only; production gets the full files instead.
-- Safe to run more than once. No rows are deleted or changed except the retention job's normal behaviour.

begin;

-- 0002b: allow the free-tier AI providers in the extraction log.
alter table public.extraction_runs drop constraint if exists extraction_runs_provider_check;
alter table public.extraction_runs add constraint extraction_runs_provider_check
  check (provider in ('gemini', 'mock', 'freellmapi', 'free'));

-- AUD-01: a patient with a clinic record can delete their account (linked_at stays as history).
alter table public.clinic_patients drop constraint if exists clinic_patients_check;
alter table public.clinic_patients add constraint clinic_patients_check
  check (user_id is null or linked_at is not null);

-- AUD-10: notification links must be same-site paths ("//host" refused).
alter table public.notifications drop constraint if exists notifications_link_check;
alter table public.notifications add constraint notifications_link_check
  check (link is null or link ~ '^/(?!/)[A-Za-z0-9/_\-?=&#.]*$');

-- AUD-07: every content change to a draft plan is attributed and audited.
alter table public.plan_versions add column if not exists last_edited_by uuid references auth.users (id) on delete set null;

create or replace function private.guard_plan_version() returns trigger
language plpgsql set search_path = '' as $$
begin
  if current_user in ('authenticated', 'anon') then
    if new.status <> old.status or new.organization_id <> old.organization_id or new.plan_id <> old.plan_id
       or new.version <> old.version or new.created_by is distinct from old.created_by
       or new.submitted_by is distinct from old.submitted_by or new.submitted_at is distinct from old.submitted_at
       or new.decided_at is distinct from old.decided_at or new.based_on_version_id is distinct from old.based_on_version_id
       or new.last_edited_by is distinct from old.last_edited_by then
      raise exception 'immutable_column' using errcode = 'P0001';
    end if;
    if old.status not in ('draft', 'changes_requested') then
      raise exception 'version_locked' using errcode = 'P0001', hint = 'Submitted, approved and rejected versions cannot be edited.';
    end if;
  elsif old.status in ('approved', 'rejected', 'superseded') and new.bundle <> old.bundle then
    raise exception 'version_locked' using errcode = 'P0001';
  end if;
  return new;
end $$;

create or replace function private.track_plan_edit() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.bundle is distinct from old.bundle then
    new.last_edited_by := auth.uid();
    perform private.audit(new.organization_id, 'plan.content_changed', 'plan_version', new.id::text,
      jsonb_build_object('version', new.version, 'role', (select m.role from public.organization_memberships m
                                                          where m.organization_id = new.organization_id and m.user_id = auth.uid())));
  end if;
  return new;
end $$;
revoke all on function private.track_plan_edit() from public;
drop trigger if exists plan_versions_track_edit on public.plan_versions;
create trigger plan_versions_track_edit before update on public.plan_versions
  for each row execute function private.track_plan_edit();

-- AUD-06: clinic uploads that never completed are removed after 24 hours.
create or replace function public.run_retention() returns void
language sql security definer set search_path = public as $$
  delete from public.extraction_runs where started_at < now() - interval '90 days';
  delete from public.documents where processing_status = 'uploading' and created_at < now() - interval '24 hours';
  delete from public.clinic_documents where processing_status = 'uploading' and created_at < now() - interval '24 hours';
$$;
revoke all on function public.run_retention() from public, anon, authenticated;

commit;
