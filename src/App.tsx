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
import PickupsPage from './pages/PickupsPage'
import TasksPage from './pages/TasksPage'
import ExportPage from './pages/ExportPage'
import { ConfirmHost } from './confirm'

type Tab = 'today' | 'meds' | 'care' | 'charts' | 'history' | 'notes' | 'appts' | 'pickups' | 'tasks' | 'export'

const TABS: { id: Tab; label: string; icon: string }[] = [
  { id: 'today', label: 'Today', icon: '📋' },
  { id: 'meds', label: 'Meds', icon: '💊' },
  { id: 'care', label: 'Care', icon: '🛁' },
  { id: 'appts', label: 'Appts', icon: '🗓' },
  { id: 'charts', label: 'Charts', icon: '📈' },
  { id: 'history', label: 'History', icon: '📅' },
  { id: 'notes', label: 'Notes', icon: '📌' },
  { id: 'pickups', label: 'Pickups', icon: '🚗' },
  { id: 'tasks', label: 'Tasks', icon: '✅' },
  { id: 'export', label: 'Export', icon: '📤' },
]

// Always one tap away in the bottom bar; everything else lives under More.
const PRIMARY_TABS: Tab[] = ['today', 'meds', 'care', 'appts']

// Tabs visible in read-only "doctor mode"
const DOCTOR_TABS: Tab[] = ['charts', 'history', 'notes', 'export']

export default function App() {
  const [session, setSession] = useState<Session | null>(null)
  const [loading, setLoading] = useState(true)
  const [tab, setTab] = useState<Tab>('today')
  const [family, setFamily] = useState<FamilyMember[]>([])
  const [allowed, setAllowed] = useState<boolean | null>(null)
  const [doctorMode, setDoctorMode] = useState(false)
  const [moreOpen, setMoreOpen] = useState(false)
  const [online, setOnline] = useState(navigator.onLine)
  const [saveFailed, setSaveFailed] = useState(false)

  useEffect(() => {
    const on = () => setOnline(true)
    const off = () => setOnline(false)
    const failed = () => setSaveFailed(true)
    window.addEventListener('online', on)
    window.addEventListener('offline', off)
    window.addEventListener('save-failed', failed)
    return () => {
      window.removeEventListener('online', on)
      window.removeEventListener('offline', off)
      window.removeEventListener('save-failed', failed)
    }
  }, [])

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

  const activeTab = doctorMode && !DOCTOR_TABS.includes(tab) ? 'charts' : tab
  const barTabs = TABS.filter((t) => (doctorMode ? DOCTOR_TABS : PRIMARY_TABS).includes(t.id))
  const moreTabs = TABS.filter((t) => !PRIMARY_TABS.includes(t.id))
  const go = (t: Tab) => { setTab(t); setMoreOpen(false); window.scrollTo(0, 0) }

  return (
    <div className={doctorMode ? 'doctor' : ''}>
      <header className="topbar">
        <div>
          <div className="title">{doctorMode ? 'Mom’s Care Log — View only' : 'Mom’s Care Log'}</div>
          <div className="subtitle">
            {doctorMode ? 'Read-only · no editing' : `${fmtToday()} · ${me?.display_name ?? myEmail}`}
          </div>
        </div>
        {doctorMode && (
          <button className="topbtn" onClick={() => setDoctorMode(false)}>Back to logging</button>
        )}
      </header>

      {!online && (
        <div className="banner banner-offline" role="status">
          <span>No connection — new entries won’t save until you’re back online.</span>
        </div>
      )}
      {saveFailed && (
        <div className="banner banner-bad" role="alert">
          <span>Something didn’t save. Check it and enter it again.</span>
          <button onClick={() => setSaveFailed(false)}>OK</button>
        </div>
      )}

      <main className="app">
        {activeTab === 'today' && <TodayPage nameOf={nameOf} myEmail={myEmail} onOpenMeds={() => go('meds')} />}
        {activeTab === 'meds' && <MedsPage nameOf={nameOf} />}
        {activeTab === 'care' && <CarePage nameOf={nameOf} />}
        {activeTab === 'charts' && <ChartsPage />}
        {activeTab === 'history' && <HistoryPage nameOf={nameOf} />}
        {activeTab === 'notes' && <NotesPage nameOf={nameOf} readOnly={doctorMode} />}
        {activeTab === 'appts' && <CalendarPage family={family} nameOf={nameOf} />}
        {activeTab === 'pickups' && <PickupsPage family={family} myEmail={myEmail} nameOf={nameOf} />}
        {activeTab === 'tasks' && <TasksPage family={family} nameOf={nameOf} />}
        {activeTab === 'export' && <ExportPage />}
      </main>

      <nav className="bottomnav" aria-label="Main">
        {barTabs.map((t) => (
          <button key={t.id} className={activeTab === t.id ? 'active' : ''}
            aria-current={activeTab === t.id ? 'page' : undefined} onClick={() => go(t.id)}>
            <span className="nav-ico" aria-hidden="true">{t.icon}</span>{t.label}
          </button>
        ))}
        {!doctorMode && (
          <button className={!PRIMARY_TABS.includes(activeTab) ? 'active' : ''}
            aria-haspopup="dialog" onClick={() => setMoreOpen(true)}>
            <span className="nav-ico" aria-hidden="true">☰</span>More
          </button>
        )}
      </nav>

      {moreOpen && (
        <div className="sheet-back" onClick={() => setMoreOpen(false)}>
          <div className="sheet" role="dialog" aria-label="More" onClick={(e) => e.stopPropagation()}>
            <div className="sheet-grip" />
            <div className="sheet-grid">
              {moreTabs.map((t) => (
                <button key={t.id} className={activeTab === t.id ? 'active' : ''} onClick={() => go(t.id)}>
                  <span className="nav-ico" aria-hidden="true">{t.icon}</span>{t.label}
                </button>
              ))}
            </div>
            <div className="sheet-list">
              <button className="secondary" onClick={() => { setDoctorMode(true); setMoreOpen(false) }}>
                👁 View-only mode (for doctors)
              </button>
              <button className="secondary" onClick={() => supabase.auth.signOut()}>Sign out</button>
            </div>
          </div>
        </div>
      )}

      <ConfirmHost />
    </div>
  )
}

function fmtToday() {
  return new Date().toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric' })
}
