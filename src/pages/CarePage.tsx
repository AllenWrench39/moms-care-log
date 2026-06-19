import { useEffect, useState } from 'react'
import { supabase, todayStr, fmtClock, CareEvent, PtExercise, PtLog } from '../supabase'
import { useToast } from '../toast'

const BM_SIZES = ['Small', 'Medium', 'Large']
const BM_TYPES = ['Normal', 'Loose', 'Diarrhea', 'Hard', 'Watery']
const URINE_COLORS = ['Clear', 'Pale Yellow', 'Dark Yellow', 'Amber', 'Orange', 'Pink/Red', 'Brown']
const HYGIENE_ITEMS = ['Bed Bath', 'Shower', 'Hair Wash', 'Nail Care', 'Oral Care', 'Skin Care', 'Pad Change', 'Repositioned']
const CLEANING_ITEMS = ['Bed Linens', 'Room Clean', 'Bathroom', 'Laundry', 'Trash', 'Floor Mop', 'Dishes', 'Supply Restock']

export default function CarePage({ nameOf }: { nameOf: (e: string) => string }) {
  const today = todayStr()
  const toast = useToast()
  const [events, setEvents] = useState<CareEvent[]>([])
  const [exercises, setExercises] = useState<PtExercise[]>([])
  const [ptLogs, setPtLogs] = useState<PtLog[]>([])
  const [bmSize, setBmSize] = useState('Medium')
  const [bmType, setBmType] = useState('Normal')
  const [ptInput, setPtInput] = useState<Record<string, { sets: string; reps: string }>>({})

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

  const isWalking = (ex: PtExercise) => ex.name.toLowerCase().includes('walking') || ex.name.toLowerCase() === 'walk'

  async function logPt(ex: PtExercise) {
    const input = ptInput[ex.id] ?? { sets: String(ex.target_sets), reps: String(ex.target_reps) }
    if (isWalking(ex)) {
      const feet = parseInt(input.reps)
      if (!feet) return
      await supabase.from('pt_logs').insert({ exercise_id: ex.id, log_date: today, sets: 1, reps: feet })
    } else {
      const sets = parseInt(input.sets), reps = parseInt(input.reps)
      if (!sets || !reps) return
      await supabase.from('pt_logs').insert({ exercise_id: ex.id, log_date: today, sets, reps })
    }
    toast.show('PT logged ✓')
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
          const input = ptInput[ex.id] ?? { sets: String(ex.target_sets), reps: String(ex.target_reps) }
          return (
            <div key={ex.id} style={{ padding: '8px 0', borderBottom: '1px solid var(--border)' }}>
              <div className="row between">
                <div>
                  <b style={{ fontSize: 14 }}>{ex.name}</b>
                  <div className="faint">Target: {ex.target_sets} sets × {ex.target_reps} reps</div>
                </div>
              </div>
                  <div className="row" style={{ marginTop: 6 }}>
                {isWalking(ex) ? (
                  <>
                    <input style={{ width: 80 }} type="number" placeholder="0" value={input.reps}
                      onChange={(e) => setPtInput({ ...ptInput, [ex.id]: { ...input, reps: e.target.value } })} />
                    <span className="muted">feet</span>
                  </>
                ) : (
                  <>
                    <input style={{ width: 64 }} type="number" value={input.sets}
                      onChange={(e) => setPtInput({ ...ptInput, [ex.id]: { ...input, sets: e.target.value } })} />
                    <span className="muted">sets ×</span>
                    <input style={{ width: 64 }} type="number" value={input.reps}
                      onChange={(e) => setPtInput({ ...ptInput, [ex.id]: { ...input, reps: e.target.value } })} />
                    <span className="muted">reps</span>
                  </>
                )}
                <button style={{ padding: '8px 12px', fontSize: 13 }} onClick={() => logPt(ex)}>Log</button>
              </div>
              {done.map((p) => (
                <div className="feed-item" key={p.id}>
                  <span style={{ color: 'var(--green)' }}>
                    {isWalking(ex) ? `✓ ${p.reps} ft` : `✓ ${p.sets} × ${p.reps}`}
                    {' '}<span className="faint">{fmtClock(p.created_at)} · {nameOf(p.created_by)}</span>
                  </span>
                  <button className="danger" onClick={() => del('pt_logs', p.id)}>✕</button>
                </div>
              ))}
            </div>
          )
        })}
      </div>

      {toast.node}
    </>
  )
}
