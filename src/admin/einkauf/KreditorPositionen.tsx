import { useId } from 'react'
import type { CompactProject, KreditorBucket, KreditorDetail } from '../../api/kreditoren'
import KreditorProjektWahl from './KreditorProjektWahl'
import {
  BUCKET_LABELS, fmtBetrag, leereZeile, parseZahl, projektText, pruefeSumme, type ZeilenEntwurf,
} from './kreditorenLogik'

/**
 * Kontierung der Lieferantenrechnung — Spec §4.4/§4.6: je Position Konto, Ziel
 * (Projekt, Lager, Gemeinkosten) und bei «Projekt» das Projekt. Sammelrechnungen
 * über mehrere Kommissionen werden hier aufgeteilt.
 *
 * Am Handy nur lesend (Spec §8.1: «die Aufteilung von Sammelrechnungen ist
 * Desktop») — der Projektleiter visiert unterwegs, er kontiert nicht.
 */

interface Props {
  bill: KreditorDetail
  zeilen: ZeilenEntwurf[]
  onChange: (next: ZeilenEntwurf[]) => void
  /** Netto laut Kopf (Formularstand), für die Summenprüfung. */
  netto: number | null
  editable: boolean
  isMobile: boolean
}

export default function KreditorPositionen({ bill, zeilen, onChange, netto, editable, isMobile }: Props) {
  const kontenId = useId()
  const pruefung = pruefeSumme(zeilen.map(z => parseZahl(z.net_amount)), netto)
  const kandidaten = bill.vorschlag.projekt_kandidaten
  const bearbeitbar = editable && !isMobile

  function setze(i: number, teil: Partial<ZeilenEntwurf>) {
    onChange(zeilen.map((z, j) => (j === i ? { ...z, ...teil } : z)))
  }

  function alleAufProjekt(p: CompactProject) {
    onChange(zeilen.map(z => ({ ...z, bucket: 'projekt', project: p })))
  }

  const summe = (
    <div className="kred-summe" data-testid="kred-summe">
      <span>Positionen: <strong>{fmtBetrag(pruefung.summe, bill.currency)}</strong></span>
      {pruefung.netto !== null && (
        <span>Netto laut Beleg: <strong>{fmtBetrag(pruefung.netto, bill.currency)}</strong></span>
      )}
      {pruefung.differenz !== null && (
        pruefung.stimmt
          ? <span className="stimmt">stimmt überein</span>
          : <span className="abweichung" role="status">Differenz {fmtBetrag(pruefung.differenz, bill.currency)} — Zeile übersehen?</span>
      )}
    </div>
  )

  if (!bearbeitbar) {
    return (
      <div>
        {editable && isMobile && (
          <div className="admin-form-hint" style={{ marginBottom: 8 }}>
            Positionen und Kontierung lassen sich am Computer bearbeiten.
          </div>
        )}
        {zeilen.length === 0 ? (
          <div className="admin-form-hint">Keine Positionen.</div>
        ) : (
          <div className="kred-zeilen-scroll">
            <table className="kred-zeilen">
              <thead>
                <tr><th>Text</th><th className="kred-num">Netto</th><th>Konto</th><th>Ziel</th></tr>
              </thead>
              <tbody>
                {zeilen.map(z => (
                  <tr key={z.key}>
                    <td>{z.text || '—'}</td>
                    <td className="kred-num">{fmtBetrag(parseZahl(z.net_amount), bill.currency)}</td>
                    <td>{z.account_no || '—'}</td>
                    <td>{z.bucket === 'projekt' ? (z.project ? projektText(z.project) : 'Projekt —') : BUCKET_LABELS[z.bucket]}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {summe}
      </div>
    )
  }

  return (
    <div>
      {kandidaten.length > 0 && zeilen.length > 0 && (
        <div className="kred-aktionen" style={{ marginBottom: 8 }}>
          <span className="admin-form-hint" style={{ margin: 0 }}>Alle Positionen auf:</span>
          {kandidaten.map(p => (
            <button key={p.project_id} type="button" className="admin-btn admin-btn-secondary admin-btn-sm"
                    onClick={() => alleAufProjekt(p)}>
              {projektText(p)}
            </button>
          ))}
        </div>
      )}
      <datalist id={kontenId}>
        {bill.konten.map(k => <option key={k.nr} value={k.nr}>{k.name}</option>)}
      </datalist>
      <div className="kred-zeilen-scroll">
        <table className="kred-zeilen">
          <thead>
            <tr>
              <th style={{ minWidth: 160 }}>Text</th>
              <th style={{ width: 100 }}>Netto</th>
              <th style={{ width: 80 }}>MWST</th>
              <th style={{ width: 90 }}>Konto</th>
              <th style={{ width: 120 }}>Ziel</th>
              <th style={{ minWidth: 180 }}>Projekt</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {zeilen.map((z, i) => (
              <tr key={z.key}>
                <td>
                  <input className="admin-form-input" value={z.text} aria-label={`Text Zeile ${i + 1}`}
                         onChange={e => setze(i, { text: e.target.value })} />
                </td>
                <td>
                  <input className="admin-form-input kred-num" inputMode="decimal" value={z.net_amount}
                         aria-label={`Netto Zeile ${i + 1}`}
                         onChange={e => setze(i, { net_amount: e.target.value })} />
                </td>
                <td>
                  <select className="admin-form-input" value={z.vat_rate} aria-label={`MWST Zeile ${i + 1}`}
                          onChange={e => setze(i, { vat_rate: e.target.value })}>
                    <option value="">—</option>
                    {/* Ein gelesener Satz ausserhalb der Liste bleibt sichtbar statt still zu verschwinden. */}
                    {z.vat_rate !== '' && !bill.mwst_saetze.map(String).includes(z.vat_rate) && (
                      <option value={z.vat_rate}>{z.vat_rate} %</option>
                    )}
                    {bill.mwst_saetze.map(s => <option key={s} value={String(s)}>{s} %</option>)}
                  </select>
                </td>
                <td>
                  <input className="admin-form-input" list={kontenId} value={z.account_no}
                         aria-label={`Konto Zeile ${i + 1}`} inputMode="numeric"
                         title={bill.konten.find(k => k.nr === z.account_no)?.name}
                         onChange={e => setze(i, { account_no: e.target.value })} />
                </td>
                <td>
                  <select className="admin-form-input" value={z.bucket} aria-label={`Ziel Zeile ${i + 1}`}
                          onChange={e => setze(i, { bucket: e.target.value as KreditorBucket })}>
                    {(Object.keys(BUCKET_LABELS) as KreditorBucket[]).map(b => (
                      <option key={b} value={b}>{BUCKET_LABELS[b]}</option>
                    ))}
                  </select>
                </td>
                <td>
                  {z.bucket === 'projekt'
                    ? <KreditorProjektWahl value={z.project} kandidaten={kandidaten}
                                           onChange={p => setze(i, { project: p })} />
                    : <span style={{ color: 'var(--muted)' }}>—</span>}
                </td>
                <td>
                  <button type="button" className="admin-btn admin-btn-secondary admin-btn-sm"
                          aria-label={`Zeile ${i + 1} entfernen`}
                          onClick={() => onChange(zeilen.filter((_, j) => j !== i))}>✕</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div style={{ marginTop: 8 }}>
        <button type="button" className="admin-btn admin-btn-secondary admin-btn-sm"
                onClick={() => onChange([...zeilen, leereZeile(bill)])}>
          + Zeile
        </button>
      </div>
      {summe}
    </div>
  )
}
