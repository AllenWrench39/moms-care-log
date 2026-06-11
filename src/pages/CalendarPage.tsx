import { useEffect, useState } from 'react'
import { supabase, Appointment, FamilyMember } from '../supabase'

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric' })
}
function fmtTime(iso: string) {
  return new Date(iso).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })
}

export default function CalendarPage({ family, nameOf }: { family: FamilyMember[]; nameOf: (e: string | null | undefined) => string }) {
  const [appts, setAppts] = useState<Appointment[]>([])
  const [showForm, setShowForm] = useState(false)
  const [title, setTitle] = useState('')
  const [location, setLocation] = useState('')
  const [when, setWhen] = useState('')
  const [driver, setDriver] = useState('')
  const [notes, setNotes] = useState('')
  const [showPast, setShowPast] = useState(false)

  async function load() {
    const { data } = await supabase.from('appointments').select('*').order('starts_at')
    setAppts(data ?? [])
  }
  useEffect(() => { load() }, [])

  async function addAppt(e: React.FormEvent) {
    e.preventDefault()
    const { error } = await supabase.from('appointments').insert({
      title: title.trim(),
      location: location.trim() || null,
      starts_at: new Date(when).toISOString(),
      driver_email: driver || null,
      notes: notes.trim() || null,
    })
    if (!error) {
      setTitle(''); setLocation(''); setWhen(''); setDriver(''); setNotes(''); setShowForm(false)
      load()
    }
  }

  async function remove(id: string) {
    if (!confirm('Delete this appointment?')) return
    await supabase.from('appointments').delete().eq('id', id)
    load()
  }

  const now = Date.now()
  const upcoming = appts.filter((a) => new Date(a.starts_at).getTime() >= now - 3600_000)
  const past = appts.filter((a) => new Date(a.starts_at).getTime() < now - 3600_000).reverse()

  const ApptCard = ({ a }: { a: Appointment }) => (
    <div className="card" key={a.id}>
      <div className="row">
        <div className="grow">
          <b>{a.title}</b>
          <div className="muted">
            {fmtDate(a.starts_at)} · {fmtTime(a.starts_at)}
            {a.location && <> · {a.location}</>}
          </div>
          {a.driver_email && <div className="muted">🚗 {nameOf(a.driver_email)} is taking her</div>}
          {a.notes && <div className="muted">{a.notes}</div>}
        </div>
        <button className="danger" onClick={() => remove(a.id)} aria-label="Delete">✕</button>
      </div>
    </div>
  )

  return (
    <>
      {showForm ? (
        <form className="card fab-form" onSubmit={addAppt}>
          <label>What</label>
          <input required value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Dr. Smith — cardiology" />
          <label>When</label>
          <input required type="datetime-local" value={when} onChange={(e) => setWhen(e.target.value)} />
          <label>Where (optional)</label>
          <input value={location} onChange={(e) => setLocation(e.target.value)} placeholder="e.g. Mercy Hospital" />
          <label>Who's taking her (optional)</label>
          <select value={driver} onChange={(e) => setDriver(e.target.value)}>
            <option value="">— not decided —</option>
            {family.map((f) => (
              <option key={f.email} value={f.email}>{f.display_name}</option>
            ))}
          </select>
          <label>Notes (optional)</label>
          <textarea value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Bring med list, fasting required…" />
          <div className="row">
            <button type="submit" className="grow">Save appointment</button>
            <button type="button" className="secondary" onClick={() => setShowForm(false)}>Cancel</button>
          </div>
        </form>
      ) : (
        <button className="secondary fab-form" style={{ width: '100%' }} onClick={() => setShowForm(true)}>
          + Add appointment
        </button>
      )}

      <div className="section-title">Upcoming</div>
      {upcoming.length === 0 && <p className="muted center">Nothing scheduled.</p>}
      {upcoming.map((a) => <ApptCard a={a} key={a.id} />)}

      {past.length > 0 && (
        <>
          <button className="ghost" onClick={() => setShowPast(!showPast)}>
            {showPast ? 'Hide' : 'Show'} past appointments ({past.length})
          </button>
          {showPast && past.map((a) => <ApptCard a={a} key={a.id} />)}
        </>
      )}
    </>
  )
}
