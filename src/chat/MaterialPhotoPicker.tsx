import { useEffect, useMemo, useState } from 'react'
import { backdropCloseProps } from '../shared/backdropClose'
import { createPortal } from 'react-dom'
import { fetchMaterialGallery, GalleryMaterialOption } from '../api/chat'
import { ErsatzteilSelection } from './ErsatzteilPrompt'
import { useBackButton } from '../shared/backButton'

interface Props {
  onCancel: () => void
  onApply: (items: ErsatzteilSelection[]) => void
}

// Reine, unit-testbare Filterfunktion: ein Artikel matcht, wenn JEDER Suchtoken in
// art_nr, name oder category vorkommt (case-insensitive, tokenisiert wie MaterialCombobox).
export function filterGallery(items: GalleryMaterialOption[], query: string): GalleryMaterialOption[] {
  const tokens = query.toLowerCase().split(/\s+/).filter(Boolean)
  if (!tokens.length) return items
  return items.filter(m => {
    const hay = `${m.art_nr} ${m.name} ${m.category ?? ''}`.toLowerCase()
    return tokens.every(t => hay.includes(t))
  })
}

// Katalog-Popup: durch alle aktiven Artikel scrollen (mit Bild zuerst, ohne Bild mit
// Platzhalter), mehrere mit Menge wählen und in den Ersatzteil-Schritt übernehmen.
// Additiv gedacht — Übernehmen setzt die Mengen der gewählten Artikel (Überschreiben,
// kein Aufaddieren); Entfernen/Feintuning passiert danach in der Liste des
// Ersatzteil-Schritts.

// Obergrenze gerenderter Kacheln: grosse Kataloge (Stobag ~4500 Artikel) würden das
// Grid sonst mit tausenden DOM-Knoten aufblähen (spürbar träge auf Baustellen-Handys).
// Die Suche filtert weiterhin über ALLE Artikel — nur die Anzeige ist gedeckelt.
export const MAX_TILES = 120

export default function MaterialPhotoPicker({ onCancel, onApply }: Props) {
  const [items, setItems] = useState<GalleryMaterialOption[]>([])
  const [byArtNr, setByArtNr] = useState<Record<string, GalleryMaterialOption>>({})
  const [qty, setQty] = useState<Record<string, number>>({})  // art_nr -> Menge (0 = nicht gewählt)
  const [query, setQuery] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(false)
  const [lightbox, setLightbox] = useState<string | null>(null)  // Bild-Vollansicht (Lightbox)

  useEffect(() => {
    let cancelled = false
    fetchMaterialGallery()
      .then(list => {
        if (cancelled) return
        setItems(list)
        setByArtNr(Object.fromEntries(list.map(m => [m.art_nr, m])))
      })
      .catch(() => { if (!cancelled) setError(true) })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [])

  const filtered = useMemo(() => filterGallery(items, query), [items, query])

  // Hardware-/Browser-Zurück geht einen Schritt zurück statt zur Hauptmaske:
  // ist die Bild-Vollansicht offen, schliesst Zurück zuerst sie (LIFO, deshalb
  // nach dem Modal-Handler registriert); sonst schliesst es das ganze Popup.
  useBackButton(true, onCancel)
  useBackButton(lightbox !== null, () => setLightbox(null))

  function toggle(artNr: string) {
    setQty(prev => {
      const next = { ...prev }
      if (next[artNr]) delete next[artNr]
      else next[artNr] = 1
      return next
    })
  }

  function setCount(artNr: string, n: number) {
    setQty(prev => ({ ...prev, [artNr]: Math.max(1, n) }))
  }

  function apply() {
    const selected: ErsatzteilSelection[] = Object.entries(qty)
      .filter(([, n]) => n > 0)
      .map(([artNr, n]) => {
        const m = byArtNr[artNr]
        return { art_nr: artNr, amount: n, name: m?.name ?? artNr, unit: m?.unit ?? 'Stk' }
      })
    onApply(selected)
  }

  const selectedCount = Object.values(qty).filter(n => n > 0).length

  return createPortal(
    <>
    <div className="photo-picker-overlay" {...backdropCloseProps(onCancel)}>
      <div className="photo-picker" onClick={e => e.stopPropagation()}>
        <div className="photo-picker-header">
          <div className="photo-picker-title">Artikel aus dem Katalog</div>
          <button className="photo-picker-close" onClick={onCancel} aria-label="Schliessen">×</button>
        </div>

        <input
          className="photo-picker-search"
          value={query}
          onChange={e => setQuery(e.target.value)}
          placeholder="Art.-Nr., Bezeichnung oder Kategorie…"
        />

        <div className="photo-picker-body">
          {loading && <div className="photo-picker-empty">Lädt…</div>}
          {!loading && error && <div className="photo-picker-empty">Fehler beim Laden.</div>}
          {!loading && !error && items.length === 0 && (
            <div className="photo-picker-empty">Keine Artikel vorhanden.</div>
          )}
          {!loading && !error && items.length > 0 && filtered.length === 0 && (
            <div className="photo-picker-empty">Keine Treffer für „{query}“.</div>
          )}
          {!loading && !error && filtered.length > 0 && (
            <div className="photo-picker-grid">
              {filtered.slice(0, MAX_TILES).map(m => {
                const n = qty[m.art_nr] || 0
                const checked = n > 0
                return (
                  <div key={m.art_nr} className={`photo-tile ${checked ? 'is-selected' : ''}`}>
                    <button type="button" className="photo-tile-pick" onClick={() => toggle(m.art_nr)}>
                      {m.image_url
                        ? <img className="photo-tile-img" src={m.image_url} alt={m.name} loading="lazy" />
                        : <div className="photo-tile-img photo-tile-noimg">kein Bild</div>}
                      {checked && <span className="photo-tile-check">✓</span>}
                      <div className="photo-tile-name">{m.name}</div>
                      <div className="photo-tile-meta">
                        <span className="photo-tile-artnr">{m.art_nr}</span>
                        {m.calc_vk > 0 && <span> · CHF {m.calc_vk.toFixed(2)}</span>}
                      </div>
                    </button>
                    {m.image_url && (
                      <button
                        type="button"
                        className="photo-tile-zoom"
                        onClick={() => setLightbox(m.image_url!)}
                        aria-label="Bild vergrössern"
                      >🔍</button>
                    )}
                    {checked && (
                      <div className="kleinmaterial-stepper photo-tile-stepper">
                        <button type="button" onClick={() => setCount(m.art_nr, n - 1)} disabled={n <= 1}>−</button>
                        <span>{n}</span>
                        <button type="button" onClick={() => setCount(m.art_nr, n + 1)}>+</button>
                        <span className="ersatzteil-unit">{m.unit}</span>
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          )}
          {!loading && !error && filtered.length > MAX_TILES && (
            <div className="photo-picker-empty">
              {filtered.length - MAX_TILES} weitere Treffer — Suche verfeinern, um sie zu sehen.
            </div>
          )}
        </div>

        <div className="photo-picker-actions">
          <button type="button" className="confirm-btn confirm-btn-no" onClick={onCancel}>Abbrechen</button>
          <button
            type="button"
            className="confirm-btn confirm-btn-yes"
            onClick={apply}
            disabled={selectedCount === 0}
          >
            {`Übernehmen${selectedCount ? ` (${selectedCount})` : ''}`}
          </button>
        </div>
      </div>
    </div>
    {lightbox && (
      <div className="photo-picker-lightbox" onClick={() => setLightbox(null)}>
        <img src={lightbox} alt="" />
      </div>
    )}
    </>,
    document.body,
  )
}
