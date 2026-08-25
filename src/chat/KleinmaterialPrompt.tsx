import { useState } from 'react'
import { KleinmaterialPromptConfig } from '../api/modules'

export interface KleinmaterialSelection {
  amount_chf: number | null  // null = "nichts verbraucht"
  count: number
  scope: string
}

interface Props {
  config: KleinmaterialPromptConfig
  onSubmit: (selection: KleinmaterialSelection) => void
}

// Vor dem Speichern: Mitarbeiter wählt einen Pauschalbetrag für Klein-/Schmiermaterial.
// Sammelt nur die Auswahl (kein Buchen) und reicht sie via onSubmit nach oben — die
// Buchung passiert zusammen mit dem Rapport beim Bestätigen. Feature `kleinmaterial_prompt`.
export default function KleinmaterialPrompt({ config, onSubmit }: Props) {
  const [selected, setSelected] = useState<number | null>(null)
  const [count, setCount] = useState(1)

  function submit(amountChf: number | null) {
    onSubmit({
      amount_chf: amountChf,
      count: amountChf === null ? 0 : count,
      scope: config.scope,
    })
  }

  const total = selected !== null ? selected * count : 0

  return (
    <div className="kleinmaterial-prompt">
      <div className="kleinmaterial-title">Klein-/Schmiermaterial verbraucht?</div>
      <div className="kleinmaterial-sub">
        Schrauben, Fett, Verbrauchsmaterial — wähle den Pauschalbetrag.
      </div>

      <div className="kleinmaterial-presets">
        {config.presets_chf.map(amt => (
          <button
            key={amt}
            type="button"
            className={`kleinmaterial-preset ${selected === amt ? 'is-selected' : ''}`}
            onClick={() => setSelected(amt)}
          >
            CHF {amt}
          </button>
        ))}
      </div>

      {selected !== null && (
        <div className="kleinmaterial-count">
          <label>Anzahl</label>
          <div className="kleinmaterial-stepper">
            <button
              type="button"
              onClick={() => setCount(Math.max(1, count - 1))}
              disabled={count <= 1}
            >−</button>
            <span>{count}</span>
            <button
              type="button"
              onClick={() => setCount(count + 1)}
            >+</button>
          </div>
          <div className="kleinmaterial-total">= CHF {total}</div>
        </div>
      )}

      <div className="kleinmaterial-actions">
        <button
          type="button"
          className="confirm-btn confirm-btn-no"
          onClick={() => submit(null)}
        >
          Nein, nichts verbraucht
        </button>
        <button
          type="button"
          className="confirm-btn confirm-btn-yes"
          onClick={() => selected !== null && submit(selected)}
          disabled={selected === null}
        >
          Erfassen
        </button>
      </div>
    </div>
  )
}
