import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'

interface Props {
  allStatuses: string[]
  statusLabels: Record<string, string>
  selected: Set<string>
  onChange: (next: Set<string>) => void
}

export function StatusFilterPopover({ allStatuses, statusLabels, selected, onChange }: Props) {
  const [open, setOpen] = useState(false)
  const [draft, setDraft] = useState<Set<string>>(selected)
  const btnRef = useRef<HTMLButtonElement>(null)
  const panelRef = useRef<HTMLDivElement>(null)
  const [panelPos, setPanelPos] = useState<{ top: number; right: number } | null>(null)

  function openPanel() {
    setDraft(new Set(selected))
    if (btnRef.current) {
      const r = btnRef.current.getBoundingClientRect()
      setPanelPos({ top: r.bottom + 4, right: window.innerWidth - r.right })
    }
    setOpen(true)
  }

  function apply() {
    onChange(new Set(draft))
    setOpen(false)
  }

  function toggle(s: string) {
    setDraft(prev => {
      const next = new Set(prev)
      if (next.has(s)) next.delete(s); else next.add(s)
      return next
    })
  }

  useEffect(() => {
    if (!open) return
    function onClick(e: MouseEvent) {
      if (panelRef.current?.contains(e.target as Node)) return
      if (btnRef.current?.contains(e.target as Node)) return
      setOpen(false)
    }
    function onKey(e: KeyboardEvent) { if (e.key === 'Escape') setOpen(false) }
    document.addEventListener('mousedown', onClick)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onClick)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  const isActive = selected.size !== allStatuses.length

  return (
    <>
      <button
        ref={btnRef}
        type="button"
        className="admin-form-select"
        style={{ width: 'auto', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 8, flexShrink: 0 }}
        onClick={() => open ? setOpen(false) : openPanel()}
        title="Nach Status filtern"
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
          <polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3" />
        </svg>
        Status
        {isActive && (
          <span style={{ background: 'var(--primary-soft)', color: 'var(--primary)', fontSize: 11, padding: '1px 6px', borderRadius: 8, fontWeight: 600 }}>
            {selected.size}
          </span>
        )}
      </button>

      {open && panelPos && createPortal(
        <div
          ref={panelRef}
          style={{
            position: 'fixed',
            top: panelPos.top,
            right: panelPos.right,
            background: 'var(--surface, #fff)',
            border: '1px solid var(--border)',
            borderRadius: 8,
            padding: 8,
            boxShadow: '0 8px 24px rgba(0,0,0,0.12)',
            zIndex: 1000,
            minWidth: 220,
          }}
        >
          {allStatuses.map(s => (
            <label key={s} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 4px', cursor: 'pointer' }}>
              <input
                type="checkbox"
                checked={draft.has(s)}
                onChange={() => toggle(s)}
                style={{ accentColor: 'var(--primary)' }}
              />
              {statusLabels[s]}
            </label>
          ))}
          <div style={{ display: 'flex', gap: 6, marginTop: 8, paddingTop: 8, borderTop: '1px solid var(--border)' }}>
            <button type="button" className="admin-btn admin-btn-secondary admin-btn-sm" onClick={() => setDraft(new Set(allStatuses))}>Alle</button>
            <button type="button" className="admin-btn admin-btn-secondary admin-btn-sm" onClick={() => setDraft(new Set())}>Keine</button>
            <button type="button" className="admin-btn admin-btn-primary admin-btn-sm" style={{ marginLeft: 'auto' }} onClick={apply}>Übernehmen</button>
          </div>
        </div>,
        document.body
      )}
    </>
  )
}
