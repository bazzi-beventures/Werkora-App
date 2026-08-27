import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'

/**
 * Trichter-Knopf im Spaltenkopf plus Auswahl-Popup.
 *
 * Der Knopf sitzt NEBEN der Beschriftung, nicht darin: Klick auf die Beschriftung
 * sortiert (wie bisher), Klick auf den Trichter öffnet den Filter. Deshalb
 * `stopPropagation` — ohne das würde jedes Öffnen des Filters die Liste
 * gleichzeitig umsortieren.
 *
 * Die Komponente weiss nichts über Projekte. Sie bekommt Abschnitte
 * (`FilterSection[]`) und Werte herein und gibt Werte zurück — damit ist sie in
 * der Kunden-, Material- und Rechnungsliste wiederverwendbar. Ein Popup kann
 * mehrere Abschnitte tragen: die Kundenspalte nutzt alle drei Varianten
 * (Ortschaft als Auswahl, Adresse und Telefon als "enthält").
 *
 * Positionierung, Portal, Aussenklick und Escape sind aus `StatusFilterPopover`
 * übernommen — das bleibt bestehen und kann später hierauf zurückgeführt werden.
 */

export interface FilterOption {
  value: string
  label: string
  /** Trefferzahl hinter dem Wert ("Winterthur (312)"). */
  badge?: number
}

export interface DateRange {
  from: string
  to: string
}

export type FilterSection =
  | { kind: 'multi'; key: string; title?: string; options: FilterOption[]; empty?: string }
  | { kind: 'text'; key: string; title: string; placeholder?: string }
  | { kind: 'daterange'; key: string; title?: string }

export type FilterValue = string[] | string | DateRange
export type FilterValues = Record<string, FilterValue>

const EMPTY_RANGE: DateRange = { from: '', to: '' }

export function multiValue(values: FilterValues, key: string): string[] {
  const v = values[key]
  return Array.isArray(v) ? v : []
}

export function textValue(values: FilterValues, key: string): string {
  const v = values[key]
  return typeof v === 'string' ? v : ''
}

export function rangeValue(values: FilterValues, key: string): DateRange {
  const v = values[key]
  return v && typeof v === 'object' && !Array.isArray(v) ? v : EMPTY_RANGE
}

/** Wie viele Abschnitte dieses Filters gesetzt sind — färbt den Trichter ein. */
export function activeSectionCount(sections: FilterSection[], values: FilterValues): number {
  return sections.filter(s => {
    if (s.kind === 'multi') return multiValue(values, s.key).length > 0
    if (s.kind === 'text') return textValue(values, s.key).trim() !== ''
    const r = rangeValue(values, s.key)
    return r.from !== '' || r.to !== ''
  }).length
}

/** Leere Werte für die gegebenen Abschnitte — der "Keine"/"Zurücksetzen"-Zustand. */
export function clearedValues(sections: FilterSection[]): FilterValues {
  const out: FilterValues = {}
  for (const s of sections) {
    if (s.kind === 'multi') out[s.key] = []
    else if (s.kind === 'text') out[s.key] = ''
    else out[s.key] = { from: '', to: '' }
  }
  return out
}

interface SectionsProps {
  sections: FilterSection[]
  draft: FilterValues
  onDraft: (next: FilterValues) => void
}

/**
 * Die Abschnitte selbst — geteilt zwischen Popup (Desktop) und Vollbild-Sheet
 * (Handy). Zwei Fassungen desselben Formulars wären genau die Stelle, an der ein
 * neuer Filter auf dem Handy fehlt und es niemandem auffällt.
 */
export function FilterSections({ sections, draft, onDraft }: SectionsProps) {
  function toggle(key: string, value: string) {
    const current = multiValue(draft, key)
    onDraft({
      ...draft,
      [key]: current.includes(value) ? current.filter(v => v !== value) : [...current, value],
    })
  }

  return (
    <>
      {sections.map((section, i) => (
        <div key={section.key} style={{ marginTop: i === 0 ? 0 : 12 }}>
          {section.title && (
            <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.04em', color: 'var(--text-muted, #888)', marginBottom: 4 }}>
              {section.title}
            </div>
          )}

          {section.kind === 'multi' && (
            section.options.length === 0 ? (
              <div style={{ fontSize: 13, color: 'var(--text-muted, #888)', padding: '4px 2px' }}>
                {section.empty ?? 'Keine Werte vorhanden.'}
              </div>
            ) : (
              <div style={{ maxHeight: 260, overflowY: 'auto' }}>
                {section.options.map(o => (
                  <label key={o.value} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 4px', cursor: 'pointer', fontSize: 14 }}>
                    <input
                      type="checkbox"
                      checked={multiValue(draft, section.key).includes(o.value)}
                      onChange={() => toggle(section.key, o.value)}
                      style={{ accentColor: 'var(--primary)' }}
                    />
                    <span style={{ flex: 1 }}>{o.label}</span>
                    {o.badge !== undefined && (
                      <span style={{ fontSize: 11, color: 'var(--text-muted, #888)', fontVariantNumeric: 'tabular-nums' }}>
                        {o.badge}
                      </span>
                    )}
                  </label>
                ))}
              </div>
            )
          )}

          {section.kind === 'text' && (
            <input
              className="admin-search"
              style={{ width: '100%', boxSizing: 'border-box' }}
              placeholder={section.placeholder ?? 'enthält …'}
              aria-label={section.title}
              value={textValue(draft, section.key)}
              onChange={e => onDraft({ ...draft, [section.key]: e.target.value })}
            />
          )}

          {section.kind === 'daterange' && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <input
                type="date"
                className="admin-search"
                aria-label="von"
                style={{ flex: 1, minWidth: 0 }}
                value={rangeValue(draft, section.key).from}
                onChange={e => onDraft({ ...draft, [section.key]: { ...rangeValue(draft, section.key), from: e.target.value } })}
              />
              <span style={{ color: 'var(--text-muted, #888)' }}>–</span>
              <input
                type="date"
                className="admin-search"
                aria-label="bis"
                style={{ flex: 1, minWidth: 0 }}
                value={rangeValue(draft, section.key).to}
                onChange={e => onDraft({ ...draft, [section.key]: { ...rangeValue(draft, section.key), to: e.target.value } })}
              />
            </div>
          )}
        </div>
      ))}
    </>
  )
}

interface Props {
  /** Spaltenname — steckt in der Beschriftung des Trichters ("Filter: Rechnung"). */
  label: string
  sections: FilterSection[]
  values: FilterValues
  onChange: (next: FilterValues) => void
  /** Wird beim ersten Öffnen gerufen — für Werte, die erst dann geladen werden. */
  onOpen?: () => void
}

export function ColumnFilter({ label, sections, values, onChange, onOpen }: Props) {
  const [open, setOpen] = useState(false)
  const [draft, setDraft] = useState<FilterValues>(values)
  const btnRef = useRef<HTMLButtonElement>(null)
  const panelRef = useRef<HTMLDivElement>(null)
  const [pos, setPos] = useState<{ top: number; right: number } | null>(null)

  const activeCount = activeSectionCount(sections, values)

  function openPanel() {
    setDraft({ ...clearedValues(sections), ...values })
    if (btnRef.current) {
      const r = btnRef.current.getBoundingClientRect()
      // Nach rechts ausgerichtet wie im StatusFilterPopover, aber geklemmt: bei
      // einer Spalte am linken Rand ragte das Popup sonst aus dem Fenster.
      setPos({ top: r.bottom + 4, right: Math.max(8, window.innerWidth - r.right) })
    }
    onOpen?.()
    setOpen(true)
  }

  function apply(next: FilterValues) {
    onChange(next)
    setOpen(false)
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

  const hasMulti = sections.some(s => s.kind === 'multi')

  return (
    <>
      <button
        ref={btnRef}
        type="button"
        aria-label={`Filter: ${label}`}
        title={`${label} filtern`}
        // Der Klick darf NICHT bis zum <th> durchschlagen — sonst sortiert jedes
        // Öffnen des Filters die Liste um.
        onClick={e => { e.stopPropagation(); open ? setOpen(false) : openPanel() }}
        style={{
          background: 'none', border: 'none', padding: '0 2px', cursor: 'pointer',
          color: activeCount > 0 ? 'var(--primary)' : 'var(--text-muted, #999)',
          display: 'inline-flex', alignItems: 'center', gap: 2, verticalAlign: 'middle',
        }}
      >
        <svg width="12" height="12" viewBox="0 0 24 24" fill={activeCount > 0 ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
          <polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3" />
        </svg>
        {activeCount > 0 && <span style={{ fontSize: 10, fontWeight: 700 }}>{activeCount}</span>}
      </button>

      {open && pos && createPortal(
        <div
          ref={panelRef}
          role="dialog"
          aria-label={`Filter: ${label}`}
          // React leitet Ereignisse aus einem Portal am REACT-Baum entlang weiter,
          // nicht am DOM-Baum: ohne dieses stopPropagation landet jeder Klick im
          // Popup beim onClick des Spaltenkopfs — ein Haekchen wuerde die Liste
          // umsortieren und das Popup dabei wegrendern.
          onClick={e => e.stopPropagation()}
          style={{
            position: 'fixed', top: pos.top, right: pos.right,
            background: 'var(--surface, #fff)', border: '1px solid var(--border)',
            borderRadius: 'var(--radius-sm)', padding: 10, boxShadow: '0 8px 24px rgba(0,0,0,0.12)',
            zIndex: 1000, minWidth: 240, maxWidth: 320,
          }}
        >
          <FilterSections sections={sections} draft={draft} onDraft={setDraft} />
          <div style={{ display: 'flex', gap: 6, marginTop: 10, paddingTop: 8, borderTop: '1px solid var(--border)' }}>
            {hasMulti && (
              <button
                type="button" className="admin-btn admin-btn-secondary admin-btn-sm"
                onClick={() => setDraft({
                  ...draft,
                  ...Object.fromEntries(sections.filter(s => s.kind === 'multi')
                    .map(s => [s.key, (s as { options: FilterOption[] }).options.map(o => o.value)])),
                })}
              >
                Alle
              </button>
            )}
            <button
              type="button" className="admin-btn admin-btn-secondary admin-btn-sm"
              onClick={() => setDraft(clearedValues(sections))}
            >
              Keine
            </button>
            <button
              type="button" className="admin-btn admin-btn-primary admin-btn-sm"
              style={{ marginLeft: 'auto' }}
              onClick={() => apply(draft)}
            >
              Übernehmen
            </button>
          </div>
        </div>,
        document.body
      )}
    </>
  )
}
