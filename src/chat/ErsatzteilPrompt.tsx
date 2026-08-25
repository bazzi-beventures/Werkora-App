import { useEffect, useState } from 'react'
import { fetchFrequentMaterials, fetchMaterialGalleryCount, FrequentMaterialOption } from '../api/chat'
import MaterialPhotoPicker from './MaterialPhotoPicker'

export interface ErsatzteilSelection {
  art_nr: string
  amount: number
  name: string
  unit: string
}

interface Props {
  onSubmit: (items: ErsatzteilSelection[]) => void
}

// Vor dem Speichern: Mitarbeiter wählt aus der kuratierten Ersatzteil-Liste
// (Mehrfachauswahl + Menge). Sammelt nur die Auswahl (kein Buchen) und reicht sie
// via onSubmit nach oben — die Buchung (verrechenbar + Lagerabbuchung) passiert
// zusammen mit dem Rapport beim Bestätigen. Feature `ersatzteil_prompt` — die Liste
// kommt vom Backend (leer ⇒ Schritt überspringen).
//
// Kein Einbauort-Feld mehr je Zeile (bis 20260815): der Ort ist eine Angabe zum
// ganzen Rapport und wird im Chat einmal erfragt, bevor dieser Schritt erscheint.
export default function ErsatzteilPrompt({ onSubmit }: Props) {
  const [items, setItems] = useState<FrequentMaterialOption[]>([])
  const [qty, setQty] = useState<Record<string, number>>({})  // art_nr -> Menge (0 = nicht gewählt)
  const [loading, setLoading] = useState(true)
  const [galleryCount, setGalleryCount] = useState(0)  // Anzahl aktiver Katalog-Artikel (>0 ⇒ Katalog-Button)
  const [showPicker, setShowPicker] = useState(false)

  useEffect(() => {
    let cancelled = false
    // Kuratierte Liste UND Katalog-Anzahl parallel laden. Der Schritt erscheint, sobald
    // eines von beidem etwas hat; nur wenn beide leer sind, wird er übersprungen.
    Promise.all([
      fetchFrequentMaterials().catch(() => [] as FrequentMaterialOption[]),
      fetchMaterialGalleryCount().catch(() => 0),
    ])
      .then(([list, count]) => {
        if (cancelled) return
        if (!list.length && count === 0) { onSubmit([]); return }  // nichts verfügbar → überspringen
        setItems(list)
        setGalleryCount(count)
      })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [])

  // Auswahl aus dem Katalog-Popup übernehmen: neue Artikel (nicht in der kuratierten Liste)
  // als Zeilen ergänzen, damit sie sichtbar/anpassbar sind; Menge setzen (überschreiben).
  function applyPicked(picked: ErsatzteilSelection[]) {
    setItems(prev => {
      const known = new Set(prev.map(m => m.art_nr))
      const additions: FrequentMaterialOption[] = picked
        .filter(p => !known.has(p.art_nr))
        .map(p => ({ id: p.art_nr, art_nr: p.art_nr, name: p.name, unit: p.unit, calc_vk: 0 }))
      return additions.length ? [...prev, ...additions] : prev
    })
    setQty(prev => {
      const next = { ...prev }
      for (const p of picked) next[p.art_nr] = p.amount
      return next
    })
    setShowPicker(false)
  }

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

  function submit() {
    const selected: ErsatzteilSelection[] = items
      .filter(m => (qty[m.art_nr] || 0) > 0)
      .map(m => ({
        art_nr: m.art_nr, amount: qty[m.art_nr], name: m.name, unit: m.unit,
      }))
    onSubmit(selected)
  }

  // Während des Ladens und wenn weder kuratierte Liste noch Katalog-Artikel da sind
  // (onSubmit wurde dann schon gerufen) nichts zeigen.
  if (loading || (items.length === 0 && galleryCount === 0)) return null

  const selectedCount = Object.values(qty).filter(n => n > 0).length

  return (
    <div className="kleinmaterial-prompt">
      <div className="kleinmaterial-title">Ersatzteile verbraucht?</div>
      <div className="kleinmaterial-sub">
        Wähle die verbauten Ersatzteile und gib die Menge an.
      </div>

      {galleryCount > 0 && (
        <button
          type="button"
          className="confirm-btn confirm-btn-no ersatzteil-foto-btn"
          onClick={() => setShowPicker(true)}
        >
          📷 Aus dem Katalog wählen
        </button>
      )}

      {showPicker && (
        <MaterialPhotoPicker onCancel={() => setShowPicker(false)} onApply={applyPicked} />
      )}

      <div className="ersatzteil-list">
        {items.map(m => {
          const checked = !!qty[m.art_nr]
          return (
            <div key={m.art_nr} className={`ersatzteil-row ${checked ? 'is-selected' : ''}`}>
              <label className="ersatzteil-pick">
                <input
                  type="checkbox"
                  checked={checked}
                  onChange={() => toggle(m.art_nr)}
                />
                <span className="ersatzteil-name">
                  <span className="ersatzteil-artnr">{m.art_nr}</span> {m.name}
                </span>
              </label>
              {checked && (
                <div className="kleinmaterial-stepper">
                  <button
                    type="button"
                    onClick={() => setCount(m.art_nr, qty[m.art_nr] - 1)}
                    disabled={qty[m.art_nr] <= 1}
                  >−</button>
                  <span>{qty[m.art_nr]}</span>
                  <button
                    type="button"
                    onClick={() => setCount(m.art_nr, qty[m.art_nr] + 1)}
                  >+</button>
                  <span className="ersatzteil-unit">{m.unit}</span>
                </div>
              )}
            </div>
          )
        })}
      </div>

      <div className="kleinmaterial-actions">
        <button
          type="button"
          className="confirm-btn confirm-btn-no"
          onClick={submit}
        >
          Nichts verbraucht
        </button>
        <button
          type="button"
          className="confirm-btn confirm-btn-yes"
          onClick={submit}
          disabled={selectedCount === 0}
        >
          {`Erfassen${selectedCount ? ` (${selectedCount})` : ''}`}
        </button>
      </div>
    </div>
  )
}
