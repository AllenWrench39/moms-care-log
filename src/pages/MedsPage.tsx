import { useEffect, useState } from 'react'
import { supabase, Medication, MedDose } from '../supabase'

function todayStr() {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function fmtTime(t: string) {
  const [h, m] = t.split(':').map(Number)
  const ampm = h >= 12 ? 'PM' : 'AM'
  const hh = h % 12 === 0 ? 12 : h % 12
  return `${hh}:${String(m).padStart(2, '0')} ${ampm}`
}

export default function MedsPage({ nameOf }: { nameOf: (e: string) => string }) {
  const [meds, setMeds] = useState<Medication[]>([])
  const [doses, setDoses] = useState<MedDose[]>([])
  const [showForm, setShowForm] = useState(false)
  const [name, setName] = useState('')
  const [dosage, setDosage] = useState('')
  const [instructions, setInstructions] = useState('')
  const [times, setTimes] = useState('08:00')
  const today = todayStr()

  async function load() {
    const [m, d] = await Promise.all([
      supabase.from('medications').select('*').eq('active', true).order('name'),
      supabase.from('med_doses').select('*').eq('dose_date', today),
    ])
    setMeds(m.data ?? [])
    setDoses(d.data ?? [])
  }

  useEffect(() => {
    load()
    const ch = supabase
      .channel('med_doses')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'med_doses' }, load)
      .subscribe()
    return () => { supabase.removeChannel(ch) }
  }, [])

  const doseFor = (medId: string, time: string) =>
    doses.find((d) => d.medication_id === medId && d.dose_time === time)

  async function toggleDose(medId: string, time: string) {
    const existing = doseFor(medId, time)
    if (existing) {
      if (!confirm('Un-check this dose?')) return
      await supabase.from('med_doses').delete().eq('id', existing.id)
    } else {
      await supabase.from('med_doses').insert({ medication_id: medId, dose_date: today, dose_time: time })
    }
    load()
  }

  async function addMed(e: React.FormEvent) {
    e.preventDefault()
    const timeList = times.split(',').map((t) => t.trim()).filter(Boolean)
    const { error } = await supabase.from('medications').insert({
      name: name.trim(),
      dosage: dosage.trim() || null,
      instructions: instructions.trim() || null,
      times: timeList,
    })
    if (!error) {
      setName(''); setDosage(''); setInstructions(''); setTimes('08:00'); setShowForm(false)
      load()
    }
  }

  async function removeMed(med: Medication) {
    if (!confirm(`Remove ${med.name} from the list? (history is kept)`)) return
    await supabase.from('medications').update({ active: false }).eq('id', med.id)
    load()
  }

  return (
    <>
      <div className="section-title">Today's medications</div>
      {meds.length === 0 && <p className="muted center">No medications yet. Add one below.</p>}
      {meds.map((med) => (
        <div className="card" key={med.id}>
          <div className="row">
            <div className="grow">
              <b>{med.name}</b> {med.dosage && <span className="muted">{med.dosage}</span>}
              {med.instructions && <div className="muted">{med.instructions}</div>}
            </div>
            <button className="danger" onClick={() => removeMed(med)} aria-label="Remove">✕</button>
          </div>
          <div style={{ marginTop: 8 }}>
            {med.times.map((t) => {
              const dose = doseFor(med.id, t)
              return (
                <button
                  key={t}
                  className={`dose-chip ${dose ? 'given' : ''}`}
                  onClick={() => toggleDose(med.id, t)}
                >
                  {dose ? '✓' : '○'} {fmtTime(t)}
                  {dose && <span style={{ fontWeight: 400 }}> · {nameOf(dose.given_by)}</span>}
                </button>
              )
            })}
          </div>
        </div>
      ))}

      {showForm ? (
        <form className="card" onSubmit={addMed}>
          <label>Medication name</label>
          <input required value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Metformin" />
          <label>Dosage (optional)</label>
          <input value={dosage} onChange={(e) => setDosage(e.target.value)} placeholder="e.g. 500mg" />
          <label>Instructions (optional)</label>
          <input value={instructions} onChange={(e) => setInstructions(e.target.value)} placeholder="e.g. with food" />
          <label>Times of day (24h, comma-separated)</label>
          <input required value={times} onChange={(e) => setTimes(e.target.value)} placeholder="08:00, 20:00" />
          <div className="row">
            <button type="submit" className="grow">Save medication</button>
            <button type="button" className="secondary" onClick={() => setShowForm(false)}>Cancel</button>
          </div>
        </form>
      ) : (
        <button className="secondary" style={{ width: '100%' }} onClick={() => setShowForm(true)}>
          + Add medication
        </button>
      )}
    </>
  )
}
