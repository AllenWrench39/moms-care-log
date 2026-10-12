import { useEffect, useState } from 'react'
import { supabase, Appointment, todayStr } from './supabase'

const localDay = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
const fmtTime = (iso: string) =>
  new Date(iso).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })

// Heads-up the day before and the day of an appointment. It drops off an hour
// after the start time, by which point she's either there or it was missed.
export default function ApptBanner({ nameOf }: { nameOf: (e: string) => string }) {
  const [appts, setAppts] = useState<Appointment[]>([])
  useEffect(() => {
    const from = new Date(Date.now() - 3600_000).toISOString()
    const to = new Date(Date.now() + 3 * 86400_000).toISOString()
    supabase.from('appointments').select('*').gte('starts_at', from).lt('starts_at', to)
      .order('starts_at').then(({ data }) => setAppts(data ?? []))
  }, [])

  const today = todayStr()
  const t = new Date(); t.setDate(t.getDate() + 1)
  const tomorrow = localDay(t)
  const shown = appts
    .map((a) => ({ a, day: localDay(new Date(a.starts_at)) }))
    .filter(({ day }) => day === today || day === tomorrow)
  if (shown.length === 0) return null

  return (
    <>
      {shown.map(({ a, day }) => (
        <div className="warn" key={a.id} style={{ borderLeft: '4px solid var(--blue)' }}>
          📅 <b>Appointment {day === today ? 'today' : 'tomorrow'} at {fmtTime(a.starts_at)}</b>
          <div style={{ marginTop: 3 }}>
            {a.title}
            {a.location && <> · {a.location}</>}
          </div>
          <div style={{ marginTop: 2 }}>
            {a.driver_email ? <>🚗 {nameOf(a.driver_email)} is taking her</> : <b>No driver set yet.</b>}
          </div>
        </div>
      ))}
    </>
  )
}
