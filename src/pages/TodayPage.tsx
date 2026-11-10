import { useEffect, useState, type ReactNode } from 'react'
import { confirmDialog } from '../confirm'
import {
  supabase, todayStr, fmtClock, fmtDateFull, stamp, dayStart, nowHHMM,
  fmtTime24, VitalReading, DaySymptom, Meal, Fluid, LogEntry, Medication, MedDose,
} from '../supabase'
import { scheduledOn } from './MedsPage'
import { useToast } from '../toast'
import DayNav, { shiftDay } from '../DayNav'
import UtiWatch from '../UtiWatch'
import { PillFillBanner } from '../PillFill'
import { PickupBanner } from './PickupsPage'
import ApptBanner from '../ApptBanner'
import VitalsEntry from '../VitalsEntry'

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
  'Nausea', 'Vomiting', 'Diarrhea', 'Constipation', 'Cramping', 'Dizziness', 'Shortness of breath',
  'Chest pain', 'Confusion', 'Fatigue', 'Swelling', 'Fall', 'No appetite',
  'Poor sleep', 'Headache', 'Weakness', 'Hemorrhoids', 'Coughing',
]

export const DIARRHEA_WARNING =
  'HOLD: Furosemide, Spironolactone, Losartan, Mirabegron. Do NOT hold: Keppra, Carvedilol, Acyclovir, Levothyroxine.'

const MEAL_TYPES = ['Breakfast', 'Lunch', 'Dinner', 'Snack', 'Supplement']

// One scale for everyone. The words were being written four different ways
// ("full plate", "100", a 100 emoji, blank), so how much she actually ate
// could not be compared across people. Each word carries its percentage.
const AMOUNTS: { label: string; pct: number }[] = [
  { label: 'None', pct: 0 },
  { label: 'A few bites', pct: 10 },
  { label: 'Quarter', pct: 25 },
  { label: 'Half', pct: 50 },
  { label: 'Most', pct: 75 },
  { label: 'All', pct: 100 },
]

export function amountText(a: { label: string; pct: number }) { return `${a.label} (${a.pct}%)` }
export function amountPct(amount: string | null): number | null {
  const m = (amount ?? '').match(/(\d+)\s*%/)
  return m ? Number(m[1]) : null
}

// What meal it probably is, from the clock. Pre-selects the chip; the logger
// still has to confirm it, which is what stops dinners landing on breakfast.
function mealTypeForHour(h: number) {
  if (h < 10.5) return 'Breakfast'
  if (h < 15) return 'Lunch'
  if (h < 20) return 'Dinner'
  return 'Snack'
}
// Coughing asks how bad, saved as e.g. "Coughing · Light".
const COUGH_LEVELS = ['Light', 'Medium', 'Heavy']

const FLUID_TYPES = ['Water', 'Coffee', 'Tea', 'Juice', 'Lemon Water', 'Electrolytes', 'Soda', 'Milk', 'Broth', 'Other']
const FLUID_GOAL_OZ = 64

type SecId = 'vitals' | 'symptoms' | 'meals' | 'fluids' | 'notes'
const OPEN_KEY = 'today-open-sections'

function loadOpen(): Record<string, boolean> {
  try { return JSON.parse(localStorage.getItem(OPEN_KEY) ?? '{}') } catch { return {} }
}

// Which of the day's notes this phone has already been shown, so the
// "new note" line clears once it has been tapped. Kept per phone, per day.
const SEEN_KEY = 'notes-seen'
function loadSeen(date: string): string[] {
  try {
    const v = JSON.parse(localStorage.getItem(SEEN_KEY) ?? '{}')
    return v.date === date && Array.isArray(v.ids) ? v.ids : []
  } catch { return [] }
}

// A section that folds down to a one-line summary. Whether it is open is
// remembered on this phone, so each caregiver keeps the layout they use.
function Section({ id, tone, title, summary, open, onToggle, children }: {
  id: SecId; tone: string; title: string; summary: string
  open: boolean; onToggle: (id: SecId) => void; children: ReactNode
}) {
  return (
    <div className={`sec sec-${tone} ${open ? 'open' : ''}`} id={`sec-${id}`}>
      <button className="sec-head" aria-expanded={open} onClick={() => onToggle(id)}>
        <span>{title}</span>
        <span className="sec-sum">{summary}</span>
        <span className="chev" aria-hidden="true">▶</span>
      </button>
      {open && children}
    </div>
  )
}

const mins = (hhmm: string) => { const [h, m] = hhmm.split(':').map(Number); return h * 60 + (m || 0) }

export default function TodayPage({ nameOf, myEmail, onOpenMeds }: {
  nameOf: (e: string) => string; myEmail: string; onOpenMeds: () => void
}) {
  const today = todayStr()
  const toast = useToast()
  const [date, setDate] = useState(todayStr())
  const [time, setTimeRaw] = useState(nowHHMM())
  const [timeEdited, setTimeEdited] = useState(false)
  const setTime = (t: string) => { setTimeRaw(t); setTimeEdited(true) }
  const resetTime = () => { setTimeRaw(nowHHMM()); setTimeEdited(false) }
  const isToday = date === today

  const [vitals, setVitals] = useState<VitalReading[]>([])
  const [symptoms, setSymptoms] = useState<DaySymptom[]>([])
  const [meals, setMeals] = useState<Meal[]>([])
  const [fluids, setFluids] = useState<Fluid[]>([])
  const [notes, setNotes] = useState<LogEntry[]>([])
  const [meds, setMeds] = useState<Medication[]>([])
  const [doses, setDoses] = useState<MedDose[]>([])
  const [openSecs, setOpenSecs] = useState<Record<string, boolean>>(loadOpen)

  function setOpen(id: SecId, open: boolean) {
    setOpenSecs((cur) => {
      const next = { ...cur, [id]: open }
      try { localStorage.setItem(OPEN_KEY, JSON.stringify(next)) } catch { /* private mode */ }
      return next
    })
  }
  const [seenNotes, setSeenNotes] = useState<string[]>(() => loadSeen(todayStr()))
  function markNotesSeen() {
    if (!isToday) return
    const ids = notes.map((n) => n.id)
    setSeenNotes(ids)
    try { localStorage.setItem(SEEN_KEY, JSON.stringify({ date, ids })) } catch { /* private mode */ }
  }
  const toggle = (id: SecId) => {
    if (id === 'notes' && !openSecs.notes) markNotesSeen()
    setOpen(id, !openSecs[id])
  }
  // From a summary tile: open the section and bring it into view.
  function jump(id: SecId) {
    setOpen(id, true)
    setTimeout(() => document.getElementById(`sec-${id}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 50)
  }

  const [editingVital, setEditingVital] = useState<VitalReading | null>(null)
  const [editValue, setEditValue] = useState('')
  const [editTime, setEditTime] = useState('')
  const [mealDesc, setMealDesc] = useState('')
  const [mealModal, setMealModal] = useState<{ type: string; amount: typeof AMOUNTS[number] | null } | null>(null)
  const [fluidType, setFluidType] = useState('Water')
  const [fluidOz, setFluidOz] = useState('8')
  const [newNote, setNewNote] = useState('')
  const [coughPick, setCoughPick] = useState(false)
  const [symptomModalOpen, setSymptomModalOpen] = useState(false)
  const [symptomTime, setSymptomTime] = useState('')

  async function load() {
    const [v, s, m, f, n, md, ds] = await Promise.all([
      supabase.from('vital_readings').select('*').eq('reading_date', date).order('created_at'),
      supabase.from('day_symptoms').select('*').eq('sym_date', date),
      supabase.from('meals').select('*').eq('meal_date', date).order('created_at'),
      supabase.from('fluids').select('*').eq('fluid_date', date).order('created_at'),
      supabase.from('log_entries').select('*')
        .gte('created_at', dayStart(date)).lt('created_at', dayStart(shiftDay(date, 1)))
        .order('created_at', { ascending: false }),
      supabase.from('medications').select('*').eq('active', true),
      supabase.from('med_doses').select('*').eq('dose_date', date),
    ])
    setVitals(v.data ?? [])
    setSymptoms(s.data ?? [])
    setMeals(m.data ?? [])
    setFluids(f.data ?? [])
    setNotes(n.data ?? [])
    setMeds(md.data ?? [])
    setDoses(ds.data ?? [])
  }

  useEffect(() => {
    load()
    const ch = supabase
      .channel('today')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'vital_readings' }, load)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'fluids' }, load)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'log_entries' }, load)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'med_doses' }, load)
      // These two only fire once the realtime migration in supabase/ is applied.
      .on('postgres_changes', { event: '*', schema: 'public', table: 'meals' }, load)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'day_symptoms' }, load)
      .subscribe()
    // Catch up on anything logged by someone else while the phone was asleep.
    const onShow = () => { if (document.visibilityState === 'visible') load() }
    document.addEventListener('visibilitychange', onShow)
    return () => { supabase.removeChannel(ch); document.removeEventListener('visibilitychange', onShow) }
  }, [date])


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
    const { error } = await supabase.from('vital_readings').update({ value, created_at: d.toISOString() }).eq('id', editingVital.id)
    if (error) { toast.show(''); return }
    setEditingVital(null)
    toast.show('Reading updated ✓')
    load()
  }

  function openSymptomModal() {
    setCoughPick(false)
    setSymptomTime(isToday && !timeEdited ? nowHHMM() : time)
    setSymptomModalOpen(true)
  }

  async function logSymptom(symptom: string) {
    const d = new Date(date + 'T12:00:00')
    const [hh, mm] = symptomTime.split(':').map(Number)
    if (!isNaN(hh) && !isNaN(mm)) d.setHours(hh, mm, 0, 0)
    const { error } = await supabase.from('day_symptoms').insert({ sym_date: date, symptom, created_at: d.toISOString() })
    if (error) { toast.show(''); return }
    toast.show(`${symptom} logged ✓`)
    load()
  }

  // Opens the confirm step rather than saving straight away.
  function openMealModal() {
    if (!mealDesc.trim()) return
    const h = timeEdited || !isToday
      ? Number(time.split(':')[0]) + Number(time.split(':')[1]) / 60
      : new Date().getHours() + new Date().getMinutes() / 60
    setMealModal({ type: mealTypeForHour(h), amount: null })
  }

  async function saveMeal() {
    if (!mealModal || !mealModal.amount) return
    const { error } = await supabase.from('meals').insert({
      meal_date: date, meal_type: mealModal.type, description: mealDesc.trim(),
      amount: amountText(mealModal.amount),
      ...stamp(date, time, timeEdited),
    })
    // Keep what was typed so it can be saved again once there is signal.
    if (error) { toast.show(''); return }
    setMealDesc(''); setMealModal(null)
    toast.show(`${mealModal.type} logged ✓`)
    load()
  }

  async function addFluid(oz: string) {
    const n = parseFloat(oz)
    if (!n || n <= 0) return
    const { error } = await supabase.from('fluids').insert({ fluid_date: date, fluid_type: fluidType, oz: n, ...stamp(date, time, timeEdited) })
    if (error) { toast.show(''); return }
    toast.show(`${n} oz ${fluidType} ✓`)
    load()
  }

  async function addNote() {
    if (!newNote.trim()) return
    const { error } = await supabase.from('log_entries').insert({ note: newNote.trim(), ...stamp(date, time, timeEdited) })
    if (error) { toast.show(''); return }
    setNewNote('')
    toast.show('Note saved ✓')
    load()
  }

  async function del(table: string, id: string) {
    if (!(await confirmDialog('Remove this?'))) return
    const { error } = await supabase.from(table).delete().eq('id', id)
    if (error) toast.show('')
    load()
  }

  const mealPcts = meals.map((m) => amountPct(m.amount)).filter((n): n is number => n !== null)
  const eatenAvg = mealPcts.length ? Math.round(mealPcts.reduce((a, b) => a + b, 0) / mealPcts.length) : null
  const totalOz = fluids.reduce((s, f) => s + Number(f.oz || 0), 0)
  // Scheduled doses with nothing logged yet (given or held) for this day.
  const nowMin = mins(nowHHMM())
  const unlogged = meds
    .filter((med) => scheduledOn(med, date))
    .flatMap((med) => med.times.map((t) => ({ med, t })))
    .filter(({ med, t }) => !doses.some((d) => d.medication_id === med.id && d.dose_time === t))
  const dueNow = unlogged.filter(({ t }) => !isToday || mins(t) <= nowMin)
  const nextTime = isToday
    ? unlogged.map(({ t }) => t).filter((t) => mins(t) > nowMin).sort((a, b) => mins(a) - mins(b))[0]
    : undefined
  const lastVital = vitals.length ? vitals[vitals.length - 1] : null
  const vitalKinds = new Set(vitals.map((v) => v.kind)).size

  // Today's notes from other caregivers that this phone has not opened yet.
  const newNotes = isToday
    ? notes.filter((n) => n.author_email?.toLowerCase() !== myEmail.toLowerCase() && !seenNotes.includes(n.id))
    : []

  const hasDiarrhea = symptoms.some((s) => ['Diarrhea', 'Vomiting'].includes(s.symptom))

  return (
    <>
      <DayNav date={date} onChange={setDate} time={time} onTimeChange={setTime}
        timeEdited={timeEdited} onResetTime={resetTime} />
      {!isToday && (
        <div className="warn">⏪ Logging for <b>{fmtDateFull(date)}</b> — not today. Everything on this tab is saved to that day.</div>
      )}

      <UtiWatch date={date} />
      {isToday && <PillFillBanner />}
      {isToday && <ApptBanner nameOf={nameOf} />}
      {isToday && <PickupBanner />}

      {newNotes.length > 0 && (
        <button className="note-alert" onClick={() => { markNotesSeen(); jump('notes') }}>
          <span>📝 {newNotes.length} new note{newNotes.length === 1 ? '' : 's'} today</span>
          <span aria-hidden="true">Read ›</span>
        </button>
      )}

      <div className="tiles">
        <button className={`tile tile-wide ${dueNow.length ? 'alert' : 'good'}`} onClick={onOpenMeds}>
          <span>
            <span className="tile-label">💊 Scheduled meds</span><br />
            <span className="tile-value">
              {dueNow.length
                ? `${dueNow.length} ${isToday ? 'due now' : 'not logged'}`
                : meds.length ? 'All logged so far ✓' : '—'}
            </span>
          </span>
          <span className="tile-sub">{nextTime ? `Next at ${fmtTime24(nextTime)} ›` : 'Open Meds ›'}</span>
        </button>
        <button className="tile" onClick={() => jump('fluids')}>
          <span className="tile-label">💧 Fluids</span>
          <span className="tile-value">{totalOz} oz</span>
          <span className="tile-sub">of {FLUID_GOAL_OZ} oz goal</span>
        </button>
        <button className="tile" onClick={() => jump('meals')}>
          <span className="tile-label">🍽 Meals</span>
          <span className="tile-value">{meals.length || 'None'}</span>
          <span className="tile-sub">{eatenAvg !== null ? `ate ${eatenAvg}% on average` : 'tap to log'}</span>
        </button>
        <button className="tile" onClick={() => jump('vitals')}>
          <span className="tile-label">📊 Vitals</span>
          <span className="tile-value">{vitalKinds ? `${vitalKinds} taken` : 'None'}</span>
          <span className="tile-sub">{lastVital ? `last at ${fmtClock(lastVital.created_at)}` : 'tap to log'}</span>
        </button>
        <button className={`tile ${symptoms.length ? 'alert' : ''}`} onClick={() => jump('symptoms')}>
          <span className="tile-label">⚠️ Symptoms</span>
          <span className="tile-value">{symptoms.length || 'None'}</span>
          <span className="tile-sub">{symptoms.length ? symptoms[symptoms.length - 1].symptom : 'tap to log'}</span>
        </button>
      </div>

      <Section id="vitals" tone="green" title="📊 Vitals" open={!!openSecs.vitals} onToggle={toggle}
        summary={vitals.length ? `${vitals.length} reading${vitals.length === 1 ? '' : 's'}` : 'none yet'}>
        <VitalsEntry date={date} time={time} timeEdited={timeEdited}
          onSaved={load} toast={toast.show} />
        <div className="faint" style={{ marginTop: 7 }}>
          Fill in only what you measured. Multiple readings per day are kept.
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
                    <button className="secondary" style={{ padding: '5px 9px', fontSize: 14 }} onClick={() => startEditVital(v)}>Edit</button>
                    <button className="danger" aria-label="Remove" onClick={() => del('vital_readings', v.id)}>✕</button>
                  </div>
                </div>
              )
            )}
          </div>
        )}
      </Section>

      <Section id="symptoms" tone="red" title="⚠️ Symptoms" open={!!openSecs.symptoms || hasDiarrhea} onToggle={toggle}
        summary={symptoms.length ? `${symptoms.length} logged` : 'none'}>
        <button onClick={openSymptomModal}>+ Add Symptom</button>
        {symptoms.length > 0 && (
          <div style={{ marginTop: 10 }}>
            {[...symptoms].reverse().map((s) => (
              <div className="feed-item" key={s.id}>
                <span><b>{s.symptom}</b> <span className="faint">{fmtClock(s.created_at)} · {nameOf(s.created_by)}</span></span>
                <button className="danger" aria-label="Remove" onClick={() => del('day_symptoms', s.id)}>✕</button>
              </div>
            ))}
          </div>
        )}
        {hasDiarrhea && (
          <div className="warn" style={{ marginTop: 10, marginBottom: 0 }}>
            ⚠️ <b>Diarrhea/Vomiting flagged.</b> {DIARRHEA_WARNING}
          </div>
        )}
      </Section>

      <Section id="meals" tone="orange" title="🍽 Meals" open={!!openSecs.meals} onToggle={toggle}
        summary={meals.length ? `${meals.length} logged${eatenAvg !== null ? ` · ${eatenAvg}%` : ''}` : 'none yet'}>
        <input value={mealDesc} onChange={(e) => setMealDesc(e.target.value)}
          placeholder="What was eaten? e.g. 1 egg, 2 sausage, half a bagel"
          onKeyDown={(e) => { if (e.key === 'Enter') openMealModal() }} />
        <button onClick={openMealModal} disabled={!mealDesc.trim()}>Next — pick meal &amp; amount</button>
        {meals.map((m) => (
          <div className="feed-item" key={m.id}>
            <div>
              <span className="tag">{m.meal_type}</span>
              {m.description}{m.amount ? ` — ${m.amount}` : ''}
              <span className="faint"> {fmtClock(m.created_at)} · {nameOf(m.created_by)}</span>
            </div>
            <button className="danger" aria-label="Remove" onClick={() => del('meals', m.id)}>✕</button>
          </div>
        ))}
      </Section>

      <Section id="fluids" tone="blue" title="💧 Fluids" open={!!openSecs.fluids} onToggle={toggle}
        summary={`${totalOz} / ${FLUID_GOAL_OZ} oz`}>
        <div className="progress"><div style={{ width: Math.min(100, (totalOz / FLUID_GOAL_OZ) * 100) + '%' }} /></div>
        <div className="faint" style={{ margin: '3px 0 9px' }}>{totalOz}/{FLUID_GOAL_OZ} oz goal</div>
        <div className="chips" style={{ marginBottom: 9 }}>
          {FLUID_TYPES.map((t) => (
            <button key={t} className={`chip ${fluidType === t ? 'on-blue' : ''}`} onClick={() => setFluidType(t)}>{t}</button>
          ))}
        </div>
        <div className="chips" style={{ marginBottom: 9 }}>
          {['2', '4', '6', '8', '10', '12', '16', '20'].map((oz) => (
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
            <button className="danger" aria-label="Remove" onClick={() => del('fluids', f.id)}>✕</button>
          </div>
        ))}
      </Section>

      <Section id="notes" tone="purple" title="📝 Notes" open={!!openSecs.notes} onToggle={toggle}
        summary={notes.length ? `${notes.length} saved` : 'none yet'}>
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
            {n.author_email === myEmail && <button className="danger" aria-label="Remove" onClick={() => del('log_entries', n.id)}>✕</button>}
          </div>
        ))}
      </Section>

      {mealModal && (
        <div className="modal-back" onClick={() => setMealModal(null)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div style={{ fontWeight: 'bold', fontSize: 15, marginBottom: 2 }}>{mealDesc.trim()}</div>
            <div className="muted" style={{ marginBottom: 12 }}>Which meal was this?</div>
            <div className="chips" style={{ marginBottom: 16 }}>
              {MEAL_TYPES.map((t) => (
                <button key={t} className={`chip ${mealModal.type === t ? 'on' : ''}`}
                  onClick={() => setMealModal({ ...mealModal, type: t })}>{t}</button>
              ))}
            </div>
            <div className="muted" style={{ marginBottom: 8 }}>How much did she eat?</div>
            <div className="chips" style={{ marginBottom: 16 }}>
              {AMOUNTS.map((a) => (
                <button key={a.label} className={`chip ${mealModal.amount?.label === a.label ? 'on' : ''}`}
                  onClick={() => setMealModal({ ...mealModal, amount: a })}>{a.label} <span className="faint">{a.pct}%</span></button>
              ))}
            </div>
            <div className="row">
              <button className="grow" onClick={saveMeal} disabled={!mealModal.amount}>
                {mealModal.amount ? `Save ${mealModal.type}` : 'Pick an amount'}
              </button>
              <button className="secondary" onClick={() => setMealModal(null)}>Cancel</button>
            </div>
          </div>
        </div>
      )}

      {symptomModalOpen && (
        <div className="modal-back" onClick={() => setSymptomModalOpen(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div style={{ fontWeight: 'bold', fontSize: 15, marginBottom: 12 }}>Log a symptom</div>
            <label>Time</label>
            <input type="time" value={symptomTime} onChange={(e) => setSymptomTime(e.target.value)} style={{ marginBottom: 14 }} />
            <div className="chips" style={{ marginBottom: 14 }}>
              {SYMPTOMS.map((s) => (
                <button key={s} className={`chip ${coughPick && s === 'Coughing' ? 'on' : ''}`}
                  onClick={() => s === 'Coughing' ? setCoughPick(!coughPick) : logSymptom(s)}>{s}</button>
              ))}
            </div>
            {coughPick && (
              <>
                <label>How bad is the cough?</label>
                <div className="chips" style={{ marginBottom: 14 }}>
                  {COUGH_LEVELS.map((l) => (
                    <button key={l} className="chip" onClick={() => { logSymptom(`Coughing · ${l}`); setCoughPick(false) }}>{l}</button>
                  ))}
                </div>
              </>
            )}
            <button className="secondary" style={{ width: '100%' }} onClick={() => setSymptomModalOpen(false)}>Done</button>
          </div>
        </div>
      )}

      {toast.node}
    </>
  )
}
