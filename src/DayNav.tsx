import { todayStr } from './supabase'

export function shiftDay(dateStr: string, delta: number) {
  const d = new Date(dateStr + 'T12:00:00')
  d.setDate(d.getDate() + delta)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

// Prev/next day arrows + date input, capped at today. Used to backfill missed
// logs. When `time`/`onTimeChange` are given, a time picker sits under it — on
// past days it always applies; on today it applies once the time is changed by
// hand, so a 12:43am trip can be logged hours later at the right time.
export default function DayNav({ date, onChange, time, onTimeChange, timeEdited, onResetTime }: {
  date: string
  onChange: (d: string) => void
  time?: string
  onTimeChange?: (t: string) => void
  timeEdited?: boolean
  onResetTime?: () => void
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
      {onTimeChange && (
        <div className="row" style={{ alignItems: 'center', marginTop: 6 }}>
          <span className="muted" style={{ flexShrink: 0 }}>Time it happened</span>
          <input type="time" value={time ?? ''} style={{ marginBottom: 0, width: 130 }}
            onChange={(e) => onTimeChange(e.target.value)} />
          {isToday && timeEdited && onResetTime && (
            <button className="secondary" style={{ padding: '6px 11px', flexShrink: 0 }} onClick={onResetTime}>Now</button>
          )}
        </div>
      )}
      {isToday && onTimeChange && (
        <div className="faint" style={{ marginTop: 3 }}>
          {timeEdited
            ? '⏱ Logging at the time above, not the current time. Tap Now to go back.'
            : 'Logs at the current time. Change this to log something from earlier today.'}
        </div>
      )}
    </div>
  )
}
