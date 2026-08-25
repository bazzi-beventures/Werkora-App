import { useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { fmtCHF } from '../utils/format'
import { useIsMobile } from '../useIsMobile'

// Tippbare Material-Auswahl mit Live-Filter. Ersetzt das native <select> in der
// Offerten-Erstellung, weil der Materialstamm (Stobag ~4'500 Artikel) im Dropdown
// unbedienbar wurde. Filtert über Art.-Nr., Bezeichnung, Kategorie und
// Lieferantennamen; optionale Lieferant-/Kategorie-Filter grenzen zusätzlich ein.

// Strukturell kompatibel zur Material-Zeile aus QuotesScreen — bewusst lokal
// definiert, um einen Zirkular-Import (QuotesScreen ↔ MaterialCombobox) zu vermeiden.
// Teilmenge des Material-Stamms (api/admin/materials.Material), die das Dropdown
// braucht. `unit`/`unit_price` sind dort nullable — ein Artikel ohne Einheit oder
// ohne fixen VK ist ein realer Datenstand (der Preis kommt dann aus calc_vk).
export interface MaterialOption {
  art_nr: string
  name: string
  unit_price: number | null
  calc_vk?: number | null
  unit: string | null
  category?: string | null
  supplier_id?: string | null
}

interface Props {
  materials: MaterialOption[]
  supplierMap: Record<string, string>
  supplierFilter: string   // '' = alle
  categoryFilter: string   // '' = alle
  value: string            // gewählte art_nr
  onChange: (artNr: string) => void
  className?: string       // optionale Zusatzklasse am Wurzel-Element (z.B. quote-main)
}

const MAX_VISIBLE = 80

// Mindestbreite des Dropdowns (Desktop). Die Beschriftung ist «Art.-Nr. — Name
// (Preis/Einheit)» und damit deutlich breiter als das Eingabefeld in einer engen
// Formularspalte — ohne diese Untergrenze bricht die Liste schon nach wenigen
// Zeichen ab («65 — Getriebehalter (C…»).
const MIN_MENU_WIDTH = 420

function labelOf(m: MaterialOption): string {
  return `${m.art_nr} — ${m.name} (${fmtCHF(m.calc_vk ?? m.unit_price ?? 0)}/${m.unit ?? ''})`
}

export function MaterialCombobox({ materials, supplierMap, supplierFilter, categoryFilter, value, onChange, className }: Props) {
  const [query, setQuery] = useState('')
  const [open, setOpen] = useState(false)
  const [highlighted, setHighlighted] = useState(0)
  const [pos, setPos] = useState<{ top: number; left: number; width: number } | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const menuRef = useRef<HTMLDivElement>(null)
  const isMobile = useIsMobile()

  const selected = useMemo(() => materials.find(m => m.art_nr === value) ?? null, [materials, value])
  const selectedLabel = selected ? labelOf(selected) : ''

  // Eingabefeld zeigt die Auswahl, solange der Nutzer nicht aktiv tippt.
  useEffect(() => { setQuery(selectedLabel) }, [selectedLabel])

  // Kandidaten = Materialien nach optionalem Lieferant-/Kategorie-Filter.
  const candidates = useMemo(() => materials.filter(m => {
    if (supplierFilter && m.supplier_id !== supplierFilter) return false
    if (categoryFilter && (m.category ?? '') !== categoryFilter) return false
    return true
  }), [materials, supplierFilter, categoryFilter])

  // Tipp-Filter: alle Tokens müssen im Suchtext (Art.-Nr. + Name + Kategorie +
  // Lieferant) vorkommen. Leere Suche / unveränderte Auswahl → ganze Liste.
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    const noTextFilter = !q || query === selectedLabel
    if (noTextFilter) return candidates.slice(0, MAX_VISIBLE)
    const tokens = q.split(/\s+/)
    const out: MaterialOption[] = []
    for (const m of candidates) {
      const hay = `${m.art_nr} ${m.name} ${m.category ?? ''} ${m.supplier_id ? supplierMap[m.supplier_id] ?? '' : ''}`.toLowerCase()
      if (tokens.every(t => hay.includes(t))) {
        out.push(m)
        if (out.length >= MAX_VISIBLE) break
      }
    }
    return out
  }, [candidates, query, selectedLabel, supplierMap])

  function reposition() {
    if (inputRef.current) {
      const r = inputRef.current.getBoundingClientRect()
      // Breite: so breit wie das Feld, mindestens MIN_MENU_WIDTH, höchstens das
      // Fenster. Ragt das breitere Menü rechts hinaus, rückt es nach links —
      // sonst landen die Preise ausserhalb des sichtbaren Bereichs.
      const limit = Math.max(window.innerWidth - 16, 160)
      const width = Math.min(Math.max(r.width, MIN_MENU_WIDTH), limit)
      const left = Math.max(8, Math.min(r.left, window.innerWidth - width - 8))
      setPos({ top: r.bottom + 4, left, width })
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

  function pick(m: MaterialOption | null) {
    onChange(m ? m.art_nr : '')
    setQuery(m ? labelOf(m) : '')
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

  const totalCandidates = candidates.length

  const menuInner = (
    <>
      <div
        onMouseDown={() => pick(null)}
        style={{ padding: '8px 12px', cursor: 'pointer', fontSize: 13, color: 'var(--muted)', borderBottom: '1px solid var(--border)' }}
      >
        — Material wählen —
      </div>
      {filtered.length === 0 ? (
        <div style={{ padding: '10px 12px', fontSize: 13, color: 'var(--muted)' }}>Kein Treffer</div>
      ) : (
        filtered.map((m, i) => (
          <div
            key={m.art_nr}
            onMouseDown={() => pick(m)}
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
            {labelOf(m)}
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
    borderRadius: 6,
    boxShadow: '0 4px 16px rgba(0,0,0,0.2)',
    overflowY: 'auto' as const,
  }

  return (
    <div className={className} style={{ flex: 2, minWidth: 0, position: 'relative' }}>
      <input
        ref={inputRef}
        className="admin-form-input"
        style={{ width: '100%' }}
        value={query}
        placeholder="Material wählen oder suchen…"
        autoComplete="off"
        onFocus={e => { e.target.select(); openMenu() }}
        onChange={e => { setQuery(e.target.value); setHighlighted(0); if (!open) openMenu() }}
        onKeyDown={onKeyDown}
      />
      {/* Mobile: In-Flow-Dropdown direkt unter dem Feld — position:fixed sitzt bei
          offener iOS-Tastatur falsch, weil iOS fixed dann nicht neu layoutet. */}
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
