import { useEffect, useState } from 'react'
import { supabase, todayStr, fmtDateFull, CareEvent } from './supabase'
import { useToast } from './toast'

// Filling the weekly pill boxes is logged as a care_event so it needs no new
// table: detail holds how many weeks the fill covers, e.g. "2 weeks".
const WEEK_CHOICES = [1, 2, 3, 4]
const REMIND_DAYS = 2

export type FillState = {
  last: CareEvent | null
  weeks: number
  dueDate: string | null
  daysLeft: number | null
}

function addDays(dateStr: string, n: number) {
  const d = new Date(dateStr + 'T12:00:00')
  d.setDate(d.getDate() + n)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function daysBetween(from: string, to: string) {
  const a = new Date(from + 'T12:00:00').getTime()
  const b = new Date(to + 'T12:00:00').getTime()
  return Math.round((b - a) / 86400000)
}

export async function loadFillState(): Promise<FillState> {
  const { data } = await supabase
    .from('care_events').select('*').eq('kind', 'pill_fill')
    .order('event_date', { ascending: false }).order('created_at', { ascending: false }).limit(1)
  const last = (data ?? [])[0] ?? null
  if (!last) return { last: null, weeks: 0, dueDate: null, daysLeft: null }
  const weeks = parseInt(last.detail) || 1
  const dueDate = addDays(last.event_date, weeks * 7)
  return { last, weeks, dueDate, daysLeft: daysBetween(todayStr(), dueDate) }
}

// Banner for the Today tab: silent until the refill is close, then loud.
export function PillFillBanner() {
  const [state, setState] = useState<FillState | null>(null)
  useEffect(() => { loadFillState().then(setState) }, [])

  if (!state || state.daysLeft === null || state.daysLeft > REMIND_DAYS) return null
  const overdue = state.daysLeft < 0
  return (
    <div className="warn" style={{ borderLeft: '4px solid var(--amber, #d68910)' }}>
      💊 <b>
        {overdue
          ? `Pill boxes ran out ${Math.abs(state.daysLeft)} ${Math.abs(state.daysLeft) === 1 ? 'day' : 'days'} ago`
          : state.daysLeft === 0
            ? 'Pill boxes run out today'
            : `Time to fill the pill boxes — ${state.daysLeft} ${state.daysLeft === 1 ? 'day' : 'days'} left`}
      </b>
      {state.dueDate && <div style={{ marginTop: 4 }}>Last fill covered through {fmtDateFull(state.dueDate)}.</div>}
    </div>
  )
}

// Full card for the Meds tab: status plus the button that logs a new fill.
export default function PillFillCard() {
  const toast = useToast()
  const [state, setState] = useState<FillState | null>(null)
  const [picking, setPicking] = useState(false)

  async function refresh() { setState(await loadFillState()) }
  useEffect(() => { refresh() }, [])

  async function logFill(weeks: number) {
    await supabase.from('care_events').insert({
      event_date: todayStr(), kind: 'pill_fill', detail: `${weeks} ${weeks === 1 ? 'week' : 'weeks'}`,
    })
    setPicking(false)
    toast.show(`Pill boxes filled — ${weeks} ${weeks === 1 ? 'week' : 'weeks'} ✓`)
    refresh()
  }

  const left = state?.daysLeft ?? null
  const due = left === null ? 'none' : left < 0 ? 'over' : left <= REMIND_DAYS ? 'soon' : 'ok'

  return (
    <div className="sec sec-purple">
      <div className="sec-title">💊 Pill Boxes</div>
      {due === 'none' && <div className="muted" style={{ marginBottom: 8 }}>No fill logged yet.</div>}
      {state?.last && (
        <div className="muted" style={{ marginBottom: 8 }}>
          Last filled <b>{fmtDateFull(state.last.event_date)}</b> for {state.weeks}{' '}
          {state.weeks === 1 ? 'week' : 'weeks'} · runs out <b>{fmtDateFull(state.dueDate!)}</b>
          <div style={{ marginTop: 2 }}>
            {due === 'over' && <span style={{ color: 'var(--red)' }}>⚠️ Overdue by {Math.abs(left!)} {Math.abs(left!) === 1 ? 'day' : 'days'}</span>}
            {due === 'soon' && <span style={{ color: 'var(--red)' }}>⏰ {left === 0 ? 'Runs out today' : `${left} ${left === 1 ? 'day' : 'days'} left`}</span>}
            {due === 'ok' && <span style={{ color: 'var(--green)' }}>✓ {left} days left</span>}
          </div>
        </div>
      )}
      <button onClick={() => setPicking(true)}>💊 Filled the pill boxes</button>

      {picking && (
        <div className="modal-back" onClick={() => setPicking(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div style={{ fontWeight: 'bold', fontSize: 15, marginBottom: 4 }}>Filled the pill boxes</div>
            <div className="muted" style={{ marginBottom: 12 }}>How many weeks did you fill?</div>
            <div className="chips" style={{ marginBottom: 14 }}>
              {WEEK_CHOICES.map((w) => (
                <button key={w} className="chip" onClick={() => logFill(w)}>
                  {w} {w === 1 ? 'week' : 'weeks'}
                </button>
              ))}
            </div>
            <div className="faint" style={{ marginBottom: 12 }}>
              You'll get a reminder {REMIND_DAYS} days before they run out.
            </div>
            <button className="secondary" style={{ width: '100%' }} onClick={() => setPicking(false)}>Cancel</button>
          </div>
        </div>
      )}

      {toast.node}
    </div>
  )
}
