-- AFTERCARE AI: legal consent records, marketing preference, and data-retention clean-up.

-- ---------------------------------------------------------------- marketing preference (separate from terms acceptance)
alter table public.profiles
  add column if not exists marketing_opt_in boolean not null default false,
  add column if not exists marketing_opt_in_at timestamptz;

-- ---------------------------------------------------------------- agreement records: who, what version, when
create table public.legal_acceptances (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  document text not null check (document in ('terms', 'privacy', 'health_data')),
  version text not null check (char_length(version) between 1 and 40),
  source text not null check (source in ('signup', 'in_app')),
  accepted_at timestamptz not null default now(),
  unique (user_id, document, version)
);
create index legal_acceptances_user_idx on public.legal_acceptances (user_id, document, accepted_at desc);

-- The acceptance time is always the server's clock; a client cannot back-date a record.
create or replace function public.legal_acceptances_stamp() returns trigger
language plpgsql as $$
begin
  new.accepted_at = now();
  return new;
end $$;
create trigger legal_acceptances_stamp before insert on public.legal_acceptances
  for each row execute function public.legal_acceptances_stamp();

alter table public.legal_acceptances enable row level security;
create policy legal_acceptances_select on public.legal_acceptances for select to authenticated
  using (user_id = auth.uid());
create policy legal_acceptances_insert on public.legal_acceptances for insert to authenticated
  with check (user_id = auth.uid());
-- Records are never edited. Users may delete their own records when they erase their data.
create policy legal_acceptances_delete on public.legal_acceptances for delete to authenticated
  using (user_id = auth.uid());

-- ---------------------------------------------------------------- record sign-up consent when the auth user is created
-- The sign-up form sends {"legal": {"terms": v, "privacy": v, "health_data": v}, "marketing_opt_in": bool}
-- as user metadata. Values are recorded exactly as accepted, with the server's timestamp.
create or replace function public.handle_new_user_consent() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  meta jsonb := coalesce(new.raw_user_meta_data, '{}'::jsonb);
  wants_marketing boolean := (meta ->> 'marketing_opt_in') = 'true';
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

create trigger on_auth_user_created_consent
  after insert on auth.users
  for each row execute function public.handle_new_user_consent();

-- ---------------------------------------------------------------- data-retention clean-up
-- Operational AI logs: 90 days. Uploads that never completed: 24 hours.
create or replace function public.run_retention() returns void
language sql security definer set search_path = public as $$
  delete from public.extraction_runs where started_at < now() - interval '90 days';
  delete from public.documents where processing_status = 'uploading' and created_at < now() - interval '24 hours';
$$;

revoke all on function public.run_retention() from public, anon, authenticated;

create extension if not exists pg_cron;
select cron.schedule('aftercare-retention', '17 3 * * *', 'select public.run_retention()');
