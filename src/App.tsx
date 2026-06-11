import { useEffect, useState } from 'react'
import type { Session } from '@supabase/supabase-js'
import { supabase, FamilyMember } from './supabase'
import Login from './Login'
import LogPage from './pages/LogPage'
import MedsPage from './pages/MedsPage'
import CalendarPage from './pages/CalendarPage'
import TasksPage from './pages/TasksPage'

type Tab = 'log' | 'meds' | 'calendar' | 'tasks'

const TABS: { id: Tab; label: string; icon: string }[] = [
  { id: 'log', label: 'Log', icon: '📝' },
  { id: 'meds', label: 'Meds', icon: '💊' },
  { id: 'calendar', label: 'Appts', icon: '📅' },
  { id: 'tasks', label: 'Tasks', icon: '✅' },
]

export default function App() {
  const [session, setSession] = useState<Session | null>(null)
  const [loading, setLoading] = useState(true)
  const [tab, setTab] = useState<Tab>('log')
  const [family, setFamily] = useState<FamilyMember[]>([])
  const [allowed, setAllowed] = useState<boolean | null>(null)

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
  const nameOf = (email: string | null | undefined) =>
    family.find((f) => f.email === email?.toLowerCase())?.display_name ?? email ?? ''

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

  return (
    <div className="app">
      <header className="app-header">
        <h1>Mom's Care Log</h1>
        <div className="row">
          <span className="who">{me?.display_name ?? myEmail}</span>
          <button className="ghost" onClick={() => supabase.auth.signOut()}>Sign out</button>
        </div>
      </header>

      {tab === 'log' && <LogPage nameOf={nameOf} myEmail={myEmail} />}
      {tab === 'meds' && <MedsPage nameOf={nameOf} />}
      {tab === 'calendar' && <CalendarPage family={family} nameOf={nameOf} />}
      {tab === 'tasks' && <TasksPage family={family} nameOf={nameOf} />}

      <nav className="tabbar">
        {TABS.map((t) => (
          <button key={t.id} className={tab === t.id ? 'active' : ''} onClick={() => setTab(t.id)}>
            <span className="icon">{t.icon}</span>
            {t.label}
          </button>
        ))}
      </nav>
    </div>
  )
}
