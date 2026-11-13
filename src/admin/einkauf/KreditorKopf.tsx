import type { Supplier } from '../../api/admin/suppliers'
import type { KreditorDetail } from '../../api/kreditoren'
import type { KopfEntwurf } from './kreditorenLogik'

/**
 * Lieferant, Kopf-Felder und Zahlung einer Lieferantenrechnung — Spec §4.3–§4.5.
 *
 * Die Zahlung kommt aus dem QR-Zahlteil und ist dann nicht bearbeitbar (E4:
 * Zahlungsdaten nie aus dem Modell, nie von Hand über einen QR-Code hinweg). Nur
 * ohne QR-Zahlteil lassen sich IBAN und Referenz von Hand erfassen.
 */

interface Props {
  bill: KreditorDetail
  kopf: KopfEntwurf
  onChange: (teil: Partial<KopfEntwurf>) => void
  suppliers: Supplier[]
  editable: boolean
  onNeuerLieferant: () => void
}

const QUELLE: Record<string, string> = {
  uid: 'über die UID',
  iban: 'über die IBAN',
  name: 'über den Namen',
}

function Feld({ label, id, children }: { label: string; id: string; children: React.ReactNode }) {
  return (
    <div className="admin-form-group">
      <label className="admin-form-label" htmlFor={id}>{label}</label>
      {children}
    </div>
  )
}

export default function KreditorKopf({ bill, kopf, onChange, suppliers, editable, onNeuerLieferant }: Props) {
  const v = bill.vorschlag
  const vorschlagName = v.supplier_id ? suppliers.find(s => s.id === v.supplier_id)?.name ?? null : null
  // Der gewählte Lieferant fehlt in der Liste (gerade angelegt, Liste noch alt):
  // als Option trotzdem zeigen, sonst sähe die Auswahl leer aus.
  const gewaehltFehlt = kopf.supplier_id !== '' && !suppliers.some(s => s.id === kopf.supplier_id)
  const sortiert = [...suppliers].sort((a, b) => a.name.localeCompare(b.name, 'de-CH'))
  const ro = !editable

  return (
    <>
      <div className="kred-karte">
        <div className="admin-section-title">Lieferant</div>
        <Feld label="Lieferant" id="kred-supplier">
          <select id="kred-supplier" className="admin-form-input" value={kopf.supplier_id} disabled={ro}
                  onChange={e => onChange({ supplier_id: e.target.value })}>
            <option value="">— nicht zugeordnet</option>
            {gewaehltFehlt && <option value={kopf.supplier_id}>{bill.supplier?.name ?? bill.supplier_name ?? 'Gewählter Lieferant'}</option>}
            {sortiert.map(s => (
              <option key={s.id} value={s.id}>
                {s.name}{s.id === v.supplier_id ? ' — Vorschlag' : ''}
              </option>
            ))}
          </select>
        </Feld>
        {(bill.supplier_name_beleg || bill.supplier_uid_beleg) && (
          <div className="admin-form-hint">
            Auf dem Beleg: {[bill.supplier_name_beleg, bill.supplier_uid_beleg].filter(Boolean).join(' · ')}
          </div>
        )}
        {v.supplier_id && vorschlagName && (
          <div className="kred-vorschlag" data-testid="kred-supplier-vorschlag">
            Vorschlag: <strong>{vorschlagName}</strong>
            {v.supplier_quelle ? ` (erkannt ${QUELLE[v.supplier_quelle] ?? ''})` : ''}
            {kopf.supplier_id !== v.supplier_id && editable && (
              <button type="button" className="admin-btn admin-btn-primary admin-btn-sm" style={{ marginLeft: 8 }}
                      onClick={() => onChange({ supplier_id: v.supplier_id ?? '' })}>
                Übernehmen
              </button>
            )}
          </div>
        )}
        {v.supplier_neu && !kopf.supplier_id && (
          <div className="kred-vorschlag">
            <div>
              Nicht im Lieferantenstamm: <strong>{v.supplier_neu.name}</strong>
              {v.supplier_neu.uid ? ` · ${v.supplier_neu.uid}` : ''}
              {(v.supplier_neu.zip || v.supplier_neu.city) ? ` · ${[v.supplier_neu.zip, v.supplier_neu.city].filter(Boolean).join(' ')}` : ''}
            </div>
            {editable && (
              <button type="button" className="admin-btn admin-btn-primary admin-btn-sm" style={{ marginTop: 6 }}
                      onClick={onNeuerLieferant}>
                Neuen Lieferanten anlegen
              </button>
            )}
          </div>
        )}
      </div>

      <div className="kred-karte">
        <div className="admin-section-title">Rechnung</div>
        <div className="admin-form-row">
          <Feld label="Rechnungsnummer" id="kred-nr">
            <input id="kred-nr" className="admin-form-input" value={kopf.bill_number} disabled={ro}
                   onChange={e => onChange({ bill_number: e.target.value })} />
          </Feld>
          <Feld label="Währung" id="kred-cur">
            <input id="kred-cur" className="admin-form-input" value={kopf.currency} disabled={ro} maxLength={3}
                   onChange={e => onChange({ currency: e.target.value.toUpperCase() })} />
          </Feld>
        </div>
        <div className="admin-form-row">
          <Feld label="Rechnungsdatum" id="kred-datum">
            <input id="kred-datum" type="date" className="admin-form-input" value={kopf.bill_date} disabled={ro}
                   onChange={e => onChange({ bill_date: e.target.value })} />
          </Feld>
          <Feld label="Fällig am" id="kred-faellig">
            <input id="kred-faellig" type="date" className="admin-form-input" value={kopf.due_date} disabled={ro}
                   onChange={e => onChange({ due_date: e.target.value })} />
          </Feld>
        </div>
        <div className="admin-form-row-3 admin-form-row">
          <Feld label="Netto" id="kred-netto">
            <input id="kred-netto" className="admin-form-input kred-num" inputMode="decimal" value={kopf.net_total}
                   disabled={ro} onChange={e => onChange({ net_total: e.target.value })} />
          </Feld>
          <Feld label="MWST" id="kred-mwst">
            <input id="kred-mwst" className="admin-form-input kred-num" inputMode="decimal" value={kopf.vat_total}
                   disabled={ro} onChange={e => onChange({ vat_total: e.target.value })} />
          </Feld>
          <Feld label="Brutto" id="kred-brutto">
            <input id="kred-brutto" className="admin-form-input kred-num" inputMode="decimal" value={kopf.gross_total}
                   disabled={ro} onChange={e => onChange({ gross_total: e.target.value })} />
          </Feld>
        </div>
        <div className="admin-form-row">
          <Feld label="Skonto %" id="kred-skonto">
            <input id="kred-skonto" className="admin-form-input kred-num" inputMode="decimal" value={kopf.skonto_pct}
                   disabled={ro} onChange={e => onChange({ skonto_pct: e.target.value })} />
          </Feld>
          <Feld label="Skonto bis" id="kred-skonto-bis">
            <input id="kred-skonto-bis" type="date" className="admin-form-input" value={kopf.skonto_until}
                   disabled={ro} onChange={e => onChange({ skonto_until: e.target.value })} />
          </Feld>
        </div>
        <label style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: 13.5, cursor: ro ? 'default' : 'pointer' }}>
          <input type="checkbox" checked={kopf.is_credit_note} disabled={ro}
                 onChange={e => onChange({ is_credit_note: e.target.checked })} />
          Gutschrift
        </label>
      </div>

      <div className="kred-karte">
        <div className="admin-section-title">Zahlung</div>
        {bill.payment_source === 'qr' && bill.payment ? (
          <div style={{ fontSize: 13.5 }}>
            <div><span style={{ fontFamily: 'var(--mono)' }}>{bill.payment.iban}</span></div>
            {bill.payment.reference && (
              <div>Referenz: <span style={{ fontFamily: 'var(--mono)' }}>{bill.payment.reference}</span></div>
            )}
            {bill.payment.creditor_name && <div>Empfänger: {bill.payment.creditor_name}</div>}
            <div className="admin-form-hint">aus dem QR-Zahlteil</div>
          </div>
        ) : (
          <>
            {bill.payment_source === 'keine' && (
              <div className="admin-form-hint" style={{ marginBottom: 8 }}>
                Kein QR-Zahlteil gefunden — IBAN und Referenz bei Bedarf von Hand erfassen.
              </div>
            )}
            <div className="admin-form-row">
              <Feld label="IBAN" id="kred-iban">
                <input id="kred-iban" className="admin-form-input" value={kopf.iban} disabled={ro}
                       style={{ fontFamily: 'var(--mono)' }}
                       onChange={e => onChange({ iban: e.target.value })} />
              </Feld>
              <Feld label="Referenz" id="kred-ref">
                <input id="kred-ref" className="admin-form-input" value={kopf.reference} disabled={ro}
                       style={{ fontFamily: 'var(--mono)' }}
                       onChange={e => onChange({ reference: e.target.value })} />
              </Feld>
            </div>
            {bill.payment_source === 'manuell' && <div className="admin-form-hint">von Hand erfasst</div>}
          </>
        )}
      </div>
    </>
  )
}
