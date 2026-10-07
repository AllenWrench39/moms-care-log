import { useEffect, useState } from 'react'
import {
  LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, ReferenceLine,
} from 'recharts'
import { supabase, fmtDateShort, VitalReading, Fluid, CareEvent } from '../supabase'

function daysAgoStr(n: number) {
  const d = new Date()
  d.setDate(d.getDate() - n)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

// Consistency runs from backed-up to loose; the two ends get distinct hues and
// normal sits in the middle in green, so a drift either way is visible.
const BM_TYPES: { key: string; color: string }[] = [
  { key: 'Hard', color: '#a0662f' },
  { key: 'Normal', color: '#5a9a5a' },
  { key: 'Soft', color: '#9cc79c' },
  { key: 'Loose', color: '#8fb3d9' },
  { key: 'Diarrhea', color: '#4a78b0' },
  { key: 'Watery', color: '#2c4f80' },
]

const FLUID_COLORS = ['#5b9bd5', '#c17b4a', '#6a9e6a', '#9b6ab5', '#d5a03a', '#d5605b', '#6ab5b5', '#888888', '#b5856a']

export default function ChartsPage() {
  const [vitals, setVitals] = useState<VitalReading[]>([])
  const [fluids, setFluids] = useState<Fluid[]>([])
  const [bms, setBms] = useState<CareEvent[]>([])

  useEffect(() => {
    supabase.from('vital_readings').select('*')
      .gte('reading_date', daysAgoStr(30)).in('kind', ['bp', 'blood_sugar'])
      .order('reading_date').then(({ data }) => setVitals(data ?? []))
    supabase.from('care_events').select('*').eq('kind', 'bm')
      .gte('event_date', daysAgoStr(29)).order('event_date')
      .then(({ data }) => setBms(data ?? []))
    supabase.from('fluids').select('*')
      .gte('fluid_date', daysAgoStr(7)).order('fluid_date')
      .then(({ data }) => setFluids(data ?? []))
  }, [])

  // last reading per day per kind
  const lastPerDay = (kind: string) => {
    const map = new Map<string, string>()
    vitals.filter((v) => v.kind === kind).forEach((v) => map.set(v.reading_date, v.value))
    return [...map.entries()].sort()
  }

  const bpData = lastPerDay('bp')
    .map(([d, val]) => {
      const p = val.split(/[/\\-]/)
      return { date: fmtDateShort(d), sys: parseInt(p[0]) || null, dia: parseInt(p[1]) || null }
    })
    .filter((d) => d.sys)

  const bsData = lastPerDay('blood_sugar')
    .map(([d, val]) => ({ date: fmtDateShort(d), bs: parseFloat(val) || null }))
    .filter((d) => d.bs)

  const avg = (nums: number[]) => (nums.length ? Math.round(nums.reduce((a, b) => a + b, 0) / nums.length) : null)
  const avgSys = avg(bpData.map((d) => d.sys as number))
  const avgDia = avg(bpData.filter((d) => d.dia).map((d) => d.dia as number))
  const avgBs = avg(bsData.map((d) => d.bs as number))

  const fluidTypes = [...new Set(fluids.map((f) => f.fluid_type))]
  const fluidDays = [...new Set(fluids.map((f) => f.fluid_date))].sort()
  const fluidData = fluidDays.map((d) => {
    const row: Record<string, string | number> = { date: fmtDateShort(d) }
    fluids.filter((f) => f.fluid_date === d).forEach((f) => {
      row[f.fluid_type] = (Number(row[f.fluid_type]) || 0) + Number(f.oz)
    })
    return row
  })

  // Every one of the last 30 days gets a bar slot, so days with no BM show as
  // gaps rather than being skipped.
  const bmDays = Array.from({ length: 30 }, (_, i) => daysAgoStr(29 - i))
  const bmData = bmDays.map((d) => {
    const row: Record<string, string | number> = { date: fmtDateShort(d) }
    bms.filter((b) => b.event_date === d).forEach((b) => {
      const type = b.detail.split(' · ')[1] ?? 'Normal'
      row[type] = (Number(row[type]) || 0) + 1
    })
    return row
  })
  const bmTotal = bms.length
  const bmAvg = bmTotal / 30
  let longestGap = 0
  let run = 0
  bmDays.forEach((d) => {
    if (bms.some((b) => b.event_date === d)) { run = 0 } else { run += 1; longestGap = Math.max(longestGap, run) }
  })
  const looseCount = bms.filter((b) => /Loose|Diarrhea|Watery/.test(b.detail)).length
  const hardCount = bms.filter((b) => /Hard/.test(b.detail)).length
  const bmTypesPresent = BM_TYPES.filter((t) => bms.some((b) => b.detail.includes(t.key)))

  const NoData = () => <div className="muted" style={{ padding: '10px 0' }}>Not enough data yet — keep logging daily!</div>

  return (
    <>
      <div className="sec sec-green">
        <div className="sec-title">🩺 Blood Pressure — last 30 days</div>
        {avgSys != null && (
          <div className="muted" style={{ fontSize: 12, marginBottom: 4 }}>
            30-day avg: <b>{avgSys}{avgDia != null ? `/${avgDia}` : ''}</b>
          </div>
        )}
        {bpData.length < 2 ? <NoData /> : (
          <ResponsiveContainer width="100%" height={190}>
            <LineChart data={bpData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e0ece8" />
              <XAxis dataKey="date" tick={{ fontSize: 9 }} />
              <YAxis domain={[50, 200]} tick={{ fontSize: 9 }} />
              <Tooltip />
              <Legend />
              {avgSys != null && <ReferenceLine y={avgSys} stroke="#d9534f" strokeDasharray="4 4" strokeOpacity={0.6} />}
              {avgDia != null && <ReferenceLine y={avgDia} stroke="#5b9bd5" strokeDasharray="4 4" strokeOpacity={0.6} />}
              <Line type="monotone" dataKey="sys" stroke="#d9534f" dot={{ r: 3 }} name="Systolic" connectNulls />
              <Line type="monotone" dataKey="dia" stroke="#5b9bd5" dot={{ r: 3 }} name="Diastolic" connectNulls />
            </LineChart>
          </ResponsiveContainer>
        )}
      </div>

      <div className="sec sec-orange">
        <div className="sec-title">🩸 Blood Sugar — last 30 days</div>
        {avgBs != null && (
          <div className="muted" style={{ fontSize: 12, marginBottom: 4 }}>
            30-day avg: <b>{avgBs} mg/dL</b>
          </div>
        )}
        {bsData.length < 2 ? <NoData /> : (
          <ResponsiveContainer width="100%" height={190}>
            <LineChart data={bsData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f0e4d0" />
              <XAxis dataKey="date" tick={{ fontSize: 9 }} />
              <YAxis domain={[50, 300]} tick={{ fontSize: 9 }} />
              <Tooltip />
              {avgBs != null && <ReferenceLine y={avgBs} stroke="#c17b4a" strokeDasharray="4 4" strokeOpacity={0.6} />}
              <Line type="monotone" dataKey="bs" stroke="#c17b4a" dot={{ r: 3 }} name="Blood Sugar mg/dL" connectNulls />
            </LineChart>
          </ResponsiveContainer>
        )}
      </div>

      <div className="sec sec-orange">
        <div className="sec-title">💩 Bowel Movements — last 30 days</div>
        {bmTotal > 0 && (
          <div style={{ fontSize: 13, color: 'var(--ink)', marginBottom: 6, lineHeight: 1.6 }}>
            <b>{bmAvg.toFixed(1)}</b> a day on average ({bmTotal} total)
            {' · '}longest gap <b style={{ color: longestGap >= 3 ? 'var(--red)' : undefined }}>
              {longestGap} {longestGap === 1 ? 'day' : 'days'}</b>
            {(looseCount > 0 || hardCount > 0) && (
              <> · {looseCount > 0 && <><b>{looseCount}</b> loose</>}
                {looseCount > 0 && hardCount > 0 && ', '}
                {hardCount > 0 && <><b>{hardCount}</b> hard</>}</>
            )}
          </div>
        )}
        {bmTotal === 0 ? <NoData /> : (
          <ResponsiveContainer width="100%" height={210}>
            <BarChart data={bmData} barCategoryGap={2}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f0e4d0" vertical={false} />
              <XAxis dataKey="date" tick={{ fontSize: 9 }} interval={4} />
              <YAxis allowDecimals={false} tick={{ fontSize: 9 }} width={22} />
              <Tooltip />
              <Legend wrapperStyle={{ fontSize: 11 }} />
              <ReferenceLine y={bmAvg} stroke="#7a6a5a" strokeDasharray="4 4" strokeOpacity={0.7} />
              {bmTypesPresent.map((t, i) => (
                <Bar key={t.key} dataKey={t.key} stackId="bm" fill={t.color}
                  radius={i === bmTypesPresent.length - 1 ? [3, 3, 0, 0] : 0} />
              ))}
            </BarChart>
          </ResponsiveContainer>
        )}
        <div className="muted" style={{ marginTop: 4 }}>
          Empty days are gaps — 3 or more in a row is worth watching for constipation.
        </div>
      </div>

      <div className="sec sec-blue">
        <div className="sec-title">💧 Fluids by Type — last 7 days</div>
        {fluidTypes.length === 0 ? <NoData /> : (
          <ResponsiveContainer width="100%" height={210}>
            <BarChart data={fluidData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#d0e0f0" />
              <XAxis dataKey="date" tick={{ fontSize: 9 }} />
              <YAxis tick={{ fontSize: 9 }} />
              <Tooltip />
              <Legend />
              {fluidTypes.map((t, i) => (
                <Bar key={t} dataKey={t} stackId="a" fill={FLUID_COLORS[i % FLUID_COLORS.length]} />
              ))}
            </BarChart>
          </ResponsiveContainer>
        )}
      </div>
    </>
  )
}
