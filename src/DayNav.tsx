import { todayStr } from './supabase'

export function shiftDay(dateStr: string, delta: number) {
  const d = new Date(dateStr + 'T12:00:00')
  d.setDate(d.getDate() + delta)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

// Prev/next day arrows + date input, capped at today. Used to backfill
// missed logs for earlier days. When `time`/`onTimeChange` are given, a time
// picker appears on past days so backfilled entries get the right clock time.
export default function DayNav({ date, onChange, time, onTimeChange }: {
  date: string
  onChange: (d: string) => void
  time?: string
  onTimeChange?: (t: string) => void
}) {
  const today = todayStr()
  const isToday = date === today
  return (
    <div style={{ marginBottom: 8 }}>
      <div className="row" style={{ alignItems: 'center' }}>
        <button className="secondary" style={{ padding: '6px 11px', flexShrink: 0 }} onClick={() => onChange(shiftDay(date, -1))}>◀</button>
        <input
          type="date" value={date} max={today} style={{ marginBottom: 0 }}
          onChange={(e) => { const v = e.target.value; if (v && v <= today) onChange(v) }}
        />
        <button className="secondary" style={{ padding: '6px 11px', flexShrink: 0 }} disabled={isToday} onClick={() => onChange(shiftDay(date, 1))}>▶</button>
        {!isToday && (
          <button className="secondary" style={{ padding: '6px 11px', flexShrink: 0 }} onClick={() => onChange(today)}>Today</button>
        )}
      </div>
      {!isToday && onTimeChange && (
        <div className="row" style={{ alignItems: 'center', marginTop: 6 }}>
          <span className="muted" style={{ flexShrink: 0 }}>Time it happened</span>
          <input type="time" value={time ?? ''} style={{ marginBottom: 0, width: 130 }}
            onChange={(e) => onTimeChange(e.target.value)} />
        </div>
      )}
    </div>
  )
}
