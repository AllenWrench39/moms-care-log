-- ============================================================
-- Migration: freeze history display + support backdated logging
-- Run once in the Supabase SQL Editor (or via migration tooling).
--
-- Problem: med_doses / pt_logs only store the medication/exercise
-- ID, so History and Export always show the CURRENT name/dose.
-- Editing a medication retroactively changed how history displayed.
--
-- Fix: snapshot the name/dose (and exercise name/unit) onto each
-- log row at the moment it is logged. Existing rows are backfilled
-- with today's values (the best information available).
-- ============================================================

alter table public.med_doses add column if not exists med_name text;
alter table public.med_doses add column if not exists med_dose text;

alter table public.pt_logs add column if not exists exercise_name text;
alter table public.pt_logs add column if not exists exercise_unit text;

update public.med_doses d
set med_name = m.name, med_dose = m.dose
from public.medications m
where m.id = d.medication_id and d.med_name is null;

update public.pt_logs p
set exercise_name = e.name, exercise_unit = e.unit
from public.pt_exercises e
where e.id = p.exercise_id and p.exercise_name is null;
