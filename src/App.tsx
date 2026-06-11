import { useEffect, useState } from 'react'
import type { Session } from '@supabase/supabase-js'
import { supabase, FamilyMember } from './supabase'
import Login from './Login'
import TodayPage from './pages/TodayPage'
import MedsPage from './pages/MedsPage'
import CarePage from './pages/CarePage'
import ChartsPage from './pages/ChartsPage'
import HistoryPage from './pages/HistoryPage'
import NotesPage from './pages/NotesPage'
import CalendarPage from './pages/CalendarPage'
import TasksPage from './pages/TasksPage'
import ExportPage from './pages/ExportPage'

type Tab = 'today' | 'meds' | 'care' | 'charts' | 'history' | 'notes' | 'appts' | 'tasks' | 'export'

const TABS: { id: Tab; label: string }[] = [
  { id: 'today', label: '📋 Today' },
  { id: 'meds', label: '💊 Meds' },
  { id: 'care', label: '🛁 Care' },
  { id: 'charts', label: '📈 Charts' },
  { id: 'history', label: '📅 History' },
  { id: 'notes', label: '📌 Notes' },
  { id: 'appts', label: '🗓 Appts' },
  { id: 'tasks', label: '✅ Tasks' },
  { id: 'export', label: '📤 Export' },
]

// Tabs visible in read-only "doctor mode"
const DOCTOR_TABS: Tab[] = ['charts', 'history', 'notes', 'export']

export default function App() {
  const [session, setSession] = useState<Session | null>(null)
  const [loading, setLoading] = useState(true)
  const [tab, setTab] = useState<Tab>('today')
  const [family, setFamily] = useState<FamilyMember[]>([])
  const [allowed, setAllowed] = useState<boolean | null>(null)
  const [doctorMode, setDoctorMode] = useState(false)

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session)
      setLoading(false)
    })
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => setSession(s))
    return () => sub.subscription.unsubscribe()
  }, [])

  useEffect(() => {
    if (!session) {
      setFamily([])
      setAllowed(null)
      return
    }
    supabase
      .from('family_members')
      .select('*')
      .then(({ data }) => {
        setFamily(data ?? [])
        // RLS hides all rows from non-family users, so an empty list means
        // this email isn't on the allowlist.
        setAllowed((data ?? []).length > 0)
      })
  }, [session])

  if (loading) return null
  if (!session) return <Login />

  const myEmail = session.user.email?.toLowerCase() ?? ''
  const me = family.find((f) => f.email === myEmail)
  const nameOf = (email: string | null | undefined) => {
    if (!email) return ''
    if (email === 'setup') return 'Setup'
    return family.find((f) => f.email === email.toLowerCase())?.display_name ?? email
  }

  if (allowed === false) {
    return (
      <div className="login-wrap">
        <div className="card login-card center">
          <h2>Not on the family list</h2>
          <p className="muted">
            You signed in as <b>{myEmail}</b>, but that email isn't on the family list.
            Ask whoever set this up to add you.
          </p>
          <button className="secondary" onClick={() => supabase.auth.signOut()}>Sign out</button>
        </div>
      </div>
    )
  }
  if (allowed === null) return null

  const visibleTabs = doctorMode ? TABS.filter((t) => DOCTOR_TABS.includes(t.id)) : TABS
  const activeTab = doctorMode && !DOCTOR_TABS.includes(tab) ? 'charts' : tab

  return (
    <div className={doctorMode ? 'doctor' : ''}>
      <header className="topbar">
        <div>
          <div className="title">{doctorMode ? '👁 Mom’s Care Log — View Only' : '🌸 Mom’s Care Log'}</div>
          <div className="subtitle">
            {doctorMode ? 'Read-only · no editing' : `${fmtToday()} · ${me?.display_name ?? myEmail}`}
          </div>
        </div>
        <div className="row">
          <button className="topbtn" onClick={() => setDoctorMode(!doctorMode)}>
            {doctorMode ? '✏️ Log Mode' : '👁 View'}
          </button>
          {!doctorMode && (
            <button className="topbtn" onClick={() => supabase.auth.signOut()}>Sign out</button>
          )}
        </div>
      </header>

      <nav className="tabstrip">
        {visibleTabs.map((t) => (
          <button key={t.id} className={activeTab === t.id ? 'active' : ''} onClick={() => setTab(t.id)}>
            {t.label}
          </button>
        ))}
      </nav>

      <main className="app">
        {activeTab === 'today' && <TodayPage nameOf={nameOf} myEmail={myEmail} />}
        {activeTab === 'meds' && <MedsPage nameOf={nameOf} />}
        {activeTab === 'care' && <CarePage nameOf={nameOf} />}
        {activeTab === 'charts' && <ChartsPage />}
        {activeTab === 'history' && <HistoryPage nameOf={nameOf} />}
        {activeTab === 'notes' && <NotesPage nameOf={nameOf} readOnly={doctorMode} />}
        {activeTab === 'appts' && <CalendarPage family={family} nameOf={nameOf} />}
        {activeTab === 'tasks' && <TasksPage family={family} nameOf={nameOf} />}
        {activeTab === 'export' && <ExportPage />}
      </main>
    </div>
  )
}

function fmtToday() {
  return new Date().toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric' })
}
