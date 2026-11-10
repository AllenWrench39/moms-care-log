import { useEffect, useMemo, useState, type ReactNode } from 'react'
import {
  supabase, todayStr, fmtDateFull, fmtClock, fmtTime24, dayStart, FamilyMember,
  VitalReading, DaySymptom, Meal, Fluid, LogEntry, MedDose, Medication, CareEvent, PtLog, PtExercise, PowderLog,
} from '../supabase'
import { amountPct } from './TodayPage'
import { POWDER_SKIPPED } from './MedsPage'
import { shiftDay } from '../DayNav'
import { useToast } from '../toast'

// ---- one shape for everything that can be logged ----
type Kind =
  | 'vital' | 'symptom' | 'meal' | 'fluid' | 'note'
  | 'given' | 'held' | 'prn' | 'powder'
  | 'bm' | 'urine' | 'urine_symptom' | 'pad' | 'hygiene' | 'cleaning' | 'pill_fill'
  | 'pt'

type Entry = {
  key: string
  id: string
  kind: Kind
  date: string        // the calendar day it belongs to (YYYY-MM-DD)
  at: string          // when it happened / was logged (ISO)
  text: string
  by: string
  bad?: boolean       // shown in red: symptoms, held or skipped meds
  sub?: string        // vital kind or symptom name
  val?: string        // a vital's raw value, for editing
  num?: number        // fluid oz or meal percent
}

type PrnLog = { id: string; name: string; dose: string | null; reason: string | null; log_date: string; created_at: string; created_by: string }

const KIND: Record<Kind, { icon: string; label: string; group: string; tone: string }> = {
  symptom:       { icon: '⚠️', label: 'Symptom',         group: 'Symptoms',          tone: 'red' },
  urine_symptom: { icon: '🚽', label: 'Urinary symptom', group: 'Urinary symptoms',  tone: 'red' },
  held:          { icon: '⏸', label: 'Med held',        group: 'Meds held',         tone: 'red' },
  vital:         { icon: '📊', label: 'Vital',           group: 'Vitals',            tone: 'green' },
  given:         { icon: '💊', label: 'Med given',       group: 'Meds given',        tone: 'green' },
  prn:           { icon: '💊', label: 'As-needed med',   group: 'As-needed meds',    tone: 'green' },
  powder:        { icon: '🌾', label: 'Powder',          group: 'Fiber, MiraLAX & D-Mannose', tone: 'green' },
  meal:          { icon: '🍽', label: 'Meal',            group: 'Meals',             tone: 'orange' },
  fluid:         { icon: '💧', label: 'Fluid',           group: 'Fluids',            tone: 'blue' },
  bm:            { icon: '💩', label: 'BM',              group: 'Bowel movements',   tone: 'orange' },
  urine:         { icon: '💛', label: 'Urine',           group: 'Urine',             tone: 'yellow' },
  pad:           { icon: '🛏', label: 'Pad change',      group: 'Pad changes',       tone: 'blue' },
  hygiene:       { icon: '🛁', label: 'Hygiene',         group: 'Hygiene',           tone: 'blue' },
  cleaning:      { icon: '🧹', label: 'Cleaning',        group: 'Cleaning',          tone: 'gray' },
  pill_fill:     { icon: '💊', label: 'Pill box fill',   group: 'Pill box fills',    tone: 'gray' },
  pt:            { icon: '🏋️', label: 'PT',              group: 'Physical therapy',  tone: 'green' },
  note:          { icon: '📝', label: 'Note',            group: 'Notes',             tone: 'purple' },
}
const KIND_ORDER = Object.keys(KIND) as Kind[]

const FILTERS: { id: string; label: string; test: (e: Entry) => boolean }[] = [
  { id: 'all',      label: 'All',            test: () => true },
  { id: 'symptoms', label: '⚠️ Symptoms',    test: (e) => e.kind === 'symptom' || e.kind === 'urine_symptom' },
  { id: 'held',     label: '⏸ Held / skipped', test: (e) => e.kind === 'held' || (e.kind === 'powder' && !!e.bad) },
  { id: 'meds',     label: '💊 Meds',        test: (e) => ['given', 'held', 'prn', 'powder'].includes(e.kind) },
  { id: 'vitals',   label: '📊 Vitals',      test: (e) => e.kind === 'vital' },
  { id: 'meals',    label: '🍽 Meals',       test: (e) => e.kind === 'meal' },
  { id: 'fluids',   label: '💧 Fluids',      test: (e) => e.kind === 'fluid' },
  { id: 'bathroom', label: '🚽 Bathroom',    test: (e) => ['bm', 'urine', 'pad'].includes(e.kind) },
  { id: 'care',     label: '🛁 Care',        test: (e) => ['hygiene', 'cleaning', 'pill_fill'].includes(e.kind) },
  { id: 'pt',       label: '🏋️ PT',          test: (e) => e.kind === 'pt' },
  { id: 'notes',    label: '📝 Notes',       test: (e) => e.kind === 'note' },
]

const RANGES = [{ days: 7, label: '7 days' }, { days: 30, label: '30 days' }, { days: 90, label: '90 days' }, { days: 0, label: 'All time' }]

const VITAL_LABEL: Record<string, string> = {
  bp: 'Blood pressure', heart_rate: 'Heart rate', temp: 'Temperature', o2: 'O2 sat',
  weight: 'Weight', blood_sugar: 'Blood sugar', pain: 'Pain', mood: 'Mood',
}
const LOW_FLUID_OZ = 32   // half the 64 oz daily goal
const PAGE = 200          // search results shown before "show more"

function localDate(iso: string) {
  const d = new Date(iso)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

// Supabase returns at most 1,000 rows per request, so page until done.
async function fetchAll<T>(table: string, col: string, since: string, isTimestamp = false): Promise<T[]> {
  const out: T[] = []
  for (let from = 0; ; from += 1000) {
    let q = supabase.from(table).select('*')
    if (since) q = q.gte(col, isTimestamp ? dayStart(since) : since)
    const { data, error } = await q.order(col).order('id').range(from, from + 999)
    if (error || !data) break
    out.push(...(data as T[]))
    if (data.length < 1000) break
  }
  return out
}

function Highlight({ text, q }: { text: string; q: string }) {
  if (!q) return <>{text}</>
  const i = text.toLowerCase().indexOf(q)
  if (i < 0) return <>{text}</>
  return <>{text.slice(0, i)}<mark>{text.slice(i, i + q.length)}</mark>{text.slice(i + q.length)}</>
}

export default function HistoryPage({ nameOf, family, readOnly }: {
  nameOf: (e: string) => string; family: FamilyMember[]; readOnly?: boolean
}) {
  const today = todayStr()
  const toast = useToast()
  const [entries, setEntries] = useState<Entry[]>([])
  const [loading, setLoading] = useState(true)
  const [rangeDays, setRangeDays] = useState(30)
  const [query, setQuery] = useState('')
  const [filter, setFilter] = useState('all')
  const [person, setPerson] = useState('')
  const [shown, setShown] = useState(PAGE)
  const [selected, setSelected] = useState<string | null>(null)
  const [dayView, setDayViewRaw] = useState<'timeline' | 'grouped'>(
    () => (localStorage.getItem('history-day-view') === 'grouped' ? 'grouped' : 'timeline'))
  const setDayView = (v: 'timeline' | 'grouped') => {
    setDayViewRaw(v)
    try { localStorage.setItem('history-day-view', v) } catch { /* private mode */ }
  }
  const [editing, setEditing] = useState<Entry | null>(null)
  const [editValue, setEditValue] = useState('')
  const [editTime, setEditTime] = useState('')

  const since = rangeDays ? shiftDay(today, -(rangeDays - 1)) : ''

  async function load() {
    setLoading(true)
    const [v, s, m, f, n, d, c, p, prn, pw, medsRes, exRes] = await Promise.all([
      fetchAll<VitalReading>('vital_readings', 'reading_date', since),
      fetchAll<DaySymptom>('day_symptoms', 'sym_date', since),
      fetchAll<Meal>('meals', 'meal_date', since),
      fetchAll<Fluid>('fluids', 'fluid_date', since),
      fetchAll<LogEntry>('log_entries', 'created_at', since, true),
      fetchAll<MedDose>('med_doses', 'dose_date', since),
      fetchAll<CareEvent>('care_events', 'event_date', since),
      fetchAll<PtLog>('pt_logs', 'log_date', since),
      fetchAll<PrnLog>('prn_logs', 'log_date', since),
      fetchAll<PowderLog>('powder_logs', 'log_date', since),
      supabase.from('medications').select('*'),
      supabase.from('pt_exercises').select('*'),
    ])
    const meds: Medication[] = medsRes.data ?? []
    const exercises: PtExercise[] = exRes.data ?? []
    // Prefer the name snapshot stored on the log row, so history does not
    // change when a medication or exercise is edited later.
    const medName = (x: MedDose) => {
      if (x.med_name) return `${x.med_name} ${x.med_dose ?? ''}`.trim()
      const med = meds.find((y) => y.id === x.medication_id)
      return med ? `${med.name} ${med.dose ?? ''}`.trim() : 'Unknown med'
    }
    const ptText = (x: PtLog) => {
      const ex = exercises.find((y) => y.id === x.exercise_id)
      const name = x.exercise_name ?? ex?.name ?? 'Exercise'
      const unit = x.exercise_unit ?? ex?.unit ?? 'sets_reps'
      const amt = unit === 'sets_reps' ? `${x.sets} × ${x.reps}` : unit === 'minutes' ? `${x.reps} min` : unit === 'feet' ? `${x.reps} ft` : `${x.reps}`
      return `${name}: ${amt}`
    }

    const all: Entry[] = [
      ...v.map((x): Entry => ({ key: 'v' + x.id, id: x.id, kind: 'vital', date: x.reading_date, at: x.created_at, by: x.created_by,
        text: `${VITAL_LABEL[x.kind] ?? x.kind.replace('_', ' ')} ${x.value}`, sub: x.kind, val: x.value })),
      ...s.map((x): Entry => ({ key: 's' + x.id, id: x.id, kind: 'symptom', date: x.sym_date, at: x.created_at, by: x.created_by,
        text: x.symptom, sub: x.symptom, bad: true })),
      ...m.map((x): Entry => ({ key: 'm' + x.id, id: x.id, kind: 'meal', date: x.meal_date, at: x.created_at, by: x.created_by,
        text: `${x.meal_type}: ${x.description}${x.amount ? ` — ${x.amount}` : ''}`, num: amountPct(x.amount) ?? undefined })),
      ...f.map((x): Entry => ({ key: 'f' + x.id, id: x.id, kind: 'fluid', date: x.fluid_date, at: x.created_at, by: x.created_by,
        text: `${x.oz} oz ${x.fluid_type}`, num: Number(x.oz) || 0 })),
      // Notes have no date column; use the local day they were written.
      ...n.map((x): Entry => ({ key: 'n' + x.id, id: x.id, kind: 'note', date: localDate(x.created_at), at: x.created_at, by: x.author_email,
        text: x.note })),
      ...d.map((x): Entry => x.status === 'held'
        ? { key: 'd' + x.id, id: x.id, kind: 'held', date: x.dose_date, at: x.created_at, by: x.created_by, bad: true,
            text: `${medName(x)} (${fmtTime24(x.dose_time)} dose) — held: ${x.hold_reason ?? 'no reason given'}` }
        : { key: 'd' + x.id, id: x.id, kind: 'given', date: x.dose_date, at: x.created_at, by: x.created_by,
            text: `${medName(x)} (${fmtTime24(x.dose_time)} dose)` }),
      ...prn.map((x): Entry => ({ key: 'r' + x.id, id: x.id, kind: 'prn', date: x.log_date, at: x.created_at, by: x.created_by,
        text: `${x.name}${x.dose ? ` ${x.dose}` : ''}${x.reason ? ` — ${x.reason}` : ''}` })),
      ...pw.map((x): Entry => ({ key: 'w' + x.id, id: x.id, kind: 'powder', date: x.log_date, at: x.created_at, by: x.created_by,
        text: x.amount === POWDER_SKIPPED ? `${x.item} — skipped` : `${x.item} ${x.amount}`, bad: x.amount === POWDER_SKIPPED })),
      ...c.filter((x) => x.kind in KIND).map((x): Entry => ({ key: 'c' + x.id, id: x.id, kind: x.kind as Kind, date: x.event_date, at: x.created_at, by: x.created_by,
        text: x.detail, bad: x.kind === 'urine_symptom' })),
      ...p.map((x): Entry => ({ key: 'p' + x.id, id: x.id, kind: 'pt', date: x.log_date, at: x.created_at, by: x.created_by,
        text: ptText(x) })),
    ]
    all.sort((a, b) => (a.date === b.date ? a.at.localeCompare(b.at) : a.date.localeCompare(b.date)))
    setEntries(all)
    setLoading(false)
  }

  useEffect(() => { load() }, [rangeDays])
  useEffect(() => { setShown(PAGE) }, [query, filter, person, rangeDays])

  const byDay = useMemo(() => {
    const map: Record<string, Entry[]> = {}
    entries.forEach((e) => { (map[e.date] ||= []).push(e) })
    return map
  }, [entries])
  const days = useMemo(() => Object.keys(byDay).sort().reverse(), [byDay])

  const q = query.trim().toLowerCase()
  const activeFilter = FILTERS.find((x) => x.id === filter) ?? FILTERS[0]
  const searching = !!q || filter !== 'all' || !!person
  const matches = useMemo(() => {
    if (!searching) return []
    return entries.filter((e) =>
      activeFilter.test(e) &&
      (!person || e.by?.toLowerCase() === person) &&
      (!q || e.text.toLowerCase().includes(q) || KIND[e.kind].label.toLowerCase().includes(q))
    ).reverse()
  }, [entries, q, filter, person])

  function startEdit(e: Entry) {
    setEditing(e)
    setEditValue(e.val ?? '')
    const d = new Date(e.at)
    setEditTime(`${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`)
  }

  async function saveEdit() {
    if (!editing || !editValue.trim()) return
    const d = new Date(editing.at)
    const [hh, mm] = editTime.split(':').map(Number)
    if (!isNaN(hh) && !isNaN(mm)) d.setHours(hh, mm, 0, 0)
    const { error } = await supabase.from('vital_readings')
      .update({ value: editValue.trim(), created_at: d.toISOString() }).eq('id', editing.id)
    if (error) { toast.show(''); return }
    setEditing(null)
    toast.show('Reading updated ✓')
    load()
  }

  function pickDate(d: string) {
    if (!d || d > today) return
    if (since && d < since) setRangeDays(0)   // reach back as far as needed
    setSelected(d)
  }

  // A plain function, not a component: a component defined here would be
  // recreated on every keystroke and drop focus from the edit fields.
  const row = (e: Entry, showKind = true) => (
    editing?.key === e.key ? (
      <div className="tl-item" key={e.key} style={{ gridTemplateColumns: '1fr' }}>
        <div>
          <label>{VITAL_LABEL[e.sub ?? ''] ?? 'Reading'}</label>
          <div className="row">
            <input className="grow" value={editValue} onChange={(ev) => setEditValue(ev.target.value)} />
            <input type="time" value={editTime} onChange={(ev) => setEditTime(ev.target.value)} style={{ width: 130 }} />
          </div>
          <div className="row" style={{ marginTop: 8 }}>
            <button className="grow" onClick={saveEdit}>Save</button>
            <button className="secondary" onClick={() => setEditing(null)}>Cancel</button>
          </div>
        </div>
      </div>
    ) : (
      <div className={`tl-item ${e.bad ? 'bad' : ''}`} key={e.key}>
        <div className="tl-time">{fmtClock(e.at)}</div>
        <div>
          <div className="tl-text">
            {showKind && <span className="tag">{KIND[e.kind].icon} {KIND[e.kind].label}</span>}
            <Highlight text={e.text} q={q} />
          </div>
          <div className="row between">
            <span className="faint">{nameOf(e.by)}</span>
            {e.kind === 'vital' && !readOnly && (
              <button className="ghost" style={{ minHeight: 32, padding: '2px 8px' }} onClick={() => startEdit(e)}>Edit</button>
            )}
          </div>
        </div>
      </div>
    )
  )

  // ================= one day =================
  if (selected) {
    const list = byDay[selected] ?? []
    const idx = days.indexOf(selected)
    // days is newest-first; "older" is the next index.
    const older = idx >= 0 ? days[idx + 1] : days.find((d) => d < selected)
    const newer = idx > 0 ? days[idx - 1] : idx < 0 ? [...days].reverse().find((d) => d > selected) : undefined
    return (
      <>
        <div className="row" style={{ marginBottom: 10 }}>
          <button className="secondary" onClick={() => { setSelected(null); setEditing(null) }}>← {searching ? 'Results' : 'All days'}</button>
          <span className="grow" />
          <button className="secondary" aria-label="Older day" disabled={!older} onClick={() => older && setSelected(older)}>◀</button>
          <button className="secondary" aria-label="Newer day" disabled={!newer} onClick={() => newer && setSelected(newer)}>▶</button>
        </div>
        <h2 style={{ marginBottom: 4 }}>{fmtDateFull(selected)}</h2>
        <DaySummary list={list} date={selected} today={today} />

        <div className="seg" style={{ margin: '12px 0' }}>
          <button className={dayView === 'timeline' ? 'on' : ''} onClick={() => setDayView('timeline')}>Timeline</button>
          <button className={dayView === 'grouped' ? 'on' : ''} onClick={() => setDayView('grouped')}>By type</button>
        </div>

        {loading && <p className="muted center">Loading…</p>}
        {!loading && list.length === 0 && <p className="muted center">Nothing was logged this day.</p>}

        {dayView === 'timeline' && list.length > 0 && (
          <div className="card">
            {[...list].sort((a, b) => a.at.localeCompare(b.at)).map((e) => row(e))}
          </div>
        )}

        {dayView === 'grouped' && KIND_ORDER.map((kind) => {
          const items = list.filter((e) => e.kind === kind)
          if (items.length === 0) return null
          const total = kind === 'fluid' ? ` — ${items.reduce((sum, e) => sum + (e.num ?? 0), 0)} oz` : ` (${items.length})`
          return (
            <div className={`sec sec-${KIND[kind].tone}`} key={kind}>
              <div className="sec-title">{KIND[kind].icon} {KIND[kind].group}{total}</div>
              {items.map((e) => row(e, false))}
            </div>
          )
        })}
        {toast.node}
      </>
    )
  }

  // ================= list / search =================
  const grouped: { date: string; items: Entry[] }[] = []
  matches.slice(0, shown).forEach((e) => {
    const last = grouped[grouped.length - 1]
    if (last && last.date === e.date) last.items.push(e)
    else grouped.push({ date: e.date, items: [e] })
  })

  return (
    <>
      <input type="search" value={query} onChange={(e) => setQuery(e.target.value)} enterKeyHint="search"
        placeholder="Search history — nausea, fall, a med, a food…" aria-label="Search history" />

      <div className="filterbar" role="group" aria-label="Show only">
        {FILTERS.map((x) => (
          <button key={x.id} className={`chip ${filter === x.id ? 'on' : ''}`} onClick={() => setFilter(x.id)}>{x.label}</button>
        ))}
      </div>

      <div className="row" style={{ marginBottom: 10 }}>
        <select aria-label="Time range" value={rangeDays} onChange={(e) => setRangeDays(Number(e.target.value))}>
          {RANGES.map((r) => <option key={r.days} value={r.days}>{r.days ? `Last ${r.label}` : r.label}</option>)}
        </select>
        <select aria-label="Logged by" value={person} onChange={(e) => setPerson(e.target.value)}>
          <option value="">Everyone</option>
          {family.map((m) => <option key={m.email} value={m.email.toLowerCase()}>{m.display_name}</option>)}
        </select>
      </div>

      <div className="row" style={{ marginBottom: 14 }}>
        <label htmlFor="hist-jump" style={{ margin: 0, flexShrink: 0 }}>Jump to a date</label>
        <input id="hist-jump" type="date" max={today} value="" onChange={(e) => pickDate(e.target.value)} />
      </div>

      {loading && <p className="muted center" style={{ marginTop: 30 }}>Loading history…</p>}

      {!loading && searching && (
        <>
          <div className="row between" style={{ marginBottom: 6 }}>
            <span className="muted">
              {matches.length} {matches.length === 1 ? 'entry' : 'entries'} on {new Set(matches.map((e) => e.date)).size} days
            </span>
            <button className="ghost" onClick={() => { setQuery(''); setFilter('all'); setPerson('') }}>Clear</button>
          </div>
          {matches.length === 0 && (
            <p className="muted center" style={{ marginTop: 20 }}>
              Nothing matches{rangeDays ? ` in the last ${rangeDays} days. Try “All time”.` : '.'}
            </p>
          )}
          {grouped.map(({ date, items }) => (
            <div key={date}>
              <button className="tl-date" onClick={() => setSelected(date)}>{fmtDateFull(date)} ›</button>
              <div className="card" style={{ padding: '4px 14px' }}>
                {items.map((e) => row(e))}
              </div>
            </div>
          ))}
          {matches.length > shown && (
            <button className="secondary" style={{ width: '100%' }} onClick={() => setShown(shown + PAGE)}>
              Show more ({matches.length - shown} left)
            </button>
          )}
        </>
      )}

      {!loading && !searching && (
        <>
          {days.length === 0 && <p className="muted center" style={{ marginTop: 30 }}>No history in this range.</p>}
          {days.map((d) => (
            <button className="card hist-day" key={d} onClick={() => setSelected(d)}>
              <div className="hd-date">
                <span>{fmtDateFull(d)}{d === today ? ' · Today' : ''}</span>
                <span className="faint" style={{ fontWeight: 400 }}>{byDay[d].length} ›</span>
              </div>
              <DaySummary list={byDay[d]} date={d} today={today} />
            </button>
          ))}
          {rangeDays > 0 && (
            <button className="secondary" style={{ width: '100%' }}
              onClick={() => setRangeDays(rangeDays < 30 ? 30 : rangeDays < 90 ? 90 : 0)}>
              Load older days
            </button>
          )}
        </>
      )}
      {toast.node}
    </>
  )
}

// The plain-words line and red flags for one day.
function DaySummary({ list, date, today }: { list: Entry[]; date: string; today: string }) {
  const of = (...kinds: Kind[]) => list.filter((e) => kinds.includes(e.kind))
  const bp = of('vital').filter((e) => e.sub === 'bp').pop()
  const oz = of('fluid').reduce((sum, e) => sum + (e.num ?? 0), 0)
  const meals = of('meal')
  const pcts = meals.map((e) => e.num).filter((n): n is number => n !== undefined)
  const given = of('given').length
  const held = list.filter((e) => e.kind === 'held' || (e.kind === 'powder' && e.bad)).length
  const bms = of('bm').length
  const pt = of('pt').length
  const symptoms = [...new Set(of('symptom').map((e) => e.sub ?? e.text))]
  const urinary = of('urine_symptom').length

  const parts: ReactNode[] = []
  if (bp) parts.push(bp.text.replace('Blood pressure', 'BP'))
  if (of('fluid').length) parts.push(`${oz} oz fluids`)
  if (meals.length) parts.push(`${meals.length} meal${meals.length === 1 ? '' : 's'}${pcts.length ? ` (${Math.round(pcts.reduce((a, b) => a + b, 0) / pcts.length)}% eaten)` : ''}`)
  if (given) parts.push(`${given} med${given === 1 ? "" : "s"} given`)
  if (bms) parts.push(`${bms} BM`)
  if (pt) parts.push(`${pt} PT`)
  const lowFluids = date !== today && of('fluid').length > 0 && oz < LOW_FLUID_OZ

  return (
    <>
      {parts.length > 0 && <div className="hd-line">{parts.map((p, i) => <span key={i}>{i > 0 && ' · '}{p}</span>)}</div>}
      {(symptoms.length > 0 || held > 0 || urinary > 0 || lowFluids) && (
        <div className="flags">
          {symptoms.map((s) => <span className="flag" key={s}>{s}</span>)}
          {urinary > 0 && <span className="flag">{urinary} urinary symptom{urinary === 1 ? '' : 's'}</span>}
          {held > 0 && <span className="flag">{held} held / skipped</span>}
          {lowFluids && <span className="flag amber">Low fluids</span>}
        </div>
      )}
    </>
  )
}
