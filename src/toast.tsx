import { useRef, useState } from 'react'
import { writeFailedRecently } from './supabase'

// Pages call show('… ✓') right after a save. If that save actually failed,
// the message is swapped for a clear "not saved" warning instead.
export function useToast() {
  const [msg, setMsg] = useState('')
  const [bad, setBad] = useState(false)
  const timer = useRef<ReturnType<typeof setTimeout>>()
  function show(m: string) {
    const failed = writeFailedRecently()
    setBad(failed)
    setMsg(failed ? 'Not saved — check signal and try again' : m)
    clearTimeout(timer.current)
    timer.current = setTimeout(() => setMsg(''), failed ? 5000 : 2200)
  }
  const node = msg ? <div className={`toast ${bad ? 'toast-bad' : ''}`} role="status">{msg}</div> : null
  return { show, node }
}
