// Hagelschaden-Disposition — Varianten vergleichen («was wäre, wenn?»).
// Spec: docs/specs/hagelschaden-disposition.md §8.
//
// Die feste Liste rechnet der Server (Equipen ±1, Samstag, Regler). Der grosse
// Hebel ist die Kapazität, die Gewichtung der kleine — darum steht die Spalte
// «fertig am» vorn.

import { useEffect } from 'react'
import { createPortal } from 'react-dom'
import type { DispoVariante } from '../../../../api/admin/hagelschadenDispo'
import { minuten, tagKurz } from './dispoFormat'

export function VariantenDialog({ varianten, laeuft, onClose }: {
  varianten: DispoVariante[] | null
  laeuft: boolean
  onClose: () => void
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  return createPortal(
    <div className="admin-modal-overlay" onClick={onClose}>
      <div className="admin-modal dispo-dialog" role="dialog" aria-label="Varianten" onClick={e => e.stopPropagation()}>
        <div className="admin-modal-header">
          <div className="admin-modal-title">Varianten</div>
          <button className="admin-modal-close" aria-label="Schliessen" onClick={onClose}>×</button>
        </div>
        <div className="admin-modal-body">
          {laeuft || !varianten ? (
            <div className="admin-loading"><div className="admin-spinner" /> Rechne bis zu sechs Varianten…</div>
          ) : (
            <>
              <div className="dispo-tabelle-scroll">
                <table className="admin-table">
                  <thead>
                    <tr><th>Variante</th><th>fertig am</th><th>Arbeitstage</th><th>km</th><th>Fahrt</th><th>nach Frist</th><th>nicht planbar</th></tr>
                  </thead>
                  <tbody>
                    {varianten.map(v => (
                      <tr key={v.name} className={v.name === 'Aktuell' ? 'dispo-aktuell' : undefined}>
                        <td className="primary">{v.name}</td>
                        <td>{v.fertig_am ? tagKurz(v.fertig_am) : '—'}</td>
                        <td>{v.arbeitstage}</td>
                        <td>{v.km.toLocaleString('de-CH')}</td>
                        <td>{minuten(v.fahrt_min)}</td>
                        <td className={v.zu_spaet > 0 ? 'dispo-warnung' : undefined}>{v.zu_spaet}</td>
                        <td className={v.ungeplant > 0 ? 'dispo-warnung' : undefined}>{v.ungeplant}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <p className="hagel-sub">
                Varianten rechnen mit weniger Zeit als der Plan selbst; für den Vergleich zählt der Abstand
                zwischen den Zeilen, nicht der einzelne Wert. Übernehmen: Equipen oder Samstag unter «Planung» ändern
                und neu berechnen.
              </p>
            </>
          )}
        </div>
      </div>
    </div>,
    document.body,
  )
}
