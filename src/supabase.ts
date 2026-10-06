import { createClient } from '@supabase/supabase-js'

const url = import.meta.env.VITE_SUPABASE_URL
const key = import.meta.env.VITE_SUPABASE_ANON_KEY

if (!url || !key) {
  throw new Error('Missing VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY — see README setup steps.')
}

export const supabase = createClient(url, key)

export type FamilyMember = { email: string; display_name: string }

export type LogEntry = {
  id: string
  created_at: string
  author_email: string
  note: string
}

export type VitalReading = {
  id: string
  reading_date: string
  kind: string
  value: string
  created_at: string
  created_by: string
}

export type DaySymptom = {
  id: string
  sym_date: string
  symptom: string
  created_at: string
  created_by: string
}

export type Meal = {
  id: string
  meal_date: string
  meal_type: string
  description: string
  amount: string | null
  created_at: string
  created_by: string
}

export type Fluid = {
  id: string
  fluid_date: string
  fluid_type: string
  oz: number
  created_at: string
  created_by: string
}

export type Medication = {
  id: string
  name: string
  dose: string | null
  times: string[]
  with_food: boolean
  notes: string | null
  hold_diarrhea: boolean
  never_hold: boolean
  active: boolean
  sort_order: number
  scheduled_days: number[] | null
}

export type MedDose = {
  id: string
  medication_id: string
  dose_date: string
  dose_time: string
  status: 'given' | 'held'
  hold_reason: string | null
  med_name: string | null   // snapshot at logging time; null on pre-migration rows
  med_dose: string | null
  created_at: string
  created_by: string
}

export type PowderLog = {
  id: string
  item: string
  amount: string
  log_date: string
  created_at: string
  created_by: string
}

export type CareEvent = {
  id: string
  event_date: string
  kind: 'bm' | 'urine' | 'urine_symptom' | 'pad' | 'hygiene' | 'cleaning' | 'pill_fill'
  detail: string
  created_at: string
  created_by: string
}

export type PtExercise = {
  id: string
  name: string
  unit: 'sets_reps' | 'minutes' | 'feet' | 'custom'
  target_sets: number
  target_reps: number
  weekly_goal: number   // 0 = no goal; measured in the exercise's own unit
  active: boolean
}

// Monday-start week containing a date, as YYYY-MM-DD bounds.
export function weekBounds(date: string): { start: string; end: string } {
  const d = new Date(date + 'T12:00:00')
  const dow = (d.getDay() + 6) % 7          // Mon = 0
  const mon = new Date(d); mon.setDate(d.getDate() - dow)
  const sun = new Date(mon); sun.setDate(mon.getDate() + 6)
  const fmt = (x: Date) =>
    `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}-${String(x.getDate()).padStart(2, '0')}`
  return { start: fmt(mon), end: fmt(sun) }
}

export type PtLog = {
  id: string
  exercise_id: string
  log_date: string
  sets: number
  reps: number
  exercise_name: string | null   // snapshot at logging time; null on pre-migration rows
  exercise_unit: string | null
  created_at: string
  created_by: string
}

export type CaregiverNote = {
  id: string
  text: string
  created_at: string
  created_by: string
}

export type NoteChange = {
  id: string
  action: string
  old_text: string | null
  new_text: string | null
  created_at: string
  created_by: string
}

export type Appointment = {
  id: string
  title: string
  location: string | null
  starts_at: string
  driver_email: string | null
  notes: string | null
}

export type Task = {
  id: string
  title: string
  kind: 'task' | 'shift'
  due_date: string | null
  assigned_to: string | null
  done: boolean
  done_by: string | null
  done_at: string | null
}

// ---- shared helpers ----
export function todayStr() {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

export function fmtClock(iso: string) {
  return new Date(iso).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })
}

export function fmtTime24(t: string) {
  const [h, m] = t.split(':').map(Number)
  const ampm = h >= 12 ? 'PM' : 'AM'
  const hh = h % 12 === 0 ? 12 : h % 12
  return `${hh}:${String(m).padStart(2, '0')} ${ampm}`
}

export function fmtDateShort(d: string) {
  return new Date(d + 'T12:00:00').toLocaleDateString([], { month: 'short', day: 'numeric' })
}

export function fmtDateFull(d: string) {
  return new Date(d + 'T12:00:00').toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' })
}

// Timestamp for a log entered against an earlier day. Returns undefined for
// today so the DB `now()` default (with real seconds) is used instead.
export function stampFor(date: string, hhmm: string, forceTime = false): string | undefined {
  if (date === todayStr() && !forceTime) return undefined
  const [h, m] = (hhmm || '').split(':').map(Number)
  const d = new Date(date + 'T12:00:00')
  if (!isNaN(h) && !isNaN(m)) d.setHours(h, m, 0, 0)
  return d.toISOString()
}

// Spreads `created_at` into an insert payload when backdating, or when the
// logger set the time by hand on today's date (a 12:43am trip logged at 7am).
export function stamp(date: string, hhmm: string, forceTime = false): { created_at?: string } {
  const at = stampFor(date, hhmm, forceTime)
  return at ? { created_at: at } : {}
}

// Local midnight of a date, as an ISO instant — for filtering timestamp
// columns (log_entries) down to one calendar day.
export function dayStart(date: string) {
  const d = new Date(date + 'T12:00:00')
  d.setHours(0, 0, 0, 0)
  return d.toISOString()
}

export function nowHHMM() {
  const d = new Date()
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}
