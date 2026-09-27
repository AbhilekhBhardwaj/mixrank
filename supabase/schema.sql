-- Technographic Detection Explorer -- schema
-- Run this once in the Supabase SQL editor (or `supabase db execute -f supabase/schema.sql`).

create extension if not exists "pgcrypto";

-- One row per batch run: the headline comparison the demo is built around.
create table if not exists public.detection_runs (
  id                 uuid primary key default gen_random_uuid(),
  created_at         timestamptz not null default now(),
  label              text,
  total_sites        integer not null,
  reachable          integer not null default 0,
  unreachable        integer not null default 0,
  primary_detected   integer not null,
  fallback_detected  integer not null,
  total_detected     integer not null,
  robots_blocked     integer not null default 0,
  undetected         integer not null,
  primary_rate       numeric(5, 1) not null,
  combined_rate      numeric(5, 1) not null,
  improvement_points numeric(5, 1) not null,
  improvement_rate   numeric(6, 1) not null,
  duration_ms        integer not null default 0
);

-- One row per site within a run.
create table if not exists public.detection_results (
  id            uuid primary key default gen_random_uuid(),
  run_id        uuid not null references public.detection_runs (id) on delete cascade,
  created_at    timestamptz not null default now(),
  url           text not null,
  final_url     text,
  status        integer,
  reachable     boolean not null default false,
  method        text not null check (method in ('primary', 'fallback', 'none')),
  technologies  jsonb not null default '[]'::jsonb,
  probes        jsonb not null default '[]'::jsonb,
  fallback_ran  boolean not null default false,
  robots        jsonb,
  blocked_by_robots boolean not null default false,
  error         text,
  duration_ms   integer not null default 0
);

-- Upgrade path for databases created before robots.txt compliance was added.
-- `create table if not exists` above leaves existing tables untouched, so the
-- new columns have to be added explicitly.
alter table public.detection_runs
  add column if not exists robots_blocked integer not null default 0;

alter table public.detection_results
  add column if not exists robots jsonb;

alter table public.detection_results
  add column if not exists blocked_by_robots boolean not null default false;

create index if not exists detection_runs_created_at_idx
  on public.detection_runs (created_at desc);

create index if not exists detection_results_run_id_idx
  on public.detection_results (run_id);

-- This is a public demo with no auth. RLS stays on, with policies that permit
-- exactly what the app needs (read history, append new runs) and nothing else.
alter table public.detection_runs enable row level security;
alter table public.detection_results enable row level security;

drop policy if exists "public read runs" on public.detection_runs;
create policy "public read runs" on public.detection_runs
  for select using (true);

drop policy if exists "public insert runs" on public.detection_runs;
create policy "public insert runs" on public.detection_runs
  for insert with check (true);

drop policy if exists "public read results" on public.detection_results;
create policy "public read results" on public.detection_results
  for select using (true);

drop policy if exists "public insert results" on public.detection_results;
create policy "public insert results" on public.detection_results
  for insert with check (true);
