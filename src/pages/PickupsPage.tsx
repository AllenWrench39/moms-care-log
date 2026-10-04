import { useEffect, useState } from 'react'
import { supabase, todayStr, fmtDateFull, fmtTime24, FamilyMember } from '../supabase'
import { useToast } from '../toast'

// Days Mom gets picked up for an outing. One person opens the date; whoever is
// taking her that day claims it with their name and a time range.
export type Pickup = {
  id: string
  pickup_date: string
  claimed_by: string | null
  claimed_name: string | null
  from_time: string | null
  to_time: string | null
  note: string | null
  cancelled: boolean
  created_by: string
}

export const NOTICE_DAYS = 3

export function daysUntil(dateStr: string) {
  const a = new Date(todayStr() + 'T12:00:00').getTime()
  const b = new Date(dateStr + 'T12:00:00').getTime()
  return Math.round((b - a) / 86400000)
}

export function countdown(days: number) {
  if (days === 0) return 'today'
  if (days === 1) return 'tomorrow'
  return `in ${days} days`
}

function timeRange(p: Pickup) {
  if (!p.from_time && !p.to_time) return 'time not set yet'
  if (p.from_time && p.to_time) return `${fmtTime24(p.from_time)} – ${fmtTime24(p.to_time)}`
  return fmtTime24((p.from_time ?? p.to_time)!)
}

// Banner for the Today tab, quiet until a pickup is close.
export function PickupBanner() {
  const [soon, setSoon] = useState<Pickup[]>([])
  useEffect(() => {
    supabase.from('pickups').select('*').eq('cancelled', false)
      .gte('pickup_date', todayStr()).order('pickup_date').limit(5)
      .then(({ data }) => setSoon((data ?? []).filter((p) => daysUntil(p.pickup_date) <= NOTICE_DAYS)))
  }, [])
  if (soon.length === 0) return null
  return (
    <>
      {soon.map((p) => (
        <div className="warn" key={p.id} style={{ borderLeft: '4px solid var(--green)' }}>
          🚗 <b>Pickup {countdown(daysUntil(p.pickup_date))} — {fmtDateFull(p.pickup_date)}</b>
          <div style={{ marginTop: 3 }}>
            {p.claimed_name
              ? <>{p.claimed_name} · {timeRange(p)}{p.note ? ` · ${p.note}` : ''}</>
              : <b>Nobody has claimed this day yet.</b>}
          </div>
        </div>
      ))}
    </>
  )
}

export default function PickupsPage({ family, myEmail, nameOf }: {
  family: FamilyMember[]
  myEmail: string
  nameOf: (e: string | null | undefined) => string
}) {
  const toast = useToast()
  const [rows, setRows] = useState<Pickup[]>([])
  const [showPast, setShowPast] = useState(false)
  const [newDate, setNewDate] = useState('')
  const [newNote, setNewNote] = useState('')
  const [claiming, setClaiming] = useState<Pickup | null>(null)
  const [form, setForm] = useState({ name: '', from: '10:00', to: '14:00', note: '' })

  async function load() {
    const { data } = await supabase.from('pickups').select('*').order('pickup_date')
    setRows(data ?? [])
  }
  useEffect(() => { load() }, [])

  async function addDay() {
    if (!newDate) return
    await supabase.from('pickups').insert({ pickup_date: newDate, note: newNote.trim() || null })
    setNewDate(''); setNewNote('')
    toast.show('Day added ✓')
    load()
  }

  function openClaim(p: Pickup) {
    setClaiming(p)
    setForm({
      name: p.claimed_name ?? family.find((f) => f.email === myEmail)?.display_name ?? '',
      from: p.from_time ?? '10:00',
      to: p.to_time ?? '14:00',
      note: p.note ?? '',
    })
  }

  async function saveClaim() {
    if (!claiming || !form.name.trim()) return
    await supabase.from('pickups').update({
      claimed_by: myEmail, claimed_name: form.name.trim(),
      from_time: form.from, to_time: form.to, note: form.note.trim() || null,
    }).eq('id', claiming.id)
    setClaiming(null)
    toast.show('Pickup claimed ✓')
    load()
  }

  async function unclaim(p: Pickup) {
    if (!confirm(`Remove ${p.claimed_name} from ${fmtDateFull(p.pickup_date)}? The day stays open.`)) return
    await supabase.from('pickups').update({
      claimed_by: null, claimed_name: null, from_time: null, to_time: null,
    }).eq('id', p.id)
    load()
  }

  async function cancelDay(p: Pickup) {
    if (!confirm(`Cancel the pickup day on ${fmtDateFull(p.pickup_date)}?`)) return
    await supabase.from('pickups').update({ cancelled: true }).eq('id', p.id)
    load()
  }

  async function removeDay(p: Pickup) {
    if (!confirm('Delete this day completely?')) return
    await supabase.from('pickups').delete().eq('id', p.id)
    load()
  }

  const today = todayStr()
  const upcoming = rows.filter((p) => p.pickup_date >= today && !p.cancelled)
  const past = rows.filter((p) => p.pickup_date < today || p.cancelled)
  const unclaimed = upcoming.filter((p) => !p.claimed_by).length

  const Card = ({ p, isPast }: { p: Pickup; isPast?: boolean }) => {
    const days = daysUntil(p.pickup_date)
    const soon = !isPast && days <= NOTICE_DAYS
    return (
      <div className="card" style={{
        marginBottom: 9, opacity: isPast ? 0.6 : 1,
        borderLeft: `4px solid ${p.cancelled ? 'var(--border)' : p.claimed_by ? 'var(--green)' : 'var(--amber, #d68910)'}`,
      }}>
        <div className="row between" style={{ alignItems: 'flex-start' }}>
          <div style={{ minWidth: 0 }}>
            <b style={{ fontSize: 15 }}>{fmtDateFull(p.pickup_date)}</b>
            {!isPast && <span className="faint"> · {countdown(days)}</span>}
            {p.cancelled && <span className="badge" style={{ marginLeft: 6 }}>Cancelled</span>}
            <div style={{ marginTop: 4 }}>
              {p.claimed_by ? (
                <>
                  <b style={{ color: 'var(--green)' }}>🚗 {p.claimed_name}</b>
                  <div className="muted">{timeRange(p)}</div>
                </>
              ) : (
                <span style={{ color: soon ? 'var(--red)' : 'var(--muted)' }}>
                  {soon ? '⚠️ Still unclaimed' : 'Open — nobody has claimed it'}
                </span>
              )}
              {p.note && <div className="faint" style={{ marginTop: 2 }}>{p.note}</div>}
            </div>
          </div>
          {!isPast && (
            <div style={{ flexShrink: 0, display: 'grid', gap: 5 }}>
              <button style={{ padding: '7px 11px', fontSize: 13 }} onClick={() => openClaim(p)}>
                {p.claimed_by ? 'Edit' : "I'll take it"}
              </button>
              {p.claimed_by && <button className="secondary" style={{ padding: '5px 9px', fontSize: 12 }} onClick={() => unclaim(p)}>Clear</button>}
            </div>
          )}
        </div>
        {!isPast && (
          <div className="row" style={{ marginTop: 8 }}>
            <button className="ghost" style={{ fontSize: 12 }} onClick={() => cancelDay(p)}>Cancel day</button>
            <button className="ghost" style={{ fontSize: 12 }} onClick={() => removeDay(p)}>Delete</button>
          </div>
        )}
      </div>
    )
  }

  return (
    <>
      <div className="sec sec-green">
        <div className="sec-title">
          🚗 Pickup Days{upcoming.length > 0 ? ` — ${upcoming.length} coming up` : ''}
        </div>
        {unclaimed > 0 && (
          <div className="warn">
            {unclaimed} upcoming {unclaimed === 1 ? 'day has' : 'days have'} nobody assigned yet.
          </div>
        )}
        <div className="muted" style={{ marginBottom: 9 }}>
          Add the days Mom can be picked up. Whoever is taking her taps <b>I'll take it</b> and
          sets their time range. Everyone sees it, and it shows on the Today tab {NOTICE_DAYS} days ahead.
        </div>
        <div className="row">
          <input type="date" value={newDate} min={today} onChange={(e) => setNewDate(e.target.value)} style={{ marginBottom: 0 }} />
          <button onClick={addDay} disabled={!newDate}>Add day</button>
        </div>
        <input value={newNote} onChange={(e) => setNewNote(e.target.value)}
          placeholder="Note for the day (optional) — e.g. lunch out, bring walker" style={{ marginTop: 8 }} />
      </div>

      {upcoming.length === 0 && (
        <div className="card center muted">No pickup days scheduled yet.</div>
      )}
      {upcoming.map((p) => <Card key={p.id} p={p} />)}

      {past.length > 0 && (
        <div style={{ marginTop: 14 }}>
          <button className="ghost" onClick={() => setShowPast(!showPast)}>
            {showPast ? '▲ Hide past' : `▼ Past & cancelled (${past.length})`}
          </button>
          {showPast && <div style={{ marginTop: 9 }}>
            {[...past].reverse().map((p) => <Card key={p.id} p={p} isPast />)}
          </div>}
        </div>
      )}

      {claiming && (
        <div className="modal-back" onClick={() => setClaiming(null)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div style={{ fontWeight: 'bold', fontSize: 15, marginBottom: 2 }}>
              {fmtDateFull(claiming.pickup_date)}
            </div>
            <div className="muted" style={{ marginBottom: 12 }}>Who is picking her up, and when?</div>

            <label>Name</label>
            <div className="chips" style={{ marginBottom: 8 }}>
              {family.map((f) => (
                <button key={f.email} className={`chip ${form.name === f.display_name ? 'on' : ''}`}
                  onClick={() => setForm({ ...form, name: f.display_name })}>{f.display_name}</button>
              ))}
            </div>
            <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Or type a name" />

            <div className="row" style={{ gap: 8, marginTop: 4 }}>
              <div style={{ flex: 1 }}>
                <label>Pick up</label>
                <input type="time" value={form.from} onChange={(e) => setForm({ ...form, from: e.target.value })} />
              </div>
              <div style={{ flex: 1 }}>
                <label>Back by</label>
                <input type="time" value={form.to} onChange={(e) => setForm({ ...form, to: e.target.value })} />
              </div>
            </div>

            <label>Note</label>
            <input value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })}
              placeholder="e.g. lunch at Maria's, back before dinner meds" />

            <div className="row" style={{ marginTop: 12 }}>
              <button className="grow" onClick={saveClaim} disabled={!form.name.trim()}>Save</button>
              <button className="secondary" onClick={() => setClaiming(null)}>Cancel</button>
            </div>
          </div>
        </div>
      )}

      {toast.node}
    </>
  )
}
