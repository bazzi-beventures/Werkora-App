// Der Abschluss einer Zählung — dieselbe Rückfrage in Liste und Zählmodus.
//
// Lag bis R2 in `admin/lager/CountDetail.tsx`. Hierher gezogen, weil ihn ein
// Inventurmanager ohne Admin-Rolle im Zählmodus der Monteur-PWA ebenso
// beantwortet (docs/specs/rollierende-inventur.md E8, §10.3): Was gebucht wird,
// muss beiden gleich gesagt werden — zwei Texte für dieselbe Buchung wären zwei
// Wahrheiten.

import type { StockCountDetail } from '../../api/inventory'
import { ConfirmDialog } from '../../admin/components/ConfirmDialog'

export function AbschlussDialog({
  detail, onConfirm, onCancel, busy,
}: {
  detail: StockCountDetail
  onConfirm: () => void
  onCancel: () => void
  busy: boolean
}) {
  const gezaehlt = detail.items.filter(i => i.counted_qty != null)
  const offen = detail.items.length - gezaehlt.length

  // Vorschau der Differenzen gegen `expected_at_start`. Die endgültige Zahl
  // rechnet der Server gegen den Bestand zum Zählzeitpunkt — sie kann hier
  // abweichen, wenn seit der Zählung gebucht wurde. Genau deshalb steht der
  // Hinweis darunter, statt eine Zahl zu behaupten, die sich gleich ändert.
  const vorschau = gezaehlt
    .map(i => ({ ...i, vorab_diff: (i.counted_qty ?? 0) - i.expected_at_start }))
    .filter(i => i.vorab_diff !== 0)

  return (
    <ConfirmDialog
      title="Inventur abschliessen?"
      message={
        <div>
          <p>
            {gezaehlt.length} von {detail.items.length} Positionen gezählt,
            {' '}{vorschau.length} mit Abweichung.
          </p>
          {offen > 0 && (
            <p style={{ color: 'var(--warning, #b45309)' }}>
              {offen} Position(en) hat niemand angesehen. Sie bleiben ungezählt — es
              wird für sie nichts gebucht.
            </p>
          )}
          {vorschau.length > 0 && (
            <div style={{ maxHeight: 180, overflow: 'auto', marginTop: 8 }}>
              <table className="admin-table">
                <thead>
                  <tr><th>Artikel</th><th style={{ textAlign: 'right' }}>Abweichung</th></tr>
                </thead>
                <tbody>
                  {vorschau.slice(0, 40).map(i => (
                    <tr key={i.id}>
                      <td>{i.name} <span style={{ color: 'var(--muted)' }}>{i.art_nr}</span></td>
                      <td style={{ textAlign: 'right', color: i.vorab_diff < 0 ? 'var(--danger)' : undefined }}>
                        {i.vorab_diff > 0 ? '+' : ''}{i.vorab_diff} {i.unit || ''}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <p style={{ fontSize: 12, color: 'var(--muted)', marginTop: 8 }}>
            Die endgültige Abweichung rechnet Werkora gegen den Bestand zum Zeitpunkt
            der Zählung — Buchungen seitdem zählen nicht als Inventurdifferenz.
            Jede Abweichung wird als Lagerbewegung gebucht.
          </p>
        </div>
      }
      confirmLabel="Abschliessen und buchen"
      onConfirm={onConfirm}
      onCancel={onCancel}
      busy={busy}
      busyLabel="Wird gebucht…"
      scrollable
      maxWidth={640}
    />
  )
}
