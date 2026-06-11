import { useEffect, useState } from 'react'
import { supabase, LogEntry } from '../supabase'

const CATEGORIES: { id: string; label: string; icon: string }[] = [
  { id: 'general', label: 'General', icon: '📝' },
  { id: 'meal', label: 'Meal', icon: '🍽️' },
  { id: 'mood', label: 'Mood', icon: '🙂' },
  { id: 'sleep', label: 'Sleep', icon: '😴' },
  { id: 'bathroom', label: 'Bathroom', icon: '🚻' },
  { id: 'activity', label: 'Activity', icon: '🚶' },
  { id: 'health', label: 'Health', icon: '🩺' },
]

const iconFor = (cat: string) => CATEGORIES.find((c) => c.id === cat)?.icon ?? '📝'

function fmtWhen(iso: string) {
  const d = new Date(iso)
  const today = new Date()
  const yesterday = new Date(today)
  yesterday.setDate(today.getDate() - 1)
  const time = d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })
  if (d.toDateString() === today.toDateString()) return `Today ${time}`
  if (d.toDateString() === yesterday.toDateString()) return `Yesterday ${time}`
  return d.toLocaleDateString([], { month: 'short', day: 'numeric' }) + ' ' + time
}

export default function LogPage({ nameOf, myEmail }: { nameOf: (e: string) => string; myEmail: string }) {
  const [entries, setEntries] = useState<LogEntry[]>([])
  const [note, setNote] = useState('')
  const [category, setCategory] = useState('general')
  const [busy, setBusy] = useState(false)

  async function load() {
    const { data } = await supabase
      .from('log_entries')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(100)
    setEntries(data ?? [])
  }

  useEffect(() => {
    load()
    const ch = supabase
      .channel('log_entries')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'log_entries' }, load)
      .subscribe()
    return () => { supabase.removeChannel(ch) }
  }, [])

  async function addEntry(e: React.FormEvent) {
    e.preventDefault()
    if (!note.trim()) return
    setBusy(true)
    const { error } = await supabase.from('log_entries').insert({ note: note.trim(), category })
    setBusy(false)
    if (!error) {
      setNote('')
      setCategory('general')
      load()
    }
  }

  async function remove(id: string) {
    if (!confirm('Delete this entry?')) return
    await supabase.from('log_entries').delete().eq('id', id)
    load()
  }

  return (
    <>
      <form className="card fab-form" onSubmit={addEntry}>
        <div className="cat-buttons">
          {CATEGORIES.map((c) => (
            <button
              key={c.id}
              type="button"
              className={category === c.id ? 'active' : ''}
              onClick={() => setCategory(c.id)}
            >
              {c.icon} {c.label}
            </button>
          ))}
        </div>
        <textarea
          placeholder="How is Mom doing? What happened?"
          value={note}
          onChange={(e) => setNote(e.target.value)}
        />
        <button type="submit" disabled={busy || !note.trim()} style={{ width: '100%' }}>
          Add to log
        </button>
      </form>

      {entries.length === 0 && <p className="muted center">No entries yet — add the first one above.</p>}
      {entries.map((en) => (
        <div className="card entry" key={en.id}>
          <div className="cat">{iconFor(en.category)}</div>
          <div className="grow">
            <div>{en.note}</div>
            <div className="meta">
              {nameOf(en.author_email)} · {fmtWhen(en.created_at)}
            </div>
          </div>
          {en.author_email === myEmail && (
            <button className="danger" onClick={() => remove(en.id)} aria-label="Delete">✕</button>
          )}
        </div>
      ))}
    </>
  )
}
