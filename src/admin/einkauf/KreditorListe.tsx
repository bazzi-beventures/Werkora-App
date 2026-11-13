import type { KreditorSummary } from '../../api/kreditoren'
import { AdminCardList } from '../components/AdminCardList'
import { fmtDate } from '../utils/format'
import { fmtBetrag, leseFehlerLabel, projektText, statusBadgeClass, statusLabel } from './kreditorenLogik'

/**
 * Liste der Lieferantenrechnungen — Tabelle am Desktop, Karten am Handy.
 * Die Marken (Sperre, neue IBAN, Lesen) sagen, wo man genauer hinsehen muss.
 */

function Marken({ b }: { b: KreditorSummary }) {
  return (
    <span className="kred-marken">
      {b.sperre && <span className="kred-marke sperre" title="Gesperrt — siehe Hinweise in der Rechnung">Sperre</span>}
      {b.iban_status === 'neu' && (
        <span className="kred-marke warnung" title="Diese Zahlungsverbindung ist beim Lieferanten noch nicht bekannt">Neue IBAN</span>
      )}
      {b.lese_status === 'laeuft' && <span className="kred-marke" role="status">wird gelesen…</span>}
      {b.lese_status === 'fehler' && (
        <span className="kred-marke warnung" title={leseFehlerLabel(b.lese_fehler)}>nicht gelesen</span>
      )}
      {b.is_credit_note && <span className="kred-marke">Gutschrift</span>}
      {b.skonto_until && b.skonto_pct && (b.status === 'zu_pruefen' || b.status === 'zu_visieren' || b.status === 'neu') && (
        <span className="kred-marke warnung">{b.skonto_pct} % Skonto bis {fmtDate(b.skonto_until)}</span>
      )}
    </span>
  )
}

function Projekte({ b }: { b: KreditorSummary }) {
  if (!b.projekte.length) return <span className="kred-projekte">—</span>
  return <span className="kred-projekte">{b.projekte.map(projektText).join(', ')}</span>
}

const lieferant = (b: KreditorSummary) => b.supplier_name ?? 'Lieferant offen'

export default function KreditorListe({ bills, isMobile, empty, onOpen }: {
  bills: KreditorSummary[]
  isMobile: boolean
  empty: string
  onOpen: (id: string) => void
}) {
  if (isMobile) {
    return (
      <AdminCardList
        items={bills}
        keyFor={b => b.id}
        onItemClick={b => onOpen(b.id)}
        empty={empty}
        renderCard={b => (
          <>
            <div className="admin-card-head">
              <span className="admin-card-title">{lieferant(b)}</span>
              <span className="kred-num" style={{ fontWeight: 600 }}>{fmtBetrag(b.gross_total, b.currency)}</span>
            </div>
            <div className="admin-card-meta">
              {[b.bill_number, b.bill_date ? fmtDate(b.bill_date) : null].filter(Boolean).join(' · ') || '—'}
            </div>
            <div className="admin-card-meta"><Projekte b={b} /></div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, alignItems: 'center', marginTop: 4 }}>
              <span className={statusBadgeClass(b.status)}>{statusLabel(b.status)}</span>
              <Marken b={b} />
            </div>
          </>
        )}
      />
    )
  }

  return (
    <table className="admin-table kred-liste">
      <thead>
        <tr>
          <th>Lieferant</th>
          <th>Nummer</th>
          <th>Datum</th>
          <th className="kred-num">Betrag</th>
          <th>Projekte</th>
          <th>Status</th>
        </tr>
      </thead>
      <tbody>
        {bills.length === 0 ? (
          <tr><td colSpan={6} className="admin-table-empty">{empty}</td></tr>
        ) : bills.map(b => (
          <tr key={b.id} onClick={() => onOpen(b.id)}>
            <td>
              <strong>{lieferant(b)}</strong>
              <div className="admin-form-hint" style={{ margin: 0 }}>
                erfasst {fmtDate(b.erfasst_am)}{b.erfasst_von_name ? ` von ${b.erfasst_von_name}` : ''}
              </div>
            </td>
            <td>{b.bill_number || '—'}</td>
            <td>{fmtDate(b.bill_date)}</td>
            <td className="kred-num">{fmtBetrag(b.gross_total, b.currency)}</td>
            <td><Projekte b={b} /></td>
            <td>
              <span className={statusBadgeClass(b.status)}>{statusLabel(b.status)}</span>{' '}
              <Marken b={b} />
              {b.visiert_von_name && (
                <div className="admin-form-hint" style={{ margin: 0 }}>
                  visiert von {b.visiert_von_name}{b.visiert_am ? `, ${fmtDate(b.visiert_am)}` : ''}
                </div>
              )}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}
