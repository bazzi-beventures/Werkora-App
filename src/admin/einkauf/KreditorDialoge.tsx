import { useState } from 'react'
import { ConfirmDialog } from '../components/ConfirmDialog'
import type { KreditorDetail, KreditorSupplierNeu } from '../../api/kreditoren'
import { fmtBetrag, praefixVorschlag } from './kreditorenLogik'
import { fmtDate } from '../utils/format'

/**
 * Die Rückfragen der Lieferantenrechnung — alle über `ConfirmDialog`, damit kein
 * eigenes Overlay-Markup entsteht (Ratchet confirmOverlay.guard.test.ts).
 */

// ─── Visum ───────────────────────────────────────────────────

/**
 * «Sachlich richtig, darf bezahlt werden» (Spec §4.7). Ist die Zahlungsverbindung
 * neu (E5), steht sie rot oben, und das Visum geht nur mit dem Häkchen, dass sie
 * telefonisch beim Lieferanten bestätigt ist — mit der Nummer aus dem Stamm, nicht
 * mit der auf der Rechnung (die könnte gefälscht sein, wie die IBAN).
 */
export function VisumDialog({ bill, busy, onConfirm, onCancel }: {
  bill: KreditorDetail
  busy: boolean
  onConfirm: (ibanBestaetigt: boolean) => void
  onCancel: () => void
}) {
  const [bestaetigt, setBestaetigt] = useState(false)
  const neu = bill.iban_bestaetigung_noetig
  return (
    <ConfirmDialog
      title="Rechnung visieren"
      message={
        <>
          {bill.supplier_name ?? 'Lieferant unbekannt'}
          {bill.bill_number ? `, Nr. ${bill.bill_number}` : ''} über{' '}
          <strong>{fmtBetrag(bill.gross_total, bill.currency)}</strong>. Mit dem Visum gilt die Rechnung
          als sachlich richtig; ihre Kosten erscheinen in der Nachkalkulation.
        </>
      }
      warning={bill.skonto_pct && bill.skonto_until
        ? `${bill.skonto_pct} % Skonto bis ${fmtDate(bill.skonto_until)}`
        : undefined}
      confirmLabel="Visieren"
      busyLabel="Visieren…"
      busy={busy}
      variant="success"
      confirmDisabled={neu && !bestaetigt}
      onConfirm={() => onConfirm(neu && bestaetigt)}
      onCancel={onCancel}
    >
      {neu && (
        <div className="kred-iban-neu" role="alert">
          <strong>Neue Zahlungsverbindung</strong>
          <div className="kred-iban">{bill.payment?.iban ?? '—'}</div>
          <label style={{ display: 'flex', gap: 8, alignItems: 'flex-start', cursor: 'pointer' }}>
            <input type="checkbox" checked={bestaetigt} onChange={e => setBestaetigt(e.target.checked)}
                   style={{ marginTop: 2 }} />
            <span>Kontoverbindung telefonisch beim Lieferanten bestätigt</span>
          </label>
          <div style={{ marginTop: 6 }}>
            Telefonnummer aus dem Lieferantenstamm nehmen, nicht von der Rechnung.
          </div>
        </div>
      )}
    </ConfirmDialog>
  )
}

// ─── Ablehnen ────────────────────────────────────────────────

export function AblehnenDialog({ busy, onConfirm, onCancel }: {
  busy: boolean
  onConfirm: (grund: string) => void
  onCancel: () => void
}) {
  const [grund, setGrund] = useState('')
  return (
    <ConfirmDialog
      title="Rechnung ablehnen"
      message="Die Rechnung ist sachlich falsch und geht zurück an den Lieferanten. Sie bleibt als Beleg erhalten und zählt nicht."
      confirmLabel="Ablehnen"
      busyLabel="Ablehnen…"
      variant="danger"
      busy={busy}
      confirmDisabled={!grund.trim()}
      onConfirm={() => onConfirm(grund.trim())}
      onCancel={onCancel}
    >
      <div className="admin-form-group">
        <label className="admin-form-label" htmlFor="kred-ablehnen-grund">Grund *</label>
        <textarea id="kred-ablehnen-grund" className="admin-form-input" rows={3} value={grund} autoFocus
                  onChange={e => setGrund(e.target.value)}
                  placeholder="z.B. Menge stimmt nicht mit dem Lieferschein überein" />
      </div>
    </ConfirmDialog>
  )
}

// ─── Neuer Lieferant ─────────────────────────────────────────

export interface NeuerLieferant {
  name: string
  prefix: string
  uid: string
  street: string
  zip: string
  city: string
}

function neuerLieferantAus(v: KreditorSupplierNeu): NeuerLieferant {
  return {
    name: v.name,
    prefix: praefixVorschlag(v.name),
    uid: v.uid ?? '',
    street: v.street ?? '',
    zip: v.zip ?? '',
    city: v.city ?? '',
  }
}

/**
 * Lieferant aus den gelesenen Daten anlegen (Spec §4.4: «Neuen Lieferanten
 * anlegen» mit den gelesenen Daten). Vorbefüllt, aber geprüft vom Menschen —
 * angelegt wird erst mit dem Knopf.
 */
export function NeuerLieferantDialog({ vorschlag, busy, fehler, onConfirm, onCancel }: {
  vorschlag: KreditorSupplierNeu
  busy: boolean
  fehler: string | null
  onConfirm: (l: NeuerLieferant) => void
  onCancel: () => void
}) {
  const [form, setForm] = useState<NeuerLieferant>(() => neuerLieferantAus(vorschlag))
  const set = (k: keyof NeuerLieferant, v: string) => setForm(f => ({ ...f, [k]: v }))
  const gueltig = form.name.trim() !== '' && form.prefix.trim().length === 3
  return (
    <ConfirmDialog
      title="Neuen Lieferanten anlegen"
      message="Aus der Rechnung gelesen — bitte prüfen. Das Präfix (3 Zeichen) geht in die Artikelnummern ein."
      warning={fehler ?? undefined}
      confirmLabel="Anlegen"
      busyLabel="Anlegen…"
      busy={busy}
      confirmDisabled={!gueltig}
      scrollable
      onConfirm={() => onConfirm({ ...form, prefix: form.prefix.trim().toUpperCase() })}
      onCancel={onCancel}
    >
      <div className="admin-form-group">
        <label className="admin-form-label" htmlFor="kred-nl-name">Name *</label>
        <input id="kred-nl-name" className="admin-form-input" value={form.name}
               onChange={e => set('name', e.target.value)} />
      </div>
      <div className="admin-form-row">
        <div className="admin-form-group">
          <label className="admin-form-label" htmlFor="kred-nl-prefix">Präfix * (3 Zeichen)</label>
          <input id="kred-nl-prefix" className="admin-form-input" value={form.prefix} maxLength={3}
                 onChange={e => set('prefix', e.target.value.toUpperCase().slice(0, 3))} />
        </div>
        <div className="admin-form-group">
          <label className="admin-form-label" htmlFor="kred-nl-uid">UID</label>
          <input id="kred-nl-uid" className="admin-form-input" value={form.uid} placeholder="CHE-123.456.789"
                 onChange={e => set('uid', e.target.value)} />
        </div>
      </div>
      <div className="admin-form-group">
        <label className="admin-form-label" htmlFor="kred-nl-street">Strasse</label>
        <input id="kred-nl-street" className="admin-form-input" value={form.street}
               onChange={e => set('street', e.target.value)} />
      </div>
      <div className="admin-form-row admin-form-row-label">
        <div className="admin-form-group">
          <label className="admin-form-label" htmlFor="kred-nl-zip">PLZ</label>
          <input id="kred-nl-zip" className="admin-form-input" value={form.zip}
                 onChange={e => set('zip', e.target.value)} />
        </div>
        <div className="admin-form-group">
          <label className="admin-form-label" htmlFor="kred-nl-city">Ort</label>
          <input id="kred-nl-city" className="admin-form-input" value={form.city}
                 onChange={e => set('city', e.target.value)} />
        </div>
      </div>
    </ConfirmDialog>
  )
}
