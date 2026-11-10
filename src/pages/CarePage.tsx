import { useEffect, useState } from 'react'
import { confirmDialog } from '../confirm'
import { supabase, todayStr, fmtClock, fmtDateFull, stamp, nowHHMM, CareEvent } from '../supabase'
import { useToast } from '../toast'
import DayNav, { shiftDay } from '../DayNav'
import UtiWatch, { URINE_FLAGS } from '../UtiWatch'

const BM_SIZES = ['Small', 'Medium', 'Large']
const BM_TYPES = ['Normal', 'Soft', 'Loose', 'Diarrhea', 'Hard', 'Watery']
const URINE_COLORS = ['Clear', 'Pale Yellow', 'Dark Yellow', 'Amber', 'Orange', 'Pink/Red', 'Brown']
// Accidents are split awake vs asleep because nearly all of hers happen while
// she is asleep — she makes it to the bathroom during the day — and the two
// mean different things to a doctor.
const URINE_SYMPTOMS = [
  'Accident while sleeping', 'Accident while awake',
  'Burning', 'Urgency', 'Frequency', 'Straining', 'Only a little came out',
  'Holding it / could not go', 'Pain when going', 'Back pain',
  'Leaning left/right too heavily',
]
const PAD_TYPES = ['Bed/Chair Pad', 'Pamper Pad']
const DAMPNESS = ['Dry', 'Damp', 'Wet', 'Soaked']
// Pamper pads can also catch a BM, so that pad gets an extra choice. A smear
// left from wiping is its own choice so it isn't counted as a BM accident.
const PAMPER_EXTRA = ['Poop', 'Wet + Poop']
const PAMPER_SMEAR = 'Smear (from wiping)'
// She usually sleeps in her chair, so only nights in bed get logged.
const HYGIENE_ITEMS = ['Bed Bath', 'Shower', 'Hair Wash', 'Nail Care', 'Oral Care', 'Skin Care', 'Pad Change', 'Repositioned', 'Slept in Bed', 'Foot Rub']
// Foot rubs ask how long, saved as e.g. "Foot Rub · 5 min".
const FOOT_RUB = 'Foot Rub'
const FOOT_RUB_MINUTES = [1, 3, 5, 10]
const CLEANING_ITEMS = ['Bed Linens', 'Room Clean', 'Bathroom', 'Laundry', 'Trash', 'Floor Mop', 'Dishes', 'Supply Restock']
// "Bathroom" covered anything from a sink wipe to a full clean, so the log could
// not say whether the floor had been mopped. Tapping it now asks what was done.
const BATHROOM_PARTS = ['Toilet', 'Sink', 'Shower', 'Floor mopped', 'Shelves', 'Mirror', 'Trash', 'Other']

export default function CarePage({ nameOf }: { nameOf: (e: string) => string }) {
  const today = todayStr()
  const toast = useToast()
  const [date, setDate] = useState(todayStr())
  const [time, setTimeRaw] = useState(nowHHMM())
  const [timeEdited, setTimeEdited] = useState(false)
  const setTime = (t: string) => { setTimeRaw(t); setTimeEdited(true) }
  const resetTime = () => { setTimeRaw(nowHHMM()); setTimeEdited(false) }
  const isToday = date === today
  const [events, setEvents] = useState<CareEvent[]>([])
  const [bmWeek, setBmWeek] = useState(0)
  const [urineFlags, setUrineFlags] = useState<string[]>([])
  const [padTarget, setPadTarget] = useState<string | null>(null)
  const [bathParts, setBathParts] = useState<string[] | null>(null)
  const [bmSize, setBmSize] = useState('Medium')
  const [bmType, setBmType] = useState('Normal')
  const [footRub, setFootRub] = useState(false)

  async function load() {
    const [e, bm] = await Promise.all([
      supabase.from('care_events').select('*').eq('event_date', date).order('created_at'),
      // Rolling 7 days ending on the day being viewed, this day included.
      supabase.from('care_events').select('id', { count: 'exact', head: true })
        .eq('kind', 'bm').gte('event_date', shiftDay(date, -6)).lte('event_date', date),
    ])
    setEvents(e.data ?? [])
    setBmWeek(bm.count ?? 0)
  }

  useEffect(() => {
    load()
    const ch = supabase
      .channel('care')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'care_events' }, load)
      .subscribe()
    return () => { supabase.removeChannel(ch) }
  }, [date])

  async function addEvent(kind: CareEvent['kind'], detail: string, msg: string) {
    await supabase.from('care_events').insert({ event_date: date, kind, detail, ...stamp(date, time, timeEdited) })
    toast.show(msg)
    load()
  }

  // Color plus whatever character flags are toggled, e.g. "Amber · Cloudy · Strong odor"
  async function logUrine(color: string) {
    await addEvent('urine', [color, ...urineFlags].join(' · '), 'Urine logged ✓')
    setUrineFlags([])
  }

  function toggleFlag(f: string) {
    setUrineFlags(urineFlags.includes(f) ? urineFlags.filter((x) => x !== f) : [...urineFlags, f])
  }

  async function logBathroom() {
    if (!bathParts || bathParts.length === 0) return
    await addEvent('cleaning', `Bathroom · ${bathParts.join(', ')}`, 'Bathroom logged ✓')
    setBathParts(null)
  }

  async function logPad(damp: string) {
    if (!padTarget) return
    await addEvent('pad', `${padTarget} · ${damp}`, `${padTarget} — ${damp} ✓`)
    setPadTarget(null)
  }

  async function del(table: string, id: string) {
    if (!(await confirmDialog('Remove this?'))) return
    await supabase.from(table).delete().eq('id', id)
    load()
  }

  async function logFootRub(minutes: number) {
    await addEvent('hygiene', `${FOOT_RUB} · ${minutes} min`, `Foot rub ${minutes} min ✓`)
    setFootRub(false)
  }

  const byKind = (kind: string) => events.filter((e) => e.kind === kind)

  const EventList = ({ kind }: { kind: string }) => (
    <>
      {byKind(kind).map((e) => (
        <div className="feed-item" key={e.id}>
          <span>{e.detail} <span className="faint">{fmtClock(e.created_at)} · {nameOf(e.created_by)}</span></span>
          <button className="danger" aria-label="Remove" onClick={() => del('care_events', e.id)}>✕</button>
        </div>
      ))}
    </>
  )

  return (
    <>
      <DayNav date={date} onChange={setDate} time={time} onTimeChange={setTime}
        timeEdited={timeEdited} onResetTime={resetTime} />
      {!isToday && (
        <div className="warn">⏪ Logging for <b>{fmtDateFull(date)}</b> — not today. Everything on this tab is saved to that day.</div>
      )}

      <UtiWatch date={date} />

      <div className="sec sec-orange">
        <div className="sec-title">
          💩 Bowel Movement — {bmWeek} in the last 7 days · {(bmWeek / 7).toFixed(1)}/day
        </div>
        <div className="faint" style={{ marginBottom: 8 }}>
          {byKind('bm').length} {isToday ? 'today' : 'this day'} · {shiftDay(date, -6).slice(5)} to {date.slice(5)}
          {bmWeek > 0 && ` · about 1 every ${(7 / bmWeek).toFixed(1)} days`}
        </div>
        <label>Size</label>
        <div className="chips" style={{ marginBottom: 8 }}>
          {BM_SIZES.map((s) => <button key={s} className={`chip ${bmSize === s ? 'on' : ''}`} onClick={() => setBmSize(s)}>{s}</button>)}
        </div>
        <label>Consistency</label>
        <div className="chips" style={{ marginBottom: 10 }}>
          {BM_TYPES.map((t) => <button key={t} className={`chip ${bmType === t ? 'on' : ''}`} onClick={() => setBmType(t)}>{t}</button>)}
        </div>
        <button onClick={() => addEvent('bm', `${bmSize} · ${bmType}`, 'BM logged ✓')}>Log BM</button>
        <EventList kind="bm" />
      </div>

      <div className="sec sec-yellow">
        <div className="sec-title">💛 Urine — {byKind('urine').length} {byKind('urine').length === 1 ? 'time' : 'times'}</div>
        <label>Anything unusual? (tap any that apply, then pick the color)</label>
        <div className="chips" style={{ marginBottom: 10 }}>
          {URINE_FLAGS.map((f) => (
            <button key={f} className={`chip ${urineFlags.includes(f) ? 'on' : ''}`} onClick={() => toggleFlag(f)}>{f}</button>
          ))}
        </div>
        <label>Color — tap to log</label>
        <div className="chips">
          {URINE_COLORS.map((c) => (
            <button key={c} className="chip" onClick={() => logUrine(c)}>{c}</button>
          ))}
        </div>
        <EventList kind="urine" />
      </div>

      <div className="sec sec-red">
        <div className="sec-title">🚽 Urinary Symptoms</div>
        <div className="muted" style={{ marginBottom: 8 }}>Tap anything she has trouble with — these are the early UTI signs.</div>
        <div className="chips">
          {URINE_SYMPTOMS.map((u) => (
            <button key={u} className="chip" onClick={() => addEvent('urine_symptom', u, u + ' logged ✓')}>{u}</button>
          ))}
        </div>
        <EventList kind="urine_symptom" />
      </div>

      <div className="sec sec-blue">
        <div className="sec-title">🛏 Pad Changes</div>
        <div className="muted" style={{ marginBottom: 8 }}>Pick which pad, then how wet it was.</div>
        <div className="chips">
          {PAD_TYPES.map((t) => (
            <button key={t} className="chip" onClick={() => setPadTarget(t)}>{t}</button>
          ))}
        </div>
        <EventList kind="pad" />
      </div>

      <div className="sec sec-blue">
        <div className="sec-title">🛁 Hygiene</div>
        <div className="muted" style={{ marginBottom: 8 }}>Tap to log each task done.</div>
        <div className="chips">
          {HYGIENE_ITEMS.map((h) => (
            <button key={h}
              className={`chip ${byKind('hygiene').some((e) => e.detail === h || e.detail.startsWith(h + ' ·')) ? 'on-blue' : ''}`}
              onClick={() => h === FOOT_RUB ? setFootRub(true) : addEvent('hygiene', h, h + ' ✓')}>
              {h}{h === FOOT_RUB ? ' …' : ''}
            </button>
          ))}
        </div>
        <EventList kind="hygiene" />
      </div>

      <div className="sec sec-gray">
        <div className="sec-title">🧹 Cleaning</div>
        <div className="chips">
          {CLEANING_ITEMS.map((c) => (
            <button key={c}
              className={`chip ${byKind('cleaning').some((e) => e.detail === c || e.detail.startsWith(c + ' ·')) ? 'on' : ''}`}
              onClick={() => c === 'Bathroom' ? setBathParts([]) : addEvent('cleaning', c, c + ' ✓')}>
              {c}{c === 'Bathroom' ? ' …' : ''}
            </button>
          ))}
        </div>
        <EventList kind="cleaning" />
      </div>

      {footRub && (
        <div className="modal-back" onClick={() => setFootRub(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div style={{ fontWeight: 'bold', fontSize: 18, marginBottom: 4 }}>Foot rub</div>
            <div className="muted" style={{ marginBottom: 12 }}>How long?</div>
            <div className="chips" style={{ marginBottom: 14 }}>
              {FOOT_RUB_MINUTES.map((m) => (
                <button key={m} className="chip" onClick={() => logFootRub(m)}>{m} min</button>
              ))}
            </div>
            <button className="secondary" style={{ width: '100%' }} onClick={() => setFootRub(false)}>Cancel</button>
          </div>
        </div>
      )}

      {bathParts && (
        <div className="modal-back" onClick={() => setBathParts(null)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div style={{ fontWeight: 'bold', fontSize: 15, marginBottom: 2 }}>Bathroom</div>
            <div className="muted" style={{ marginBottom: 12 }}>What got cleaned? Tap all that apply.</div>
            <div className="chips" style={{ marginBottom: 16 }}>
              {BATHROOM_PARTS.map((b) => (
                <button key={b} className={`chip ${bathParts.includes(b) ? 'on' : ''}`}
                  onClick={() => setBathParts(bathParts.includes(b)
                    ? bathParts.filter((x) => x !== b)
                    : [...bathParts, b])}>{b}</button>
              ))}
            </div>
            <div className="row">
              <button className="grow" onClick={logBathroom} disabled={bathParts.length === 0}>
                {bathParts.length === 0 ? 'Pick what was cleaned' : `Save ${bathParts.length}`}
              </button>
              <button className="secondary" onClick={() => setBathParts(null)}>Cancel</button>
            </div>
          </div>
        </div>
      )}

      {padTarget && (
        <div className="modal-back" onClick={() => setPadTarget(null)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div style={{ fontWeight: 'bold', fontSize: 15, marginBottom: 4 }}>{padTarget}</div>
            <div className="muted" style={{ marginBottom: 12 }}>How wet was it?</div>
            <div className="chips" style={{ marginBottom: 14 }}>
              {DAMPNESS.map((d) => (
                <button key={d} className="chip" onClick={() => logPad(d)}>{d}</button>
              ))}
              {padTarget === 'Pamper Pad' && PAMPER_EXTRA.map((d) => (
                <button key={d} className="chip" onClick={() => logPad(d)}>💩 {d}</button>
              ))}
              {padTarget === 'Pamper Pad' && (
                <button className="chip" onClick={() => logPad(PAMPER_SMEAR)}>🧻 {PAMPER_SMEAR}</button>
              )}
            </div>
            <button className="secondary" style={{ width: '100%' }} onClick={() => setPadTarget(null)}>Cancel</button>
          </div>
        </div>
      )}

      {toast.node}
    </>
  )
}
