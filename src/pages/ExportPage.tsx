import { useState } from 'react'
import { supabase, fmtTime24 } from '../supabase'

const FILTERS: { id: string; label: string }[] = [
  { id: 'all', label: 'All Data' },
  { id: 'vitals', label: 'Vitals' },
  { id: 'meds', label: 'Medications' },
  { id: 'fluids', label: 'Fluids' },
  { id: 'meals', label: 'Meals' },
  { id: 'care', label: 'Care' },
  { id: 'notes', label: 'Notes' },
]

export default function ExportPage() {
  const [filter, setFilter] = useState('all')
  const [busy, setBusy] = useState(false)

  async function exportCSV() {
    setBusy(true)
    const rows: string[][] = [['Date', 'Time', 'Logged By', 'Type', 'Item', 'Value']]
    const want = (k: string) => filter === 'all' || filter === k

    const clock = (iso: string) => new Date(iso).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })
    const dateOf = (iso: string) => iso.split('T')[0]

    if (want('vitals')) {
      const { data } = await supabase.from('vital_readings').select('*').order('reading_date')
      ;(data ?? []).forEach((v) => rows.push([v.reading_date, clock(v.created_at), v.created_by, 'Vitals', v.kind.replace('_', ' '), v.value]))
      const { data: sym } = await supabase.from('day_symptoms').select('*').order('sym_date')
      ;(sym ?? []).forEach((s) => rows.push([s.sym_date, '', s.created_by, 'Symptom', s.symptom, '']))
    }
    if (want('meds')) {
      const [{ data: meds }, { data: doses }] = await Promise.all([
        supabase.from('medications').select('*'),
        supabase.from('med_doses').select('*').order('dose_date'),
      ])
      ;(doses ?? []).forEach((d) => {
        const m = (meds ?? []).find((x) => x.id === d.medication_id)
        const name = m ? `${m.name} ${m.dose ?? ''}`.trim() : 'Unknown'
        rows.push([
          d.dose_date, clock(d.created_at), d.created_by,
          d.status === 'given' ? 'Medication' : 'Medication HELD',
          `${name} @ ${fmtTime24(d.dose_time)}`,
          d.status === 'given' ? 'Given' : `Held: ${d.hold_reason}`,
        ])
      })
    }
    if (want('fluids')) {
      const { data } = await supabase.from('fluids').select('*').order('fluid_date')
      ;(data ?? []).forEach((f) => rows.push([f.fluid_date, clock(f.created_at), f.created_by, 'Fluids', f.fluid_type, `${f.oz} oz`]))
    }
    if (want('meals')) {
      const { data } = await supabase.from('meals').select('*').order('meal_date')
      ;(data ?? []).forEach((m) => rows.push([m.meal_date, clock(m.created_at), m.created_by, 'Meal', m.meal_type, m.description + (m.amount ? ` (${m.amount})` : '')]))
    }
    if (want('care')) {
      // cleaning excluded from exports — internal housekeeping, not medical
      const { data } = await supabase.from('care_events').select('*').neq('kind', 'cleaning').order('event_date')
      ;(data ?? []).forEach((c) => rows.push([c.event_date, clock(c.created_at), c.created_by, 'Care', c.kind.toUpperCase(), c.detail]))
      const [{ data: pt }, { data: ex }] = await Promise.all([
        supabase.from('pt_logs').select('*').order('log_date'),
        supabase.from('pt_exercises').select('*'),
      ])
      ;(pt ?? []).forEach((p) => {
        const e = (ex ?? []).find((x) => x.id === p.exercise_id)
        const unit = e?.unit ?? 'sets_reps'
        const amount = unit === 'sets_reps' ? `${p.sets} sets x ${p.reps} reps` : unit === 'minutes' ? `${p.reps} min` : unit === 'feet' ? `${p.reps} ft` : String(p.reps)
        rows.push([p.log_date, clock(p.created_at), p.created_by, 'PT', e?.name ?? 'Exercise', amount])
      })
    }
    if (want('notes')) {
      const { data } = await supabase.from('log_entries').select('*').order('created_at')
      ;(data ?? []).forEach((n) => rows.push([dateOf(n.created_at), clock(n.created_at), n.author_email, 'Note', '', n.note]))
    }

    const csv = rows.map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(',')).join('\n')
    const blob = new Blob([csv], { type: 'text/csv' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `moms-care-${filter}-${new Date().toISOString().split('T')[0]}.csv`
    a.click()
    URL.revokeObjectURL(url)
    setBusy(false)
  }

  return (
    <>
      <div className="sec sec-purple">
        <div className="sec-title">📤 Export for Doctor</div>
        <p className="muted" style={{ marginTop: 0 }}>
          Choose what to include, then download a CSV. Open in Excel or Google Sheets, or email it to the doctor before appointments.
        </p>
        <div className="chips" style={{ marginBottom: 13 }}>
          {FILTERS.map((f) => (
            <button key={f.id} className={`chip ${filter === f.id ? 'on' : ''}`} onClick={() => setFilter(f.id)}>{f.label}</button>
          ))}
        </div>
        <button style={{ width: '100%', padding: '12px 0', fontSize: 15 }} disabled={busy} onClick={exportCSV}>
          {busy ? 'Preparing…' : `⬇ Download ${FILTERS.find((f) => f.id === filter)?.label} as CSV`}
        </button>
        <div className="faint" style={{ marginTop: 8 }}>Cleaning tasks are never included in exports.</div>
      </div>

      <div className="sec sec-orange">
        <div className="sec-title">ℹ️ Sharing tips</div>
        <ul className="muted" style={{ paddingLeft: 16, margin: 0, lineHeight: 2 }}>
          <li>Tap <b>👁 View</b> in the header for read-only mode when showing a doctor</li>
          <li>Download a CSV before appointments and email or print it</li>
          <li>Family members sign in with their own email — add people in Supabase → family_members</li>
        </ul>
      </div>
    </>
  )
}
