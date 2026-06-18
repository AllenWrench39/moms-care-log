import { useRef, useState } from 'react'

export function useToast() {
  const [msg, setMsg] = useState('')
  const timer = useRef<ReturnType<typeof setTimeout>>()
  function show(m: string) {
    setMsg(m)
    clearTimeout(timer.current)
    timer.current = setTimeout(() => setMsg(''), 2200)
  }
  const node = msg ? <div className="toast">{msg}</div> : null
  return { show, node }
}
