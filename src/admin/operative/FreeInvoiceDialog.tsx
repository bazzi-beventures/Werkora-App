/**
 * «Neue Rechnung» — eine Rechnung ohne Projekt und ohne Rapport.
 *
 * Spec: docs/specs/admin-werkora-ch.md §8.2 a, §4.3/3.
 *
 * Der Normalfall dieses Produkts ist: die Rechnung folgt aus abgenommener
 * Arbeit, also aus Rapporten oder einer Offerte. Dieser Dialog ist die
 * Ausnahme, und er existiert für einen konkreten Fall — die Abo-Rechnung an
 * die Mandanten, die weder das eine noch das andere hat (E2/E9).
 *
 * Deshalb hängt er an `freie_rechnung` (Stufe beta, Default aus). Ohne Flag
 * gibt es den Knopf nicht, und der Server antwortet zusätzlich 403: der
 * Rapport-Zwang soll nicht als Nebenwirkung der eigenen Buchhaltung fallen.
 *
 * **Gerechnet wird nicht hier.** Die Zeilensumme unten ist eine Anzeige; die
 * verbindliche Summe zieht das Backend über `compute_invoice_total` — dieselbe
 * Funktion wie bei der Projektrechnung. Ein zweiter Rechenweg im Frontend wäre
 * die klassische Art, sich um Rappen von der Buchhaltung zu entfernen.
 */
import { useMemo, useState } from 'react'
import { generateFreeInvoice, type FreePosition } from '../../api/admin'
import type { Customer } from '../../api/admin'
import { CustomerCombobox } from './CustomerCombobox'

/** Wie `services/free_invoice.py`: mehr Zeilen nimmt der Server nicht an. */
const MAX_POSITIONEN = 100
const STANDARD_FRIST_TAGE = 30

/** Eine Zeile im Formular. Getrennt vom API-Typ, weil Mengen und Preise hier
 *  als Text leben — ein halb getipptes «12.» ist keine Zahl, und ein Feld, das
 *  beim Tippen gegen `Number()` läuft, springt einem unter den Fingern weg. */
interface Zeile {
  text: string
  menge: string
  einheit: string
  einzelpreis: string
}

const LEERE_ZEILE: Zeile = { text: '', menge: '1', einheit: 'Stk', einzelpreis: '' }

/** Komma und Punkt sind beide erlaubt — auf einer Schweizer Tastatur tippt man
 *  im Zweifel das Komma, und daran soll keine Rechnung scheitern. */
function zahl(s: string): number {
  const n = Number(s.replace(',', '.').trim())
  return Number.isFinite(n) ? n : NaN
}

export function zeilenPruefen(zeilen: Zeile[]): { fehler: string | null; positionen: FreePosition[] } {
  const positionen: FreePosition[] = []

  for (const [i, z] of zeilen.entries()) {
    const nr = i + 1
    const text = z.text.trim()
    const menge = zahl(z.menge)
    const preis = zahl(z.einzelpreis)

    if (!text) return { fehler: `Position ${nr}: Beschreibung fehlt.`, positionen: [] }
    if (Number.isNaN(menge)) return { fehler: `Position ${nr}: Menge ist keine Zahl.`, positionen: [] }
    // Menge 0 wird nicht stillschweigend korrigiert: auf einer Rechnung ist das
    // ein Eingabefehler, und nach dem Versand fällt er niemandem mehr auf.
    if (menge === 0) return { fehler: `Position ${nr}: Menge 0 ergibt keine Zeile.`, positionen: [] }
    if (Number.isNaN(preis)) return { fehler: `Position ${nr}: Einzelpreis ist keine Zahl.`, positionen: [] }

    positionen.push({
      text,
      menge,
      einheit: z.einheit.trim() || 'Stk',
      einzelpreis: preis,
    })
  }

  if (!positionen.length) return { fehler: 'Mindestens eine Position.', positionen: [] }

  // Negative Einzelpreise sind erlaubt — eine Gutschriftszeile («Rabatt
  // Jahresabo, −200.00») ist auf einer Abo-Rechnung der Normalfall. Was nicht
  // geht, ist eine Rechnung, die unter dem Strich nichts fordert.
  const total = positionen.reduce((s, p) => s + p.menge * p.einzelpreis, 0)
  if (total <= 0) return { fehler: 'Das Total muss grösser als 0 sein.', positionen: [] }

  return { fehler: null, positionen }
}

interface Props {
  customers: Customer[]
  onClose: () => void
  onCreated: (invoiceNumber: string) => void
}

export default function FreeInvoiceDialog({ customers, onClose, onCreated }: Props) {
  const [customerId, setCustomerId] = useState('')
  const [zeilen, setZeilen] = useState<Zeile[]>([{ ...LEERE_ZEILE }])
  const [frist, setFrist] = useState(String(STANDARD_FRIST_TAGE))
  const [remark, setRemark] = useState('')
  const [fehler, setFehler] = useState('')
  const [laeuft, setLaeuft] = useState(false)

  const total = useMemo(
    () => zeilen.reduce((s, z) => {
      const m = zahl(z.menge)
      const p = zahl(z.einzelpreis)
      return s + (Number.isNaN(m) || Number.isNaN(p) ? 0 : m * p)
    }, 0),
    [zeilen],
  )

  function setzeZeile(i: number, feld: keyof Zeile, wert: string) {
    setZeilen((alt) => alt.map((z, j) => (j === i ? { ...z, [feld]: wert } : z)))
  }

  async function absenden() {
    setFehler('')
    if (!customerId) { setFehler('Kunde wählen.'); return }

    const { fehler: f, positionen } = zeilenPruefen(zeilen)
    if (f) { setFehler(f); return }

    const tage = Number(frist)
    if (!Number.isInteger(tage) || tage < 0 || tage > 365) {
      setFehler('Zahlungsfrist: ganze Zahl zwischen 0 und 365.')
      return
    }

    setLaeuft(true)
    try {
      const res = await generateFreeInvoice({
        customer_id: customerId,
        positions: positionen,
        payment_terms_days: tage,
        remark: remark.trim() || undefined,
      })
      onCreated(res.invoice_number)
    } catch (e) {
      setFehler(e instanceof Error ? e.message : 'Die Rechnung konnte nicht erzeugt werden.')
    } finally {
      setLaeuft(false)
    }
  }

  return (
    <div className="admin-modal-backdrop" onClick={onClose}>
      <div className="admin-modal admin-modal-lg" onClick={(e) => e.stopPropagation()}>
        <div className="admin-modal-head">
          <h2>Neue Rechnung</h2>
          <button type="button" className="admin-modal-close" onClick={onClose} aria-label="Schliessen">×</button>
        </div>

        <div className="admin-modal-body">
          <label className="admin-form-label">
            Kunde
            <CustomerCombobox customers={customers} value={customerId} onChange={setCustomerId} />
          </label>

          <div className="admin-form-label">Positionen</div>
          <div className="admin-table-wrap">
            <table className="admin-table">
              <thead>
                <tr>
                  <th>Beschreibung</th>
                  <th style={{ width: '5.5rem' }}>Menge</th>
                  <th style={{ width: '6rem' }}>Einheit</th>
                  <th style={{ width: '7rem' }}>Einzelpreis</th>
                  <th style={{ width: '7rem' }}>Betrag</th>
                  <th style={{ width: '3rem' }} />
                </tr>
              </thead>
              <tbody>
                {zeilen.map((z, i) => {
                  const m = zahl(z.menge)
                  const pr = zahl(z.einzelpreis)
                  const betrag = Number.isNaN(m) || Number.isNaN(pr) ? null : m * pr
                  return (
                    <tr key={i}>
                      <td>
                        <input
                          className="admin-form-input"
                          aria-label={`Beschreibung Position ${i + 1}`}
                          value={z.text}
                          onChange={(e) => setzeZeile(i, 'text', e.target.value)}
                        />
                      </td>
                      <td>
                        <input
                          className="admin-form-input"
                          inputMode="decimal"
                          aria-label={`Menge Position ${i + 1}`}
                          value={z.menge}
                          onChange={(e) => setzeZeile(i, 'menge', e.target.value)}
                        />
                      </td>
                      <td>
                        <input
                          className="admin-form-input"
                          aria-label={`Einheit Position ${i + 1}`}
                          value={z.einheit}
                          onChange={(e) => setzeZeile(i, 'einheit', e.target.value)}
                        />
                      </td>
                      <td>
                        <input
                          className="admin-form-input"
                          inputMode="decimal"
                          aria-label={`Einzelpreis Position ${i + 1}`}
                          value={z.einzelpreis}
                          onChange={(e) => setzeZeile(i, 'einzelpreis', e.target.value)}
                        />
                      </td>
                      <td>{betrag === null ? '—' : betrag.toFixed(2)}</td>
                      <td>
                        {zeilen.length > 1 && (
                          <button
                            type="button"
                            className="admin-btn admin-btn-secondary admin-btn-sm"
                            aria-label={`Position ${i + 1} entfernen`}
                            onClick={() => setZeilen((alt) => alt.filter((_, j) => j !== i))}
                          >
                            ×
                          </button>
                        )}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>

          <button
            type="button"
            className="admin-btn admin-btn-secondary admin-btn-sm"
            disabled={zeilen.length >= MAX_POSITIONEN}
            onClick={() => setZeilen((alt) => [...alt, { ...LEERE_ZEILE }])}
          >
            Position hinzufügen
          </button>

          <div className="admin-form-row">
            <label className="admin-form-label">
              Zahlungsfrist (Tage)
              <input
                className="admin-form-input"
                inputMode="numeric"
                value={frist}
                onChange={(e) => setFrist(e.target.value)}
              />
            </label>
          </div>

          <label className="admin-form-label">
            Bemerkung (optional)
            <input
              className="admin-form-input"
              value={remark}
              onChange={(e) => setRemark(e.target.value)}
            />
          </label>

          {/* Anzeige, nicht Buchhaltung — die verbindliche Summe rechnet das
              Backend (siehe Kopf). */}
          <div className="admin-modal-total">Total CHF {total.toFixed(2)}</div>

          {fehler && <div className="admin-error">{fehler}</div>}
        </div>

        <div className="admin-modal-foot">
          <button type="button" className="admin-btn admin-btn-secondary" onClick={onClose}>
            Abbrechen
          </button>
          <button type="button" className="admin-btn admin-btn-primary" disabled={laeuft} onClick={absenden}>
            {laeuft ? 'Erzeuge…' : 'Rechnung erzeugen'}
          </button>
        </div>
      </div>
    </div>
  )
}
