import { useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import type { Customer } from '../../api/admin/customers'
import { useIsMobile } from '../useIsMobile'

// Tippbare Kunden-Auswahl mit Live-Filter. Ersetzt das native <select> in der
// Projekt-Erstellung, weil das Dropdown bei vielen Kunden unbedienbar wurde.
// Bewusst analog zur MaterialCombobox aufgebaut (gleiche Bedien-/Tastaturlogik).
//
// Suche: alle getippten Tokens müssen vorkommen (UND-Logik) — entweder im
// Text-Heuhaufen (Name, Firma, Adressen, Kontaktnamen, E-Mail) oder, falls ein
// Token Ziffern enthält, in den auf Ziffern reduzierten Telefonnummern. Dadurch
// findet «Luca 079 576 55 16» die gespeicherte Nummer «0795765516» trotz
// Leerzeichen, und «Luca Seuzach» trifft über Name + Ort gleichzeitig.

interface Props {
  customers: Customer[]
  value: string                       // gewählte customer_id ('' = kein Kunde)
  onChange: (customerId: string) => void
}

const MAX_VISIBLE = 80

function digitsOnly(s: string): string {
  return s.replace(/\D+/g, '')
}

function addrOf(c: Customer): string {
  return c.billing_address ?? c.address ?? ''
}

function labelOf(c: Customer): string {
  const a = addrOf(c)
  return a ? `${c.name} · ${a}` : c.name
}

// Vorberechneter Suchindex pro Kunde: Text-Heuhaufen + Ziffern-Telefonnummern.
interface Indexed {
  c: Customer
  hay: string
  phoneDigits: string
}

export function CustomerCombobox({ customers, value, onChange }: Props) {
  const [query, setQuery] = useState('')
  const [open, setOpen] = useState(false)
  const [highlighted, setHighlighted] = useState(0)
  const [pos, setPos] = useState<{ top: number; left: number; width: number } | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const menuRef = useRef<HTMLDivElement>(null)
  const isMobile = useIsMobile()

  const selected = useMemo(() => customers.find(c => c.id === value) ?? null, [customers, value])
  const selectedLabel = selected ? labelOf(selected) : ''

  // Eingabefeld zeigt die Auswahl, solange der Nutzer nicht aktiv tippt.
  useEffect(() => { setQuery(selectedLabel) }, [selectedLabel])

  const indexed = useMemo<Indexed[]>(() => customers.map(c => ({
    c,
    hay: [
      c.name, c.company, c.address, c.billing_name, c.billing_address,
      c.object_address, c.email, c.local_contact_name, c.owner_contact_name,
    ].filter(Boolean).join(' ').toLowerCase(),
    phoneDigits: digitsOnly([
      c.phone, c.phone_landline, c.local_contact_phone, c.owner_contact_phone,
    ].filter(Boolean).join(' ')),
  })), [customers])

  // Tipp-Filter: jedes Token muss treffen (Text ODER Telefon-Ziffern).
  // Leere Suche / unveränderte Auswahl → ganze Liste.
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    const noTextFilter = !q || query === selectedLabel
    if (noTextFilter) return indexed.slice(0, MAX_VISIBLE).map(x => x.c)
    const tokens = q.split(/\s+/)
    const out: Customer[] = []
    for (const x of indexed) {
      const hit = tokens.every(t => {
        const td = digitsOnly(t)
        if (td.length >= 2 && x.phoneDigits.includes(td)) return true
        return x.hay.includes(t)
      })
      if (hit) {
        out.push(x.c)
        if (out.length >= MAX_VISIBLE) break
      }
    }
    return out
  }, [indexed, query, selectedLabel])

  function reposition() {
    if (inputRef.current) {
      const r = inputRef.current.getBoundingClientRect()
      setPos({ top: r.bottom + 4, left: r.left, width: r.width })
    }
  }

  function openMenu() {
    reposition()
    setHighlighted(0)
    setOpen(true)
  }

  useEffect(() => {
    if (!open) return
    function onClick(e: MouseEvent) {
      if (menuRef.current?.contains(e.target as Node)) return
      if (inputRef.current?.contains(e.target as Node)) return
      setOpen(false)
      setQuery(selectedLabel) // verworfener Tipp-Text → zurück auf Auswahl
    }
    document.addEventListener('mousedown', onClick)
    window.addEventListener('resize', reposition)
    window.addEventListener('scroll', reposition, true)
    return () => {
      document.removeEventListener('mousedown', onClick)
      window.removeEventListener('resize', reposition)
      window.removeEventListener('scroll', reposition, true)
    }
  }, [open, selectedLabel])

  function pick(c: Customer | null) {
    onChange(c ? c.id : '')
    setQuery(c ? labelOf(c) : '')
    setOpen(false)
  }

  function onKeyDown(e: React.KeyboardEvent) {
    if (!open && (e.key === 'ArrowDown' || e.key === 'Enter')) { openMenu(); return }
    if (!open) return
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setHighlighted(h => Math.min(h + 1, filtered.length - 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setHighlighted(h => Math.max(h - 1, 0))
    } else if (e.key === 'Enter') {
      e.preventDefault()
      if (filtered[highlighted]) pick(filtered[highlighted])
    } else if (e.key === 'Escape') {
      setOpen(false)
      setQuery(selectedLabel)
    }
  }

  const totalCandidates = customers.length

  const menuInner = (
    <>
      <div
        onMouseDown={() => pick(null)}
        style={{ padding: '8px 12px', cursor: 'pointer', fontSize: 13, color: 'var(--muted)', borderBottom: '1px solid var(--border)' }}
      >
        — kein Kunde zugeordnet —
      </div>
      {filtered.length === 0 ? (
        <div style={{ padding: '10px 12px', fontSize: 13, color: 'var(--muted)' }}>Kein Treffer</div>
      ) : (
        filtered.map((c, i) => (
          <div
            key={c.id}
            onMouseDown={() => pick(c)}
            onMouseEnter={() => setHighlighted(i)}
            style={{
              padding: '8px 12px',
              minHeight: isMobile ? 44 : undefined,
              display: isMobile ? 'flex' : undefined,
              alignItems: isMobile ? 'center' : undefined,
              cursor: 'pointer',
              fontSize: 13,
              color: 'var(--text)',
              background: i === highlighted ? 'var(--surface2)' : 'transparent',
              borderBottom: i < filtered.length - 1 ? '1px solid var(--border)' : 'none',
              whiteSpace: 'nowrap',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
            }}
          >
            {labelOf(c)}
          </div>
        ))
      )}
      {totalCandidates > filtered.length && (
        <div style={{ padding: '6px 12px', fontSize: 11, color: 'var(--muted)', borderTop: '1px solid var(--border)' }}>
          {filtered.length} von {totalCandidates} — weiter tippen, um einzugrenzen
        </div>
      )}
    </>
  )

  const menuBoxBase = {
    margin: 0,
    padding: 0,
    listStyle: 'none' as const,
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
        className="admin-form-select"
        style={{ width: '100%' }}
        value={query}
        placeholder="Kunde wählen oder suchen…"
        autoComplete="off"
        onFocus={e => { e.target.select(); openMenu() }}
        onChange={e => { setQuery(e.target.value); setHighlighted(0); if (!open) openMenu() }}
        onKeyDown={onKeyDown}
      />
      {/* Mobile: In-Flow-Dropdown direkt unter dem Feld (iOS-Tastatur-tauglich). */}
      {open && isMobile && (
        <div
          ref={menuRef}
          style={{ ...menuBoxBase, position: 'absolute', top: '100%', left: 0, right: 0, marginTop: 4, zIndex: 50, maxHeight: '40vh' }}
        >
          {menuInner}
        </div>
      )}
      {open && !isMobile && pos && createPortal(
        <div
          ref={menuRef}
          style={{ ...menuBoxBase, position: 'fixed', top: pos.top, left: pos.left, width: pos.width, zIndex: 2000, maxHeight: 300 }}
        >
          {menuInner}
        </div>,
        document.body
      )}
    </div>
  )
}
