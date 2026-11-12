import { useEffect, useState } from 'react'
import { confirmDialog } from '../confirm'
import { supabase, todayStr, fmtClock, fmtDateFull, stamp, nowHHMM, weekBounds, PtExercise, PtLog } from '../supabase'
import { useToast } from '../toast'
import DayNav, { shiftDay } from '../DayNav'

const UNIT_OPTIONS: { value: PtExercise['unit']; label: string }[] = [
  { value: 'sets_reps', label: 'Sets × Reps' },
  { value: 'minutes',   label: 'Time (minutes)' },
  { value: 'feet',      label: 'Distance (feet)' },
  { value: 'custom',    label: 'Custom amount' },
]

const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']

function unitShort(ex: PtExercise) {
  return ex.unit === 'minutes' ? 'min' : ex.unit === 'feet' ? 'ft' : ex.unit === 'custom' ? '' : 'reps'
}

// What one round looks like for this exercise, e.g. "1 × 10", "5 min", "50 ft".
function roundText(ex: PtExercise, sets: number, reps: number): string {
  if (ex.unit === 'sets_reps') return `${sets} × ${reps}`
  if (ex.unit === 'minutes') return `${reps} min`
  if (ex.unit === 'feet') return `${reps} ft`
  return `${reps}`
}

const BLANK_FORM = {
  name: '', unit: 'sets_reps' as PtExercise['unit'],
  target_sets: '1', target_reps: '10', weekly_goal: '20',
}

export default function PtPage({ nameOf }: { nameOf: (e: string) => string }) {
  const today = todayStr()
  const toast = useToast()
  const [date, setDate] = useState(todayStr())
  const [time, setTimeRaw] = useState(nowHHMM())
  const [timeEdited, setTimeEdited] = useState(false)
  const setTime = (t: string) => { setTimeRaw(t); setTimeEdited(true) }
  const resetTime = () => { setTimeRaw(nowHHMM()); setTimeEdited(false) }
  const isToday = date === today

  const [exercises, setExercises] = useState<PtExercise[]>([])
  const [weekLogs, setWeekLogs] = useState<PtLog[]>([])
  const [custom, setCustom] = useState<string | null>(null)            // exercise id with the "other amount" row open
  const [input, setInput] = useState({ sets: '1', reps: '10' })
  const [manageEx, setManageEx] = useState(false)
  const [exForm, setExForm] = useState(BLANK_FORM)
  const [editingEx, setEditingEx] = useState<PtExercise | null>(null)

  const week = weekBounds(date)

  async function load() {
    const [x, wk] = await Promise.all([
      supabase.from('pt_exercises').select('*').eq('active', true).order('name'),
      // The whole Mon–Sun week around the day being viewed.
      supabase.from('pt_logs').select('*').gte('log_date', week.start).lte('log_date', week.end).order('created_at'),
    ])
    setExercises(x.data ?? [])
    setWeekLogs(wk.data ?? [])
  }

  useEffect(() => {
    load()
    const onShow = () => { if (document.visibilityState === 'visible') load() }
    document.addEventListener('visibilitychange', onShow)
    return () => document.removeEventListener('visibilitychange', onShow)
  }, [date])

  async function logPt(ex: PtExercise, sets: number, reps: number) {
    if (!reps || reps <= 0 || (ex.unit === 'sets_reps' && (!sets || sets <= 0))) return
    const { error } = await supabase.from('pt_logs').insert({
      exercise_id: ex.id, log_date: date,
      sets: ex.unit === 'sets_reps' ? sets : 1, reps,
      exercise_name: ex.name, exercise_unit: ex.unit,
      ...stamp(date, time, timeEdited),
    })
    if (error) { toast.show(''); return }
    setCustom(null)
    toast.show(`${ex.name} — ${roundText(ex, sets, reps)} ✓`)
    load()
  }

  async function delLog(id: string) {
    if (!(await confirmDialog('Remove this?'))) return
    const { error } = await supabase.from('pt_logs').delete().eq('id', id)
    if (error) toast.show('')
    load()
  }

  function openCustom(ex: PtExercise) {
    setInput({ sets: String(ex.target_sets ?? 1), reps: String(ex.target_reps ?? 10) })
    setCustom(custom === ex.id ? null : ex.id)
  }

  async function saveExercise() {
    if (!exForm.name.trim()) return
    const payload = {
      name: exForm.name.trim(),
      unit: exForm.unit,
      target_sets: parseInt(exForm.target_sets) || 1,
      target_reps: parseInt(exForm.target_reps) || 10,
      weekly_goal: parseInt(exForm.weekly_goal) || 0,
      active: true,
    }
    const { error } = editingEx
      ? await supabase.from('pt_exercises').update(payload).eq('id', editingEx.id)
      : await supabase.from('pt_exercises').insert(payload)
    if (error) { toast.show(''); return }
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
      weekly_goal: String(ex.weekly_goal ?? 0),
    })
  }

  async function removeEx(ex: PtExercise) {
    if (!(await confirmDialog(`Remove "${ex.name}"? Past logs are kept.`))) return
    const { error } = await supabase.from('pt_exercises').update({ active: false }).eq('id', ex.id)
    if (error) toast.show('')
    load()
  }

  // ---- derived ----
  const dayLogs = weekLogs.filter((p) => p.log_date === date)
  // A 2 × 10 round counts as 20 reps toward the goal.
  const weekTotal = (ex: PtExercise) =>
    weekLogs.filter((p) => p.exercise_id === ex.id).reduce((sum, p) =>
      sum + Number(p.reps || 0) * (ex.unit === 'sets_reps' ? Number(p.sets || 1) : 1), 0)
  const withGoal = exercises.filter((ex) => ex.weekly_goal > 0)
  const goalsMet = withGoal.filter((ex) => weekTotal(ex) >= ex.weekly_goal).length
  const doneToday = new Set(dayLogs.map((p) => p.exercise_id)).size
  const weekDays = WEEKDAYS.map((label, i) => {
    const d = shiftDay(week.start, i)
    return { label, d, count: weekLogs.filter((p) => p.log_date === d).length }
  })

  return (
    <>
      <DayNav date={date} onChange={setDate} time={time} onTimeChange={setTime}
        timeEdited={timeEdited} onResetTime={resetTime} />
      {!isToday && (
        <div className="warn">⏪ Logging for <b>{fmtDateFull(date)}</b> — not today. Everything on this tab is saved to that day.</div>
      )}

      <div className="card">
        <div className="row between">
          <div>
            <div className="tile-label">This week</div>
            <div className="tile-value">
              {withGoal.length ? `${goalsMet} of ${withGoal.length} goals met` : `${weekLogs.length} rounds logged`}
            </div>
          </div>
          <div style={{ textAlign: 'right' }}>
            <div className="tile-label">{isToday ? 'Today' : 'This day'}</div>
            <div className="tile-value">{doneToday} done</div>
          </div>
        </div>
        <div className="weekstrip">
          {weekDays.map(({ label, d, count }) => (
            <button key={d} className={`wd ${d === date ? 'sel' : ''}`} disabled={d > today}
              style={{ background: 'none', padding: 0, minHeight: 0 }}
              aria-label={`${label}: ${count} rounds`} onClick={() => setDate(d)}>
              {label}
              <div className={`dot ${count ? 'did' : ''}`}>{count || '–'}</div>
            </button>
          ))}
        </div>
        <div className="faint" style={{ marginTop: 8 }}>Rounds logged each day. Tap a day to see or add to it.</div>
      </div>

      {exercises.length === 0 && <p className="muted center">No exercises yet. Add one below.</p>}

      {exercises.map((ex) => {
        const done = dayLogs.filter((p) => p.exercise_id === ex.id)
        const soFar = weekTotal(ex)
        const hasGoal = ex.weekly_goal > 0
        const left = ex.weekly_goal - soFar
        const met = hasGoal && left <= 0
        const sets = ex.target_sets ?? 1
        const reps = ex.target_reps ?? 10
        return (
          <div className={`ex-card ${met ? 'met' : ''}`} key={ex.id}>
            <div className="ex-head">
              <span className="ex-name">{ex.name}</span>
              <span className="ex-count">
                {hasGoal
                  ? met ? `✓ ${soFar} / ${ex.weekly_goal}` : `${soFar} / ${ex.weekly_goal} ${unitShort(ex)}`
                  : soFar ? `${soFar} ${unitShort(ex)} this week` : ''}
              </span>
            </div>
            {hasGoal && (
              <>
                <div className={`progress ${met ? 'green' : ''}`} style={{ margin: '8px 0 4px' }}>
                  <div style={{ width: `${Math.min(100, (soFar / ex.weekly_goal) * 100)}%` }} />
                </div>
                <div className="faint">
                  {met
                    ? `Weekly goal met${left < 0 ? ` — ${-left} over` : ''}`
                    : `${left} ${unitShort(ex)} to go this week`}
                </div>
              </>
            )}

            <div className="ex-actions">
              <button className="grow" onClick={() => logPt(ex, sets, reps)}>+ Log {roundText(ex, sets, reps)}</button>
              <button className="secondary" aria-expanded={custom === ex.id} onClick={() => openCustom(ex)}>Other</button>
            </div>

            {custom === ex.id && (
              <div className="row" style={{ marginTop: 10 }}>
                {ex.unit === 'sets_reps' && (
                  <>
                    <input style={{ width: 70 }} type="number" inputMode="numeric" aria-label="Sets" value={input.sets}
                      onChange={(e) => setInput({ ...input, sets: e.target.value })} />
                    <span className="muted">×</span>
                  </>
                )}
                <input style={{ width: 84 }} type="number" inputMode="numeric" aria-label="Amount" value={input.reps}
                  onChange={(e) => setInput({ ...input, reps: e.target.value })} />
                <span className="muted">{unitShort(ex)}</span>
                <button className="grow" onClick={() => logPt(ex, parseInt(input.sets), parseInt(input.reps))}>Log</button>
              </div>
            )}

            {done.map((p) => (
              <div className="feed-item" key={p.id}>
                <span style={{ color: 'var(--green)' }}>
                  ✓ {roundText(ex, p.sets, p.reps)}
                  {' '}<span className="faint">{fmtClock(p.created_at)} · {nameOf(p.created_by)}</span>
                </span>
                <button className="danger" aria-label="Remove" onClick={() => delLog(p.id)}>✕</button>
              </div>
            ))}
          </div>
        )
      })}

      <button className="ghost" onClick={() => { setManageEx(!manageEx); setEditingEx(null); setExForm(BLANK_FORM) }}>
        {manageEx ? '▲ Hide exercise editor' : '▼ Add or edit exercises'}
      </button>

      {manageEx && (
        <div className="card" style={{ marginTop: 10 }}>
          <label>Exercise name</label>
          <input value={exForm.name} onChange={(e) => setExForm({ ...exForm, name: e.target.value })} placeholder="e.g. Heel Raises" />
          <label>Type</label>
          <div className="chips" style={{ marginBottom: 10 }}>
            {UNIT_OPTIONS.map((o) => (
              <button key={o.value} className={`chip ${exForm.unit === o.value ? 'on' : ''}`}
                onClick={() => setExForm({ ...exForm, unit: o.value })}>{o.label}</button>
            ))}
          </div>
          {exForm.unit === 'sets_reps' ? (
            <div className="row" style={{ marginBottom: 10 }}>
              <div style={{ flex: 1 }}>
                <label>Sets per round</label>
                <input type="number" inputMode="numeric" value={exForm.target_sets} onChange={(e) => setExForm({ ...exForm, target_sets: e.target.value })} />
              </div>
              <div style={{ flex: 1 }}>
                <label>Reps per round</label>
                <input type="number" inputMode="numeric" value={exForm.target_reps} onChange={(e) => setExForm({ ...exForm, target_reps: e.target.value })} />
              </div>
            </div>
          ) : (
            <>
              <label>Per round {exForm.unit === 'minutes' ? '(minutes)' : exForm.unit === 'feet' ? '(feet)' : '(amount)'}</label>
              <input type="number" inputMode="numeric" value={exForm.target_reps} onChange={(e) => setExForm({ ...exForm, target_reps: e.target.value })} />
            </>
          )}
          <label>Weekly goal ({exForm.unit === 'minutes' ? 'minutes' : exForm.unit === 'feet' ? 'feet' : 'reps'} per week · 0 for none)</label>
          <input inputMode="numeric" value={exForm.weekly_goal}
            onChange={(e) => setExForm({ ...exForm, weekly_goal: e.target.value.replace(/[^0-9]/g, '') })} />
          <div className="row">
            <button className="grow" onClick={saveExercise}>{editingEx ? 'Save changes' : 'Add exercise'}</button>
            <button className="secondary" onClick={() => { setEditingEx(null); setExForm(BLANK_FORM) }}>Clear</button>
          </div>

          <div style={{ marginTop: 12 }}>
            {exercises.map((ex) => (
              <div className="feed-item" key={ex.id}>
                <div>
                  <b>{ex.name}</b>
                  <div className="faint">
                    {UNIT_OPTIONS.find((o) => o.value === ex.unit)?.label ?? ex.unit}
                    {ex.weekly_goal > 0 ? ` · goal ${ex.weekly_goal} ${unitShort(ex)}/week` : ''}
                  </div>
                </div>
                <div className="row" style={{ flexShrink: 0 }}>
                  <button className="secondary" onClick={() => startEditEx(ex)}>Edit</button>
                  <button className="danger" aria-label="Remove" onClick={() => removeEx(ex)}>✕</button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {toast.node}
    </>
  )
}
