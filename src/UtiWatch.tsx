import { useEffect, useState } from 'react'
import { supabase, fmtDateFull, todayStr } from './supabase'

// Signs that, taken together, are worth a phone call about a possible UTI.
// Urine character flags and urinary symptoms come from care_events; new
// confusion and a fever come from the Today tab. Two or more on the same day
// raises the banner — one on its own is common enough not to.
export const URINE_FLAGS = ['Cloudy', 'Strong odor', 'Blood/Pink', 'Sediment']

export default function UtiWatch({ date }: { date: string }) {
  const [signs, setSigns] = useState<string[]>([])

  useEffect(() => {
    let cancelled = false
    async function load() {
      const [care, sym, vit] = await Promise.all([
        supabase.from('care_events').select('kind,detail').eq('event_date', date),
        supabase.from('day_symptoms').select('symptom').eq('sym_date', date),
        supabase.from('vital_readings').select('value').eq('reading_date', date).eq('kind', 'temp'),
      ])
      const found: string[] = []
      const add = (s: string) => { if (!found.includes(s)) found.push(s) }

      for (const e of care.data ?? []) {
        if (e.kind === 'urine') URINE_FLAGS.forEach((f) => { if (e.detail.includes(f)) add(f + ' urine') })
        if (e.kind === 'urine_symptom') add(e.detail)
        if (e.kind === 'pad' && e.detail.includes('Soaked')) add('Soaked pad')
      }
      if ((sym.data ?? []).some((s) => s.symptom === 'Confusion')) add('Confusion')
      if ((vit.data ?? []).some((v) => parseFloat(v.value) >= 100.4)) add('Fever 100.4+')

      if (!cancelled) setSigns(found)
    }
    load()
    return () => { cancelled = true }
  }, [date])

  if (signs.length < 2) return null

  return (
    <div className="warn" style={{ borderLeft: '4px solid var(--red, #c0392b)' }}>
      🚩 <b>UTI watch — {signs.length} signs {date === todayStr() ? 'today' : `on ${fmtDateFull(date)}`}:</b>{' '}
      {signs.join(', ')}.
      <div style={{ marginTop: 4 }}>
        Two or more together are worth a call to the doctor — especially new confusion, which is
        often the first sign for her.
      </div>
    </div>
  )
}
