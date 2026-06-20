import { useEffect, useState } from 'react'
import {
  supabase, fmtDateFull, fmtClock, fmtTime24,
  VitalReading, DaySymptom, Meal, Fluid, LogEntry, MedDose, Medication, CareEvent, PtLog, PtExercise,
} from '../supabase'

function daysAgoStr(n: number) {
  const d = new Date()
  d.setDate(d.getDate() - n)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

type DayData = {
  vitals: VitalReading[]
  symptoms: DaySymptom[]
  meals: Meal[]
  fluids: Fluid[]
  notes: LogEntry[]
  doses: MedDose[]
  care: CareEvent[]
  pt: PtLog[]
}

export default function HistoryPage({ nameOf }: { nameOf: (e: string) => string }) {
  const [days, setDays] = useState<string[]>([])
  const [selected, setSelected] = useState<string | null>(null)
  const [day, setDay] = useState<DayData | null>(null)
  const [meds, setMeds] = useState<Medication[]>([])
  const [exercises, setExercises] = useState<PtExercise[]>([])
  const [summaries, setSummaries] = useState<Record<string, string[]>>({})
  const [editingVital, setEditingVital] = useState<VitalReading | null>(null)
  const [editValue, setEditValue] = useState('')
  const [editTime, setEditTime] = useState('')

  useEffect(() => {
    const since = daysAgoStr(30)
    Promise.all([
      supabase.from('vital_readings').select('reading_date,kind,value').gte('reading_date', since),
      supabase.from('fluids').select('fluid_date,oz').gte('fluid_date', since),
      supabase.from('meals').select('meal_date').gte('meal_date', since),
      supabase.from('med_doses').select('dose_date,status').gte('dose_date', since),
      supabase.from('care_events').select('event_date,kind').gte('event_date', since),
      supabase.from('medications').select('*'),
      supabase.from('pt_exercises').select('*'),
    ]).then(([v, f, m, d, c, medsRes, exRes]) => {
      setMeds(medsRes.data ?? [])
      setExercises(exRes.data ?? [])
      const tags: Record<string, string[]> = {}
      const push = (date: string, tag: string) => { (tags[date] ||= []).includes(tag) || tags[date].push(tag) }
      ;(v.data ?? []).forEach((r) => { if (r.kind === 'bp') push(r.reading_date, 'BP ' + r.value); if (r.kind === 'blood_sugar') push(r.reading_date, 'BS ' + r.value) })
      const ozByDay: Record<string, number> = {}
      ;(f.data ?? []).forEach((r) => { ozByDay[r.fluid_date] = (ozByDay[r.fluid_date] || 0) + Number(r.oz) })
      Object.entries(ozByDay).forEach(([date, oz]) => push(date, `💧${oz}oz`))
      const mealCount: Record<string, number> = {}
      ;(m.data ?? []).forEach((r) => { mealCount[r.meal_date] = (mealCount[r.meal_date] || 0) + 1 })
      Object.entries(mealCount).forEach(([date, n]) => push(date, `🍽 ${n}`))
      const givenCount: Record<string, number> = {}
      const heldCount: Record<string, number> = {}
      ;(d.data ?? []).forEach((r) => {
        if (r.status === 'given') givenCount[r.dose_date] = (givenCount[r.dose_date] || 0) + 1
        else heldCount[r.dose_date] = (heldCount[r.dose_date] || 0) + 1
      })
      Object.entries(givenCount).forEach(([date, n]) => push(date, `💊 ${n}`))
      Object.entries(heldCount).forEach(([date, n]) => push(date, `⏸ ${n} held`))
      ;(c.data ?? []).forEach((r) => { if (r.kind === 'bm') push(r.event_date, '💩') })
      setSummaries(tags)
      setDays(Object.keys(tags).sort().reverse())
    })
  }, [])

  useEffect(() => {
    if (!selected) { setDay(null); return }
    const d = selected
    Promise.all([
      supabase.from('vital_readings').select('*').eq('reading_date', d).order('created_at'),
      supabase.from('day_symptoms').select('*').eq('sym_date', d),
      supabase.from('meals').select('*').eq('meal_date', d).order('created_at'),
      supabase.from('fluids').select('*').eq('fluid_date', d).order('created_at'),
      supabase.from('log_entries').select('*').gte('created_at', d + 'T00:00:00').lt('created_at', d + 'T23:59:59').order('created_at'),
      supabase.from('med_doses').select('*').eq('dose_date', d),
      supabase.from('care_events').select('*').eq('event_date', d).order('created_at'),
      supabase.from('pt_logs').select('*').eq('log_date', d),
    ]).then(([v, s, m, f, n, doses, c, p]) => {
      setDay({
        vitals: v.data ?? [], symptoms: s.data ?? [], meals: m.data ?? [], fluids: f.data ?? [],
        notes: n.data ?? [], doses: doses.data ?? [], care: c.data ?? [], pt: p.data ?? [],
      })
    })
  }, [selected])

  function startEditVital(v: VitalReading) {
    setEditingVital(v)
    setEditValue(v.value)
    const d = new Date(v.created_at)
    setEditTime(`${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`)
  }

  async function saveVitalEdit() {
    if (!editingVital) return
    const value = editValue.trim()
    if (!value) return
    const d = new Date(editingVital.created_at)
    const [hh, mm] = editTime.split(':').map(Number)
    if (!isNaN(hh) && !isNaN(mm)) d.setHours(hh, mm, 0, 0)
    await supabase.from('vital_readings').update({ value, created_at: d.toISOString() }).eq('id', editingVital.id)
    setEditingVital(null)
    if (selected) {
      const v = await supabase.from('vital_readings').select('*').eq('reading_date', selected).order('created_at')
      setDay((prev) => prev ? { ...prev, vitals: v.data ?? [] } : prev)
    }
  }

  const medName = (id: string) => {
    const m = meds.find((x) => x.id === id)
    return m ? `${m.name} ${m.dose ?? ''}`.trim() : 'Unknown med'
  }
  const exName = (id: string) => exercises.find((x) => x.id === id)?.name ?? 'Exercise'
  const exUnit = (id: string) => exercises.find((x) => x.id === id)?.unit ?? 'sets_reps'

  if (selected && day) {
    const totalOz = day.fluids.reduce((s, f) => s + Number(f.oz), 0)
    const given = day.doses.filter((x) => x.status === 'given')
    const held = day.doses.filter((x) => x.status === 'held')
    const careKinds: { kind: string; label: string }[] = [
      { kind: 'bm', label: '💩 Bowel Movements' }, { kind: 'urine', label: '💛 Urine' },
      { kind: 'hygiene', label: '🛁 Hygiene' }, { kind: 'cleaning', label: '🧹 Cleaning' },
    ]
    return (
      <>
        <button className="secondary" style={{ marginBottom: 12 }} onClick={() => setSelected(null)}>← Back</button>
        <h3 style={{ marginTop: 0 }}>{fmtDateFull(selected)}</h3>

        {day.vitals.length > 0 && (
          <div className="sec sec-green">
            <div className="sec-title">Vitals</div>
            {day.vitals.map((v) =>
              editingVital?.id === v.id ? (
                <div className="feed-item" key={v.id}>
                  <div className="row grow" style={{ gap: 6 }}>
                    <input className="grow" value={editValue} onChange={(e) => setEditValue(e.target.value)} />
                    <input type="time" value={editTime} onChange={(e) => setEditTime(e.target.value)} style={{ width: 120 }} />
                  </div>
                  <div className="row" style={{ flexShrink: 0 }}>
                    <button onClick={saveVitalEdit}>Save</button>
                    <button className="secondary" onClick={() => setEditingVital(null)}>Cancel</button>
                  </div>
                </div>
              ) : (
                <div className="feed-item" key={v.id}>
                  <div style={{ fontSize: 13 }}>
                    <b>{v.kind.replace('_', ' ')}:</b> {v.value} <span className="faint">{fmtClock(v.created_at)} · {nameOf(v.created_by)}</span>
                  </div>
                  <button className="secondary" style={{ padding: '5px 9px', fontSize: 12, flexShrink: 0 }} onClick={() => startEditVital(v)}>Edit</button>
                </div>
              )
            )}
            {day.symptoms.length > 0 && (
              <div style={{ fontSize: 13, padding: '3px 0' }}><b>Symptoms:</b> {day.symptoms.map((s) => s.symptom).join(', ')}</div>
            )}
          </div>
        )}

        {day.meals.length > 0 && (
          <div className="sec sec-orange">
            <div className="sec-title">Meals</div>
            {day.meals.map((m) => (
              <div key={m.id} style={{ fontSize: 13, padding: '3px 0' }}>
                <b>{m.meal_type}:</b> {m.description}{m.amount ? ` (${m.amount})` : ''} <span className="faint">{fmtClock(m.created_at)}</span>
              </div>
            ))}
          </div>
        )}

        {day.fluids.length > 0 && (
          <div className="sec sec-blue">
            <div className="sec-title">Fluids — {totalOz} oz</div>
            {day.fluids.map((f) => (
              <div key={f.id} style={{ fontSize: 13, padding: '3px 0' }}>{f.oz} oz {f.fluid_type} <span className="faint">{fmtClock(f.created_at)} · {nameOf(f.created_by)}</span></div>
            ))}
          </div>
        )}

        {given.length > 0 && (
          <div className="sec sec-green">
            <div className="sec-title">Meds Given</div>
            {given.map((x) => (
              <div key={x.id} style={{ fontSize: 13, padding: '3px 0' }}>✓ {medName(x.medication_id)} @ {fmtTime24(x.dose_time)} <span className="faint">{fmtClock(x.created_at)} · {nameOf(x.created_by)}</span></div>
            ))}
          </div>
        )}

        {held.length > 0 && (
          <div className="sec sec-red">
            <div className="sec-title">Meds Held</div>
            {held.map((x) => (
              <div key={x.id} style={{ fontSize: 13, padding: '3px 0', color: 'var(--red)' }}>⏸ {medName(x.medication_id)} @ {fmtTime24(x.dose_time)} — {x.hold_reason} <span className="faint">{nameOf(x.created_by)}</span></div>
            ))}
          </div>
        )}

        {careKinds.map(({ kind, label }) => {
          const items = day.care.filter((c) => c.kind === kind)
          if (items.length === 0) return null
          return (
            <div className="sec sec-gray" key={kind}>
              <div className="sec-title">{label}</div>
              {items.map((c) => (
                <div key={c.id} style={{ fontSize: 13, padding: '3px 0' }}>{c.detail} <span className="faint">{fmtClock(c.created_at)} · {nameOf(c.created_by)}</span></div>
              ))}
            </div>
          )
        })}

        {day.pt.length > 0 && (
          <div className="sec sec-green">
            <div className="sec-title">🏋️ Physical Therapy</div>
            {day.pt.map((p) => (
              <div key={p.id} style={{ fontSize: 13, padding: '3px 0' }}>
                {exName(p.exercise_id)}: {
                  exUnit(p.exercise_id) === 'sets_reps' ? `${p.sets} × ${p.reps}` :
                  exUnit(p.exercise_id) === 'minutes' ? `${p.reps} min` :
                  exUnit(p.exercise_id) === 'feet' ? `${p.reps} ft` : `${p.reps}`
                } <span className="faint">{nameOf(p.created_by)}</span>
              </div>
            ))}
          </div>
        )}

        {day.notes.length > 0 && (
          <div className="sec sec-purple">
            <div className="sec-title">Notes</div>
            {day.notes.map((n) => (
              <div key={n.id} style={{ fontSize: 13, padding: '5px 0', borderBottom: '1px solid var(--border)' }}>
                {n.note} <span className="faint">— {nameOf(n.author_email)}, {fmtClock(n.created_at)}</span>
              </div>
            ))}
          </div>
        )}
      </>
    )
  }

  return (
    <>
      {days.length === 0 && <p className="muted center" style={{ marginTop: 40 }}>No history yet.</p>}
      {days.map((d) => (
        <div className="card hist-card" key={d} onClick={() => setSelected(d)}>
          <div style={{ fontWeight: 'bold', marginBottom: 6 }}>{fmtDateFull(d)}</div>
          <div className="chips">
            {(summaries[d] ?? []).map((t) => <span className="tag" key={t}>{t}</span>)}
          </div>
        </div>
      ))}
    </>
  )
}
