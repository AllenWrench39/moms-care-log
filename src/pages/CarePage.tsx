import { useEffect, useState } from 'react'
import { supabase, todayStr, fmtClock, CareEvent, PtExercise, PtLog } from '../supabase'
import { useToast } from '../toast'

const BM_SIZES = ['Small', 'Medium', 'Large']
const BM_TYPES = ['Normal', 'Loose', 'Diarrhea', 'Hard', 'Watery']
const URINE_COLORS = ['Clear', 'Pale Yellow', 'Dark Yellow', 'Amber', 'Orange', 'Pink/Red', 'Brown']
const HYGIENE_ITEMS = ['Bed Bath', 'Shower', 'Hair Wash', 'Nail Care', 'Oral Care', 'Skin Care', 'Pad Change', 'Repositioned']
const CLEANING_ITEMS = ['Bed Linens', 'Room Clean', 'Bathroom', 'Laundry', 'Trash', 'Floor Mop', 'Dishes', 'Supply Restock']

const UNIT_OPTIONS: { value: PtExercise['unit']; label: string }[] = [
  { value: 'sets_reps', label: 'Sets × Reps' },
  { value: 'minutes',   label: 'Time (minutes)' },
  { value: 'feet',      label: 'Distance (feet)' },
  { value: 'custom',    label: 'Custom amount' },
]

function unitLabel(ex: PtExercise): string {
  if (ex.unit === 'minutes') return 'min'
  if (ex.unit === 'feet') return 'ft'
  if (ex.unit === 'custom') return 'amount'
  return 'reps'
}

function logDisplay(ex: PtExercise, p: PtLog): string {
  if (ex.unit === 'sets_reps') return `✓ ${p.sets} × ${p.reps}`
  if (ex.unit === 'minutes') return `✓ ${p.reps} min`
  if (ex.unit === 'feet') return `✓ ${p.reps} ft`
  return `✓ ${p.reps}`
}

const BLANK_FORM = { name: '', unit: 'sets_reps' as PtExercise['unit'], target_sets: '1', target_reps: '10' }

export default function CarePage({ nameOf }: { nameOf: (e: string) => string }) {
  const today = todayStr()
  const toast = useToast()
  const [events, setEvents] = useState<CareEvent[]>([])
  const [exercises, setExercises] = useState<PtExercise[]>([])
  const [ptLogs, setPtLogs] = useState<PtLog[]>([])
  const [bmSize, setBmSize] = useState('Medium')
  const [bmType, setBmType] = useState('Normal')
  const [ptInput, setPtInput] = useState<Record<string, { sets: string; reps: string }>>({})
  const [manageEx, setManageEx] = useState(false)
  const [exForm, setExForm] = useState(BLANK_FORM)
  const [editingEx, setEditingEx] = useState<PtExercise | null>(null)

  async function load() {
    const [e, x, p] = await Promise.all([
      supabase.from('care_events').select('*').eq('event_date', today).order('created_at'),
      supabase.from('pt_exercises').select('*').eq('active', true).order('name'),
      supabase.from('pt_logs').select('*').eq('log_date', today),
    ])
    setEvents(e.data ?? [])
    setExercises(x.data ?? [])
    setPtLogs(p.data ?? [])
  }

  useEffect(() => {
    load()
    const ch = supabase
      .channel('care')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'care_events' }, load)
      .subscribe()
    return () => { supabase.removeChannel(ch) }
  }, [])

  async function addEvent(kind: CareEvent['kind'], detail: string, msg: string) {
    await supabase.from('care_events').insert({ event_date: today, kind, detail })
    toast.show(msg)
    load()
  }

  async function del(table: string, id: string) {
    if (!confirm('Remove this?')) return
    await supabase.from(table).delete().eq('id', id)
    load()
  }

  async function logPt(ex: PtExercise) {
    const input = ptInput[ex.id] ?? { sets: String(ex.target_sets ?? 1), reps: String(ex.target_reps ?? 10) }
    if (ex.unit === 'sets_reps') {
      const sets = parseInt(input.sets), reps = parseInt(input.reps)
      if (!sets || !reps) return
      await supabase.from('pt_logs').insert({ exercise_id: ex.id, log_date: today, sets, reps })
    } else {
      const val = parseInt(input.reps)
      if (!val) return
      await supabase.from('pt_logs').insert({ exercise_id: ex.id, log_date: today, sets: 1, reps: val })
    }
    toast.show('PT logged ✓')
    load()
  }

  async function saveExercise() {
    if (!exForm.name.trim()) return
    const payload = {
      name: exForm.name.trim(),
      unit: exForm.unit,
      target_sets: parseInt(exForm.target_sets) || 1,
      target_reps: parseInt(exForm.target_reps) || 10,
      active: true,
    }
    if (editingEx) {
      await supabase.from('pt_exercises').update(payload).eq('id', editingEx.id)
    } else {
      await supabase.from('pt_exercises').insert(payload)
    }
    setExForm(BLANK_FORM)
    setEditingEx(null)
    toast.show('Exercise saved ✓')
    load()
  }

  function startEditEx(ex: PtExercise) {
    setEditingEx(ex)
    setExForm({
      name: ex.name,
      unit: ex.unit,
      target_sets: String(ex.target_sets ?? 1),
      target_reps: String(ex.target_reps ?? 10),
    })
  }

  async function removeEx(ex: PtExercise) {
    if (!confirm(`Remove "${ex.name}"? Past logs are kept.`)) return
    await supabase.from('pt_exercises').update({ active: false }).eq('id', ex.id)
    load()
  }

  const byKind = (kind: string) => events.filter((e) => e.kind === kind)

  const EventList = ({ kind }: { kind: string }) => (
    <>
      {byKind(kind).map((e) => (
        <div className="feed-item" key={e.id}>
          <span>{e.detail} <span className="faint">{fmtClock(e.created_at)} · {nameOf(e.created_by)}</span></span>
          <button className="danger" onClick={() => del('care_events', e.id)}>✕</button>
        </div>
      ))}
    </>
  )

  return (
    <>
      <div className="sec sec-orange">
        <div className="sec-title">💩 Bowel Movement</div>
        <label>Size</label>
        <div className="chips" style={{ marginBottom: 8 }}>
          {BM_SIZES.map((s) => <button key={s} className={`chip ${bmSize === s ? 'on' : ''}`} onClick={() => setBmSize(s)}>{s}</button>)}
        </div>
        <label>Consistency</label>
        <div className="chips" style={{ marginBottom: 10 }}>
          {BM_TYPES.map((t) => <button key={t} className={`chip ${bmType === t ? 'on' : ''}`} onClick={() => setBmType(t)}>{t}</button>)}
        </div>
        <button onClick={() => addEvent('bm', `${bmSize} · ${bmType}`, 'BM logged ✓')}>Log BM</button>
        <EventList kind="bm" />
      </div>

      <div className="sec sec-yellow">
        <div className="sec-title">💛 Urine</div>
        <div className="chips">
          {URINE_COLORS.map((c) => (
            <button key={c} className="chip" onClick={() => addEvent('urine', c, 'Urine logged ✓')}>{c}</button>
          ))}
        </div>
        <EventList kind="urine" />
      </div>

      <div className="sec sec-blue">
        <div className="sec-title">🛁 Hygiene</div>
        <div className="muted" style={{ marginBottom: 8 }}>Tap to log each task done today.</div>
        <div className="chips">
          {HYGIENE_ITEMS.map((h) => (
            <button key={h} className={`chip ${byKind('hygiene').some((e) => e.detail === h) ? 'on-blue' : ''}`}
              onClick={() => addEvent('hygiene', h, h + ' ✓')}>{h}</button>
          ))}
        </div>
        <EventList kind="hygiene" />
      </div>

      <div className="sec sec-gray">
        <div className="sec-title">🧹 Cleaning</div>
        <div className="chips">
          {CLEANING_ITEMS.map((c) => (
            <button key={c} className={`chip ${byKind('cleaning').some((e) => e.detail === c) ? 'on' : ''}`}
              onClick={() => addEvent('cleaning', c, c + ' ✓')}>{c}</button>
          ))}
        </div>
        <EventList kind="cleaning" />
      </div>

      <div className="sec sec-green">
        <div className="sec-title">🏋️ Physical Therapy</div>
        {exercises.map((ex) => {
          const done = ptLogs.filter((p) => p.exercise_id === ex.id)
          const input = ptInput[ex.id] ?? { sets: String(ex.target_sets ?? 1), reps: String(ex.target_reps ?? 10) }
          return (
            <div key={ex.id} style={{ padding: '8px 0', borderBottom: '1px solid var(--border)' }}>
              <div>
                <b style={{ fontSize: 14 }}>{ex.name}</b>
                <span className="faint" style={{ marginLeft: 8 }}>
                  {ex.unit === 'sets_reps' && `Target: ${ex.target_sets} × ${ex.target_reps}`}
                  {ex.unit === 'minutes' && `Target: ${ex.target_reps} min`}
                  {ex.unit === 'feet' && `Target: ${ex.target_reps} ft`}
                  {ex.unit === 'custom' && ex.target_reps ? `Target: ${ex.target_reps}` : ''}
                </span>
              </div>
              <div className="row" style={{ marginTop: 6 }}>
                {ex.unit === 'sets_reps' ? (
                  <>
                    <input style={{ width: 64 }} type="number" value={input.sets}
                      onChange={(e) => setPtInput({ ...ptInput, [ex.id]: { ...input, sets: e.target.value } })} />
                    <span className="muted">sets ×</span>
                    <input style={{ width: 64 }} type="number" value={input.reps}
                      onChange={(e) => setPtInput({ ...ptInput, [ex.id]: { ...input, reps: e.target.value } })} />
                    <span className="muted">reps</span>
                  </>
                ) : (
                  <>
                    <input style={{ width: 80 }} type="number" placeholder="0" value={input.reps}
                      onChange={(e) => setPtInput({ ...ptInput, [ex.id]: { ...input, reps: e.target.value } })} />
                    <span className="muted">{unitLabel(ex)}</span>
                  </>
                )}
                <button style={{ padding: '8px 12px', fontSize: 13 }} onClick={() => logPt(ex)}>Log</button>
              </div>
              {done.map((p) => (
                <div className="feed-item" key={p.id}>
                  <span style={{ color: 'var(--green)' }}>
                    {logDisplay(ex, p)}
                    {' '}<span className="faint">{fmtClock(p.created_at)} · {nameOf(p.created_by)}</span>
                  </span>
                  <button className="danger" onClick={() => del('pt_logs', p.id)}>✕</button>
                </div>
              ))}
            </div>
          )
        })}

        <div style={{ marginTop: 14 }}>
          <button className="ghost" onClick={() => { setManageEx(!manageEx); setEditingEx(null); setExForm(BLANK_FORM) }}>
            {manageEx ? '▲ Hide exercise editor' : '▼ Edit exercises'}
          </button>
        </div>

        {manageEx && (
          <div style={{ marginTop: 10 }}>
            <div style={{ marginBottom: 10 }}>
              <label>Exercise name</label>
              <input value={exForm.name} onChange={(e) => setExForm({ ...exForm, name: e.target.value })} placeholder="e.g. Heel Raises" />
              <label>Type</label>
              <div className="chips" style={{ marginBottom: 8 }}>
                {UNIT_OPTIONS.map((o) => (
                  <button key={o.value} className={`chip ${exForm.unit === o.value ? 'on' : ''}`}
                    onClick={() => setExForm({ ...exForm, unit: o.value })}>{o.label}</button>
                ))}
              </div>
              {exForm.unit === 'sets_reps' && (
                <div className="row" style={{ gap: 8, marginBottom: 8 }}>
                  <div style={{ flex: 1 }}>
                    <label>Target sets</label>
                    <input type="number" value={exForm.target_sets} onChange={(e) => setExForm({ ...exForm, target_sets: e.target.value })} />
                  </div>
                  <div style={{ flex: 1 }}>
                    <label>Target reps</label>
                    <input type="number" value={exForm.target_reps} onChange={(e) => setExForm({ ...exForm, target_reps: e.target.value })} />
                  </div>
                </div>
              )}
              {exForm.unit !== 'sets_reps' && (
                <div style={{ marginBottom: 8 }}>
                  <label>Target {exForm.unit === 'minutes' ? '(minutes)' : exForm.unit === 'feet' ? '(feet)' : '(amount)'}</label>
                  <input type="number" value={exForm.target_reps} onChange={(e) => setExForm({ ...exForm, target_reps: e.target.value })} />
                </div>
              )}
              <div className="row">
                <button onClick={saveExercise}>{editingEx ? 'Save changes' : 'Add exercise'}</button>
                <button className="secondary" onClick={() => { setEditingEx(null); setExForm(BLANK_FORM) }}>Clear</button>
              </div>
            </div>

            {exercises.map((ex) => (
              <div className="feed-item" key={ex.id}>
                <div>
                  <b>{ex.name}</b>
                  <div className="faint">{UNIT_OPTIONS.find((o) => o.value === ex.unit)?.label ?? ex.unit}</div>
                </div>
                <div className="row" style={{ flexShrink: 0 }}>
                  <button className="secondary" style={{ padding: '5px 9px', fontSize: 12 }} onClick={() => startEditEx(ex)}>Edit</button>
                  <button className="danger" onClick={() => removeEx(ex)}>✕</button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {toast.node}
    </>
  )
}
