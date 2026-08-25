import { useEffect, useRef, useState } from 'react'
import { apiFetch } from '../api/client'

// Suche läuft über einen Backend-Proxy (tel.search.ch), damit der API-Key
// serverseitig bleibt (Railway-Env). Default-Endpoint ist der Admin-Lookup;
// die Mitarbeiter-PWA reicht via `endpoint` ihren eigenen (nicht-Admin) durch.
interface LookupHit {
  name: string
  street?: string
  zip?: string
  city?: string
  phone?: string
  email?: string
}

export interface CompanyResult {
  name: string
  address: string
  phone: string
  email: string
}

interface Props {
  onSelect: (result: CompanyResult) => void
  /** Backend-Proxy-Endpoint. Default: Admin-Lookup. Die Mitarbeiter-PWA nutzt
   *  /pwa/project-drafts/company-lookup (ohne Admin-Rechte). */
  endpoint?: string
  /** CSS-Klasse der Eingabefelder — passt die Komponente an Admin- vs. PWA-Style an. */
  inputClassName?: string
}

export function CompanySearch({
  onSelect,
  endpoint = '/pwa/admin/suppliers/lookup',
  inputClassName = 'admin-form-input',
}: Props) {
  const [query, setQuery] = useState('')
  const [ort, setOrt] = useState('')
  const [suggestions, setSuggestions] = useState<LookupHit[]>([])
  const [open, setOpen] = useState(false)
  const [highlighted, setHighlighted] = useState(-1)
  const [loading, setLoading] = useState(false)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const containerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current)

    if (query.trim().length < 3) {
      setSuggestions([])
      setOpen(false)
      return
    }

    debounceRef.current = setTimeout(async () => {
      setLoading(true)
      try {
        // firma=0: auch Privatpersonen — Kunden sind oft keine Firmen
        const params = new URLSearchParams({ q: query.trim(), firma: '0' })
        if (ort.trim()) params.set('wo', ort.trim())

        const results = await apiFetch(`${endpoint}?${params}`) as LookupHit[]
        setSuggestions(results)
        setOpen(results.length > 0)
        setHighlighted(-1)
      } catch {
        setSuggestions([])
        setOpen(false)
      } finally {
        setLoading(false)
      }
    }, 350)

    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current)
    }
  }, [query, ort, endpoint])

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [])

  function select(entry: LookupHit) {
    const city = [entry.zip, entry.city].filter(Boolean).join(' ')
    const address = [entry.street, city].filter(Boolean).join(', ')

    onSelect({
      name: entry.name,
      address,
      phone: entry.phone ?? '',
      email: entry.email ?? '',
    })

    setQuery('')
    setOrt('')
    setOpen(false)
    setSuggestions([])
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (!open || suggestions.length === 0) return
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setHighlighted(h => Math.min(h + 1, suggestions.length - 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setHighlighted(h => Math.max(h - 1, 0))
    } else if (e.key === 'Enter' && highlighted >= 0) {
      e.preventDefault()
      select(suggestions[highlighted])
    } else if (e.key === 'Escape') {
      setOpen(false)
    }
  }

  return (
    <div ref={containerRef} style={{ position: 'relative' }}>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr auto', gap: 8 }}>
        <input
          className={inputClassName}
          placeholder="Firmaname oder Name…"
          value={query}
          onChange={e => setQuery(e.target.value)}
          onKeyDown={handleKeyDown}
          autoComplete="off"
        />
        <input
          className={inputClassName}
          placeholder="Ort"
          value={ort}
          onChange={e => setOrt(e.target.value)}
          style={{ width: 140 }}
          autoComplete="off"
        />
      </div>
      {loading && (
        <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 4 }}>Suche…</div>
      )}
      {open && (
        <ul style={{
          position: 'absolute',
          top: '100%',
          left: 0,
          right: 0,
          zIndex: 1000,
          margin: 0,
          padding: 0,
          listStyle: 'none',
          background: 'var(--surface)',
          border: '1px solid var(--border)',
          borderRadius: 6,
          boxShadow: 'var(--shadow-hover, 0 4px 16px rgba(0,0,0,0.15))',
          maxHeight: 260,
          overflowY: 'auto',
        }}>
          {suggestions.map((s, i) => {
            const city = [s.zip, s.city].filter(Boolean).join(' ')
            return (
              <li
                key={`${s.name}-${s.street ?? ''}-${i}`}
                onMouseDown={() => select(s)}
                onMouseEnter={() => setHighlighted(i)}
                style={{
                  padding: '8px 12px',
                  cursor: 'pointer',
                  background: i === highlighted ? 'var(--surface-2)' : 'transparent',
                  borderBottom: i < suggestions.length - 1 ? '1px solid var(--border)' : 'none',
                }}
              >
                <div style={{ fontWeight: 500, fontSize: 13, color: 'var(--text)' }}>{s.name}</div>
                <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 2 }}>
                  {[s.street, city].filter(Boolean).join(' · ')}
                  {s.phone ? ` · ${s.phone}` : ''}
                </div>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}
