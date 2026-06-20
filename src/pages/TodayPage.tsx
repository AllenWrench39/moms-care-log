import { useEffect, useState } from 'react'
import {
  supabase, todayStr, fmtClock,
  VitalReading, DaySymptom, Meal, Fluid, LogEntry,
} from '../supabase'
import { useToast } from '../toast'

const VITALS: { kind: string; label: string; ph: string }[] = [
  { kind: 'bp', label: 'Blood Pressure', ph: '120/80' },
  { kind: 'heart_rate', label: 'Heart Rate bpm', ph: '72' },
  { kind: 'temp', label: 'Temperature °F', ph: '98.6' },
  { kind: 'o2', label: 'O2 Sat %', ph: '97' },
  { kind: 'weight', label: 'Weight lbs', ph: '145' },
  { kind: 'blood_sugar', label: 'Blood Sugar mg/dL', ph: '105' },
  { kind: 'pain', label: 'Pain 0–10', ph: '2' },
  { kind: 'mood', label: 'Mood', ph: 'Good' },
]

const VITAL_LABEL: Record<string, string> = Object.fromEntries(VITALS.map((v) => [v.kind, v.label]))

export const SYMPTOMS = [
  'Nausea', 'Vomiting', 'Diarrhea', 'Constipation', 'Dizziness', 'Shortness of breath',
  'Chest pain', 'Confusion', 'Fatigue', 'Swelling', 'Fall', 'No appetite',
  'Poor sleep', 'Headache', 'Weakness',
]

export const DIARRHEA_WARNING =
  'HOLD: Furosemide, Spironolactone, Losartan, Mirabegron. Do NOT hold: Keppra, Carvedilol, Acyclovir, Levothyroxine.'

const MEAL_TYPES = ['Breakfast', 'Lunch', 'Dinner', 'Snack', 'Supplement']
const FLUID_TYPES = ['Water', 'Coffee', 'Tea', 'Juice', 'Electrolytes', 'Soda', 'Milk', 'Broth', 'D-Mannose', 'Other']
const FLUID_GOAL_OZ = 64

export default function TodayPage({ nameOf, myEmail }: { nameOf: (e: string) => string; myEmail: string }) {
  const today = todayStr()
  const toast = useToast()

  const [vitals, setVitals] = useState<VitalReading[]>([])
  const [symptoms, setSymptoms] = useState<DaySymptom[]>([])
  const [meals, setMeals] = useState<Meal[]>([])
  const [fluids, setFluids] = useState<Fluid[]>([])
  const [notes, setNotes] = useState<LogEntry[]>([])

  const [vitalInputs, setVitalInputs] = useState<Record<string, string>>({})
  const [editingVital, setEditingVital] = useState<VitalReading | null>(null)
  const [editValue, setEditValue] = useState('')
  const [editTime, setEditTime] = useState('')
  const [mealType, setMealType] = useState('Breakfast')
  const [mealDesc, setMealDesc] = useState('')
  const [mealAmt, setMealAmt] = useState('')
  const [fluidType, setFluidType] = useState('Water')
  const [fluidOz, setFluidOz] = useState('8')
  const [newNote, setNewNote] = useState('')

  async function load() {
    const [v, s, m, f, n] = await Promise.all([
      supabase.from('vital_readings').select('*').eq('reading_date', today).order('created_at'),
      supabase.from('day_symptoms').select('*').eq('sym_date', today),
      supabase.from('meals').select('*').eq('meal_date', today).order('created_at'),
      supabase.from('fluids').select('*').eq('fluid_date', today).order('created_at'),
      supabase.from('log_entries').select('*').gte('created_at', today + 'T00:00:00').order('created_at', { ascending: false }),
    ])
    setVitals(v.data ?? [])
    setSymptoms(s.data ?? [])
    setMeals(m.data ?? [])
    setFluids(f.data ?? [])
    setNotes(n.data ?? [])
  }

  useEffect(() => {
    load()
    const ch = supabase
      .channel('today')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'vital_readings' }, load)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'fluids' }, load)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'log_entries' }, load)
      .subscribe()
    return () => { supabase.removeChannel(ch) }
  }, [])

  // latest reading per vital kind today
  const latest = (kind: string) => [...vitals].reverse().find((v) => v.kind === kind)

  async function saveVital(kind: string) {
    const value = (vitalInputs[kind] ?? '').trim()
    if (!value) return
    await supabase.from('vital_readings').insert({ reading_date: today, kind, value })
    setVitalInputs({ ...vitalInputs, [kind]: '' })
    toast.show('Reading saved ✓')
    load()
  }

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
    toast.show('Reading updated ✓')
    load()
  }

  async function toggleSymptom(symptom: string) {
    const existing = symptoms.find((s) => s.symptom === symptom)
    if (existing) await supabase.from('day_symptoms').delete().eq('id', existing.id)
    else await supabase.from('day_symptoms').insert({ sym_date: today, symptom })
    load()
  }

  async function addMeal() {
    if (!mealDesc.trim()) return
    await supabase.from('meals').insert({
      meal_date: today, meal_type: mealType, description: mealDesc.trim(), amount: mealAmt.trim() || null,
    })
    setMealDesc(''); setMealAmt('')
    toast.show('Meal logged ✓')
    load()
  }

  async function addFluid(oz: string) {
    const n = parseFloat(oz)
    if (!n || n <= 0) return
    await supabase.from('fluids').insert({ fluid_date: today, fluid_type: fluidType, oz: n })
    toast.show(`${n} oz ${fluidType} ✓`)
    load()
  }

  async function addNote() {
    if (!newNote.trim()) return
    await supabase.from('log_entries').insert({ note: newNote.trim() })
    setNewNote('')
    toast.show('Note saved ✓')
    load()
  }

  async function del(table: string, id: string) {
    if (!confirm('Remove this?')) return
    await supabase.from(table).delete().eq('id', id)
    load()
  }

  const totalOz = fluids.reduce((s, f) => s + Number(f.oz || 0), 0)
  const hasDiarrhea = symptoms.some((s) => ['Diarrhea', 'Vomiting'].includes(s.symptom))

  return (
    <>
      <div className="sec sec-green">
        <div className="sec-title">📊 Vitals</div>
        <div className="vgrid">
          {VITALS.map((v) => {
            const last = latest(v.kind)
            return (
              <div key={v.kind}>
                <label>{v.label}</label>
                <div className="row">
                  <input
                    className="grow"
                    value={vitalInputs[v.kind] ?? ''}
                    placeholder={last ? last.value : v.ph}
                    onChange={(e) => setVitalInputs({ ...vitalInputs, [v.kind]: e.target.value })}
                    onBlur={() => saveVital(v.kind)}
                    onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur() }}
                  />
                </div>
                {last && <div className="faint">{last.value} · {fmtClock(last.created_at)} · {nameOf(last.created_by)}</div>}
              </div>
            )
          })}
        </div>
        <div className="faint" style={{ marginTop: 7 }}>
          Type a value and tap away to save. Multiple readings per day are kept.
        </div>
        {vitals.length > 0 && (
          <div style={{ marginTop: 10 }}>
            {[...vitals].reverse().map((v) =>
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
                  <div>
                    <span className="tag">{VITAL_LABEL[v.kind] ?? v.kind}</span>
                    <b>{v.value}</b>
                    <span className="faint"> {fmtClock(v.created_at)} · {nameOf(v.created_by)}</span>
                  </div>
                  <div className="row" style={{ flexShrink: 0 }}>
                    <button className="secondary" style={{ padding: '5px 9px', fontSize: 12 }} onClick={() => startEditVital(v)}>Edit</button>
                    <button className="danger" onClick={() => del('vital_readings', v.id)}>✕</button>
                  </div>
                </div>
              )
            )}
          </div>
        )}
      </div>

      <div className="sec sec-red">
        <div className="sec-title">⚠️ Symptoms</div>
        <div className="chips">
          {SYMPTOMS.map((s) => {
            const on = symptoms.some((x) => x.symptom === s)
            return (
              <button key={s} className={`chip ${on ? 'on-red' : ''}`} onClick={() => toggleSymptom(s)}>
                {s}
              </button>
            )
          })}
        </div>
        {hasDiarrhea && (
          <div className="warn" style={{ marginTop: 10, marginBottom: 0 }}>
            ⚠️ <b>Diarrhea/Vomiting flagged.</b> {DIARRHEA_WARNING}
          </div>
        )}
      </div>

      <div className="sec sec-orange">
        <div className="sec-title">🍽 Meals</div>
        <div className="chips" style={{ marginBottom: 9 }}>
          {MEAL_TYPES.map((t) => (
            <button key={t} className={`chip ${mealType === t ? 'on' : ''}`} onClick={() => setMealType(t)}>{t}</button>
          ))}
        </div>
        <input value={mealDesc} onChange={(e) => setMealDesc(e.target.value)} placeholder="What was eaten?" />
        <div className="row">
          <input className="grow" value={mealAmt} onChange={(e) => setMealAmt(e.target.value)} placeholder="Amount (full plate, half…)" />
          <button onClick={addMeal}>Add</button>
        </div>
        {meals.map((m) => (
          <div className="feed-item" key={m.id}>
            <div>
              <span className="tag">{m.meal_type}</span>
              {m.description}{m.amount ? ` — ${m.amount}` : ''}
              <span className="faint"> {fmtClock(m.created_at)} · {nameOf(m.created_by)}</span>
            </div>
            <button className="danger" onClick={() => del('meals', m.id)}>✕</button>
          </div>
        ))}
      </div>

      <div className="sec sec-blue">
        <div className="sec-title">💧 Fluids — {totalOz} oz today</div>
        <div className="progress"><div style={{ width: Math.min(100, (totalOz / FLUID_GOAL_OZ) * 100) + '%' }} /></div>
        <div className="faint" style={{ margin: '3px 0 9px' }}>{totalOz}/{FLUID_GOAL_OZ} oz goal</div>
        <div className="chips" style={{ marginBottom: 9 }}>
          {FLUID_TYPES.map((t) => (
            <button key={t} className={`chip ${fluidType === t ? 'on-blue' : ''}`} onClick={() => setFluidType(t)}>{t}</button>
          ))}
        </div>
        <div className="chips" style={{ marginBottom: 9 }}>
          {['4', '6', '8', '12', '16'].map((oz) => (
            <button key={oz} className="chip" onClick={() => addFluid(oz)}>+{oz} oz</button>
          ))}
        </div>
        <div className="row">
          <input style={{ width: 80 }} type="number" value={fluidOz} onChange={(e) => setFluidOz(e.target.value)} />
          <button className="grow" onClick={() => addFluid(fluidOz)}>Log {fluidType}</button>
        </div>
        {[...fluids].reverse().map((f) => (
          <div className="feed-item" key={f.id}>
            <span><b>{f.oz} oz</b> {f.fluid_type} <span className="faint">{fmtClock(f.created_at)} · {nameOf(f.created_by)}</span></span>
            <button className="danger" onClick={() => del('fluids', f.id)}>✕</button>
          </div>
        ))}
      </div>

      <div className="sec sec-purple">
        <div className="sec-title">📝 Notes</div>
        <textarea
          value={newNote}
          onChange={(e) => setNewNote(e.target.value)}
          placeholder="Observations, doctor instructions, behavior changes, anything notable…"
        />
        <button onClick={addNote}>Save Note</button>
        {notes.map((n) => (
          <div className="feed-item" key={n.id}>
            <div>
              {n.note}
              <div className="faint">{fmtClock(n.created_at)} · {nameOf(n.author_email)}</div>
            </div>
            {n.author_email === myEmail && <button className="danger" onClick={() => del('log_entries', n.id)}>✕</button>}
          </div>
        ))}
      </div>

      {toast.node}
    </>
  )
}
