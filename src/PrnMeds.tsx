import { useEffect, useState } from 'react'
import { supabase, todayStr, fmtClock, fmtDateFull, stamp } from './supabase'
import { useToast } from './toast'

// As-needed medicines and short courses live apart from the daily schedule:
// adding them there would mark every unneeded day as a missed dose.

export type PrnMed = { id: string; name: string; dose_options: string[]; active: boolean; sort_order: number }
export type MedCourse = {
  id: string; name: string; dose: string | null; interval_hours: number
  total_doses: number; started_at: string; completed: boolean; notes: string | null
}
export type PrnLog = {
  id: string; prn_med_id: string | null; course_id: string | null
  name: string; dose: string | null; reason: string | null
  log_date: string; created_at: string; created_by: string
}

const REASONS = [
  'Headache', 'Pain', 'Cough', 'Congestion', 'Heartburn', 'Nausea',
  "Can't sleep", 'Constipation', 'Fever', 'Anxious', 'Allergies', 'Other',
]

function sinceText(iso: string) {
  const mins = Math.round((Date.now() - new Date(iso).getTime()) / 60000)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins} min ago`
  const h = Math.round(mins / 60)
  if (h < 24) return `${h} hr ago`
  const d = Math.round(h / 24)
  return `${d} ${d === 1 ? 'day' : 'days'} ago`
}

function dueText(ms: number) {
  if (ms <= 0) return 'due now'
  const mins = Math.round(ms / 60000)
  if (mins < 60) return `in ${mins} min`
  const h = Math.floor(mins / 60)
  const rem = mins % 60
  if (h < 24) return `in ${h}h${rem ? ` ${rem}m` : ''}`
  return `in ${Math.round(h / 24)} days`
}

const BLANK_COURSE = { name: '', dose: '', interval_hours: '24', total_doses: '3' }

export default function PrnMeds({ nameOf, time, timeEdited }: {
  nameOf: (e: string) => string
  time: string
  timeEdited: boolean
}) {
  const toast = useToast()
  const [meds, setMeds] = useState<PrnMed[]>([])
  const [courses, setCourses] = useState<MedCourse[]>([])
  const [logs, setLogs] = useState<PrnLog[]>([])
  const [recent, setRecent] = useState<PrnLog[]>([])
  const [giving, setGiving] = useState<{ med: PrnMed; dose: string | null; reason: string | null } | null>(null)
  const [addCourse, setAddCourse] = useState(false)
  const [courseForm, setCourseForm] = useState(BLANK_COURSE)
  const [manage, setManage] = useState(false)
  const [newName, setNewName] = useState('')
  const [newDoses, setNewDoses] = useState('')

  async function load() {
    const today = todayStr()
    const [m, c, l, r] = await Promise.all([
      supabase.from('prn_meds').select('*').eq('active', true).order('sort_order'),
      supabase.from('med_courses').select('*').eq('completed', false).order('started_at'),
      supabase.from('prn_logs').select('*').eq('log_date', today).order('created_at'),
      // Last given per item, for the double-dose guard on each button.
      supabase.from('prn_logs').select('*').order('created_at', { ascending: false }).limit(60),
    ])
    setMeds(m.data ?? [])
    setCourses(c.data ?? [])
    setLogs(l.data ?? [])
    setRecent(r.data ?? [])
  }

  useEffect(() => { load() }, [])

  const lastGiven = (medId: string) => recent.find((r) => r.prn_med_id === medId)
  const courseDoses = (courseId: string) => recent.filter((r) => r.course_id === courseId).length

  async function giveNow() {
    if (!giving || !giving.dose) return
    await supabase.from('prn_logs').insert({
      prn_med_id: giving.med.id, name: giving.med.name, dose: giving.dose,
      reason: giving.reason, log_date: todayStr(), ...stamp(todayStr(), time, timeEdited),
    })
    toast.show(`${giving.med.name} ${giving.dose} given ✓`)
    setGiving(null)
    load()
  }

  async function logCourseDose(c: MedCourse) {
    const given = courseDoses(c.id)
    await supabase.from('prn_logs').insert({
      course_id: c.id, name: c.name, dose: c.dose, log_date: todayStr(),
      ...stamp(todayStr(), time, timeEdited),
    })
    if (given + 1 >= c.total_doses) {
      await supabase.from('med_courses').update({ completed: true }).eq('id', c.id)
      toast.show(`${c.name} course finished 🎉`)
    } else {
      toast.show(`${c.name} — dose ${given + 1} of ${c.total_doses} ✓`)
    }
    load()
  }

  async function saveCourse() {
    if (!courseForm.name.trim()) return
    await supabase.from('med_courses').insert({
      name: courseForm.name.trim(),
      dose: courseForm.dose.trim() || null,
      interval_hours: Number(courseForm.interval_hours) || 24,
      total_doses: Number(courseForm.total_doses) || 1,
    })
    setCourseForm(BLANK_COURSE)
    setAddCourse(false)
    toast.show('Course added ✓')
    load()
  }

  async function endCourse(c: MedCourse) {
    if (!confirm(`End the ${c.name} course now?`)) return
    await supabase.from('med_courses').update({ completed: true }).eq('id', c.id)
    load()
  }

  async function addPrnMed() {
    if (!newName.trim()) return
    await supabase.from('prn_meds').insert({
      name: newName.trim(),
      dose_options: newDoses.split(',').map((d) => d.trim()).filter(Boolean),
      sort_order: 70,
    })
    setNewName(''); setNewDoses('')
    toast.show('Added ✓')
    load()
  }

  async function removePrnMed(m: PrnMed) {
    if (!confirm(`Remove ${m.name} from the as-needed list? (past doses are kept)`)) return
    await supabase.from('prn_meds').update({ active: false }).eq('id', m.id)
    load()
  }

  async function delLog(id: string) {
    if (!confirm('Remove this?')) return
    await supabase.from('prn_logs').delete().eq('id', id)
    load()
  }

  return (
    <>
      {courses.length > 0 && (
        <div className="sec sec-red">
          <div className="sec-title">💊 Short Course</div>
          {courses.map((c) => {
            const given = courseDoses(c.id)
            const last = recent.find((r) => r.course_id === c.id)
            const nextDue = last
              ? new Date(last.created_at).getTime() + c.interval_hours * 3600000
              : null
            const overdue = nextDue !== null && nextDue <= Date.now()
            return (
              <div key={c.id} style={{ padding: '6px 0' }}>
                <div className="row between" style={{ alignItems: 'flex-start' }}>
                  <div>
                    <b style={{ fontSize: 15 }}>{c.name}{c.dose ? ` ${c.dose}` : ''}</b>
                    <div className="muted" style={{ fontSize: 13 }}>
                      Dose <b>{given} of {c.total_doses}</b> · every {c.interval_hours} hours
                    </div>
                    <div className="faint">
                      {last
                        ? <>Last dose {fmtClock(last.created_at)} {sinceText(last.created_at)} · next {overdue
                            ? <b style={{ color: 'var(--red)' }}>due now</b>
                            : <b>{dueText(nextDue! - Date.now())}</b>}</>
                        : 'No doses given yet'}
                    </div>
                  </div>
                  <button className="danger" style={{ flexShrink: 0 }} onClick={() => endCourse(c)}>End</button>
                </div>
                <div className="progress" style={{ margin: '8px 0 6px' }}>
                  <div style={{ width: `${Math.min(100, (given / c.total_doses) * 100)}%` }} />
                </div>
                <button onClick={() => logCourseDose(c)}>
                  Give dose {given + 1} of {c.total_doses}
                </button>
              </div>
            )
          })}
        </div>
      )}

      <div className="sec sec-purple">
        <div className="sec-title">🕐 As Needed</div>
        <div className="muted" style={{ marginBottom: 9 }}>
          Tap what was given. Each shows when it was last given, so nobody doubles up.
        </div>
        <div style={{ display: 'grid', gap: 7 }}>
          {meds.map((m) => {
            const last = lastGiven(m.id)
            const recentHours = last ? (Date.now() - new Date(last.created_at).getTime()) / 3600000 : null
            return (
              <button key={m.id} className="secondary" style={{ textAlign: 'left', padding: '10px 12px' }}
                onClick={() => setGiving({ med: m, dose: m.dose_options[0] ?? null, reason: null })}>
                <b>{m.name}</b>
                <div className="faint" style={{ marginTop: 2 }}>
                  {last
                    ? <span style={{ color: recentHours !== null && recentHours < 4 ? 'var(--red)' : undefined }}>
                        Last: {last.dose} · {sinceText(last.created_at)}
                        {last.log_date !== todayStr() ? ` (${fmtDateFull(last.log_date).split(',')[0]})` : ''}
                      </span>
                    : 'Never logged'}
                </div>
              </button>
            )
          })}
        </div>

        {logs.length > 0 && (
          <div style={{ marginTop: 12 }}>
            <label>Given today</label>
            {logs.map((l) => (
              <div className="feed-item" key={l.id}>
                <span>
                  <b>{l.name}</b> {l.dose}{l.reason ? ` — ${l.reason}` : ''}
                  <span className="faint"> {fmtClock(l.created_at)} · {nameOf(l.created_by)}</span>
                </span>
                <button className="danger" onClick={() => delLog(l.id)}>✕</button>
              </div>
            ))}
          </div>
        )}

        <div className="row" style={{ marginTop: 12 }}>
          <button className="ghost" onClick={() => setAddCourse(!addCourse)}>
            {addCourse ? '▲ Cancel' : '+ Start a course'}
          </button>
          <button className="ghost" onClick={() => setManage(!manage)}>
            {manage ? '▲ Done' : '▼ Edit list'}
          </button>
        </div>

        {addCourse && (
          <div style={{ marginTop: 10 }}>
            <label>Medication</label>
            <input value={courseForm.name} onChange={(e) => setCourseForm({ ...courseForm, name: e.target.value })}
              placeholder="e.g. Fosfomycin" />
            <label>Dose</label>
            <input value={courseForm.dose} onChange={(e) => setCourseForm({ ...courseForm, dose: e.target.value })}
              placeholder="e.g. 3 g packet" />
            <div className="row" style={{ gap: 8 }}>
              <div style={{ flex: 1 }}>
                <label>Every (hours)</label>
                <input inputMode="numeric" value={courseForm.interval_hours}
                  onChange={(e) => setCourseForm({ ...courseForm, interval_hours: e.target.value.replace(/[^0-9]/g, '') })} />
              </div>
              <div style={{ flex: 1 }}>
                <label>Total doses</label>
                <input inputMode="numeric" value={courseForm.total_doses}
                  onChange={(e) => setCourseForm({ ...courseForm, total_doses: e.target.value.replace(/[^0-9]/g, '') })} />
              </div>
            </div>
            <button onClick={saveCourse}>Start course</button>
          </div>
        )}

        {manage && (
          <div style={{ marginTop: 10 }}>
            {meds.map((m) => (
              <div className="feed-item" key={m.id}>
                <div>
                  <b>{m.name}</b>
                  <div className="faint">{m.dose_options.join(' · ') || 'no preset doses'}</div>
                </div>
                <button className="danger" onClick={() => removePrnMed(m)}>✕</button>
              </div>
            ))}
            <label style={{ marginTop: 8 }}>Add an as-needed medicine</label>
            <input value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="Name, e.g. Benadryl" />
            <input value={newDoses} onChange={(e) => setNewDoses(e.target.value)} placeholder="Doses, comma separated: 25 mg, 50 mg" />
            <button onClick={addPrnMed}>Add</button>
          </div>
        )}
      </div>

      {giving && (
        <div className="modal-back" onClick={() => setGiving(null)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div style={{ fontWeight: 'bold', fontSize: 15, marginBottom: 2 }}>{giving.med.name}</div>
            {(() => {
              const last = lastGiven(giving.med.id)
              return last ? (
                <div className="faint" style={{ marginBottom: 12 }}>
                  Last given {last.dose} · {sinceText(last.created_at)}
                </div>
              ) : <div className="faint" style={{ marginBottom: 12 }}>No previous dose logged</div>
            })()}

            <label>Dose</label>
            <div className="chips" style={{ marginBottom: 14 }}>
              {giving.med.dose_options.map((d) => (
                <button key={d} className={`chip ${giving.dose === d ? 'on' : ''}`}
                  onClick={() => setGiving({ ...giving, dose: d })}>{d}</button>
              ))}
            </div>

            <label>Why? (optional)</label>
            <div className="chips" style={{ marginBottom: 16 }}>
              {REASONS.map((r) => (
                <button key={r} className={`chip ${giving.reason === r ? 'on' : ''}`}
                  onClick={() => setGiving({ ...giving, reason: giving.reason === r ? null : r })}>{r}</button>
              ))}
            </div>

            <div className="row">
              <button className="grow" onClick={giveNow} disabled={!giving.dose}>Log it</button>
              <button className="secondary" onClick={() => setGiving(null)}>Cancel</button>
            </div>
          </div>
        </div>
      )}

      {toast.node}
    </>
  )
}
