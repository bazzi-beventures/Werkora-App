// Block «Pauschalen & Spesen» der Maske «Offerte neu»: alles, was ohne Rabatt ins
// Total geht — Montage, Sonderaufwände, Sonderpositionen und Fahrspesen. In der alten
// Maske waren das vier Bereiche mit vier Eingabemustern. Gespeichert wird weiter in den
// bisherigen Listen (das PDF gliedert danach), die Art steht als Marke an der Karte.

import { fmtCHF } from '../../../utils/format'
import { lineTotal, parseNum } from '../../../utils/quotePricing'
import type { QuoteMasterData } from '../useQuoteMasterData'
import type { RowList } from '../useRowList'
import type { ExtraChargeRow, InstallationRow, SpecialMode, SpecialRow } from '../quoteTypes'
import { BlockKopf, Feld, Marke, Rechenwert, ZeilenMenu } from './Bausteine'

const MENGE_LABEL: Record<Exclude<SpecialMode, 'pauschal'>, string> = { stunden: 'Stunden', stueck: 'Stück' }
const ANSATZ_LABEL: Record<Exclude<SpecialMode, 'pauschal'>, string> = { stunden: 'CHF/h', stueck: 'CHF/Stk' }

function sonderTotal(r: SpecialRow): number {
  return r.mode === 'pauschal' ? parseNum(r.unit_price) : lineTotal(parseNum(r.hours), parseNum(r.unit_price))
}

export function PauschalenBlock({ installation, extraCharges, special, master, travel, summe }: {
  installation: RowList<InstallationRow>
  extraCharges: RowList<ExtraChargeRow>
  special: RowList<SpecialRow>
  master: QuoteMasterData
  travel: { distanceKm: number | null | undefined; amount: number; checked: boolean; onChange: (v: boolean) => void }
  summe: number | null
}) {
  const hatDistanz = travel.distanceKm !== null && travel.distanceKm !== undefined
  return (
    <section className="on-block" aria-label="Pauschalen und Spesen">
      <BlockKopf titel="Pauschalen & Spesen" summe={summe} hinweis="ohne Rabatt" />

      {installation.rows.map((row, i) => (
        <div key={`m${i}`} className="on-karte">
          <div className="on-karte-kopf">
            <input className="admin-form-input on-karte-haupt" aria-label="Bezeichnung" placeholder="Bezeichnung"
              value={row.description} onChange={e => installation.update(i, { description: e.target.value })} />
            <Marke>Montage</Marke>
            <ZeilenMenu aktionen={[{ label: 'Entfernen', gefahr: true, onClick: () => installation.remove(i) }]} />
          </div>
          <div className="on-felder on-felder-3">
            <Feld label="Betrag CHF" zahl value={row.unit_price} onChange={v => installation.update(i, { unit_price: v })} />
          </div>
        </div>
      ))}

      {extraCharges.rows.map((row, i) => (
        <div key={`z${i}`} className="on-karte">
          <div className="on-karte-kopf">
            <input className="admin-form-input on-karte-haupt" aria-label="Bezeichnung" placeholder="Bezeichnung"
              value={row.description} onChange={e => extraCharges.update(i, { description: e.target.value })} />
            <Marke>Sonderaufwand</Marke>
            <ZeilenMenu aktionen={[{ label: 'Entfernen', gefahr: true, onClick: () => extraCharges.remove(i) }]} />
          </div>
          <div className="on-felder on-felder-3">
            <Feld label="Betrag CHF" zahl value={row.total_price} onChange={v => extraCharges.update(i, { total_price: v })} />
          </div>
        </div>
      ))}

      {special.rows.map((row, i) => (
        <div key={`s${i}`} className="on-karte">
          <div className="on-karte-kopf">
            <input className="admin-form-input on-karte-haupt" aria-label="Bezeichnung" placeholder="Bezeichnung"
              value={row.description} onChange={e => special.update(i, { description: e.target.value })} />
            <Marke>Sonderposition</Marke>
            <ZeilenMenu aktionen={[{ label: 'Entfernen', gefahr: true, onClick: () => special.remove(i) }]} />
          </div>
          <div className="on-felder on-felder-3">
            <div className="on-feld">
              <label htmlFor={`on-sonder-art-${i}`}>Preismodell</label>
              <select id={`on-sonder-art-${i}`} className="admin-form-select" value={row.mode}
                onChange={e => special.update(i, { mode: e.target.value as SpecialMode })}>
                <option value="pauschal">Pauschale</option>
                <option value="stunden">Stundenansatz</option>
                <option value="stueck">Stückpreis</option>
              </select>
            </div>
            {row.mode === 'pauschal' ? (
              <Feld label="Betrag CHF" zahl value={row.unit_price} onChange={v => special.update(i, { unit_price: v })} />
            ) : (
              <>
                <Feld label={MENGE_LABEL[row.mode]} zahl value={row.hours} onChange={v => special.update(i, { hours: v })} />
                <Feld label={ANSATZ_LABEL[row.mode]} zahl value={row.unit_price} onChange={v => special.update(i, { unit_price: v })} />
                <Rechenwert label="Total" betrag={sonderTotal(row)} />
              </>
            )}
          </div>
        </div>
      ))}

      <label className={`on-fahrt${hatDistanz ? '' : ' on-fahrt-aus'}`}>
        <input type="checkbox" checked={travel.checked && hatDistanz} disabled={!hatDistanz}
          onChange={e => travel.onChange(e.target.checked)} />
        <span>
          Fahrspesen
          {hatDistanz
            ? <> ({travel.distanceKm} km) <span className="on-zahl">{fmtCHF(travel.amount)}</span></>
            : <span className="on-leise"> — Distanz beim Projekt fehlt, bitte zuerst dort eintragen</span>}
        </span>
      </label>

      <div className="on-knoepfe">
        {master.installationTemplates.map(tpl => (
          <button key={`it${tpl.id}`} type="button" className="admin-btn admin-btn-secondary admin-btn-sm" title={tpl.notes ?? undefined}
            onClick={() => installation.add({ description: tpl.label, unit_price: String(tpl.default_fee) })}>
            + {tpl.label} ({fmtCHF(tpl.default_fee)})
          </button>
        ))}
        {master.specialEnabled && master.specialTemplates.map(tpl => (
          <button key={`st${tpl.id}`} type="button" className="admin-btn admin-btn-secondary admin-btn-sm" title={tpl.notes ?? undefined}
            onClick={() => special.add({
              description: tpl.label, mode: tpl.pricing_mode, unit_price: String(tpl.default_fee),
              hours: tpl.default_hours != null ? String(tpl.default_hours) : '',
            })}>
            + {tpl.label}
          </button>
        ))}
        <button type="button" className="admin-btn admin-btn-secondary admin-btn-sm"
          onClick={() => installation.add({ description: '', unit_price: '' })}>+ Montage</button>
        <button type="button" className="admin-btn admin-btn-secondary admin-btn-sm"
          onClick={() => extraCharges.add({ description: '', total_price: '' })}>+ Sonderaufwand</button>
        {master.specialEnabled && (
          <button type="button" className="admin-btn admin-btn-secondary admin-btn-sm"
            onClick={() => special.add({ description: '', mode: 'pauschal', unit_price: '', hours: '' })}>+ Sonderposition</button>
        )}
      </div>
    </section>
  )
}
