import { useEffect, useState } from 'react'

// In-app replacement for the browser's confirm() popup.
// Usage: if (!(await confirmDialog('Remove this?'))) return
type Pending = { message: string; resolve: (ok: boolean) => void }
let open: ((p: Pending) => void) | null = null

export function confirmDialog(message: string): Promise<boolean> {
  return new Promise((resolve) => {
    if (open) open({ message, resolve })
    else resolve(window.confirm(message))
  })
}

export function ConfirmHost() {
  const [pending, setPending] = useState<Pending | null>(null)
  useEffect(() => {
    open = setPending
    return () => { open = null }
  }, [])
  if (!pending) return null
  const done = (ok: boolean) => { pending.resolve(ok); setPending(null) }
  return (
    <div className="modal-back" onClick={() => done(false)}>
      <div className="modal" role="alertdialog" aria-modal="true" onClick={(e) => e.stopPropagation()}>
        <div className="confirm-msg">{pending.message}</div>
        <div className="row">
          <button className="secondary grow" onClick={() => done(false)}>Cancel</button>
          <button className="grow" autoFocus onClick={() => done(true)}>Yes</button>
        </div>
      </div>
    </div>
  )
}
