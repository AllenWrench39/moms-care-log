import { useEffect, useState } from 'react'
import {
  LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
} from 'recharts'
import { supabase, fmtDateShort, VitalReading, Fluid } from '../supabase'

function daysAgoStr(n: number) {
  const d = new Date()
  d.setDate(d.getDate() - n)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

const FLUID_COLORS = ['#5b9bd5', '#c17b4a', '#6a9e6a', '#9b6ab5', '#d5a03a', '#d5605b', '#6ab5b5', '#888888', '#b5856a']

export default function ChartsPage() {
  const [vitals, setVitals] = useState<VitalReading[]>([])
  const [fluids, setFluids] = useState<Fluid[]>([])

  useEffect(() => {
    supabase.from('vital_readings').select('*')
      .gte('reading_date', daysAgoStr(30)).in('kind', ['bp', 'blood_sugar'])
      .order('reading_date').then(({ data }) => setVitals(data ?? []))
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

  const fluidTypes = [...new Set(fluids.map((f) => f.fluid_type))]
  const fluidDays = [...new Set(fluids.map((f) => f.fluid_date))].sort()
  const fluidData = fluidDays.map((d) => {
    const row: Record<string, string | number> = { date: fmtDateShort(d) }
    fluids.filter((f) => f.fluid_date === d).forEach((f) => {
      row[f.fluid_type] = (Number(row[f.fluid_type]) || 0) + Number(f.oz)
    })
    return row
  })

  const NoData = () => <div className="muted" style={{ padding: '10px 0' }}>Not enough data yet — keep logging daily!</div>

  return (
    <>
      <div className="sec sec-green">
        <div className="sec-title">🩺 Blood Pressure — last 30 days</div>
        {bpData.length < 2 ? <NoData /> : (
          <ResponsiveContainer width="100%" height={190}>
            <LineChart data={bpData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e0ece8" />
              <XAxis dataKey="date" tick={{ fontSize: 9 }} />
              <YAxis domain={[50, 200]} tick={{ fontSize: 9 }} />
              <Tooltip />
              <Legend />
              <Line type="monotone" dataKey="sys" stroke="#d9534f" dot={{ r: 3 }} name="Systolic" connectNulls />
              <Line type="monotone" dataKey="dia" stroke="#5b9bd5" dot={{ r: 3 }} name="Diastolic" connectNulls />
            </LineChart>
          </ResponsiveContainer>
        )}
      </div>

      <div className="sec sec-orange">
        <div className="sec-title">🩸 Blood Sugar — last 30 days</div>
        {bsData.length < 2 ? <NoData /> : (
          <ResponsiveContainer width="100%" height={190}>
            <LineChart data={bsData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f0e4d0" />
              <XAxis dataKey="date" tick={{ fontSize: 9 }} />
              <YAxis domain={[50, 300]} tick={{ fontSize: 9 }} />
              <Tooltip />
              <Line type="monotone" dataKey="bs" stroke="#c17b4a" dot={{ r: 3 }} name="Blood Sugar mg/dL" connectNulls />
            </LineChart>
          </ResponsiveContainer>
        )}
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
