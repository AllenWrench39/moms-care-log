import { useEffect, useState } from 'react'
import { supabase, todayStr, fmtTime24, fmtClock, Medication, MedDose, PowderLog } from '../supabase'
import { DIARRHEA_WARNING } from './TodayPage'
import { useToast } from '../toast'

const POWDER_AMOUNTS = ['½ tsp', '1 tsp', '2 tsp', '½ tbsp', '1 tbsp', '2 tbsp']
const POWDER_ITEMS = ['Fiber', 'MiraLAX'] as const

const HOLD_REASONS = ['Refused', 'Nausea/Vomiting', 'Diarrhea', 'Low BP', 'Low Blood Sugar', 'Asleep', "Doctor's order", 'Out of stock', 'Other']

export default function MedsPage({ nameOf }: { nameOf: (e: string) => string }) {
  const today = todayStr()
  const toast = useToast()
  const [meds, setMeds] = useState<Medication[]>([])
  const [doses, setDoses] = useState<MedDose[]>([])
  const [hasDiarrhea, setHasDiarrhea] = useState(false)
  const [holdTarget, setHoldTarget] = useState<{ med: Medication; time: string } | null>(null)
  const [manage, setManage] = useState(false)
  const [editing, setEditing] = useState<Medication | null>(null)
  const [form, setForm] = useState({ name: '', dose: '', times: '', notes: '', with_food: false, hold_diarrhea: false, never_hold: false })
  const [showAdd, setShowAdd] = useState(false)
  const [powderLogs, setPowderLogs] = useState<PowderLog[]>([])
  const [powderPicker, setPowderPicker] = useState<'Fiber' | 'MiraLAX' | null>(null)

  async function load() {
    const [m, d, s, pl] = await Promise.all([
      supabase.from('medications').select('*').eq('active', true).order('sort_order').order('name'),
      supabase.from('med_doses').select('*').eq('dose_date', today),
      supabase.from('day_symptoms').select('symptom').eq('sym_date', today),
      supabase.from('powder_logs').select('*').eq('log_date', today).order('created_at'),
    ])
    setMeds(m.data ?? [])
    setDoses(d.data ?? [])
    setHasDiarrhea((s.data ?? []).some((x) => ['Diarrhea', 'Vomiting'].includes(x.symptom)))
    setPowderLogs(pl.data ?? [])
  }

  async function logPowder(item: 'Fiber' | 'MiraLAX', amount: string) {
    await supabase.from('powder_logs').insert({ item, amount, log_date: today })
    toast.show(`${item} ${amount} logged ✓`)
    setPowderPicker(null)
    load()
  }

  async function delPowder(id: string) {
    if (!confirm('Remove this?')) return
    await supabase.from('powder_logs').delete().eq('id', id)
    load()
  }

  useEffect(() => {
    load()
    const ch = supabase
      .channel('meds')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'med_doses' }, load)
      .subscribe()
    return () => { supabase.removeChannel(ch) }
  }, [])

  const doseFor = (medId: string, time: string) =>
    doses.find((d) => d.medication_id === medId && d.dose_time === time)

  async function give(med: Medication, time: string) {
    const existing = doseFor(med.id, time)
    if (existing?.status === 'given') {
      await supabase.from('med_doses').delete().eq('id', existing.id)
      toast.show('Unmarked')
    } else {
      if (existing) await supabase.from('med_doses').delete().eq('id', existing.id)
      await supabase.from('med_doses').insert({ medication_id: med.id, dose_date: today, dose_time: time, status: 'given' })
      toast.show('Med marked ✓')
    }
    load()
  }

  async function giveAll(time: string) {
    const pending = timeGroups[time].filter((med) => {
      const d = doseFor(med.id, time)
      return d?.status !== 'given' && d?.status !== 'held'
    })
    if (pending.length === 0) return
    await supabase.from('med_doses').insert(
      pending.map((med) => ({ medication_id: med.id, dose_date: today, dose_time: time, status: 'given' }))
    )
    toast.show(`${pending.length} meds marked ✓`)
    load()
  }

  async function hold(med: Medication, time: string, reason?: string) {
    const existing = doseFor(med.id, time)
    if (existing?.status === 'held') {
      await supabase.from('med_doses').delete().eq('id', existing.id)
      toast.show('Hold removed')
      load()
      return
    }
    if (!reason) {
      setHoldTarget({ med, time })
      return
    }
    if (existing) await supabase.from('med_doses').delete().eq('id', existing.id)
    await supabase.from('med_doses').insert({
      medication_id: med.id, dose_date: today, dose_time: time, status: 'held', hold_reason: reason,
    })
    toast.show('Med held: ' + reason)
    load()
  }

  // group by time
  const timeGroups: Record<string, Medication[]> = {}
  meds.forEach((med) => med.times.forEach((t) => { (timeGroups[t] ||= []).push(med) }))
  const sortedTimes = Object.keys(timeGroups).sort()

  async function saveMed() {
    if (!form.name.trim()) return
    const times = form.times.split(',').map((t) => t.trim()).filter(Boolean)
    const payload = {
      name: form.name.trim(), dose: form.dose.trim() || null, times,
      notes: form.notes.trim() || null, with_food: form.with_food,
      hold_diarrhea: form.hold_diarrhea, never_hold: form.never_hold,
    }
    if (editing) await supabase.from('medications').update(payload).eq('id', editing.id)
    else await supabase.from('medications').insert({ ...payload, sort_order: 99 })
    setEditing(null); setShowAdd(false)
    setForm({ name: '', dose: '', times: '', notes: '', with_food: false, hold_diarrhea: false, never_hold: false })
    toast.show('Saved ✓')
    load()
  }

  function startEdit(med: Medication) {
    setEditing(med)
    setShowAdd(true)
    setForm({
      name: med.name, dose: med.dose ?? '', times: med.times.join(', '), notes: med.notes ?? '',
      with_food: med.with_food, hold_diarrhea: med.hold_diarrhea, never_hold: med.never_hold,
    })
  }

  async function removeMed(med: Medication) {
    if (!confirm(`Remove ${med.name} from the schedule? (history is kept)`)) return
    await supabase.from('medications').update({ active: false }).eq('id', med.id)
    load()
  }

  return (
    <>
      {hasDiarrhea && (
        <div className="warn">⚠️ <b>Diarrhea/Vomiting flagged today.</b> {DIARRHEA_WARNING}</div>
      )}
      <div className="muted" style={{ marginBottom: 4 }}>
        Tap <b>Give</b> to mark given · <b>Hold</b> to log a skipped dose · tap again to undo.
      </div>

      {sortedTimes.map((time) => {
        const showPowderSection = time === '09:00'
        const pendingCount = timeGroups[time].filter((med) => {
          const d = doseFor(med.id, time)
          return d?.status !== 'given' && d?.status !== 'held'
        }).length
        return (
        <div key={time}>
        {showPowderSection && (
          <div style={{ marginBottom: 10 }}>
            <div className="med-time-head">🌾 Fiber &amp; MiraLAX</div>
            {POWDER_ITEMS.map((item) => (
              <div className="med-row" key={item}>
                <div className="row between">
                  <b className="med-name">{item}</b>
                  <button className="btn-give" onClick={() => setPowderPicker(item)}>Log dose</button>
                </div>
                {powderLogs.filter((p) => p.item === item).map((p) => (
                  <div className="feed-item" key={p.id}>
                    <span style={{ color: 'var(--green)' }}>✓ {p.amount} <span className="faint">{fmtClock(p.created_at)} · {nameOf(p.created_by)}</span></span>
                    <button className="danger" onClick={() => delPowder(p.id)}>✕</button>
                  </div>
                ))}
              </div>
            ))}
          </div>
        )}
          <div className="med-time-head row between">
            <span>🕐 {fmtTime24(time)}</span>
            {timeGroups[time].length > 2 && pendingCount > 0 && (
              <button className="btn-give" style={{ padding: '4px 10px', fontSize: 12 }} onClick={() => giveAll(time)}>
                ✓ Give all ({pendingCount})
              </button>
            )}
          </div>
          {timeGroups[time].map((med) => {
            const dose = doseFor(med.id, time)
            const given = dose?.status === 'given'
            const held = dose?.status === 'held'
            const holdFlag = hasDiarrhea && med.hold_diarrhea && !given && !held
            return (
              <div className="med-row" key={med.id + time}>
                <div className="row between top">
                  <div className="grow">
                    <div className={`med-name ${given ? 'given' : ''} ${held ? 'held' : ''}`}>
                      {med.name} {med.dose && <span style={{ fontWeight: 'normal', fontSize: 13 }}>{med.dose}</span>}
                      {med.never_hold && <span className="badge" style={{ marginLeft: 5, background: 'var(--green-soft)', color: 'var(--green)' }}>DO NOT HOLD</span>}
                      {holdFlag && <span className="badge" style={{ marginLeft: 5, background: 'var(--amber-soft)', color: 'var(--amber-ink)' }}>⚠ HOLD TODAY?</span>}
                    </div>
                    {med.notes && <div className="med-note">{med.notes}</div>}
                    {given && dose && <div className="med-status" style={{ color: 'var(--green)' }}>✓ Given {fmtClock(dose.created_at)} by {nameOf(dose.created_by)}</div>}
                    {held && dose && <div className="med-status" style={{ color: 'var(--red)' }}>⏸ Held — {dose.hold_reason} · {fmtClock(dose.created_at)} by {nameOf(dose.created_by)}</div>}
                  </div>
                  <div className="row" style={{ flexShrink: 0 }}>
                    <button className={`btn-give ${given ? 'undo' : ''}`} onClick={() => give(med, time)}>
                      {given ? '↩ Undo' : 'Give'}
                    </button>
                    <button className={`btn-hold ${held ? 'undo' : ''}`} onClick={() => hold(med, time, held ? dose?.hold_reason ?? undefined : undefined)}>
                      {held ? '↩ Unhold' : 'Hold'}
                    </button>
                  </div>
                </div>
              </div>
            )
          })}
        </div>
        )
      })}

      <div style={{ marginTop: 18 }}>
        <button className="ghost" onClick={() => setManage(!manage)}>
          {manage ? '▲ Hide schedule editor' : '▼ Edit medication schedule'}
        </button>
      </div>

      {manage && (
        <div className="card" style={{ marginTop: 8 }}>
          <div className="row between" style={{ marginBottom: 10 }}>
            <h3 style={{ margin: 0 }}>Medication schedule</h3>
            {!showAdd && <button className="secondary" onClick={() => { setEditing(null); setShowAdd(true) }}>+ Add Med</button>}
          </div>

          {showAdd && (
            <div style={{ marginBottom: 14 }}>
              <label>Name</label>
              <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="e.g. Metoprolol" />
              <label>Dose</label>
              <input value={form.dose} onChange={(e) => setForm({ ...form, dose: e.target.value })} placeholder="e.g. 25 mg" />
              <label>Times (24h, comma-separated)</label>
              <input value={form.times} onChange={(e) => setForm({ ...form, times: e.target.value })} placeholder="09:00, 17:00" />
              <label>Notes</label>
              <input value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} placeholder="e.g. With food" />
              <div className="chips" style={{ marginBottom: 10 }}>
                <button className={`chip ${form.with_food ? 'on' : ''}`} onClick={() => setForm({ ...form, with_food: !form.with_food })}>With food</button>
                <button className={`chip ${form.hold_diarrhea ? 'on-red' : ''}`} onClick={() => setForm({ ...form, hold_diarrhea: !form.hold_diarrhea })}>Hold on diarrhea</button>
                <button className={`chip ${form.never_hold ? 'on' : ''}`} onClick={() => setForm({ ...form, never_hold: !form.never_hold })}>Never hold</button>
              </div>
              <div className="row">
                <button onClick={saveMed}>{editing ? 'Save changes' : 'Add medication'}</button>
                <button className="secondary" onClick={() => { setShowAdd(false); setEditing(null) }}>Cancel</button>
              </div>
            </div>
          )}

          {meds.map((med) => (
            <div className="feed-item" key={med.id}>
              <div>
                <b>{med.name}</b> <span className="muted">{med.dose}</span>
                <div className="faint">{med.times.map(fmtTime24).join(' · ')}{med.notes ? ` — ${med.notes}` : ''}</div>
              </div>
              <div className="row" style={{ flexShrink: 0 }}>
                <button className="secondary" style={{ padding: '5px 9px', fontSize: 12 }} onClick={() => startEdit(med)}>Edit</button>
                <button className="danger" onClick={() => removeMed(med)}>✕</button>
              </div>
            </div>
          ))}
        </div>
      )}

      {powderPicker && (
        <div className="modal-back" onClick={() => setPowderPicker(null)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div style={{ fontWeight: 'bold', fontSize: 15, marginBottom: 12 }}>Log {powderPicker} — how much?</div>
            <div className="chips" style={{ marginBottom: 14 }}>
              {POWDER_AMOUNTS.map((a) => (
                <button key={a} className="chip" onClick={() => logPowder(powderPicker, a)}>{a}</button>
              ))}
            </div>
            <button className="secondary" style={{ width: '100%' }} onClick={() => setPowderPicker(null)}>Cancel</button>
          </div>
        </div>
      )}

      {holdTarget && (
        <div className="modal-back" onClick={() => setHoldTarget(null)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div style={{ fontWeight: 'bold', fontSize: 15, marginBottom: 4 }}>Hold {holdTarget.med.name}</div>
            {holdTarget.med.never_hold && (
              <div className="warn">⚠️ This medication is marked <b>DO NOT HOLD</b>. Only hold on a doctor's order.</div>
            )}
            <div className="muted" style={{ marginBottom: 12 }}>Why is this dose being held?</div>
            <div className="chips" style={{ marginBottom: 14 }}>
              {HOLD_REASONS.map((r) => (
                <button key={r} className="chip" onClick={() => { hold(holdTarget.med, holdTarget.time, r); setHoldTarget(null) }}>{r}</button>
              ))}
            </div>
            <button className="secondary" style={{ width: '100%' }} onClick={() => setHoldTarget(null)}>Cancel</button>
          </div>
        </div>
      )}

      {toast.node}
    </>
  )
}
