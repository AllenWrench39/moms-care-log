# PROJECT NOTES — read this first in a new session

Status as of June 11, 2026. The app is **fully built and merged to `main`**.

## What this is
A private family web app (5–7 people) to coordinate Mom's care from phones.
React + Vite + TypeScript, Supabase backend, deploys to Vercel.
Sign-in by email magic link; data locked to a family email allowlist via
Supabase row-level security (RLS).

## Build status — DONE
- All code on `main` (PR #1, merged). Production build verified (`npm run build` passes).
- Tabs: Today (vitals/symptoms/meals/fluids/notes), Meds (give/hold with
  reasons + safety flags), Care (BM/urine/hygiene/cleaning/PT), Charts,
  History, Notes (pinned + change log), Appts, Tasks, Export (CSV + doctor
  read-only mode via 👁 View button).
- `supabase/schema.sql` pre-loads: 26 medications with times and hold rules,
  6 PT exercises, 6 caregiver rule notes.
- Med safety rules encoded: HOLD on diarrhea = Furosemide, Spironolactone,
  Losartan, Mirabegron. NEVER hold = Levothyroxine, Carvedilol, Acyclovir,
  Levetiracetam (Keppra). Iron only Sun/Mon/Wed (in its notes).

## Supabase — REUSING the old project (user only gets 2 free projects)
- Project ref: `xukskdsqwlofaqnkftny` → URL `https://xukskdsqwlofaqnkftny.supabase.co`
- The OLD tables in it (`care_logs`, `med_schedule`, `caregiver_notes`,
  `pt_schedule`) came from a Claude-artifact prototype and had PUBLIC
  read/write policies — they must be dropped.

## REMAINING SETUP
1. ✅ DONE (June 11, 2026, via Supabase connector): old unsecured tables
   dropped; `schema.sql` applied as migrations (15 tables, RLS on all,
   26 meds / 6 PT exercises / 6 caregiver notes seeded). Allowlist
   currently has ONLY vincenthowg@gmail.com — add family members later:
   `insert into public.family_members (email, display_name) values ('email','Name');`
2. Vercel (manual — connector can't create projects): at vercel.com/new
   import this repo, deploy from `main`. Env vars are committed in
   `.env.production` so no dashboard env vars are needed (anon key is
   public by design; old public tables are gone).
3. Supabase → Authentication → URL Configuration: set Site URL to the
   Vercel URL and add it to Redirect URLs (so magic links open the app).
4. Test sign-in on a phone, then share the URL with family
   (Add to Home Screen). Full steps with details are in README.md.

## History / context
- The user (Vincent) previously built this as a Claude.ai artifact
  (v1–v5.3). It worked locally but artifact CSP blocked Supabase sync, so
  data never shared between people. This repo is the from-scratch rebuild
  that fixes that. Old artifact code lives only in chat uploads — do not
  reuse it; all features were re-implemented fresh.
- The old Supabase anon key appeared in shared files; that's acceptable
  (anon keys are public by design) BUT only once the old public-policy
  tables are dropped (step 1a above).
- User has Supabase and Vercel connectors added — a new session may be able
  to run the setup steps directly via those connectors.

## Nov 2026 — reliability + redesign (branch `redesign-reliability`)
- Saves: every write goes through `trackedFetch` in `src/supabase.ts`. A failed
  write turns the next toast into "Not saved" and shows a red banner, so a
  success toast can't appear for something that didn't save.
- Offline: `public/sw.js` caches the app shell only (never data). Entries are
  NOT queued offline — an offline banner says so.
- Nav: bottom bar (Today, Meds, Care, Appts, More). Other tabs, view-only mode
  and sign out are in the More sheet.
- Design tokens + dark mode are in `src/styles.css`; use the CSS variables,
  not hex colours, in new code.
- `confirmDialog()` in `src/confirm.tsx` replaces the browser `confirm()`.
- Optional, not yet applied: `supabase/2026-11-09-realtime-meals-symptoms.sql`
  (live updates for meals and symptoms).

## Nov 2026 — history, PT tab, theme (branch `history-pt-theme`)
- History (`src/pages/HistoryPage.tsx`) loads every table for the chosen range
  into one `Entry` list: search, type filters, by-caregiver, date jump, and a
  day view with Timeline / By type. No 30-day cap; notes use the local day.
- PT has its own tab (`src/pages/PtPage.tsx`); it is no longer on Care.
  Bottom bar is Today, Meds, Care, PT, More — Appts moved under More.
- Foot Rub (Care → Hygiene) is saved as hygiene detail `Foot Rub · N min`.
- Powder Skip is saved as a `powder_logs` row with amount `Skipped`
  (`POWDER_SKIPPED`). No schema change.
- Theme: `src/theme.ts` sets `data-theme` on `<html>`; Auto / Light / Dark is
  under More and is remembered per phone.
