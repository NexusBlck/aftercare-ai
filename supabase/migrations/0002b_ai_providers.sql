-- AFTERCARE AI: allow the free-tier AI providers in the extraction log.
-- Widens a check constraint only; no rows are changed.
alter table public.extraction_runs drop constraint if exists extraction_runs_provider_check;
alter table public.extraction_runs add constraint extraction_runs_provider_check check (provider in ('gemini', 'mock', 'freellmapi', 'free'));
