import { useEffect, useState } from 'react'
import { supabase, CaregiverNote, NoteChange } from '../supabase'
import { useToast } from '../toast'

export default function NotesPage({ nameOf, readOnly }: { nameOf: (e: string) => string; readOnly: boolean }) {
  const toast = useToast()
  const [notes, setNotes] = useState<CaregiverNote[]>([])
  const [changes, setChanges] = useState<NoteChange[]>([])
  const [newText, setNewText] = useState('')
  const [editId, setEditId] = useState<string | null>(null)
  const [editText, setEditText] = useState('')
  const [showLog, setShowLog] = useState(false)

  async function load() {
    const [n, c] = await Promise.all([
      supabase.from('caregiver_notes').select('*').order('created_at'),
      supabase.from('note_changes').select('*').order('created_at', { ascending: false }).limit(100),
    ])
    setNotes(n.data ?? [])
    setChanges(c.data ?? [])
  }
  useEffect(() => { load() }, [])

  async function add() {
    if (!newText.trim()) return
    await supabase.from('caregiver_notes').insert({ text: newText.trim() })
    await supabase.from('note_changes').insert({ action: 'Added', new_text: newText.trim() })
    setNewText('')
    toast.show('Note added ✓')
    load()
  }

  async function saveEdit(note: CaregiverNote) {
    if (!editText.trim()) return
    await supabase.from('caregiver_notes').update({ text: editText.trim() }).eq('id', note.id)
    await supabase.from('note_changes').insert({ action: 'Edited', old_text: note.text, new_text: editText.trim() })
    setEditId(null)
    toast.show('Note updated ✓')
    load()
  }

  async function remove(note: CaregiverNote) {
    if (!confirm('Remove this note?')) return
    await supabase.from('caregiver_notes').delete().eq('id', note.id)
    await supabase.from('note_changes').insert({ action: 'Deleted', old_text: note.text })
    toast.show('Note removed')
    load()
  }

  return (
    <>
      <div className="sec sec-yellow">
        <div className="sec-title">📌 Caregiver Notes</div>
        <div className="muted" style={{ marginBottom: 10 }}>
          Rules, reminders, and instructions for anyone caring for Mom.
        </div>
        {notes.map((n) => (
          <div key={n.id} style={{ padding: '8px 0', borderBottom: '1px solid #f0e8dc' }}>
            {editId === n.id ? (
              <div>
                <textarea value={editText} onChange={(e) => setEditText(e.target.value)} autoFocus />
                <div className="row">
                  <button onClick={() => saveEdit(n)}>Save</button>
                  <button className="secondary" onClick={() => setEditId(null)}>Cancel</button>
                </div>
              </div>
            ) : (
              <div className="row between top">
                <div style={{ fontSize: 13 }} className="grow">• {n.text}</div>
                {!readOnly && (
                  <div className="row" style={{ flexShrink: 0 }}>
                    <button className="secondary" style={{ padding: '4px 9px', fontSize: 12 }} onClick={() => { setEditId(n.id); setEditText(n.text) }}>Edit</button>
                    <button className="danger" onClick={() => remove(n)}>✕</button>
                  </div>
                )}
              </div>
            )}
          </div>
        ))}
        {!readOnly && (
          <div style={{ marginTop: 12 }}>
            <textarea value={newText} onChange={(e) => setNewText(e.target.value)} placeholder="e.g. Give melatonin only if she asks for it." />
            <button onClick={add}>+ Add Note</button>
          </div>
        )}
      </div>

      <div className="sec sec-gray">
        <button className="ghost" style={{ padding: 0 }} onClick={() => setShowLog(!showLog)}>
          {showLog ? '▲ Hide change log' : '▼ Show change log'} ({changes.length} changes)
        </button>
        {showLog && (
          changes.length === 0
            ? <div className="muted" style={{ marginTop: 8 }}>No changes recorded yet.</div>
            : changes.map((c) => (
                <div key={c.id} style={{ fontSize: 12, padding: '7px 0', borderBottom: '1px solid #e8e8e8' }}>
                  <span className="tag">{c.action}</span>
                  {c.action === 'Edited' ? `"${c.old_text}" → "${c.new_text}"` : (c.new_text ?? c.old_text)}
                  <div className="faint">{new Date(c.created_at).toLocaleString([], { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })} · {nameOf(c.created_by)}</div>
                </div>
              ))
        )}
      </div>

      {toast.node}
    </>
  )
}
