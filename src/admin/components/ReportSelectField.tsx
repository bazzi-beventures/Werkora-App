// Rapport-Auswahl im Erstellen-Dialog (Spec docs/specs/anzahlung-und-rapportauswahl.md
// §2): welche verrechenbaren Rapporte kommen auf diese Rechnung? Vorbelegt mit allen;
// was nicht angehakt ist, bleibt für eine spätere Rechnung offen. Die Payload-Regel
// liegt in utils/invoiceMode.ts (reportSelectionPayload), hier nur die Darstellung.

import type { BillableReport } from '../../api/admin/invoices'
import { fmtDate } from '../utils/format'

interface Props {
  reports: BillableReport[]
  checked: number[]
  onChange: (ids: number[]) => void
  disabled?: boolean
}

export function ReportSelectField({ reports, checked, onChange, disabled }: Props) {
  const checkedSet = new Set(checked)
  function toggle(id: number) {
    onChange(checkedSet.has(id) ? checked.filter(c => c !== id) : [...checked, id])
  }
  const offen = reports.length - reports.filter(r => checkedSet.has(r.id)).length
  return (
    <fieldset style={{ border: 'none', padding: 0, margin: '0 0 12px' }}>
      <legend className="admin-form-label">Rapporte auf dieser Rechnung</legend>
      <div style={{ maxHeight: 220, overflowY: 'auto' }}>
        {reports.map(r => (
          <label
            key={r.id}
            style={{ display: 'flex', alignItems: 'flex-start', gap: 8, padding: '5px 2px', fontSize: 13, cursor: disabled ? 'default' : 'pointer' }}
          >
            <input
              type="checkbox"
              checked={checkedSet.has(r.id)}
              disabled={disabled}
              onChange={() => toggle(r.id)}
              aria-label={`Rapport vom ${fmtDate(r.report_date)}`}
              style={{ marginTop: 2 }}
            />
            <span style={{ minWidth: 0 }}>
              <span style={{ fontWeight: 600 }}>{fmtDate(r.report_date)}</span>
              {r.created_by && <span style={{ color: 'var(--muted)' }}> · {r.created_by}</span>}
              {r.hours > 0 && <span style={{ color: 'var(--muted)' }}> · {r.hours.toLocaleString('de-CH')} h</span>}
              {r.description && (
                <span style={{ display: 'block', fontSize: 11, color: 'var(--muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {r.description}
                </span>
              )}
            </span>
          </label>
        ))}
      </div>
      {offen > 0 && (
        <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 4 }}>
          {offen === 1 ? '1 Rapport bleibt' : `${offen} Rapporte bleiben`} für eine spätere Rechnung offen.
        </div>
      )}
    </fieldset>
  )
}
