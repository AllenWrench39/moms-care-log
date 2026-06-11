import { useState } from 'react'
import { supabase } from './supabase'

export default function Login() {
  const [email, setEmail] = useState('')
  const [sent, setSent] = useState(false)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  async function sendLink(e: React.FormEvent) {
    e.preventDefault()
    setBusy(true)
    setError('')
    const { error } = await supabase.auth.signInWithOtp({
      email: email.trim().toLowerCase(),
      options: { emailRedirectTo: window.location.origin },
    })
    setBusy(false)
    if (error) setError(error.message)
    else setSent(true)
  }

  return (
    <div className="login-wrap">
      <div className="card login-card">
        <h2 className="center">💜 Mom's Care Log</h2>
        {sent ? (
          <p className="success center">
            Check your email! We sent a sign-in link to <b>{email}</b>. Open it on this phone.
          </p>
        ) : (
          <form onSubmit={sendLink}>
            <p className="muted center">Enter your email and we'll send you a sign-in link. No password needed.</p>
            <input
              type="email"
              required
              placeholder="you@example.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              autoComplete="email"
            />
            <button type="submit" disabled={busy} style={{ width: '100%' }}>
              {busy ? 'Sending…' : 'Send sign-in link'}
            </button>
            {error && <p className="error">{error}</p>}
          </form>
        )}
      </div>
    </div>
  )
}
