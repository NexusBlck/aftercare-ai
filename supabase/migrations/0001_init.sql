-- AFTERCARE AI — initial schema
-- All timestamps are timestamptz (UTC). Date-only clinical instructions use `date`, never timestamps.

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------- helpers
create or replace function public.set_updated_at() returns trigger
language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end $$;

create type public.verification_status as enum (
  'needs_review', 'confirmed_by_patient', 'needs_clinician_clarification', 'conflicting'
);

-- ---------------------------------------------------------------- profiles
create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  display_name text check (char_length(display_name) <= 80),
  preferred_language text not null default 'en' check (preferred_language in ('en', 'ur')),
  onboarded boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ---------------------------------------------------------------- care plans
create table public.care_plans (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  title text not null check (char_length(title) between 1 and 120),
  diagnosis text,
  procedure text,
  admission_date date,
  discharge_date date,
  facility text,
  clinician text,
  encounter_evidence jsonb not null default '{}'::jsonb,
  status text not null default 'draft' check (status in ('draft', 'active', 'archived')),
  is_sample boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index care_plans_user_idx on public.care_plans (user_id, created_at desc);

-- ---------------------------------------------------------------- documents
create table public.documents (
  id uuid primary key default gen_random_uuid(),
  care_plan_id uuid not null references public.care_plans (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  file_path text unique,
  original_filename text not null check (char_length(original_filename) <= 255),
  mime_type text not null check (mime_type in ('application/pdf', 'image/jpeg', 'image/png')),
  file_size integer not null check (file_size > 0),
  document_type text not null default 'unknown' check (document_type in (
    'discharge_summary', 'prescription', 'laboratory_report', 'imaging_report',
    'wound_care_instructions', 'follow_up_letter', 'other', 'unknown')),
  classification_source text not null default 'none' check (classification_source in ('ai', 'patient', 'sample', 'none')),
  processing_status text not null default 'uploading' check (processing_status in (
    'uploading', 'uploaded', 'processing', 'ready_for_review', 'failed', 'rejected', 'sample')),
  processing_error text,
  sample_text text,
  processing_started_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index documents_plan_idx on public.documents (care_plan_id);
create index documents_user_idx on public.documents (user_id);

-- ---------------------------------------------------------------- shared item columns (repeated per table for clarity)
create table public.medications (
  id uuid primary key default gen_random_uuid(),
  care_plan_id uuid not null references public.care_plans (id) on delete cascade,
  document_id uuid references public.documents (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  name text not null check (char_length(name) between 1 and 300),
  brand_name text,
  generic_name text,
  strength text,
  dose text,
  route text,
  frequency text,
  timing text,
  duration text,
  special_instructions text,
  source_page integer check (source_page is null or source_page >= 1),
  source_excerpt text,
  verification_status public.verification_status not null default 'needs_review',
  uncertain boolean not null default false,
  uncertainty_note text,
  patient_edited boolean not null default false,
  plain_language jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index medications_plan_idx on public.medications (care_plan_id);

create table public.recovery_tasks (
  id uuid primary key default gen_random_uuid(),
  care_plan_id uuid not null references public.care_plans (id) on delete cascade,
  document_id uuid references public.documents (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  category text not null check (category in ('wound_care', 'activity', 'diet', 'other')),
  kind text not null,
  instruction text not null check (char_length(instruction) between 1 and 2000),
  due_date date,
  schedule_description text,
  completed boolean not null default false,
  completed_at timestamptz,
  source_page integer check (source_page is null or source_page >= 1),
  source_excerpt text,
  verification_status public.verification_status not null default 'needs_review',
  uncertain boolean not null default false,
  uncertainty_note text,
  patient_edited boolean not null default false,
  plain_language jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check ((completed and completed_at is not null) or (not completed and completed_at is null))
);
create index recovery_tasks_plan_idx on public.recovery_tasks (care_plan_id);

create table public.follow_ups (
  id uuid primary key default gen_random_uuid(),
  care_plan_id uuid not null references public.care_plans (id) on delete cascade,
  document_id uuid references public.documents (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  specialty text,
  clinician text,
  scheduled_date date,
  scheduled_time time,
  investigation text,
  preparation_instructions text,
  status text not null default 'upcoming' check (status in ('upcoming', 'attended', 'rescheduled')),
  patient_reschedule_date date,
  patient_note text,
  source_page integer check (source_page is null or source_page >= 1),
  source_excerpt text,
  verification_status public.verification_status not null default 'needs_review',
  uncertain boolean not null default false,
  uncertainty_note text,
  patient_edited boolean not null default false,
  plain_language jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index follow_ups_plan_idx on public.follow_ups (care_plan_id);

create table public.warning_signs (
  id uuid primary key default gen_random_uuid(),
  care_plan_id uuid not null references public.care_plans (id) on delete cascade,
  document_id uuid references public.documents (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  sign text not null check (char_length(sign) between 1 and 1000),
  action text,
  source_page integer check (source_page is null or source_page >= 1),
  source_excerpt text,
  verification_status public.verification_status not null default 'needs_review',
  uncertain boolean not null default false,
  uncertainty_note text,
  patient_edited boolean not null default false,
  plain_language jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index warning_signs_plan_idx on public.warning_signs (care_plan_id);

-- Uncertainties and conflicts. Never deleted by the patient; only marked as discussed.
create table public.review_flags (
  id uuid primary key default gen_random_uuid(),
  care_plan_id uuid not null references public.care_plans (id) on delete cascade,
  document_id uuid references public.documents (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  kind text not null check (kind in ('uncertainty', 'conflict')),
  category text not null,
  description text not null,
  related_ids text[] not null default '{}',
  excerpts text[] not null default '{}',
  origin text not null check (origin in ('ai', 'rule', 'sample')),
  rule_key text,
  status text not null default 'open' check (status in ('open', 'discussed_with_care_team')),
  patient_note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index review_flags_plan_idx on public.review_flags (care_plan_id);

-- Audit trail of every patient correction.
create table public.corrections (
  id uuid primary key default gen_random_uuid(),
  care_plan_id uuid not null references public.care_plans (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  entity_type text not null check (entity_type in ('medication', 'task', 'follow_up', 'warning_sign', 'encounter', 'flag')),
  entity_id text not null,
  field text not null,
  previous_value text,
  new_value text,
  note text,
  source text not null default 'patient' check (source = 'patient'),
  created_at timestamptz not null default now()
);
create index corrections_plan_idx on public.corrections (care_plan_id);

create table public.extraction_runs (
  id uuid primary key default gen_random_uuid(),
  document_id uuid not null references public.documents (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  model_identifier text not null,
  provider text not null check (provider in ('gemini', 'mock')),
  status text not null check (status in ('started', 'succeeded', 'failed')),
  error_code text,
  error_message text,
  schema_version text not null,
  started_at timestamptz not null default now(),
  extracted_at timestamptz
);
create index extraction_runs_document_idx on public.extraction_runs (document_id, started_at desc);

-- ---------------------------------------------------------------- updated_at triggers
do $$
declare t text;
begin
  foreach t in array array['profiles','care_plans','documents','medications','recovery_tasks','follow_ups','warning_signs','review_flags']
  loop
    execute format('create trigger %I_updated_at before update on public.%I for each row execute function public.set_updated_at()', t, t);
  end loop;
end $$;

-- ---------------------------------------------------------------- ownership helpers (security definer avoids RLS recursion)
create or replace function public.owns_care_plan(plan_id uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.care_plans where id = plan_id and user_id = auth.uid());
$$;

create or replace function public.owns_document(doc_id uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select doc_id is null or exists (select 1 from public.documents where id = doc_id and user_id = auth.uid());
$$;

revoke all on function public.owns_care_plan(uuid) from public;
revoke all on function public.owns_document(uuid) from public;
grant execute on function public.owns_care_plan(uuid) to authenticated;
grant execute on function public.owns_document(uuid) to authenticated;

-- ---------------------------------------------------------------- row level security
alter table public.profiles enable row level security;
alter table public.care_plans enable row level security;
alter table public.documents enable row level security;
alter table public.medications enable row level security;
alter table public.recovery_tasks enable row level security;
alter table public.follow_ups enable row level security;
alter table public.warning_signs enable row level security;
alter table public.review_flags enable row level security;
alter table public.corrections enable row level security;
alter table public.extraction_runs enable row level security;

create policy profiles_own on public.profiles for all to authenticated
  using (id = auth.uid()) with check (id = auth.uid());

create policy care_plans_own on public.care_plans for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

create policy documents_own on public.documents for all to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid() and public.owns_care_plan(care_plan_id));

-- Child rows: the row, its care plan and its source document must all belong to the caller.
do $$
declare t text;
begin
  foreach t in array array['medications','recovery_tasks','follow_ups','warning_signs','review_flags']
  loop
    execute format(
      'create policy %I_own on public.%I for all to authenticated
         using (user_id = auth.uid())
         with check (user_id = auth.uid() and public.owns_care_plan(care_plan_id) and public.owns_document(document_id))',
      t, t);
  end loop;
end $$;

create policy corrections_select on public.corrections for select to authenticated using (user_id = auth.uid());
create policy corrections_insert on public.corrections for insert to authenticated
  with check (user_id = auth.uid() and public.owns_care_plan(care_plan_id));
-- Corrections are an append-only audit trail: no update/delete policies.

create policy extraction_runs_select on public.extraction_runs for select to authenticated using (user_id = auth.uid());
create policy extraction_runs_insert on public.extraction_runs for insert to authenticated
  with check (user_id = auth.uid() and public.owns_document(document_id));
create policy extraction_runs_update on public.extraction_runs for update to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

-- ---------------------------------------------------------------- private storage
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('medical-documents', 'medical-documents', false, 10485760, array['application/pdf', 'image/jpeg', 'image/png'])
on conflict (id) do update set public = false;

-- Objects live at {user_id}/{care_plan_id}/{uuid}.{ext}; the first folder must be the caller's id.
create policy storage_own_select on storage.objects for select to authenticated
  using (bucket_id = 'medical-documents' and (storage.foldername(name))[1] = auth.uid()::text);
create policy storage_own_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'medical-documents' and (storage.foldername(name))[1] = auth.uid()::text);
create policy storage_own_delete on storage.objects for delete to authenticated
  using (bucket_id = 'medical-documents' and (storage.foldername(name))[1] = auth.uid()::text);
