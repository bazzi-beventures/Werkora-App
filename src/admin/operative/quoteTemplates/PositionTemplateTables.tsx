import type { InstallationTpl, SpecialTpl } from '../../../api/admin/quoteTemplates'
import type { Kind } from './types'

// Die beiden Vorlagen-Tabellen des Offert-Panels (Montage- und Sonderpositionen).
// Rein darstellend — Laden, Speichern und der Editor liegen im Panel.
interface Props {
  installation: InstallationTpl[]
  special: SpecialTpl[]
  // Feature 'sonderpositionen': aus = Hinweis statt Ausblenden, damit man die
  // Vorlagen vor dem Aktivieren vorbereiten kann.
  specialFeatureOn: boolean
  onNew: (kind: Kind) => void
  onEditInstallation: (t: InstallationTpl) => void
  onEditSpecial: (t: SpecialTpl) => void
}

export function PositionTemplateTables({
  installation, special, specialFeatureOn, onNew, onEditInstallation, onEditSpecial,
}: Props) {
  return (
    <>
      {/* ── Montagepositionen ── */}
      <div className="admin-page-header" style={{ marginTop: 8 }}>
        <div>
          <div className="admin-page-title" style={{ fontSize: 18 }}>Montagepositionen</div>
          <div className="admin-page-subtitle">Pauschalbeträge für Montageleistungen</div>
        </div>
        <button className="admin-btn admin-btn-primary" onClick={() => onNew('installation')}>+ Neue Montage-Vorlage</button>
      </div>
      <div className="admin-table-wrap">
        <table className="admin-table">
          <thead>
            <tr><th>Bezeichnung</th><th>Betrag</th><th>Notiz</th><th></th></tr>
          </thead>
          <tbody>
            {installation.length === 0 ? (
              <tr><td colSpan={4} className="admin-table-empty">Keine Montage-Vorlagen definiert.</td></tr>
            ) : installation.map(t => (
              <tr key={t.id} onClick={() => onEditInstallation(t)} style={{ cursor: 'pointer' }}>
                <td><strong>{t.label}</strong></td>
                <td style={{ fontWeight: 700 }}>CHF {t.default_fee.toFixed(2)}</td>
                <td style={{ color: 'var(--muted)' }}>{t.notes || '—'}</td>
                <td>
                  <button className="admin-btn admin-btn-secondary admin-btn-sm" onClick={e => { e.stopPropagation(); onEditInstallation(t) }}>Bearbeiten</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* ── Sonderpositionen ── */}
      <div className="admin-page-header" style={{ marginTop: 24 }}>
        <div>
          <div className="admin-page-title" style={{ fontSize: 18 }}>Sonderpositionen (Demontage / Entsorgung)</div>
          <div className="admin-page-subtitle">Pauschale oder Stundenansatz — getrennt von Montage/Material ausgewiesen</div>
        </div>
        <button className="admin-btn admin-btn-primary" onClick={() => onNew('special')}>+ Neue Sonderposition</button>
      </div>
      {!specialFeatureOn && (
        <div className="admin-form-hint" style={{ margin: '0 0 12px' }}>
          Hinweis: Das Feature „Sonderpositionen" ist für diesen Mandanten aktuell deaktiviert — diese Vorlagen
          erscheinen erst im Offerte-Formular, wenn du es unter Konfiguration aktivierst. Du kannst sie hier
          trotzdem schon vorbereiten.
        </div>
      )}
      <div className="admin-table-wrap">
        <table className="admin-table">
          <thead>
            <tr><th>Bezeichnung</th><th>Modus</th><th>Betrag</th><th>Notiz</th><th></th></tr>
          </thead>
          <tbody>
            {special.length === 0 ? (
              <tr><td colSpan={5} className="admin-table-empty">Keine Sonderpositionen definiert.</td></tr>
            ) : special.map(t => (
              <tr key={t.id} onClick={() => onEditSpecial(t)} style={{ cursor: 'pointer' }}>
                <td><strong>{t.label}</strong></td>
                <td style={{ color: 'var(--muted)' }}>{t.pricing_mode === 'stunden' ? 'Stundenansatz' : 'Pauschale'}</td>
                <td style={{ fontWeight: 700 }}>
                  {t.pricing_mode === 'stunden'
                    ? `CHF ${t.default_fee.toFixed(2)}/h${t.default_hours != null ? ` × ${t.default_hours}` : ''}`
                    : `CHF ${t.default_fee.toFixed(2)}`}
                </td>
                <td style={{ color: 'var(--muted)' }}>{t.notes || '—'}</td>
                <td>
                  <button className="admin-btn admin-btn-secondary admin-btn-sm" onClick={e => { e.stopPropagation(); onEditSpecial(t) }}>Bearbeiten</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  )
}
