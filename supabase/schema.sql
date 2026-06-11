-- ============================================================
-- Mom's Care Log — Supabase setup
-- Run this ONCE in your Supabase project's SQL Editor.
--
-- IMPORTANT: Before running, edit the family member emails at
-- the bottom of this file!
-- ============================================================

-- ---------- Family allowlist ----------
-- Only people whose email is in this table can read/write any data.
create table public.family_members (
  email text primary key,
  display_name text not null
);

alter table public.family_members enable row level security;

-- Helper: is the logged-in user on the family list?
create or replace function public.is_family()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.family_members
    where email = lower(auth.jwt() ->> 'email')
  );
$$;

create policy "family can read family list"
  on public.family_members for select
  to authenticated
  using (public.is_family());

-- ---------- Daily care log ----------
create table public.log_entries (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  author_email text not null default lower(auth.jwt() ->> 'email'),
  category text not null default 'general',  -- general, meal, mood, sleep, bathroom, activity, health
  note text not null
);

alter table public.log_entries enable row level security;
create policy "family read logs" on public.log_entries for select to authenticated using (public.is_family());
create policy "family add logs" on public.log_entries for insert to authenticated with check (public.is_family());
create policy "author edit logs" on public.log_entries for update to authenticated
  using (public.is_family() and author_email = lower(auth.jwt() ->> 'email'));
create policy "author delete logs" on public.log_entries for delete to authenticated
  using (public.is_family() and author_email = lower(auth.jwt() ->> 'email'));

-- ---------- Medications ----------
create table public.medications (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  name text not null,
  dosage text,                   -- e.g. "10mg"
  instructions text,             -- e.g. "with food"
  times text[] not null default '{}',  -- e.g. {"08:00","20:00"}
  active boolean not null default true
);

alter table public.medications enable row level security;
create policy "family all meds" on public.medications for all to authenticated
  using (public.is_family()) with check (public.is_family());

-- One row per dose actually given (check-off)
create table public.med_doses (
  id uuid primary key default gen_random_uuid(),
  medication_id uuid not null references public.medications(id) on delete cascade,
  dose_date date not null,
  dose_time text not null,       -- matches one of medications.times
  given_at timestamptz not null default now(),
  given_by text not null default lower(auth.jwt() ->> 'email'),
  unique (medication_id, dose_date, dose_time)
);

alter table public.med_doses enable row level security;
create policy "family all doses" on public.med_doses for all to authenticated
  using (public.is_family()) with check (public.is_family());

-- ---------- Appointments ----------
create table public.appointments (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  title text not null,
  location text,
  starts_at timestamptz not null,
  driver_email text,             -- who's taking her
  notes text
);

alter table public.appointments enable row level security;
create policy "family all appts" on public.appointments for all to authenticated
  using (public.is_family()) with check (public.is_family());

-- ---------- Tasks & shifts ----------
create table public.tasks (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  title text not null,
  kind text not null default 'task',   -- 'task' or 'shift'
  due_date date,
  assigned_to text,                    -- family member email
  done boolean not null default false,
  done_by text,
  done_at timestamptz
);

alter table public.tasks enable row level security;
create policy "family all tasks" on public.tasks for all to authenticated
  using (public.is_family()) with check (public.is_family());

-- ---------- Realtime (optional, makes updates show up live) ----------
alter publication supabase_realtime add table public.log_entries;
alter publication supabase_realtime add table public.med_doses;
alter publication supabase_realtime add table public.tasks;

-- ============================================================
-- EDIT THIS: your family members (lowercase emails).
-- Only these people will be able to use the app.
-- ============================================================
insert into public.family_members (email, display_name) values
  ('vincenthowg@gmail.com', 'Vincent');
  -- ,('sibling1@example.com', 'Name')
  -- ,('sibling2@example.com', 'Name')
