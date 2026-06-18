-- ============================================================
-- Mom's Care Log — Supabase setup (full rebuild)
-- Run this ONCE in your Supabase project's SQL Editor.
--
-- IMPORTANT: Before running, edit the family member emails at
-- the bottom of this file!
-- ============================================================

-- ---------- Family allowlist ----------
create table public.family_members (
  email text primary key,
  display_name text not null
);

alter table public.family_members enable row level security;

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

create policy "family read family list"
  on public.family_members for select
  to authenticated
  using (public.is_family());

-- Convenience: apply the standard family-only policy to a table
create or replace procedure public.family_policy(tbl text)
language plpgsql
as $$
begin
  execute format('alter table public.%I enable row level security', tbl);
  execute format(
    'create policy "family all" on public.%I for all to authenticated using (public.is_family()) with check (public.is_family())',
    tbl);
end;
$$;

-- ---------- Daily notes feed ----------
create table public.log_entries (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  author_email text not null default lower(auth.jwt() ->> 'email'),
  note text not null
);
call public.family_policy('log_entries');

-- ---------- Vitals (multiple readings per day) ----------
-- kind: bp, blood_sugar, temp, o2, heart_rate, weight, pain, mood
create table public.vital_readings (
  id uuid primary key default gen_random_uuid(),
  reading_date date not null,
  kind text not null,
  value text not null,
  created_at timestamptz not null default now(),
  created_by text not null default lower(auth.jwt() ->> 'email')
);
create index on public.vital_readings (reading_date, kind);
call public.family_policy('vital_readings');

-- ---------- Symptoms (toggled per day) ----------
create table public.day_symptoms (
  id uuid primary key default gen_random_uuid(),
  sym_date date not null,
  symptom text not null,
  created_by text not null default lower(auth.jwt() ->> 'email'),
  unique (sym_date, symptom)
);
call public.family_policy('day_symptoms');

-- ---------- Meals ----------
create table public.meals (
  id uuid primary key default gen_random_uuid(),
  meal_date date not null,
  meal_type text not null,         -- Breakfast, Lunch, Dinner, Snack, Supplement
  description text not null,
  amount text,                     -- "full plate", "half", ...
  created_at timestamptz not null default now(),
  created_by text not null default lower(auth.jwt() ->> 'email')
);
call public.family_policy('meals');

-- ---------- Fluids ----------
create table public.fluids (
  id uuid primary key default gen_random_uuid(),
  fluid_date date not null,
  fluid_type text not null,        -- Water, Coffee, Tea, ...
  oz numeric not null,
  created_at timestamptz not null default now(),
  created_by text not null default lower(auth.jwt() ->> 'email')
);
call public.family_policy('fluids');

-- ---------- Medications ----------
create table public.medications (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  name text not null,
  dose text,
  times text[] not null default '{}',   -- 24h "HH:MM"
  with_food boolean not null default false,
  notes text,
  hold_diarrhea boolean not null default false,  -- HOLD on heavy diarrhea days
  never_hold boolean not null default false,     -- critical: do NOT hold
  active boolean not null default true,
  sort_order int not null default 0
);
call public.family_policy('medications');

-- One row per dose given OR held
create table public.med_doses (
  id uuid primary key default gen_random_uuid(),
  medication_id uuid not null references public.medications(id) on delete cascade,
  dose_date date not null,
  dose_time text not null,               -- matches one of medications.times
  status text not null default 'given',  -- 'given' or 'held'
  hold_reason text,                      -- set when status = 'held'
  created_at timestamptz not null default now(),
  created_by text not null default lower(auth.jwt() ->> 'email'),
  unique (medication_id, dose_date, dose_time)
);
call public.family_policy('med_doses');

-- ---------- Care events (BM, urine, hygiene, cleaning) ----------
create table public.care_events (
  id uuid primary key default gen_random_uuid(),
  event_date date not null,
  kind text not null,        -- 'bm', 'urine', 'hygiene', 'cleaning'
  detail text not null,      -- e.g. "Medium · Loose", "Pale Yellow", "Bed Bath"
  created_at timestamptz not null default now(),
  created_by text not null default lower(auth.jwt() ->> 'email')
);
create index on public.care_events (event_date, kind);
call public.family_policy('care_events');

-- ---------- Physical therapy ----------
create table public.pt_exercises (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  target_sets int not null default 3,
  target_reps int not null default 10,
  active boolean not null default true
);
call public.family_policy('pt_exercises');

create table public.pt_logs (
  id uuid primary key default gen_random_uuid(),
  exercise_id uuid not null references public.pt_exercises(id) on delete cascade,
  log_date date not null,
  sets int not null,
  reps int not null,
  created_at timestamptz not null default now(),
  created_by text not null default lower(auth.jwt() ->> 'email')
);
call public.family_policy('pt_logs');

-- ---------- Pinned caregiver notes + change log ----------
create table public.caregiver_notes (
  id uuid primary key default gen_random_uuid(),
  text text not null,
  created_at timestamptz not null default now(),
  created_by text not null default lower(auth.jwt() ->> 'email')
);
call public.family_policy('caregiver_notes');

create table public.note_changes (
  id uuid primary key default gen_random_uuid(),
  action text not null,        -- 'Added', 'Edited', 'Deleted'
  old_text text,
  new_text text,
  created_at timestamptz not null default now(),
  created_by text not null default lower(auth.jwt() ->> 'email')
);
call public.family_policy('note_changes');

-- ---------- Appointments ----------
create table public.appointments (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  title text not null,
  location text,
  starts_at timestamptz not null,
  driver_email text,
  notes text
);
call public.family_policy('appointments');

-- ---------- Tasks & shifts ----------
create table public.tasks (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  title text not null,
  kind text not null default 'task',   -- 'task' or 'shift'
  due_date date,
  assigned_to text,
  done boolean not null default false,
  done_by text,
  done_at timestamptz
);
call public.family_policy('tasks');

-- ---------- Realtime ----------
alter publication supabase_realtime add table public.log_entries;
alter publication supabase_realtime add table public.med_doses;
alter publication supabase_realtime add table public.tasks;
alter publication supabase_realtime add table public.vital_readings;
alter publication supabase_realtime add table public.fluids;
alter publication supabase_realtime add table public.care_events;

-- ============================================================
-- Pre-loaded medication schedule (26 meds)
-- HOLD on heavy diarrhea days: Furosemide, Spironolactone, Losartan, Mirabegron
-- NEVER hold: Levothyroxine, Carvedilol, Acyclovir, Levetiracetam (Keppra)
-- ============================================================
insert into public.medications (name, dose, times, with_food, notes, hold_diarrhea, never_hold, sort_order) values
  ('Levothyroxine', '112 mcg', '{05:00}', false, 'Take alone with water only. Empty stomach.', false, true, 1),
  ('Nexium (Esomeprazole)', '40 mg', '{08:30}', false, 'Must be taken BEFORE breakfast.', false, false, 2),
  ('Budesonide', '3 mg (1 capsule)', '{09:00}', true, 'With breakfast.', false, false, 3),
  ('Glipizide', '10 mg', '{09:00,12:30}', true, 'Breakfast and lunch.', false, false, 4),
  ('Saxagliptin', '5 mg', '{09:00}', true, 'With breakfast.', false, false, 5),
  ('Carvedilol', '25 mg', '{09:00,12:30}', true, 'Breakfast and lunch. Do NOT hold.', false, true, 6),
  ('Losartan', '50 mg', '{09:00,17:00}', true, 'Breakfast and dinner. HOLD on heavy diarrhea days.', true, false, 7),
  ('Spironolactone', '25 mg', '{09:00}', true, 'With breakfast. HOLD on heavy diarrhea days.', true, false, 8),
  ('Aspirin', '81 mg', '{09:00}', true, 'With breakfast.', false, false, 9),
  ('Ursodiol', '500 mg x2', '{09:00,17:00}', true, 'Breakfast and dinner.', false, false, 10),
  ('Mirabegron (Myrbetriq)', '50 mg', '{09:00}', true, 'With breakfast. HOLD on heavy diarrhea days.', true, false, 11),
  ('Folic Acid', '1 mg', '{09:00}', true, 'With breakfast.', false, false, 12),
  ('Vitamin D3', '5000 IU', '{09:00,17:00}', true, 'Breakfast and dinner.', false, false, 13),
  ('Cranberry Supplement', '', '{09:00}', true, 'With breakfast.', false, false, 14),
  ('Acyclovir', '400 mg', '{09:00,17:00}', true, 'Do NOT hold. Breakfast and dinner.', false, true, 15),
  ('Zinc', '50 mg', '{09:00}', true, 'With breakfast.', false, false, 16),
  ('Loratadine', '10 mg', '{09:00}', true, 'Allergy med (non-drowsy). With breakfast.', false, false, 17),
  ('Furosemide', '20 mg', '{10:30}', false, 'Increases urination 2–3 hrs. HOLD on heavy diarrhea days.', true, false, 18),
  ('Dorzolamide-Timolol', 'Eye drops', '{10:30,19:30}', false, '1 drop per eye. Morning and night.', false, false, 19),
  ('Levetiracetam (Keppra)', '500 mg', '{12:30,18:30}', true, 'Do NOT hold. Lunch and night.', false, true, 20),
  ('Iron (Ferrous Gluconate)', '324 mg', '{14:30}', false, 'Sun, Mon, Wed ONLY. Every 2 days to avoid constipation.', false, false, 21),
  ('Atorvastatin', '40 mg', '{17:00}', true, 'With dinner.', false, false, 22),
  ('Pregabalin', '50 mg', '{18:30}', false, 'Night dose.', false, false, 23),
  ('Nitrofurantoin', '50 mg', '{18:30}', false, 'Night dose.', false, false, 24),
  ('Famotidine', '40 mg', '{18:30}', false, 'Night dose.', false, false, 25),
  ('Latanoprost', 'Eye drops', '{19:30}', false, '1 drop per eye at night.', false, false, 26);

-- Pre-loaded PT exercises
insert into public.pt_exercises (name, target_sets, target_reps) values
  ('Ankle Pumps', 3, 10),
  ('Heel Slides', 3, 10),
  ('Quad Sets', 3, 10),
  ('Straight Leg Raises', 3, 10),
  ('Sit to Stand', 3, 5),
  ('Standing Balance', 3, 30);

-- Pre-loaded caregiver notes
insert into public.caregiver_notes (text, created_by) values
  ('Levothyroxine must be taken alone with water (empty stomach).', 'setup'),
  ('Nexium must be taken BEFORE breakfast.', 'setup'),
  ('Furosemide increases urination for 2–3 hours after taking.', 'setup'),
  ('Iron only on Sunday, Monday, Wednesday.', 'setup'),
  ('HOLD on heavy diarrhea days: Furosemide, Spironolactone, Losartan, Mirabegron.', 'setup'),
  ('Do NOT hold: Keppra (Levetiracetam), Carvedilol, Acyclovir, Levothyroxine.', 'setup');

-- ============================================================
-- EDIT THIS: your family members (lowercase emails).
-- Only these people will be able to use the app.
-- ============================================================
insert into public.family_members (email, display_name) values
  ('vincenthowg@gmail.com', 'Vincent');
  -- ,('sibling1@example.com', 'Name')
  -- ,('sibling2@example.com', 'Name')
