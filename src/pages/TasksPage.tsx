import { useEffect, useState } from 'react'
import { supabase, Task, FamilyMember } from '../supabase'

function fmtDue(d: string) {
  const date = new Date(d + 'T00:00:00')
  return date.toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric' })
}

export default function TasksPage({ family, nameOf }: { family: FamilyMember[]; nameOf: (e: string | null | undefined) => string }) {
  const [tasks, setTasks] = useState<Task[]>([])
  const [showForm, setShowForm] = useState(false)
  const [title, setTitle] = useState('')
  const [kind, setKind] = useState<'task' | 'shift'>('task')
  const [dueDate, setDueDate] = useState('')
  const [assignedTo, setAssignedTo] = useState('')
  const [showDone, setShowDone] = useState(false)

  async function load() {
    const { data } = await supabase
      .from('tasks')
      .select('*')
      .order('done')
      .order('due_date', { ascending: true, nullsFirst: false })
    setTasks(data ?? [])
  }

  useEffect(() => {
    load()
    const ch = supabase
      .channel('tasks')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'tasks' }, load)
      .subscribe()
    return () => { supabase.removeChannel(ch) }
  }, [])

  async function addTask(e: React.FormEvent) {
    e.preventDefault()
    const { error } = await supabase.from('tasks').insert({
      title: title.trim(),
      kind,
      due_date: dueDate || null,
      assigned_to: assignedTo || null,
    })
    if (!error) {
      setTitle(''); setKind('task'); setDueDate(''); setAssignedTo(''); setShowForm(false)
      load()
    }
  }

  async function toggle(t: Task) {
    const { data } = await supabase.auth.getUser()
    const email = data.user?.email?.toLowerCase() ?? null
    await supabase
      .from('tasks')
      .update(
        t.done
          ? { done: false, done_by: null, done_at: null }
          : { done: true, done_by: email, done_at: new Date().toISOString() },
      )
      .eq('id', t.id)
    load()
  }

  async function remove(id: string) {
    if (!confirm('Delete this task?')) return
    await supabase.from('tasks').delete().eq('id', id)
    load()
  }

  const open = tasks.filter((t) => !t.done)
  const done = tasks.filter((t) => t.done)

  const TaskRow = ({ t }: { t: Task }) => (
    <div className="task-row" key={t.id}>
      <input type="checkbox" checked={t.done} onChange={() => toggle(t)} />
      <div className="grow">
        <span className={t.done ? 'done-label' : ''}>
          {t.kind === 'shift' && <span className="badge">SHIFT</span>} {t.title}
        </span>
        <div className="muted">
          {t.due_date && <>📆 {fmtDue(t.due_date)} </>}
          {t.assigned_to && <>· {nameOf(t.assigned_to)} </>}
          {t.done && t.done_by && <>· done by {nameOf(t.done_by)}</>}
        </div>
      </div>
      <button className="danger" onClick={() => remove(t.id)} aria-label="Delete">✕</button>
    </div>
  )

  return (
    <>
      {showForm ? (
        <form className="card fab-form" onSubmit={addTask}>
          <label>What needs doing</label>
          <input required value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Pick up prescriptions" />
          <label>Type</label>
          <select value={kind} onChange={(e) => setKind(e.target.value as 'task' | 'shift')}>
            <option value="task">Task / errand</option>
            <option value="shift">Care shift (who's with Mom)</option>
          </select>
          <label>Date (optional)</label>
          <input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
          <label>Assigned to (optional)</label>
          <select value={assignedTo} onChange={(e) => setAssignedTo(e.target.value)}>
            <option value="">— anyone —</option>
            {family.map((f) => (
              <option key={f.email} value={f.email}>{f.display_name}</option>
            ))}
          </select>
          <div className="row">
            <button type="submit" className="grow">Save</button>
            <button type="button" className="secondary" onClick={() => setShowForm(false)}>Cancel</button>
          </div>
        </form>
      ) : (
        <button className="secondary fab-form" style={{ width: '100%' }} onClick={() => setShowForm(true)}>
          + Add task or shift
        </button>
      )}

      <div className="section-title">To do</div>
      <div className="card">
        {open.length === 0 && <p className="muted center">All caught up! 🎉</p>}
        {open.map((t) => <TaskRow t={t} key={t.id} />)}
      </div>

      {done.length > 0 && (
        <>
          <button className="ghost" onClick={() => setShowDone(!showDone)}>
            {showDone ? 'Hide' : 'Show'} completed ({done.length})
          </button>
          {showDone && <div className="card">{done.map((t) => <TaskRow t={t} key={t.id} />)}</div>}
        </>
      )}
    </>
  )
}
