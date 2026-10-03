import { useRef, useState } from 'react'
import { supabase, stamp } from './supabase'

// Pain and mood were free text, so the log holds things like "4 legs and feet
// hurting" and 53 one-off mood words. Fixed choices make both countable.
const PAIN_SITES = ['Foot', 'Feet', 'Legs', 'Knee', 'Hip', 'Low back', 'Bottom', 'Stomach', 'Head', 'Arm', 'Chest', 'Other']
const MOODS = ['Good', 'Happy', 'Better', 'Ok', 'Fair', 'Tired', 'Sleepy', 'Hard to wake', 'Grumpy', 'Sick']

// Sanity ranges. Outside these the save asks first — it never blocks, since an
// unusual reading can be the real one and the whole point of logging it.
const RANGE: Record<string, [number, number, string]> = {
  sys: [60, 260, 'blood pressure (top number)'],
  dia: [30, 160, 'blood pressure (bottom number)'],
  heart_rate: [30, 200, 'heart rate'],
  blood_sugar: [20, 600, 'blood sugar'],
  o2: [50, 100, 'oxygen'],
  temp: [93, 108, 'temperature'],
  weight: [50, 400, 'weight'],
}

type Props = {
  date: string
  time: string
  timeEdited: boolean
  onSaved: () => void
  toast: (msg: string) => void
}

export default function VitalsEntry({ date, time, timeEdited, onSaved, toast }: Props) {
  const [open, setOpen] = useState(false)
  const [more, setMore] = useState(false)
  const [sys, setSys] = useState('')
  const [dia, setDia] = useState('')
  const [hr, setHr] = useState('')
  const [sugar, setSugar] = useState('')
  const [o2, setO2] = useState('')
  const [temp, setTemp] = useState('')
  const [weight, setWeight] = useState('')
  const [pain, setPain] = useState<string | null>(null)
  const [painSite, setPainSite] = useState<string | null>(null)
  const [mood, setMood] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const diaRef = useRef<HTMLInputElement>(null)

  function reset() {
    setSys(''); setDia(''); setHr(''); setSugar(''); setO2('')
    setTemp(''); setWeight(''); setPain(null); setPainSite(null); setMood(null)
    setMore(false)
  }

  // Digits only, so a stray bracket or emoji can never reach the record.
  const digits = (v: string, max: number) => v.replace(/[^0-9]/g, '').slice(0, max)
  const decimal = (v: string) => v.replace(/[^0-9.]/g, '').slice(0, 5)

  function onSys(v: string) {
    const d = digits(v, 3)
    setSys(d)
    if (d.length === 3) diaRef.current?.focus()   // jump to the bottom number
  }

  function outOfRange(): string[] {
    const bad: string[] = []
    const check = (key: string, raw: string) => {
      if (!raw) return
      const n = Number(raw)
      const [lo, hi, label] = RANGE[key]
      if (isNaN(n) || n < lo || n > hi) bad.push(`${label}: ${raw}`)
    }
    check('sys', sys); check('dia', dia); check('heart_rate', hr)
    check('blood_sugar', sugar); check('o2', o2); check('temp', temp); check('weight', weight)
    return bad
  }

  async function save() {
    const rows: { kind: string; value: string }[] = []
    if (sys && dia) rows.push({ kind: 'bp', value: `${sys}/${dia}` })
    if (hr) rows.push({ kind: 'heart_rate', value: hr })
    if (sugar) rows.push({ kind: 'blood_sugar', value: sugar })
    if (o2) rows.push({ kind: 'o2', value: o2 })
    if (temp) rows.push({ kind: 'temp', value: temp })
    if (weight) rows.push({ kind: 'weight', value: weight })
    if (pain) rows.push({ kind: 'pain', value: painSite ? `${pain} · ${painSite}` : pain })
    if (mood) rows.push({ kind: 'mood', value: mood })

    if ((sys && !dia) || (!sys && dia)) {
      alert('Blood pressure needs both numbers. Fill in the other one, or clear both.')
      return
    }
    if (rows.length === 0) { setOpen(false); reset(); return }

    const bad = outOfRange()
    if (bad.length > 0 && !confirm(`That looks unusual — ${bad.join(', ')}. Save anyway?`)) return

    setBusy(true)
    await supabase.from('vital_readings').insert(
      rows.map((r) => ({ reading_date: date, ...r, ...stamp(date, time, timeEdited) }))
    )
    setBusy(false)
    toast(`${rows.length} ${rows.length === 1 ? 'reading' : 'readings'} saved ✓`)
    setOpen(false)
    reset()
    onSaved()
  }

  const numProps = { inputMode: 'numeric' as const, pattern: '[0-9]*', type: 'text' as const }
  const box = { width: 78, marginBottom: 0, fontSize: 17, textAlign: 'center' as const }

  return (
    <>
      <button onClick={() => setOpen(true)}>➕ Take vitals</button>

      {open && (
        <div className="modal-back" onClick={() => { setOpen(false); reset() }}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div style={{ fontWeight: 'bold', fontSize: 15, marginBottom: 2 }}>Take vitals</div>
            <div className="muted" style={{ marginBottom: 14 }}>Fill in what you have — skip the rest.</div>

            <label>Blood pressure</label>
            <div className="row" style={{ alignItems: 'center', marginBottom: 12 }}>
              <input {...numProps} style={box} value={sys} placeholder="138"
                onChange={(e) => onSys(e.target.value)} />
              <span style={{ fontSize: 20, color: 'var(--muted)' }}>/</span>
              <input {...numProps} ref={diaRef} style={box} value={dia} placeholder="74"
                onChange={(e) => setDia(digits(e.target.value, 3))} />
            </div>

            <label>Pulse</label>
            <input {...numProps} style={{ ...box, marginBottom: 12 }} value={hr} placeholder="68"
              onChange={(e) => setHr(digits(e.target.value, 3))} />

            <label>Blood sugar</label>
            <input {...numProps} style={{ ...box, marginBottom: 12 }} value={sugar} placeholder="105"
              onChange={(e) => setSugar(digits(e.target.value, 3))} />

            <label>Oxygen %</label>
            <input {...numProps} style={{ ...box, marginBottom: 12 }} value={o2} placeholder="97"
              onChange={(e) => setO2(digits(e.target.value, 3))} />

            <button className="ghost" onClick={() => setMore(!more)} style={{ marginBottom: more ? 12 : 16 }}>
              {more ? '▲ Fewer' : '▼ More — temperature, weight, pain, mood'}
            </button>

            {more && (
              <div style={{ marginBottom: 16 }}>
                <label>Temperature °F</label>
                <input inputMode="decimal" type="text" style={{ ...box, width: 90, marginBottom: 12 }}
                  value={temp} placeholder="98.6" onChange={(e) => setTemp(decimal(e.target.value))} />

                <label>Weight lbs</label>
                <input {...numProps} style={{ ...box, marginBottom: 12 }} value={weight} placeholder="145"
                  onChange={(e) => setWeight(digits(e.target.value, 3))} />

                <label>Pain 0–10</label>
                <div className="chips" style={{ marginBottom: 8 }}>
                  {Array.from({ length: 11 }, (_, i) => String(i)).map((n) => (
                    <button key={n} className={`chip ${pain === n ? 'on' : ''}`}
                      onClick={() => { setPain(pain === n ? null : n); if (pain === n) setPainSite(null) }}>{n}</button>
                  ))}
                </div>
                {pain && pain !== '0' && (
                  <>
                    <label>Where?</label>
                    <div className="chips" style={{ marginBottom: 12 }}>
                      {PAIN_SITES.map((p) => (
                        <button key={p} className={`chip ${painSite === p ? 'on' : ''}`}
                          onClick={() => setPainSite(painSite === p ? null : p)}>{p}</button>
                      ))}
                    </div>
                  </>
                )}

                <label>Mood</label>
                <div className="chips">
                  {MOODS.map((m) => (
                    <button key={m} className={`chip ${mood === m ? 'on' : ''}`}
                      onClick={() => setMood(mood === m ? null : m)}>{m}</button>
                  ))}
                </div>
              </div>
            )}

            <div className="row">
              <button className="grow" onClick={save} disabled={busy}>{busy ? 'Saving…' : 'Save'}</button>
              <button className="secondary" onClick={() => { setOpen(false); reset() }}>Cancel</button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
