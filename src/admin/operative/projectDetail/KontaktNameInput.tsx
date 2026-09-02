import { useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import type { Customer } from '../../../api/admin/customers'
import { useIsMobile } from '../../useIsMobile'
import {
  KontaktCandidate, ROLE_LABELS, searchKontaktCandidates,
} from './kontaktKundenstamm'

// Namensfeld einer Ansprechperson mit Vorschlägen aus dem Kundenstamm.
//
// Bewusst KEINE Combobox wie beim Kunden: das Feld bleibt ein freies Textfeld
// (die «altbekannte Mechanik»), die Vorschläge sind ein Angebot obendrauf. Wer
// keinen Treffer klickt, hat genau das getippt, was im Feld steht — nichts
// wird beim Verlassen zurückgesetzt oder auf eine Auswahl gezwungen.
//
// Dropdown-Technik wie in der CustomerCombobox: auf dem Handy in-flow unter dem
// Feld (iOS-Tastatur-tauglich), am Desktop als Portal mit fixer Position, damit
// die Liste aus der Karte herausragen darf.

interface Props {
  value: string
  onChange: (name: string) => void
  /** Vorschlag angeklickt — der Aufrufer füllt daraus die ganze Zeile. */
  onPick: (cand: KontaktCandidate) => void
  customers: readonly Customer[]
  id?: string
  ariaLabel?: string
  autoComplete?: string
}

export function KontaktNameInput({
  value, onChange, onPick, customers, id, ariaLabel = 'Name', autoComplete,
}: Props) {
  const [open, setOpen] = useState(false)
  const [highlighted, setHighlighted] = useState(0)
  const [pos, setPos] = useState<{ top: number; left: number; width: number } | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const menuRef = useRef<HTMLDivElement>(null)
  const isMobile = useIsMobile()

  const hits = useMemo(() => searchKontaktCandidates(value, customers), [value, customers])
  const show = open && hits.length > 0

  function reposition() {
    if (inputRef.current) {
      const r = inputRef.current.getBoundingClientRect()
      setPos({ top: r.bottom + 4, left: r.left, width: Math.max(r.width, 280) })
    }
  }

  useEffect(() => {
    if (!show) return
    function onClick(e: MouseEvent) {
      if (menuRef.current?.contains(e.target as Node)) return
      if (inputRef.current?.contains(e.target as Node)) return
      setOpen(false)
    }
    document.addEventListener('mousedown', onClick)
    window.addEventListener('resize', reposition)
    window.addEventListener('scroll', reposition, true)
    return () => {
      document.removeEventListener('mousedown', onClick)
      window.removeEventListener('resize', reposition)
      window.removeEventListener('scroll', reposition, true)
    }
  }, [show])

  function pick(cand: KontaktCandidate) {
    onPick(cand)
    setOpen(false)
  }

  function onKeyDown(e: React.KeyboardEvent) {
    if (!show) {
      if (e.key === 'ArrowDown' && hits.length > 0) { reposition(); setHighlighted(0); setOpen(true) }
      return
    }
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setHighlighted(h => Math.min(h + 1, hits.length - 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setHighlighted(h => Math.max(h - 1, 0))
    } else if (e.key === 'Enter') {
      // Nur abfangen, solange die Liste offen ist — sonst soll Enter das
      // Formular wie gewohnt abschicken.
      e.preventDefault()
      if (hits[highlighted]) pick(hits[highlighted])
    } else if (e.key === 'Escape') {
      e.preventDefault()
      setOpen(false)
    }
  }

  const menuInner = (
    <>
      <div style={{ padding: '6px 12px', fontSize: 11, color: 'var(--muted)', borderBottom: '1px solid var(--border)' }}>
        Aus dem Kundenstamm übernehmen
      </div>
      {hits.map((c, i) => (
        <div
          key={`${c.customerId}:${c.role}`}
          role="option"
          aria-selected={i === highlighted}
          onMouseDown={e => { e.preventDefault(); pick(c) }}
          onMouseEnter={() => setHighlighted(i)}
          style={{
            padding: '8px 12px',
            minHeight: isMobile ? 44 : undefined,
            cursor: 'pointer',
            fontSize: 13,
            color: 'var(--text)',
            background: i === highlighted ? 'var(--surface2)' : 'transparent',
            borderBottom: i < hits.length - 1 ? '1px solid var(--border)' : 'none',
            display: 'flex', flexDirection: 'column', gap: 2,
          }}
        >
          <span style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
            <strong>{c.name}</strong>
            {c.telefon ? <span style={{ color: 'var(--muted)' }}> · {c.telefon}</span> : null}
          </span>
          <span style={{ fontSize: 11, color: 'var(--muted)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
            {c.role === 'kunde' ? ROLE_LABELS.kunde : `${ROLE_LABELS[c.role]} von ${c.customerName}`}
          </span>
        </div>
      ))}
    </>
  )

  const menuBoxBase = {
    margin: 0,
    padding: 0,
    background: 'var(--surface)',
    border: '1px solid var(--border)',
    borderRadius: 'var(--radius-xs)',
    boxShadow: '0 4px 16px rgba(0,0,0,0.2)',
    overflowY: 'auto' as const,
  }

  return (
    <div style={{ width: '100%', position: 'relative' }}>
      <input
        ref={inputRef}
        id={id}
        className="admin-form-input"
        aria-label={ariaLabel}
        autoComplete={autoComplete}
        role="combobox"
        aria-expanded={show}
        aria-autocomplete="list"
        value={value}
        onFocus={() => { reposition(); setOpen(true) }}
        onChange={e => {
          onChange(e.target.value)
          setHighlighted(0)
          if (!open) { reposition(); setOpen(true) }
        }}
        onKeyDown={onKeyDown}
      />
      {show && isMobile && (
        <div
          ref={menuRef}
          role="listbox"
          style={{ ...menuBoxBase, position: 'absolute', top: '100%', left: 0, right: 0, marginTop: 4, zIndex: 50, maxHeight: '40vh' }}
        >
          {menuInner}
        </div>
      )}
      {show && !isMobile && pos && createPortal(
        <div
          ref={menuRef}
          role="listbox"
          style={{ ...menuBoxBase, position: 'fixed', top: pos.top, left: pos.left, width: pos.width, zIndex: 2000, maxHeight: 300 }}
        >
          {menuInner}
        </div>,
        document.body,
      )}
    </div>
  )
}
