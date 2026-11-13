-- pgTAP suite: schema-level security guarantees of the AFTERCARE AI database.
-- Run by tests/db/pgtap.test.ts (PGlite with the real migrations). :uid is replaced with a fresh auth user.
select plan(31);

-- RLS everywhere, nothing for anonymous users
select ok(
  not exists (select 1 from pg_class c join pg_namespace n on n.oid = c.relnamespace where n.nspname = 'public' and c.relkind = 'r' and not c.relrowsecurity),
  'RLS is enabled on every table in public'
);
select is((select count(*)::int from pg_policies where schemaname = 'public' and ('anon' = any(roles) or 'public' = any(roles))), 0, 'no RLS policy targets anon or PUBLIC');
select ok(not has_table_privilege('anon', 'public.clinic_patients', 'select'), 'anon cannot read clinic_patients');
select ok(not has_table_privilege('anon', 'public.plan_versions', 'select'), 'anon cannot read plan_versions');
select ok(not has_table_privilege('anon', 'public.clinic_documents', 'select'), 'anon cannot read clinic_documents');
select ok(not has_table_privilege('anon', 'public.audit_logs', 'select'), 'anon cannot read audit_logs');
select ok(not has_table_privilege('anon', 'public.patient_invitations', 'select'), 'anon cannot read patient_invitations');

-- Append-only / function-only tables
select policies_are('public', 'audit_logs', array['audit_logs_select'], 'audit_logs: read policy only (writes via SECURITY DEFINER)');
select policies_are('public', 'clinical_approvals', array['clinical_approvals_select'], 'clinical_approvals: read policy only');
select policies_are('public', 'organization_memberships', array['memberships_select'], 'memberships: read policy only');
select policies_are('public', 'staff_invitations', array['staff_invitations_select'], 'staff_invitations: read policy only');
select policies_are('public', 'patient_invitations', array['patient_invitations_select'], 'patient_invitations: read policy only');
select policies_are('public', 'subscriptions', array['subscriptions_select'], 'subscriptions: read policy only (operator-managed)');
select policies_are('public', 'corrections', array['corrections_select', 'corrections_insert'], 'patient corrections: append-only');

-- SECURITY DEFINER hygiene
select is(
  (select count(*)::int from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname in ('public', 'private') and p.prosecdef
     and not exists (select 1 from unnest(coalesce(p.proconfig, '{}')) c where c like 'search_path=%')),
  0, 'every SECURITY DEFINER function pins search_path'
);
select ok(not has_function_privilege('anon', 'public.decide_plan_version(uuid,text,text)', 'execute'), 'anon cannot call decide_plan_version');
select ok(not has_function_privilege('anon', 'public.redeem_patient_invitation(text,date)', 'execute'), 'anon cannot call redeem_patient_invitation');
select ok(not has_function_privilege('authenticated', 'private.audit(uuid,text,text,text,jsonb)', 'execute'), 'users cannot write audit entries directly');
select ok(not has_function_privilege('authenticated', 'private.notify(uuid,uuid,text,text,text)', 'execute'), 'users cannot create notifications directly');

-- Tenant integrity
select fk_ok('public', 'care_episodes', array['patient_id', 'organization_id'], 'public', 'clinic_patients', array['id', 'organization_id']);
select fk_ok('public', 'recovery_plans', array['patient_id', 'organization_id'], 'public', 'clinic_patients', array['id', 'organization_id']);
select fk_ok('public', 'plan_versions', array['plan_id', 'organization_id'], 'public', 'recovery_plans', array['id', 'organization_id']);
select col_not_null('public', 'clinic_patients', 'organization_id', 'clinic_patients.organization_id is NOT NULL');
select col_not_null('public', 'clinic_documents', 'organization_id', 'clinic_documents.organization_id is NOT NULL');
select col_not_null('public', 'plan_versions', 'organization_id', 'plan_versions.organization_id is NOT NULL');
select has_check('public', 'staff_invitations', 'invitation tokens are constrained to SHA-256 hex');
select col_is_unique('public', 'patient_invitations', array['token_hash'], 'patient invitation hashes are unique');

-- Behaviour as a signed-in user with no membership
set role authenticated;
select set_config('request.jwt.claim.sub', ':uid', false);
select is_empty('select id from public.clinic_patients', 'a non-member sees no clinic patients');
select is_empty('select id from public.audit_logs', 'a non-member sees no audit entries');
select throws_ok($$select public.decide_plan_version(gen_random_uuid(), 'approved', null)$$, 'P0001', 'not_found', 'a non-member cannot decide on any plan');
select throws_ok($$insert into public.organizations (name, slug) values ('Nope', 'nope-org')$$, '42501', null, 'organizations cannot be inserted directly');
reset role;

select * from finish();
