// Block «Arbeit» der Maske «Offerte neu»: eine Karte je Funktion mit Stunden, Ansatz
// und Zeilentotal. Der Ansatz kommt wie bisher aus der Funktion (Personal →
// Stundensätze); neu steht er sichtbar in der Zeile statt nur in der Auswahlliste.

import { fmtCHF } from '../../../utils/format'
import { lineTotal, parseNum } from '../../../utils/quotePricing'
import type { RowList } from '../useRowList'
import type { LaborRow, StaffRole } from '../quoteTypes'
import { BlockKopf, Feld, Marke, Rechenwert, ZeilenMenu } from './Bausteine'

const LEERE_LOHNZEILE: LaborRow = { description: '', quantity: '', unit_price: null, hidden: false }

function lohnSumme(rows: LaborRow[]): number {
  return rows.reduce((s, r) => s + (r.unit_price == null ? 0 : lineTotal(parseNum(r.quantity), r.unit_price)), 0)
}

export function ArbeitBlock({ labor, roles, montageEnabled, summe, rabattHinweis }: {
  labor: RowList<LaborRow>
  roles: StaffRole[]
  montageEnabled: boolean
  /** Summe aus der Vorschau; ohne sie die lokal gerechnete. */
  summe: number | null
  rabattHinweis?: string
}) {
  return (
    <section className="on-block" aria-label="Arbeit">
      <BlockKopf titel="Arbeit" summe={summe ?? lohnSumme(labor.rows)} hinweis={rabattHinweis} />
      {labor.rows.map((row, i) => {
        const total = row.unit_price == null ? null : lineTotal(parseNum(row.quantity), row.unit_price)
        return (
          <div key={i} className="on-karte">
            <div className="on-karte-kopf">
              <select
                className="admin-form-select"
                aria-label="Funktion"
                value={row.description}
                onChange={e => labor.update(i, {
                  description: e.target.value,
                  unit_price: roles.find(r => r.name === e.target.value)?.hourly_rate ?? null,
                })}
              >
                <option value="">Funktion wählen…</option>
                {roles.map(r => (
                  <option key={r.name} value={r.name}>{r.name}{r.job_title ? ` — ${r.job_title}` : ''}</option>
                ))}
              </select>
              <ZeilenMenu aktionen={[
                ...(montageEnabled ? [{
                  label: 'In Produktpreise einrechnen (verstecken)',
                  an: !!row.hidden,
                  onClick: () => labor.update(i, { hidden: !row.hidden }),
                }] : []),
                { label: 'Entfernen', gefahr: true, onClick: () => labor.remove(i) },
              ]} />
            </div>
            <div className="on-felder on-felder-3">
              <Feld label="Stunden" zahl value={row.quantity} onChange={v => labor.update(i, { quantity: v })} />
              <Rechenwert label="Ansatz/h" betrag={row.unit_price} />
              <Rechenwert label="Total" betrag={total} />
            </div>
            {row.hidden && (
              <p className="on-karte-fuss">
                <Marke ton="warn">versteckt</Marke>
                Steht nicht als eigene Zeile auf der Offerte, sondern wird in die Produktpreise eingerechnet
                {total != null ? ` (${fmtCHF(total)})` : ''}.
              </p>
            )}
          </div>
        )
      })}
      <div className="on-knoepfe">
        <button type="button" className="admin-btn admin-btn-secondary admin-btn-sm"
          onClick={() => labor.add({ ...LEERE_LOHNZEILE })}>+ Funktion</button>
      </div>
    </section>
  )
}
