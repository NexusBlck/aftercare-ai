-- AFTERCARE AI — multi-tenant clinic portal.
--
-- Additive only: no existing table, column or policy is changed. Patient-owned data (care_plans and
-- friends) keeps working exactly as before. Clinic-owned data lives in the tables below.
--
-- Tenant isolation is enforced in three layers:
--   1. composite foreign keys, so a row can never point at another organization's patient, episode or plan;
--   2. RLS on every table, keyed on auth.uid() and an *active* membership (never on a client-supplied org id);
--   3. SECURITY DEFINER functions for every consequential transition (approval, invitations, roles),
--      which re-check the caller's role themselves and write the audit log in the same transaction.
-- Direct writes by API users are further restricted by triggers (`current_user` is `authenticated` for
-- PostgREST requests and the function owner inside SECURITY DEFINER functions).

create schema if not exists private;
revoke all on schema private from public;
grant usage on schema private to authenticated;

-- ============================================================== fix: sign-up trigger (from 0002)
-- When user metadata has no "marketing_opt_in" key (users created from the dashboard, invited users,
-- other sign-in methods) the old expression was NULL and the NOT NULL profile column made the whole
-- auth.users insert fail. Missing means "not opted in".
create or replace function public.handle_new_user_consent() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  meta jsonb := coalesce(new.raw_user_meta_data, '{}'::jsonb);
  wants_marketing boolean := coalesce((meta ->> 'marketing_opt_in') = 'true', false);
begin
  if jsonb_typeof(meta -> 'legal') = 'object' then
    insert into public.legal_acceptances (user_id, document, version, source)
    select new.id, d.key, left(d.value #>> '{}', 40), 'signup'
    from jsonb_each(meta -> 'legal') as d
    where d.key in ('terms', 'privacy', 'health_data') and jsonb_typeof(d.value) = 'string'
    on conflict do nothing;
  end if;

  insert into public.profiles (id, marketing_opt_in, marketing_opt_in_at)
  values (new.id, wants_marketing, case when wants_marketing then now() end)
  on conflict (id) do nothing;
  return new;
end $$;
revoke all on function public.handle_new_user_consent() from public, anon, authenticated;

-- ============================================================== organizations & membership

create table public.organizations (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(btrim(name)) between 2 and 120),
  slug text not null unique check (slug ~ '^[a-z0-9](?:[a-z0-9-]{1,46}[a-z0-9])$'),
  org_type text not null default 'clinic' check (org_type in ('hospital', 'clinic', 'practice', 'other')),
  contact_email text check (contact_email is null or (char_length(contact_email) <= 254 and contact_email ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$')),
  contact_phone text check (contact_phone is null or char_length(contact_phone) <= 40),
  address text check (address is null or char_length(address) <= 300),
  city text check (city is null or char_length(city) <= 80),
  country text not null default 'PK' check (country ~ '^[A-Z]{2}$'),
  logo_path text,
  communication_hours text check (communication_hours is null or char_length(communication_hours) <= 300),
  emergency_instructions text check (emergency_instructions is null or char_length(emergency_instructions) <= 600),
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.organization_memberships (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  role text not null check (role in ('owner', 'admin', 'clinician', 'nurse')),
  -- May approve recovery plans. Always true for clinicians, never for nurses; optional for owners/admins
  -- who are themselves licensed clinicians (common in small practices).
  clinical_reviewer boolean not null default false,
  status text not null default 'active' check (status in ('active', 'revoked')),
  display_name text check (display_name is null or char_length(display_name) <= 80),
  email text check (email is null or char_length(email) <= 254),
  invited_by uuid references auth.users (id) on delete set null,
  revoked_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, user_id),
  check (role <> 'clinician' or clinical_reviewer),
  check (role <> 'nurse' or not clinical_reviewer),
  check ((status = 'revoked') = (revoked_at is not null))
);
create index memberships_user_idx on public.organization_memberships (user_id) where status = 'active';
-- Exactly one owner per organization.
create unique index memberships_one_owner on public.organization_memberships (organization_id) where role = 'owner';

create table public.staff_invitations (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  email text not null check (char_length(email) <= 254 and email = lower(email) and email ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
  role text not null check (role in ('admin', 'clinician', 'nurse')),
  clinical_reviewer boolean not null default false,
  token_hash text not null unique check (token_hash ~ '^[0-9a-f]{64}$'),
  expires_at timestamptz not null,
  created_by uuid references auth.users (id) on delete set null,
  accepted_by uuid references auth.users (id) on delete set null,
  accepted_at timestamptz,
  revoked_at timestamptz,
  created_at timestamptz not null default now(),
  check (role <> 'clinician' or clinical_reviewer),
  check (role <> 'nurse' or not clinical_reviewer)
);
create index staff_invitations_org_idx on public.staff_invitations (organization_id, created_at desc);

-- ============================================================== subscriptions (manual configuration)

create table public.subscriptions (
  organization_id uuid primary key references public.organizations (id) on delete cascade,
  plan text not null default 'starter' check (plan in ('starter', 'professional', 'enterprise')),
  status text not null default 'trialing' check (status in ('trialing', 'active', 'past_due', 'cancelled', 'suspended')),
  trial_ends_at timestamptz,
  current_period_start timestamptz,
  current_period_end timestamptz,
  external_reference text check (external_reference is null or char_length(external_reference) <= 120),
  notes text check (notes is null or char_length(notes) <= 500),
  updated_at timestamptz not null default now()
);

-- Billing history foundation. Rows are written by an operator (service role) only.
create table public.billing_events (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  kind text not null check (kind in ('invoice', 'payment', 'credit', 'adjustment')),
  amount_minor bigint not null,
  currency text not null default 'PKR' check (currency ~ '^[A-Z]{3}$'),
  reference text check (reference is null or char_length(reference) <= 120),
  description text check (description is null or char_length(description) <= 300),
  occurred_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);
create index billing_events_org_idx on public.billing_events (organization_id, occurred_at desc);

-- ============================================================== patients & care episodes

create table public.clinic_patients (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  mrn text check (mrn is null or char_length(mrn) between 1 and 40),
  full_name text not null check (char_length(btrim(full_name)) between 2 and 120),
  date_of_birth date not null check (date_of_birth > date '1900-01-01'),
  email text check (email is null or (char_length(email) <= 254 and email ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$')),
  phone text check (phone is null or char_length(phone) <= 40),
  preferred_language text not null default 'en' check (preferred_language in ('en', 'ur')),
  emergency_contact_name text check (emergency_contact_name is null or char_length(emergency_contact_name) <= 120),
  emergency_contact_phone text check (emergency_contact_phone is null or char_length(emergency_contact_phone) <= 40),
  consent_status text not null default 'not_recorded' check (consent_status in ('not_recorded', 'verbal', 'written', 'declined')),
  status text not null default 'active' check (status in ('active', 'archived')),
  user_id uuid references auth.users (id) on delete set null,
  linked_at timestamptz,
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, organization_id),
  -- A linked account always has a link time. The reverse is not required: when a patient deletes
  -- their account, user_id becomes NULL (ON DELETE SET NULL) and linked_at remains as history.
  check (user_id is null or linked_at is not null)
);
create unique index clinic_patients_mrn on public.clinic_patients (organization_id, mrn) where mrn is not null;
create unique index clinic_patients_user on public.clinic_patients (organization_id, user_id) where user_id is not null;
create index clinic_patients_org_idx on public.clinic_patients (organization_id, status, created_at desc);
create index clinic_patients_name_idx on public.clinic_patients (organization_id, lower(full_name));
create index clinic_patients_user_idx on public.clinic_patients (user_id) where user_id is not null;

create table public.care_episodes (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  patient_id uuid not null,
  title text not null check (char_length(btrim(title)) between 2 and 160),
  department text check (department is null or char_length(department) <= 80),
  admission_date date,
  discharge_date date,
  status text not null default 'open' check (status in ('open', 'closed')),
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (patient_id, organization_id) references public.clinic_patients (id, organization_id) on delete cascade,
  unique (id, organization_id, patient_id),
  check (discharge_date is null or admission_date is null or discharge_date >= admission_date)
);
create index care_episodes_patient_idx on public.care_episodes (patient_id, created_at desc);

-- ============================================================== documents

create table public.clinic_documents (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  patient_id uuid not null,
  episode_id uuid not null,
  file_path text not null unique,
  original_filename text not null check (char_length(original_filename) between 1 and 255),
  mime_type text not null check (mime_type in ('application/pdf', 'image/jpeg', 'image/png')),
  file_size integer not null check (file_size > 0),
  document_type text not null default 'unknown' check (document_type in (
    'discharge_summary', 'prescription', 'laboratory_report', 'imaging_report',
    'wound_care_instructions', 'follow_up_letter', 'other', 'unknown')),
  processing_status text not null default 'uploading' check (processing_status in (
    'uploading', 'uploaded', 'processing', 'processed', 'failed')),
  processing_error text check (processing_error is null or char_length(processing_error) <= 500),
  processing_started_at timestamptz,
  shared_with_patient boolean not null default false,
  uploaded_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (episode_id, organization_id, patient_id) references public.care_episodes (id, organization_id, patient_id) on delete cascade,
  unique (id, organization_id),
  -- Objects live at clinic/{organization_id}/{patient_id}/{uuid}.{ext}
  check (file_path = 'clinic/' || organization_id || '/' || patient_id || '/' || id || '.' || (case mime_type when 'application/pdf' then 'pdf' when 'image/jpeg' then 'jpg' else 'png' end))
);
create index clinic_documents_patient_idx on public.clinic_documents (patient_id, created_at desc);
create index clinic_documents_episode_idx on public.clinic_documents (episode_id);

-- ============================================================== recovery plans, versions, approvals

create table public.recovery_plans (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  patient_id uuid not null,
  episode_id uuid not null unique,
  title text not null check (char_length(btrim(title)) between 1 and 120),
  approved_version_id uuid,
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (episode_id, organization_id, patient_id) references public.care_episodes (id, organization_id, patient_id) on delete cascade,
  -- Direct link to the patient: tenant integrity, and lets the Data API embed the patient in plan queries.
  constraint recovery_plans_patient_fk foreign key (patient_id, organization_id) references public.clinic_patients (id, organization_id) on delete cascade,
  unique (id, organization_id),
  unique (id, organization_id, patient_id)
);
create index recovery_plans_patient_idx on public.recovery_plans (patient_id);

-- Each version is a snapshot of the plan (the same PlanBundle structure the patient app uses, validated
-- by the API before it is written). Approved, rejected and superseded versions are immutable.
create table public.plan_versions (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  plan_id uuid not null,
  version integer not null check (version >= 1),
  bundle jsonb not null check (jsonb_typeof(bundle) = 'object'),
  status text not null default 'draft' check (status in (
    'draft', 'pending_review', 'changes_requested', 'approved', 'rejected', 'superseded')),
  based_on_version_id uuid references public.plan_versions (id) on delete set null,
  -- Who last changed the content; set by trigger, so direct API writes are attributed too.
  last_edited_by uuid references auth.users (id) on delete set null,
  created_by uuid references auth.users (id) on delete set null,
  submitted_by uuid references auth.users (id) on delete set null,
  submitted_at timestamptz,
  decided_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- Named explicitly: the API embeds plans through this relationship (recovery_plans also references
  -- plan_versions via approved_version_id, so embeds must name which one).
  constraint plan_versions_plan_id_organization_id_fkey foreign key (plan_id, organization_id) references public.recovery_plans (id, organization_id) on delete cascade,
  unique (plan_id, version),
  unique (id, organization_id)
);
-- At most one version in progress per plan.
create unique index plan_versions_one_open on public.plan_versions (plan_id) where status in ('draft', 'pending_review', 'changes_requested');
create index plan_versions_status_idx on public.plan_versions (organization_id, status, updated_at desc);

alter table public.recovery_plans
  add constraint recovery_plans_approved_version_fk
  foreign key (approved_version_id, organization_id) references public.plan_versions (id, organization_id);

create table public.clinical_approvals (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  plan_id uuid not null,
  version_id uuid not null,
  version integer not null,
  clinician_user_id uuid references auth.users (id) on delete set null,
  clinician_name text,
  decision text not null check (decision in ('approved', 'rejected', 'changes_requested')),
  comments text check (comments is null or char_length(comments) <= 2000),
  decided_at timestamptz not null default now(),
  foreign key (version_id, organization_id) references public.plan_versions (id, organization_id) on delete cascade,
  foreign key (plan_id, organization_id) references public.recovery_plans (id, organization_id) on delete cascade
);
create index clinical_approvals_plan_idx on public.clinical_approvals (plan_id, decided_at desc);

-- ============================================================== patient invitations & progress

create table public.patient_invitations (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  patient_id uuid not null,
  token_hash text not null unique check (token_hash ~ '^[0-9a-f]{64}$'),
  expires_at timestamptz not null,
  failed_attempts integer not null default 0 check (failed_attempts >= 0),
  delivery_channel text not null default 'manual' check (delivery_channel in ('manual', 'email')),
  delivery_status text not null default 'not_sent' check (delivery_status in ('not_sent', 'sent', 'failed')),
  created_by uuid references auth.users (id) on delete set null,
  redeemed_by uuid references auth.users (id) on delete set null,
  redeemed_at timestamptz,
  revoked_at timestamptz,
  created_at timestamptz not null default now(),
  foreign key (patient_id, organization_id) references public.clinic_patients (id, organization_id) on delete cascade
);
create index patient_invitations_patient_idx on public.patient_invitations (patient_id, created_at desc);

-- What the patient has acknowledged or completed in an approved version. The approved instructions
-- themselves are never editable by the patient.
create table public.patient_progress (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  patient_id uuid not null,
  version_id uuid not null,
  item_kind text not null check (item_kind in ('task', 'medication', 'warning_signs', 'plan')),
  item_id text not null check (char_length(item_id) between 1 and 64),
  action text not null check (action in ('completed', 'acknowledged')),
  user_id uuid not null references auth.users (id) on delete cascade,
  created_at timestamptz not null default now(),
  foreign key (version_id, organization_id) references public.plan_versions (id, organization_id) on delete cascade,
  foreign key (patient_id, organization_id) references public.clinic_patients (id, organization_id) on delete cascade,
  unique (version_id, item_kind, item_id, action)
);
create index patient_progress_patient_idx on public.patient_progress (patient_id, created_at desc);

-- Follow-up tracking keeps patient-reported attendance separate from staff-verified attendance.
create table public.follow_up_tracking (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  patient_id uuid not null,
  plan_id uuid not null,
  follow_up_item_id text not null check (char_length(follow_up_item_id) between 1 and 64),
  patient_status text not null default 'none' check (patient_status in ('none', 'reported_attended', 'reported_missed', 'reported_rescheduled')),
  patient_note text check (patient_note is null or char_length(patient_note) <= 500),
  patient_reported_at timestamptz,
  staff_status text not null default 'unverified' check (staff_status in ('unverified', 'verified_attended', 'verified_missed', 'cancelled')),
  staff_note text check (staff_note is null or char_length(staff_note) <= 500),
  verified_by uuid references auth.users (id) on delete set null,
  verified_at timestamptz,
  updated_at timestamptz not null default now(),
  foreign key (plan_id, organization_id, patient_id) references public.recovery_plans (id, organization_id, patient_id) on delete cascade,
  unique (plan_id, follow_up_item_id)
);

-- ============================================================== questions to the care team

create table public.patient_questions (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  patient_id uuid not null,
  plan_id uuid,
  subject text not null check (char_length(btrim(subject)) between 3 and 140),
  status text not null default 'new' check (status in ('new', 'assigned', 'in_progress', 'responded', 'closed')),
  urgent_keywords boolean not null default false,
  assigned_to uuid references auth.users (id) on delete set null,
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (patient_id, organization_id) references public.clinic_patients (id, organization_id) on delete cascade,
  foreign key (plan_id, organization_id, patient_id) references public.recovery_plans (id, organization_id, patient_id) on delete set null (plan_id),
  unique (id, organization_id)
);
create index patient_questions_org_idx on public.patient_questions (organization_id, status, updated_at desc);
create index patient_questions_patient_idx on public.patient_questions (patient_id, updated_at desc);

create table public.question_messages (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  question_id uuid not null,
  author_user_id uuid references auth.users (id) on delete set null,
  author_kind text not null check (author_kind in ('patient', 'staff')),
  author_name text check (author_name is null or char_length(author_name) <= 80),
  body text not null check (char_length(btrim(body)) between 1 and 4000),
  created_at timestamptz not null default now(),
  foreign key (question_id, organization_id) references public.patient_questions (id, organization_id) on delete cascade
);
create index question_messages_question_idx on public.question_messages (question_id, created_at);

-- ============================================================== notifications & audit

create table public.notifications (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid references public.organizations (id) on delete cascade,
  recipient_user_id uuid not null references auth.users (id) on delete cascade,
  type text not null check (type in (
    'patient_invitation', 'plan_approved', 'plan_submitted', 'follow_up_due', 'follow_up_overdue',
    'question_submitted', 'question_responded', 'staff_invitation')),
  -- Previews never contain medical details: generic title + a link into the app.
  title text not null check (char_length(title) <= 140),
  -- Same-site paths only: "/x" yes, "//host" (protocol-relative, off-site) no.
  link text check (link is null or link ~ '^/(?!/)[A-Za-z0-9/_\-?=&#.]*$'),
  channel text not null default 'in_app' check (channel in ('in_app', 'email', 'sms')),
  delivery_status text not null default 'delivered' check (delivery_status in ('pending', 'delivered', 'failed', 'not_configured')),
  read_at timestamptz,
  created_at timestamptz not null default now()
);
create index notifications_recipient_idx on public.notifications (recipient_user_id, created_at desc);

create table public.audit_logs (
  id bigint generated always as identity primary key,
  organization_id uuid references public.organizations (id) on delete cascade,
  actor_user_id uuid references auth.users (id) on delete set null,
  action text not null check (action ~ '^[a-z_]+\.[a-z_]+$'),
  resource_type text not null check (char_length(resource_type) <= 40),
  resource_id text check (resource_id is null or char_length(resource_id) <= 64),
  -- Non-sensitive identifiers only (roles, versions, statuses). Never document text or medical details.
  metadata jsonb not null default '{}'::jsonb check (jsonb_typeof(metadata) = 'object'),
  created_at timestamptz not null default now()
);
create index audit_logs_org_idx on public.audit_logs (organization_id, created_at desc);

-- ============================================================== updated_at triggers

do $$
declare t text;
begin
  foreach t in array array['organizations','organization_memberships','clinic_patients','care_episodes','clinic_documents',
                           'recovery_plans','plan_versions','follow_up_tracking','patient_questions','subscriptions']
  loop
    execute format('create trigger %I_updated_at before update on public.%I for each row execute function public.set_updated_at()', t, t);
  end loop;
end $$;

-- ============================================================== private helpers

-- Is the caller an *active* member of the organization with one of the given roles?
create or replace function private.has_role(org uuid, roles text[]) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.organization_memberships m
    where m.organization_id = org and m.user_id = auth.uid() and m.status = 'active' and m.role = any (roles)
  );
$$;

create or replace function private.is_staff(org uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select private.has_role(org, array['owner', 'admin', 'clinician', 'nurse']);
$$;

create or replace function private.is_reviewer(org uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.organization_memberships m
    where m.organization_id = org and m.user_id = auth.uid() and m.status = 'active' and m.clinical_reviewer
  );
$$;

-- Is the caller the linked, active patient for this clinic patient record?
create or replace function private.is_patient(patient uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.clinic_patients p where p.id = patient and p.user_id = auth.uid() and p.status = 'active'
  );
$$;

-- A patient may see only the currently approved version of their own plans.
create or replace function private.patient_can_view_version(version uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.recovery_plans rp
    join public.clinic_patients p on p.id = rp.patient_id
    where rp.approved_version_id = version and p.user_id = auth.uid() and p.status = 'active'
  );
$$;

create or replace function private.audit(org uuid, act text, rtype text, rid text, meta jsonb default '{}'::jsonb) returns void
language sql security definer set search_path = '' as $$
  insert into public.audit_logs (organization_id, actor_user_id, action, resource_type, resource_id, metadata)
  values (org, auth.uid(), act, rtype, rid, coalesce(meta, '{}'::jsonb));
$$;

create or replace function private.notify(org uuid, recipient uuid, ntype text, ntitle text, nlink text) returns void
language sql security definer set search_path = '' as $$
  insert into public.notifications (organization_id, recipient_user_id, type, title, link)
  select org, recipient, ntype, ntitle, nlink where recipient is not null;
$$;

create or replace function private.new_token() returns text
language sql volatile set search_path = '' as $$
  select replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', '');
$$;

create or replace function private.hash_token(token text) returns text
language sql immutable set search_path = '' as $$
  select encode(sha256(convert_to(token, 'UTF8')), 'hex');
$$;

create or replace function private.member_name(org uuid) returns text
language sql stable security definer set search_path = '' as $$
  select coalesce(m.display_name, m.email) from public.organization_memberships m
  where m.organization_id = org and m.user_id = auth.uid();
$$;

-- Plan limits. NULL means unlimited. Kept in one place so the API and the database agree.
create or replace function private.plan_limits(plan_name text) returns jsonb
language sql immutable set search_path = '' as $$
  select case plan_name
    when 'starter' then '{"active_patients": 50, "staff": 10, "episodes_per_month": 100, "storage_mb": 2048, "advanced_analytics": false, "custom_branding": false, "integrations": false}'::jsonb
    when 'professional' then '{"active_patients": 1000, "staff": 25, "episodes_per_month": 2000, "storage_mb": 51200, "advanced_analytics": true, "custom_branding": true, "integrations": false}'::jsonb
    else '{"active_patients": null, "staff": null, "episodes_per_month": null, "storage_mb": null, "advanced_analytics": true, "custom_branding": true, "integrations": true}'::jsonb
  end;
$$;

-- Raises unless the subscription allows writes and the named resource is under its limit.
create or replace function private.check_entitlement(org uuid, resource text) returns void
language plpgsql stable security definer set search_path = '' as $$
declare
  sub public.subscriptions;
  lim bigint;
  used bigint;
begin
  select * into sub from public.subscriptions where organization_id = org;
  if sub is null or sub.status in ('cancelled', 'suspended')
     or (sub.status = 'trialing' and sub.trial_ends_at is not null and sub.trial_ends_at < now()) then
    raise exception 'subscription_inactive' using errcode = 'P0001', hint = 'The clinic subscription is not active.';
  end if;
  if resource is null then return; end if;
  lim := (private.plan_limits(sub.plan) ->> resource)::bigint;
  if lim is null then return; end if;
  if resource = 'active_patients' then
    select count(*) into used from public.clinic_patients where organization_id = org and status = 'active';
  elsif resource = 'staff' then
    select (select count(*) from public.organization_memberships where organization_id = org and status = 'active')
         + (select count(*) from public.staff_invitations where organization_id = org and accepted_at is null and revoked_at is null and expires_at > now())
      into used;
  elsif resource = 'episodes_per_month' then
    select count(*) into used from public.care_episodes where organization_id = org and created_at >= date_trunc('month', now());
  else
    return;
  end if;
  if used >= lim then
    raise exception 'plan_limit_reached' using errcode = 'P0001', hint = resource;
  end if;
end $$;

revoke all on all functions in schema private from public;
grant execute on function private.has_role(uuid, text[]), private.is_staff(uuid), private.is_reviewer(uuid),
  private.is_patient(uuid), private.patient_can_view_version(uuid) to authenticated;

-- ============================================================== write guards (triggers)

-- Columns that tie a row to its tenant or to a person can only change inside SECURITY DEFINER functions.
create or replace function private.guard_clinic_patient() returns trigger
language plpgsql set search_path = '' as $$
begin
  if current_user in ('authenticated', 'anon') then
    if new.organization_id <> old.organization_id or new.user_id is distinct from old.user_id
       or new.linked_at is distinct from old.linked_at or new.created_by is distinct from old.created_by then
      raise exception 'immutable_column' using errcode = 'P0001';
    end if;
    if new.status <> old.status and not private.has_role(old.organization_id, array['owner', 'admin']) then
      raise exception 'forbidden' using errcode = 'P0001', hint = 'Only clinic owners and administrators can archive patients.';
    end if;
    if new.status = 'active' and old.status = 'archived' then
      perform private.check_entitlement(old.organization_id, 'active_patients');
    end if;
  end if;
  return new;
end $$;
create trigger clinic_patients_guard before update on public.clinic_patients for each row execute function private.guard_clinic_patient();

create or replace function private.guard_clinic_patient_insert() returns trigger
language plpgsql set search_path = '' as $$
begin
  if current_user in ('authenticated', 'anon') then
    perform private.check_entitlement(new.organization_id, 'active_patients');
    new.user_id := null;
    new.linked_at := null;
    new.status := 'active';
    new.created_by := auth.uid();
  end if;
  return new;
end $$;
create trigger clinic_patients_guard_insert before insert on public.clinic_patients for each row execute function private.guard_clinic_patient_insert();

create or replace function private.guard_episode() returns trigger
language plpgsql set search_path = '' as $$
begin
  if current_user in ('authenticated', 'anon') then
    if tg_op = 'INSERT' then
      perform private.check_entitlement(new.organization_id, 'episodes_per_month');
      new.created_by := auth.uid();
    elsif new.organization_id <> old.organization_id or new.patient_id <> old.patient_id or new.created_by is distinct from old.created_by then
      raise exception 'immutable_column' using errcode = 'P0001';
    end if;
  end if;
  return new;
end $$;
create trigger care_episodes_guard before insert or update on public.care_episodes for each row execute function private.guard_episode();

create or replace function private.guard_document() returns trigger
language plpgsql set search_path = '' as $$
begin
  if current_user in ('authenticated', 'anon') then
    if tg_op = 'INSERT' then
      perform private.check_entitlement(new.organization_id, null);
      new.uploaded_by := auth.uid();
      new.processing_status := 'uploading';
      new.shared_with_patient := false;
    elsif new.organization_id <> old.organization_id or new.patient_id <> old.patient_id or new.episode_id <> old.episode_id
          or new.file_path <> old.file_path or new.uploaded_by is distinct from old.uploaded_by
          or new.mime_type <> old.mime_type or new.file_size <> old.file_size then
      raise exception 'immutable_column' using errcode = 'P0001';
    elsif new.shared_with_patient <> old.shared_with_patient and not private.is_reviewer(old.organization_id)
          and not private.has_role(old.organization_id, array['owner', 'admin']) then
      raise exception 'forbidden' using errcode = 'P0001', hint = 'Only clinicians and administrators can share documents with patients.';
    end if;
  end if;
  return new;
end $$;
create trigger clinic_documents_guard before insert or update on public.clinic_documents for each row execute function private.guard_document();

-- Plan content can be edited only while a version is a draft (or returned for changes); status
-- transitions happen only through the review functions below.
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
create trigger plan_versions_guard before update on public.plan_versions for each row execute function private.guard_plan_version();

-- Every content change to a draft is attributed and audited in the database, whichever path wrote it
-- (the API, AI processing, or a direct Data API call by any staff member).
create or replace function private.track_plan_edit() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.bundle is distinct from old.bundle then
    new.last_edited_by := auth.uid();
    perform private.audit(new.organization_id, 'plan.content_changed', 'plan_version', new.id::text,
      jsonb_build_object('version', new.version, 'role', (select m.role from public.organization_memberships m
                                                          where m.organization_id = new.organization_id and m.user_id = auth.uid())));
  end if;
  -- Forging last_edited_by is refused by private.guard_plan_version, which runs first, as the caller.
  return new;
end $$;
revoke all on function private.track_plan_edit() from public;
create trigger plan_versions_track_edit before update on public.plan_versions for each row execute function private.track_plan_edit();

-- Retention: clinic uploads that never completed are removed after 24 hours (extends 0002's job).
create or replace function public.run_retention() returns void
language sql security definer set search_path = public as $$
  delete from public.extraction_runs where started_at < now() - interval '90 days';
  delete from public.documents where processing_status = 'uploading' and created_at < now() - interval '24 hours';
  delete from public.clinic_documents where processing_status = 'uploading' and created_at < now() - interval '24 hours';
$$;
revoke all on function public.run_retention() from public, anon, authenticated;

create or replace function private.guard_recovery_plan() returns trigger
language plpgsql set search_path = '' as $$
begin
  if current_user in ('authenticated', 'anon')
     and (new.approved_version_id is distinct from old.approved_version_id or new.organization_id <> old.organization_id
          or new.patient_id <> old.patient_id or new.episode_id <> old.episode_id) then
    raise exception 'immutable_column' using errcode = 'P0001';
  end if;
  return new;
end $$;
create trigger recovery_plans_guard before update on public.recovery_plans for each row execute function private.guard_recovery_plan();

revoke all on all functions in schema private from public;
-- Policies and guard triggers run as the calling user, so these read-only checks must be executable.
grant execute on function private.has_role(uuid, text[]), private.is_staff(uuid), private.is_reviewer(uuid),
  private.is_patient(uuid), private.patient_can_view_version(uuid), private.check_entitlement(uuid, text) to authenticated;

-- ============================================================== row level security

alter table public.organizations enable row level security;
alter table public.organization_memberships enable row level security;
alter table public.staff_invitations enable row level security;
alter table public.subscriptions enable row level security;
alter table public.billing_events enable row level security;
alter table public.clinic_patients enable row level security;
alter table public.care_episodes enable row level security;
alter table public.clinic_documents enable row level security;
alter table public.recovery_plans enable row level security;
alter table public.plan_versions enable row level security;
alter table public.clinical_approvals enable row level security;
alter table public.patient_invitations enable row level security;
alter table public.patient_progress enable row level security;
alter table public.follow_up_tracking enable row level security;
alter table public.patient_questions enable row level security;
alter table public.question_messages enable row level security;
alter table public.notifications enable row level security;
alter table public.audit_logs enable row level security;

-- Organizations: members read; owners/admins edit profile fields. Created only via create_organization().
-- Linked patients may read the clinic's public contact details (name, hours, emergency instructions).
create policy organizations_select on public.organizations for select to authenticated
  using (private.is_staff(id) or exists (
    select 1 from public.clinic_patients p where p.organization_id = organizations.id and p.user_id = auth.uid() and p.status = 'active'));
create policy organizations_update on public.organizations for update to authenticated
  using (private.has_role(id, array['owner', 'admin'])) with check (private.has_role(id, array['owner', 'admin']));

create policy memberships_select on public.organization_memberships for select to authenticated
  using (user_id = auth.uid() or private.is_staff(organization_id));

create policy staff_invitations_select on public.staff_invitations for select to authenticated
  using (private.has_role(organization_id, array['owner', 'admin']));

create policy subscriptions_select on public.subscriptions for select to authenticated
  using (private.is_staff(organization_id));
create policy billing_events_select on public.billing_events for select to authenticated
  using (private.has_role(organization_id, array['owner', 'admin']));

create policy clinic_patients_select on public.clinic_patients for select to authenticated
  using (private.is_staff(organization_id) or (user_id = auth.uid() and status = 'active'));
create policy clinic_patients_insert on public.clinic_patients for insert to authenticated
  with check (private.is_staff(organization_id));
create policy clinic_patients_update on public.clinic_patients for update to authenticated
  using (private.is_staff(organization_id)) with check (private.is_staff(organization_id));

create policy care_episodes_select on public.care_episodes for select to authenticated
  using (private.is_staff(organization_id) or private.is_patient(patient_id));
create policy care_episodes_insert on public.care_episodes for insert to authenticated
  with check (private.is_staff(organization_id));
create policy care_episodes_update on public.care_episodes for update to authenticated
  using (private.is_staff(organization_id)) with check (private.is_staff(organization_id));

create policy clinic_documents_select on public.clinic_documents for select to authenticated
  using (private.is_staff(organization_id) or (shared_with_patient and processing_status <> 'uploading' and private.is_patient(patient_id)));
create policy clinic_documents_insert on public.clinic_documents for insert to authenticated
  with check (private.is_staff(organization_id));
create policy clinic_documents_update on public.clinic_documents for update to authenticated
  using (private.is_staff(organization_id)) with check (private.is_staff(organization_id));
create policy clinic_documents_delete on public.clinic_documents for delete to authenticated
  using (private.has_role(organization_id, array['owner', 'admin']));

create policy recovery_plans_select on public.recovery_plans for select to authenticated
  using (private.is_staff(organization_id) or (approved_version_id is not null and private.is_patient(patient_id)));
create policy recovery_plans_update on public.recovery_plans for update to authenticated
  using (private.is_staff(organization_id)) with check (private.is_staff(organization_id));

create policy plan_versions_select on public.plan_versions for select to authenticated
  using (private.is_staff(organization_id) or private.patient_can_view_version(id));
-- Drafts are written by staff (AI processing may be started by any staff member); only clinical
-- reviewers can move a version to approved, via decide_plan_version().
create policy plan_versions_update on public.plan_versions for update to authenticated
  using (private.is_staff(organization_id)) with check (private.is_staff(organization_id));

create policy clinical_approvals_select on public.clinical_approvals for select to authenticated
  using (private.is_staff(organization_id) or (decision = 'approved' and private.patient_can_view_version(version_id)));

create policy patient_invitations_select on public.patient_invitations for select to authenticated
  using (private.is_staff(organization_id));

create policy patient_progress_select on public.patient_progress for select to authenticated
  using (private.is_staff(organization_id) or user_id = auth.uid());
create policy patient_progress_insert on public.patient_progress for insert to authenticated
  with check (user_id = auth.uid() and private.is_patient(patient_id) and private.patient_can_view_version(version_id)
              and exists (select 1 from public.recovery_plans rp join public.plan_versions v on v.plan_id = rp.id
                          where v.id = version_id and rp.patient_id = patient_progress.patient_id));
create policy patient_progress_delete on public.patient_progress for delete to authenticated
  using (user_id = auth.uid() and private.patient_can_view_version(version_id));

create policy follow_up_tracking_select on public.follow_up_tracking for select to authenticated
  using (private.is_staff(organization_id) or private.is_patient(patient_id));

create policy patient_questions_select on public.patient_questions for select to authenticated
  using (private.is_staff(organization_id) or private.is_patient(patient_id));
create policy question_messages_select on public.question_messages for select to authenticated
  using (private.is_staff(organization_id) or exists (
    select 1 from public.patient_questions q where q.id = question_id and private.is_patient(q.patient_id)));

create policy notifications_select on public.notifications for select to authenticated
  using (recipient_user_id = auth.uid());
create policy notifications_update on public.notifications for update to authenticated
  using (recipient_user_id = auth.uid()) with check (recipient_user_id = auth.uid());

create policy audit_logs_select on public.audit_logs for select to authenticated
  using (private.has_role(organization_id, array['owner', 'admin']));
-- No insert/update/delete policies on audit_logs: rows are written only by SECURITY DEFINER functions.

-- Notifications: a recipient may only mark them read.
create or replace function private.guard_notification() returns trigger
language plpgsql set search_path = '' as $$
begin
  if current_user in ('authenticated', 'anon') and (
     new.recipient_user_id <> old.recipient_user_id or new.type <> old.type or new.title <> old.title
     or new.link is distinct from old.link or new.organization_id is distinct from old.organization_id
     or new.channel <> old.channel or new.delivery_status <> old.delivery_status) then
    raise exception 'immutable_column' using errcode = 'P0001';
  end if;
  return new;
end $$;
create trigger notifications_guard before update on public.notifications for each row execute function private.guard_notification();
revoke all on function private.guard_notification() from public;

-- Anonymous users have no access to any clinic table.
revoke all on public.organizations, public.organization_memberships, public.staff_invitations, public.subscriptions,
  public.billing_events, public.clinic_patients, public.care_episodes, public.clinic_documents, public.recovery_plans,
  public.plan_versions, public.clinical_approvals, public.patient_invitations, public.patient_progress,
  public.follow_up_tracking, public.patient_questions, public.question_messages, public.notifications, public.audit_logs
  from anon;

-- ============================================================== RPC: organizations & staff

create or replace function public.create_organization(
  p_name text, p_slug text, p_org_type text, p_contact_email text, p_contact_phone text, p_city text,
  p_owner_name text, p_owner_is_clinician boolean
) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  uid uuid := auth.uid();
  org uuid;
  owner_email text;
begin
  if uid is null then raise exception 'unauthorized' using errcode = 'P0001'; end if;
  if (select count(*) from public.organization_memberships where user_id = uid and role = 'owner') >= 3 then
    raise exception 'too_many_organizations' using errcode = 'P0001';
  end if;
  if exists (select 1 from public.organizations where slug = p_slug) then
    raise exception 'slug_taken' using errcode = 'P0001';
  end if;
  select email into owner_email from auth.users where id = uid;

  insert into public.organizations (name, slug, org_type, contact_email, contact_phone, city, created_by)
  values (btrim(p_name), p_slug, coalesce(p_org_type, 'clinic'), nullif(btrim(p_contact_email), ''), nullif(btrim(p_contact_phone), ''),
          nullif(btrim(p_city), ''), uid)
  returning id into org;

  insert into public.organization_memberships (organization_id, user_id, role, clinical_reviewer, display_name, email)
  values (org, uid, 'owner', coalesce(p_owner_is_clinician, false), nullif(btrim(p_owner_name), ''), lower(owner_email));

  -- New clinics start on a 30-day Starter trial; paid plans are configured by an operator.
  insert into public.subscriptions (organization_id, plan, status, trial_ends_at)
  values (org, 'starter', 'trialing', now() + interval '30 days');

  perform private.audit(org, 'organization.created', 'organization', org::text, jsonb_build_object('org_type', coalesce(p_org_type, 'clinic')));
  return org;
end $$;

-- Returns the one-time plaintext token. Only its SHA-256 hash is stored.
create or replace function public.create_staff_invitation(p_org uuid, p_email text, p_role text, p_clinical_reviewer boolean, p_ttl_hours integer default 168)
returns table (invitation_id uuid, token text, expires_at timestamptz)
language plpgsql security definer set search_path = '' as $$
declare
  t text := private.new_token();
  inv uuid;
  exp timestamptz := now() + make_interval(hours => least(greatest(coalesce(p_ttl_hours, 168), 1), 336));
  em text := lower(btrim(p_email));
  reviewer boolean := case p_role when 'clinician' then true when 'nurse' then false else coalesce(p_clinical_reviewer, false) end;
begin
  if not private.has_role(p_org, array['owner', 'admin']) then raise exception 'forbidden' using errcode = 'P0001'; end if;
  -- Only the owner can invite administrators.
  if p_role = 'admin' and not private.has_role(p_org, array['owner']) then raise exception 'forbidden' using errcode = 'P0001'; end if;
  if p_role not in ('admin', 'clinician', 'nurse') then raise exception 'invalid_role' using errcode = 'P0001'; end if;
  if exists (select 1 from public.organization_memberships m where m.organization_id = p_org and m.status = 'active' and lower(m.email) = em) then
    raise exception 'already_member' using errcode = 'P0001';
  end if;
  perform private.check_entitlement(p_org, 'staff');
  -- A new invitation replaces any pending one for the same address.
  update public.staff_invitations si set revoked_at = now()
    where si.organization_id = p_org and si.email = em and si.accepted_at is null and si.revoked_at is null;
  insert into public.staff_invitations (organization_id, email, role, clinical_reviewer, token_hash, expires_at, created_by)
  values (p_org, em, p_role, reviewer, private.hash_token(t), exp, auth.uid())
  returning id into inv;
  perform private.audit(p_org, 'staff.invited', 'staff_invitation', inv::text, jsonb_build_object('role', p_role, 'clinical_reviewer', reviewer));
  return query select inv, t, exp;
end $$;

-- The signed-in user's email must match the invited address, so a leaked link alone is not enough.
create or replace function public.accept_staff_invitation(p_token text, p_display_name text)
returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  uid uuid := auth.uid();
  inv public.staff_invitations;
  user_email text;
begin
  if uid is null then raise exception 'unauthorized' using errcode = 'P0001'; end if;
  select * into inv from public.staff_invitations where token_hash = private.hash_token(coalesce(p_token, '')) for update;
  if inv is null or inv.revoked_at is not null then raise exception 'invitation_invalid' using errcode = 'P0001'; end if;
  if inv.accepted_at is not null then raise exception 'invitation_used' using errcode = 'P0001'; end if;
  if inv.expires_at < now() then raise exception 'invitation_expired' using errcode = 'P0001'; end if;
  select lower(email) into user_email from auth.users where id = uid;
  if user_email is distinct from inv.email then raise exception 'invitation_email_mismatch' using errcode = 'P0001'; end if;

  insert into public.organization_memberships (organization_id, user_id, role, clinical_reviewer, display_name, email, invited_by)
  values (inv.organization_id, uid, inv.role, inv.clinical_reviewer, nullif(btrim(p_display_name), ''), user_email, inv.created_by)
  on conflict (organization_id, user_id) do update
    set role = excluded.role, clinical_reviewer = excluded.clinical_reviewer, status = 'active', revoked_at = null,
        display_name = coalesce(excluded.display_name, public.organization_memberships.display_name)
    where public.organization_memberships.role <> 'owner';

  update public.staff_invitations set accepted_at = now(), accepted_by = uid where id = inv.id;
  perform private.audit(inv.organization_id, 'staff.joined', 'membership', uid::text, jsonb_build_object('role', inv.role));
  return inv.organization_id;
end $$;

create or replace function public.revoke_staff_invitation(p_invitation uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare inv public.staff_invitations;
begin
  select * into inv from public.staff_invitations where id = p_invitation;
  if inv is null or not private.has_role(inv.organization_id, array['owner', 'admin']) then raise exception 'not_found' using errcode = 'P0001'; end if;
  update public.staff_invitations set revoked_at = now() where id = p_invitation and accepted_at is null and revoked_at is null;
  perform private.audit(inv.organization_id, 'staff.invitation_revoked', 'staff_invitation', p_invitation::text);
end $$;

-- Owners manage everyone except themselves; admins manage clinicians and nurses only.
create or replace function public.update_member(p_membership uuid, p_role text, p_clinical_reviewer boolean, p_status text)
returns void
language plpgsql security definer set search_path = '' as $$
declare
  m public.organization_memberships;
  new_role text;
  new_reviewer boolean;
begin
  select * into m from public.organization_memberships where id = p_membership for update;
  if m is null or not private.has_role(m.organization_id, array['owner', 'admin']) then raise exception 'not_found' using errcode = 'P0001'; end if;
  if m.user_id = auth.uid() then raise exception 'cannot_change_self' using errcode = 'P0001'; end if;
  if m.role = 'owner' then raise exception 'forbidden' using errcode = 'P0001'; end if;
  new_role := coalesce(p_role, m.role);
  if new_role not in ('admin', 'clinician', 'nurse') then raise exception 'invalid_role' using errcode = 'P0001'; end if;
  if (m.role = 'admin' or new_role = 'admin') and not private.has_role(m.organization_id, array['owner']) then
    raise exception 'forbidden' using errcode = 'P0001';
  end if;
  new_reviewer := case new_role when 'clinician' then true when 'nurse' then false else coalesce(p_clinical_reviewer, m.clinical_reviewer) end;
  if coalesce(p_status, m.status) = 'active' and m.status = 'revoked' then
    perform private.check_entitlement(m.organization_id, 'staff');
  end if;

  update public.organization_memberships
    set role = new_role, clinical_reviewer = new_reviewer, status = coalesce(p_status, m.status),
        revoked_at = case when coalesce(p_status, m.status) = 'revoked' then coalesce(m.revoked_at, now()) else null end
    where id = p_membership;

  if coalesce(p_status, m.status) <> m.status then
    perform private.audit(m.organization_id, case when p_status = 'revoked' then 'staff.revoked' else 'staff.reinstated' end,
                          'membership', m.user_id::text, jsonb_build_object('role', new_role));
  end if;
  if new_role <> m.role or new_reviewer <> m.clinical_reviewer then
    perform private.audit(m.organization_id, 'staff.role_changed', 'membership', m.user_id::text,
                          jsonb_build_object('from', m.role, 'to', new_role, 'clinical_reviewer', new_reviewer));
  end if;
end $$;

-- ============================================================== RPC: plans and clinical review

create or replace function public.create_recovery_plan(p_episode uuid, p_title text, p_bundle jsonb)
returns table (plan_id uuid, version_id uuid)
language plpgsql security definer set search_path = '' as $$
declare
  ep public.care_episodes;
  pid uuid;
  vid uuid;
begin
  select * into ep from public.care_episodes where id = p_episode;
  if ep is null or not private.is_staff(ep.organization_id) then raise exception 'not_found' using errcode = 'P0001'; end if;
  perform private.check_entitlement(ep.organization_id, null);
  if exists (select 1 from public.recovery_plans where episode_id = p_episode) then raise exception 'plan_exists' using errcode = 'P0001'; end if;
  insert into public.recovery_plans (organization_id, patient_id, episode_id, title, created_by)
  values (ep.organization_id, ep.patient_id, ep.id, left(btrim(p_title), 120), auth.uid()) returning id into pid;
  insert into public.plan_versions (organization_id, plan_id, version, bundle, status, created_by)
  values (ep.organization_id, pid, 1, p_bundle, 'draft', auth.uid()) returning id into vid;
  perform private.audit(ep.organization_id, 'plan.created', 'recovery_plan', pid::text, jsonb_build_object('version', 1));
  return query select pid, vid;
end $$;

create or replace function public.submit_plan_version(p_version uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare v public.plan_versions; reviewer record;
begin
  select * into v from public.plan_versions where id = p_version for update;
  if v is null or not private.is_staff(v.organization_id) then raise exception 'not_found' using errcode = 'P0001'; end if;
  if v.status not in ('draft', 'changes_requested') then raise exception 'invalid_transition' using errcode = 'P0001'; end if;
  update public.plan_versions set status = 'pending_review', submitted_by = auth.uid(), submitted_at = now() where id = p_version;
  perform private.audit(v.organization_id, 'plan.submitted', 'plan_version', p_version::text, jsonb_build_object('version', v.version));
  for reviewer in
    select user_id from public.organization_memberships
    where organization_id = v.organization_id and status = 'active' and clinical_reviewer and user_id <> auth.uid()
  loop
    perform private.notify(v.organization_id, reviewer.user_id, 'plan_submitted', 'A recovery plan is waiting for clinical review', '/clinic/review');
  end loop;
end $$;

-- Explicit, attributable decision by an active clinical reviewer. Approval makes this version the one
-- patients see and supersedes the previously approved version.
create or replace function public.decide_plan_version(p_version uuid, p_decision text, p_comments text)
returns void
language plpgsql security definer set search_path = '' as $$
declare
  v public.plan_versions;
  rp public.recovery_plans;
  patient_user uuid;
begin
  select * into v from public.plan_versions where id = p_version for update;
  if v is null or not private.is_staff(v.organization_id) then raise exception 'not_found' using errcode = 'P0001'; end if;
  if not private.is_reviewer(v.organization_id) then raise exception 'forbidden' using errcode = 'P0001', hint = 'Only clinical reviewers can decide on recovery plans.'; end if;
  if p_decision not in ('approved', 'rejected', 'changes_requested') then raise exception 'invalid_decision' using errcode = 'P0001'; end if;
  if v.status <> 'pending_review' then raise exception 'invalid_transition' using errcode = 'P0001'; end if;
  if p_decision <> 'approved' and coalesce(btrim(p_comments), '') = '' then raise exception 'comment_required' using errcode = 'P0001'; end if;
  select * into rp from public.recovery_plans where id = v.plan_id for update;

  if p_decision = 'approved' then
    update public.plan_versions set status = 'superseded' where plan_id = v.plan_id and status = 'approved';
    update public.plan_versions set status = 'approved', decided_at = now() where id = p_version;
    update public.recovery_plans set approved_version_id = p_version where id = v.plan_id;
    select user_id into patient_user from public.clinic_patients where id = rp.patient_id and status = 'active';
    perform private.notify(v.organization_id, patient_user, 'plan_approved', 'Your care team has shared an updated recovery plan', '/care-team');
  else
    update public.plan_versions set status = p_decision, decided_at = now() where id = p_version;
  end if;

  insert into public.clinical_approvals (organization_id, plan_id, version_id, version, clinician_user_id, clinician_name, decision, comments)
  values (v.organization_id, v.plan_id, p_version, v.version, auth.uid(), private.member_name(v.organization_id), p_decision, nullif(btrim(p_comments), ''));
  perform private.audit(v.organization_id, 'plan.' || p_decision, 'plan_version', p_version::text, jsonb_build_object('version', v.version));
end $$;

-- Changing an approved plan always starts a new draft version that needs renewed approval.
create or replace function public.revise_plan(p_plan uuid) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  rp public.recovery_plans;
  base public.plan_versions;
  vid uuid;
  next_version integer;
begin
  select * into rp from public.recovery_plans where id = p_plan for update;
  if rp is null or not private.is_staff(rp.organization_id) then raise exception 'not_found' using errcode = 'P0001'; end if;
  if exists (select 1 from public.plan_versions where plan_id = p_plan and status in ('draft', 'pending_review', 'changes_requested')) then
    raise exception 'version_in_progress' using errcode = 'P0001';
  end if;
  select * into base from public.plan_versions where plan_id = p_plan order by version desc limit 1;
  select coalesce(max(version), 0) + 1 into next_version from public.plan_versions where plan_id = p_plan;
  insert into public.plan_versions (organization_id, plan_id, version, bundle, status, based_on_version_id, created_by)
  values (rp.organization_id, p_plan, next_version, base.bundle, 'draft', base.id, auth.uid()) returning id into vid;
  perform private.audit(rp.organization_id, 'plan.revised', 'plan_version', vid::text, jsonb_build_object('version', next_version, 'based_on', base.version));
  return vid;
end $$;

-- Approval may be withdrawn (for example after an error is found); patients then see no plan until a
-- new version is approved.
create or replace function public.revoke_plan_approval(p_plan uuid, p_reason text) returns void
language plpgsql security definer set search_path = '' as $$
declare rp public.recovery_plans;
begin
  select * into rp from public.recovery_plans where id = p_plan for update;
  if rp is null or not private.is_staff(rp.organization_id) then raise exception 'not_found' using errcode = 'P0001'; end if;
  if not private.is_reviewer(rp.organization_id) then raise exception 'forbidden' using errcode = 'P0001'; end if;
  if rp.approved_version_id is null then raise exception 'invalid_transition' using errcode = 'P0001'; end if;
  if coalesce(btrim(p_reason), '') = '' then raise exception 'comment_required' using errcode = 'P0001'; end if;
  update public.plan_versions set status = 'superseded' where id = rp.approved_version_id;
  insert into public.clinical_approvals (organization_id, plan_id, version_id, version, clinician_user_id, clinician_name, decision, comments)
  select rp.organization_id, rp.id, v.id, v.version, auth.uid(), private.member_name(rp.organization_id), 'rejected', 'Approval withdrawn: ' || btrim(p_reason)
  from public.plan_versions v where v.id = rp.approved_version_id;
  update public.recovery_plans set approved_version_id = null where id = p_plan;
  perform private.audit(rp.organization_id, 'plan.approval_revoked', 'recovery_plan', p_plan::text);
end $$;

-- ============================================================== RPC: patient invitations

create or replace function public.create_patient_invitation(p_patient uuid, p_ttl_hours integer default 72)
returns table (invitation_id uuid, token text, expires_at timestamptz)
language plpgsql security definer set search_path = '' as $$
declare
  p public.clinic_patients;
  t text := private.new_token();
  inv uuid;
  exp timestamptz := now() + make_interval(hours => least(greatest(coalesce(p_ttl_hours, 72), 1), 336));
begin
  select * into p from public.clinic_patients where id = p_patient;
  if p is null or not private.is_staff(p.organization_id) then raise exception 'not_found' using errcode = 'P0001'; end if;
  if p.status <> 'active' then raise exception 'patient_archived' using errcode = 'P0001'; end if;
  if p.user_id is not null then raise exception 'already_linked' using errcode = 'P0001'; end if;
  perform private.check_entitlement(p.organization_id, null);
  if not exists (select 1 from public.recovery_plans where patient_id = p_patient and approved_version_id is not null) then
    raise exception 'no_approved_plan' using errcode = 'P0001';
  end if;
  update public.patient_invitations pi set revoked_at = now()
    where pi.patient_id = p_patient and pi.redeemed_at is null and pi.revoked_at is null;
  insert into public.patient_invitations (organization_id, patient_id, token_hash, expires_at, created_by)
  values (p.organization_id, p_patient, private.hash_token(t), exp, auth.uid()) returning id into inv;
  perform private.audit(p.organization_id, 'invitation.created', 'patient_invitation', inv::text);
  return query select inv, t, exp;
end $$;

create or replace function public.revoke_patient_invitation(p_invitation uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare inv public.patient_invitations;
begin
  select * into inv from public.patient_invitations where id = p_invitation;
  if inv is null or not private.is_staff(inv.organization_id) then raise exception 'not_found' using errcode = 'P0001'; end if;
  update public.patient_invitations set revoked_at = now() where id = p_invitation and redeemed_at is null and revoked_at is null;
  perform private.audit(inv.organization_id, 'invitation.revoked', 'patient_invitation', p_invitation::text);
end $$;

-- Links the signed-in account to the invited patient record after a date-of-birth check.
-- Returns a status instead of raising so failed attempts are counted (5 failures revoke the invitation).
create or replace function public.redeem_patient_invitation(p_token text, p_date_of_birth date)
returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  uid uuid := auth.uid();
  inv public.patient_invitations;
  p public.clinic_patients;
begin
  if uid is null then return jsonb_build_object('ok', false, 'reason', 'unauthorized'); end if;
  select * into inv from public.patient_invitations where token_hash = private.hash_token(coalesce(p_token, '')) for update;
  if inv is null or inv.revoked_at is not null then return jsonb_build_object('ok', false, 'reason', 'invitation_invalid'); end if;
  select * into p from public.clinic_patients where id = inv.patient_id for update;
  if inv.redeemed_at is not null then
    if inv.redeemed_by = uid and p.user_id = uid then return jsonb_build_object('ok', true, 'patient_id', p.id, 'already', true); end if;
    return jsonb_build_object('ok', false, 'reason', 'invitation_used');
  end if;
  if inv.expires_at < now() then return jsonb_build_object('ok', false, 'reason', 'invitation_expired'); end if;
  if p.status <> 'active' then return jsonb_build_object('ok', false, 'reason', 'invitation_invalid'); end if;
  if p.user_id is not null and p.user_id <> uid then return jsonb_build_object('ok', false, 'reason', 'invitation_used'); end if;
  if p_date_of_birth is distinct from p.date_of_birth then
    update public.patient_invitations
      set failed_attempts = failed_attempts + 1,
          revoked_at = case when failed_attempts + 1 >= 5 then now() else null end
      where id = inv.id;
    perform private.audit(inv.organization_id, 'invitation.verification_failed', 'patient_invitation', inv.id::text);
    return jsonb_build_object('ok', false, 'reason', case when inv.failed_attempts + 1 >= 5 then 'invitation_locked' else 'verification_failed' end);
  end if;
  if exists (select 1 from public.clinic_patients where organization_id = p.organization_id and user_id = uid and id <> p.id) then
    return jsonb_build_object('ok', false, 'reason', 'account_already_linked');
  end if;

  update public.clinic_patients set user_id = uid, linked_at = now() where id = p.id;
  update public.patient_invitations set redeemed_at = now(), redeemed_by = uid where id = inv.id;
  perform private.audit(inv.organization_id, 'invitation.redeemed', 'patient_invitation', inv.id::text);
  return jsonb_build_object('ok', true, 'patient_id', p.id);
end $$;

-- ============================================================== RPC: follow-ups

create or replace function public.report_follow_up(p_plan uuid, p_item text, p_status text, p_note text) returns void
language plpgsql security definer set search_path = '' as $$
declare rp public.recovery_plans;
begin
  select * into rp from public.recovery_plans where id = p_plan;
  if rp is null or rp.approved_version_id is null or not private.is_patient(rp.patient_id) then raise exception 'not_found' using errcode = 'P0001'; end if;
  if p_status not in ('none', 'reported_attended', 'reported_missed', 'reported_rescheduled') then raise exception 'invalid_status' using errcode = 'P0001'; end if;
  if not exists (select 1 from public.plan_versions v, jsonb_array_elements(v.bundle -> 'follow_ups') f
                 where v.id = rp.approved_version_id and f ->> 'id' = p_item) then
    raise exception 'not_found' using errcode = 'P0001';
  end if;
  insert into public.follow_up_tracking (organization_id, patient_id, plan_id, follow_up_item_id, patient_status, patient_note, patient_reported_at)
  values (rp.organization_id, rp.patient_id, p_plan, p_item, p_status, nullif(left(btrim(p_note), 500), ''), now())
  on conflict (plan_id, follow_up_item_id) do update
    set patient_status = excluded.patient_status, patient_note = excluded.patient_note, patient_reported_at = now();
end $$;

create or replace function public.verify_follow_up(p_plan uuid, p_item text, p_status text, p_note text) returns void
language plpgsql security definer set search_path = '' as $$
declare rp public.recovery_plans;
begin
  select * into rp from public.recovery_plans where id = p_plan;
  if rp is null or not private.is_staff(rp.organization_id) then raise exception 'not_found' using errcode = 'P0001'; end if;
  if p_status not in ('unverified', 'verified_attended', 'verified_missed', 'cancelled') then raise exception 'invalid_status' using errcode = 'P0001'; end if;
  insert into public.follow_up_tracking (organization_id, patient_id, plan_id, follow_up_item_id, staff_status, staff_note, verified_by, verified_at)
  values (rp.organization_id, rp.patient_id, p_plan, left(p_item, 64), p_status, nullif(left(btrim(p_note), 500), ''), auth.uid(), now())
  on conflict (plan_id, follow_up_item_id) do update
    set staff_status = excluded.staff_status, staff_note = excluded.staff_note, verified_by = auth.uid(), verified_at = now();
  perform private.audit(rp.organization_id, 'follow_up.verified', 'recovery_plan', p_plan::text, jsonb_build_object('status', p_status));
end $$;

-- ============================================================== RPC: questions

create or replace function public.submit_patient_question(p_patient uuid, p_plan uuid, p_subject text, p_body text, p_urgent_keywords boolean)
returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  p public.clinic_patients;
  q uuid;
  staff record;
begin
  select * into p from public.clinic_patients where id = p_patient;
  if p is null or not private.is_patient(p_patient) then raise exception 'not_found' using errcode = 'P0001'; end if;
  if p_plan is not null and not exists (select 1 from public.recovery_plans where id = p_plan and patient_id = p_patient and approved_version_id is not null) then
    raise exception 'not_found' using errcode = 'P0001';
  end if;
  if (select count(*) from public.patient_questions where patient_id = p_patient and created_at > now() - interval '1 day') >= 10 then
    raise exception 'rate_limited' using errcode = 'P0001';
  end if;
  insert into public.patient_questions (organization_id, patient_id, plan_id, subject, urgent_keywords, created_by)
  values (p.organization_id, p_patient, p_plan, btrim(p_subject), coalesce(p_urgent_keywords, false), auth.uid()) returning id into q;
  insert into public.question_messages (organization_id, question_id, author_user_id, author_kind, body)
  values (p.organization_id, q, auth.uid(), 'patient', btrim(p_body));
  perform private.audit(p.organization_id, 'question.submitted', 'patient_question', q::text);
  for staff in select user_id from public.organization_memberships where organization_id = p.organization_id and status = 'active' loop
    perform private.notify(p.organization_id, staff.user_id, 'question_submitted', 'A patient sent a question', '/clinic/questions/' || q);
  end loop;
  return q;
end $$;

create or replace function public.add_question_message(p_question uuid, p_body text) returns void
language plpgsql security definer set search_path = '' as $$
declare
  q public.patient_questions;
  is_staff_member boolean;
  patient_user uuid;
begin
  select * into q from public.patient_questions where id = p_question for update;
  if q is null then raise exception 'not_found' using errcode = 'P0001'; end if;
  is_staff_member := private.is_staff(q.organization_id);
  if not is_staff_member and not private.is_patient(q.patient_id) then raise exception 'not_found' using errcode = 'P0001'; end if;
  if q.status = 'closed' then raise exception 'question_closed' using errcode = 'P0001'; end if;
  insert into public.question_messages (organization_id, question_id, author_user_id, author_kind, author_name, body)
  values (q.organization_id, p_question, auth.uid(), case when is_staff_member then 'staff' else 'patient' end,
          case when is_staff_member then private.member_name(q.organization_id) end, btrim(p_body));
  if is_staff_member then
    update public.patient_questions set status = 'responded', assigned_to = coalesce(assigned_to, auth.uid()) where id = p_question;
    select user_id into patient_user from public.clinic_patients where id = q.patient_id;
    perform private.notify(q.organization_id, patient_user, 'question_responded', 'Your care team replied to your question', '/care-team/questions/' || p_question);
    perform private.audit(q.organization_id, 'question.responded', 'patient_question', p_question::text);
  else
    update public.patient_questions set status = case when status = 'responded' then 'in_progress' else status end where id = p_question;
  end if;
end $$;

create or replace function public.update_question(p_question uuid, p_status text, p_assigned_to uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare q public.patient_questions;
begin
  select * into q from public.patient_questions where id = p_question for update;
  if q is null or not private.is_staff(q.organization_id) then raise exception 'not_found' using errcode = 'P0001'; end if;
  if p_status is not null and p_status not in ('new', 'assigned', 'in_progress', 'responded', 'closed') then raise exception 'invalid_status' using errcode = 'P0001'; end if;
  if p_assigned_to is not null and not exists (
    select 1 from public.organization_memberships where organization_id = q.organization_id and user_id = p_assigned_to and status = 'active') then
    raise exception 'invalid_assignee' using errcode = 'P0001';
  end if;
  update public.patient_questions
    set status = coalesce(p_status, case when p_assigned_to is not null and status = 'new' then 'assigned' else status end),
        assigned_to = coalesce(p_assigned_to, assigned_to)
    where id = p_question;
  perform private.audit(q.organization_id, 'question.updated', 'patient_question', p_question::text, jsonb_build_object('status', p_status));
end $$;

-- ============================================================== RPC: entitlements & audit from the API

create or replace function public.organization_entitlements(p_org uuid) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare sub public.subscriptions;
begin
  if not private.is_staff(p_org) then raise exception 'not_found' using errcode = 'P0001'; end if;
  select * into sub from public.subscriptions where organization_id = p_org;
  return jsonb_build_object(
    'plan', sub.plan,
    'status', sub.status,
    'trial_ends_at', sub.trial_ends_at,
    'active', sub.status in ('trialing', 'active', 'past_due') and not (sub.status = 'trialing' and sub.trial_ends_at is not null and sub.trial_ends_at < now()),
    'limits', private.plan_limits(sub.plan),
    'usage', jsonb_build_object(
      'active_patients', (select count(*) from public.clinic_patients where organization_id = p_org and status = 'active'),
      'staff', (select count(*) from public.organization_memberships where organization_id = p_org and status = 'active'),
      'episodes_per_month', (select count(*) from public.care_episodes where organization_id = p_org and created_at >= date_trunc('month', now())),
      'storage_mb', (select coalesce(round(sum(file_size) / 1048576.0), 0) from public.clinic_documents where organization_id = p_org)
    )
  );
end $$;

-- Events that happen in the API (document upload, download, processing) are logged through this
-- allow-list so members cannot forge consequential events such as approvals.
create or replace function public.log_clinic_event(p_org uuid, p_action text, p_resource_type text, p_resource_id text, p_metadata jsonb)
returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not private.is_staff(p_org) then raise exception 'not_found' using errcode = 'P0001'; end if;
  if p_action not in ('patient.created', 'patient.updated', 'episode.created', 'document.uploaded', 'document.viewed',
                      'document.processed', 'document.processing_failed', 'document.shared', 'document.deleted', 'plan.edited') then
    raise exception 'invalid_action' using errcode = 'P0001';
  end if;
  perform private.audit(p_org, p_action, left(p_resource_type, 40), left(p_resource_id, 64), coalesce(p_metadata, '{}'::jsonb));
end $$;

-- ============================================================== function privileges

do $$
declare f text;
begin
  foreach f in array array[
    'create_organization(text,text,text,text,text,text,text,boolean)',
    'create_staff_invitation(uuid,text,text,boolean,integer)',
    'accept_staff_invitation(text,text)',
    'revoke_staff_invitation(uuid)',
    'update_member(uuid,text,boolean,text)',
    'create_recovery_plan(uuid,text,jsonb)',
    'submit_plan_version(uuid)',
    'decide_plan_version(uuid,text,text)',
    'revise_plan(uuid)',
    'revoke_plan_approval(uuid,text)',
    'create_patient_invitation(uuid,integer)',
    'revoke_patient_invitation(uuid)',
    'redeem_patient_invitation(text,date)',
    'report_follow_up(uuid,text,text,text)',
    'verify_follow_up(uuid,text,text,text)',
    'submit_patient_question(uuid,uuid,text,text,boolean)',
    'add_question_message(uuid,text)',
    'update_question(uuid,text,uuid)',
    'organization_entitlements(uuid)',
    'log_clinic_event(uuid,text,text,text,jsonb)'
  ] loop
    execute format('revoke all on function public.%s from public, anon', f);
    execute format('grant execute on function public.%s to authenticated', f);
  end loop;
end $$;

-- ============================================================== private storage for clinic documents

-- Objects live at clinic/{organization_id}/{patient_id}/{uuid}.{ext}. The org segment is validated before casting.
create or replace function private.storage_org(object_name text) returns uuid
language sql immutable set search_path = '' as $$
  select case when (storage.foldername(object_name))[1] = 'clinic'
               and (storage.foldername(object_name))[2] ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
         then ((storage.foldername(object_name))[2])::uuid end;
$$;

create or replace function private.patient_can_read_object(object_name text) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.clinic_documents d join public.clinic_patients p on p.id = d.patient_id
    where d.file_path = object_name and d.shared_with_patient and p.user_id = auth.uid() and p.status = 'active'
  );
$$;

revoke all on function private.storage_org(text), private.patient_can_read_object(text) from public;
grant execute on function private.storage_org(text), private.patient_can_read_object(text) to authenticated;

create policy storage_clinic_select on storage.objects for select to authenticated
  using (bucket_id = 'medical-documents' and (
    private.is_staff(private.storage_org(name)) or private.patient_can_read_object(name)));
create policy storage_clinic_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'medical-documents' and private.is_staff(private.storage_org(name)));
create policy storage_clinic_delete on storage.objects for delete to authenticated
  using (bucket_id = 'medical-documents' and private.has_role(private.storage_org(name), array['owner', 'admin']));
