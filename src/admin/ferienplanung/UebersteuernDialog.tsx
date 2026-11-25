// Freigabe trotz hartem Befund: Begründung ist Pflicht (Spec §9 P2, Entscheid E1).
// Die Begründung wird an der Absenz festgehalten (`override_grund`).
import { useState } from 'react'
import type { Befund } from '../../api/admin/ferienplanung'
import { BefundListe } from './BefundListe'

export function UebersteuernDialog({ name, befunde, onAbbrechen, onBestaetigen }: {
  name: string
  befunde: Befund[]
  onAbbrechen: () => void
  onBestaetigen: (grund: string) => void
}) {
  const [grund, setGrund] = useState('')
  return (
    <div className="admin-modal-overlay" onClick={onAbbrechen}>
      <div className="admin-modal" role="dialog" aria-label="Freigabe trotz Befund" onClick={e => e.stopPropagation()}>
        <div className="admin-modal-header">
          <div className="admin-modal-title">Freigabe trotz Befund — {name}</div>
          <button className="admin-modal-close" aria-label="Schliessen" onClick={onAbbrechen}>×</button>
        </div>
        <div className="admin-modal-body">
          <BefundListe befunde={befunde} />
          <label className="admin-form-group" style={{ display: 'block', marginTop: 12 }}>
            <span className="admin-form-label">Begründung (Pflicht, wird festgehalten)</span>
            <textarea className="admin-form-input" rows={3} maxLength={500} value={grund}
              aria-label="Begründung" placeholder="z. B. Mitarbeiter wünscht es ausdrücklich, Vertretung geregelt"
              onChange={e => setGrund(e.target.value)} />
          </label>
        </div>
        <div className="admin-modal-footer">
          <button className="admin-btn admin-btn-secondary" onClick={onAbbrechen}>Abbrechen</button>
          <button className="admin-btn admin-btn-success" disabled={!grund.trim()}
            onClick={() => onBestaetigen(grund.trim())}>
            Trotzdem genehmigen
          </button>
        </div>
      </div>
    </div>
  )
}
