-- ============================================================
-- STEP 0 — Run this FIRST, before schema.sql, when reusing the
-- old Supabase project (xukskdsqwlofaqnkftny).
--
-- It removes the old tables from the previous artifact version,
-- which had public read/write policies (no security).
--
-- ⚠️ This permanently deletes any data in those old tables.
-- If there's anything in them you want to keep, export it from
-- Table Editor first (each table has an Export option).
-- ============================================================

drop table if exists public.care_logs cascade;
drop table if exists public.med_schedule cascade;
drop table if exists public.caregiver_notes cascade;
drop table if exists public.pt_schedule cascade;
