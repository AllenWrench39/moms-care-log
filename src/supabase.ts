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
  category: string
  note: string
}

export type Medication = {
  id: string
  name: string
  dosage: string | null
  instructions: string | null
  times: string[]
  active: boolean
}

export type MedDose = {
  id: string
  medication_id: string
  dose_date: string
  dose_time: string
  given_at: string
  given_by: string
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
