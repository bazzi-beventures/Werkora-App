import { useState, useEffect } from 'react'
import { StaffMember, StaffRole, upsertStaff, getStaffRoles } from '../../api/admin'

interface Props {
  member: StaffMember | null
  onClose: () => void
  onSaved: () => void
}

export default function StaffDetailScreen({ member, onClose, onSaved }: Props) {
  const isNew = !member
  const [name, setName] = useState(member?.name ?? '')
  const [kuerzel, setKuerzel] = useState(member?.kuerzel ?? '')
  const [funktion, setFunktion] = useState(member?.funktion ?? '')
  const [hourlyRate, setHourlyRate] = useState(member?.hourly_rate?.toString() ?? '')
  const [monthlySalary, setMonthlySalary] = useState(member?.monthly_salary?.toString() ?? '')
  const [rapportpflicht, setRapportpflicht] = useState<boolean>(member?.rapportpflicht ?? true)
  const [projektleiter, setProjektleiter] = useState<boolean>(member?.projektleiter ?? false)
  const [vacationDays, setVacationDays] = useState(member?.vacation_days_per_year?.toString() ?? '')
  const [dateOfBirth, setDateOfBirth] = useState(member?.date_of_birth ?? '')
  const [pensum, setPensum] = useState(member?.pensum?.toString() ?? '100')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [roles, setRoles] = useState<StaffRole[]>([])

  useEffect(() => {
    getStaffRoles().then(setRoles).catch(() => {})
  }, [])

  async function handleSave(e: React.FormEvent) {
    e.preventDefault()
    if (!name.trim()) return
    setError('')
    setSaving(true)
    try {
      await upsertStaff({
        id: member?.id,
        name: name.trim(),
        kuerzel: kuerzel || undefined,
        funktion: funktion || undefined,
        hourly_rate: hourlyRate ? parseFloat(hourlyRate) : undefined,
        monthly_salary: monthlySalary ? parseFloat(monthlySalary) : undefined,
        rapportpflicht: rapportpflicht,
        projektleiter: projektleiter,
        vacation_days_per_year: vacationDays ? parseInt(vacationDays) : undefined,
        date_of_birth: dateOfBirth || undefined,
        pensum: pensum ? Math.max(0, Math.min(100, parseInt(pensum))) : 100,
      })
      onSaved()
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Fehler beim Speichern')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="admin-page">
      <div className="admin-page-header">
        <div>
          <div className="admin-page-title">{isNew ? 'Neuer Mitarbeiter' : member.name}</div>
          <div className="admin-page-subtitle">{isNew ? 'Mitarbeiter anlegen' : 'Mitarbeiter bearbeiten'}</div>
        </div>
        <button className="admin-btn admin-btn-secondary" onClick={onClose}>← Zurück</button>
      </div>

      <div className="admin-detail-grid">
        {/* Formular */}
        <form onSubmit={handleSave} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div className="admin-table-wrap" style={{ padding: 24 }}>
            <div className="admin-section-title">Stammdaten</div>
            {error && <div className="admin-form-error" style={{ marginBottom: 12 }}>{error}</div>}

            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div className="admin-form-group">
                <label className="admin-form-label">Name *</label>
                <input className="admin-form-input" value={name} onChange={e => setName(e.target.value)} required />
              </div>
              <div className="admin-form-row">
                <div className="admin-form-group">
                  <label className="admin-form-label">Kürzel</label>
                  <input className="admin-form-input" value={kuerzel} onChange={e => setKuerzel(e.target.value)} placeholder="z.B. MA" maxLength={5} />
                </div>
                <div className="admin-form-group">
                  <label className="admin-form-label">Funktion</label>
                  <select className="admin-form-input" value={funktion} onChange={e => setFunktion(e.target.value)}>
                    <option value="">— Bitte wählen —</option>
                    {roles.map(r => (
                      <option key={r.name} value={r.name}>{r.name}</option>
                    ))}
                  </select>
                </div>
              </div>
              <div className="admin-form-row">
                <div className="admin-form-group">
                  <label className="admin-form-label">Geburtsdatum</label>
                  <input
                    className="admin-form-input"
                    type="date"
                    value={dateOfBirth}
                    onChange={e => setDateOfBirth(e.target.value)}
                  />
                  <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 4 }}>
                    Für automatische Altersgrenze bei Ferienanspruch.
                  </div>
                </div>
                <div className="admin-form-group">
                  <label className="admin-form-label">Ferientage / Jahr (Override)</label>
                  <input
                    className="admin-form-input"
                    type="number"
                    min="0"
                    max="60"
                    value={vacationDays}
                    onChange={e => setVacationDays(e.target.value.replace(/[^0-9]/g, ''))}
                    placeholder="Tenant-Default"
                  />
                  <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 4 }}>
                    Leer = Standard aus Konfiguration (ggf. alters-basiert).
                  </div>
                </div>
              </div>
              <div className="admin-form-group">
                <label className="admin-form-label">Pensum (%)</label>
                <input
                  className="admin-form-input"
                  type="number"
                  min="0"
                  max="100"
                  value={pensum}
                  onChange={e => setPensum(e.target.value.replace(/[^0-9]/g, ''))}
                  placeholder="100"
                />
                <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 4 }}>
                  Beschäftigungsgrad. 100% = Vollzeit (Tenant-Soll). Bei 80% und 40h-Woche = 32h Soll (6.4h/Tag).
                </div>
              </div>
              <div className="admin-form-row">
                <div className="admin-form-group">
                  <label className="admin-form-label">Stundenlohn (CHF)</label>
                  <input className="admin-form-input" inputMode="decimal" value={hourlyRate} onChange={e => setHourlyRate(e.target.value.replace(/[^0-9.]/g, ''))} placeholder="35.00" />
                </div>
                <div className="admin-form-group">
                  <label className="admin-form-label">Monatslohn (CHF)</label>
                  <input className="admin-form-input" inputMode="decimal" value={monthlySalary} onChange={e => setMonthlySalary(e.target.value.replace(/[^0-9.]/g, ''))} placeholder="5500.00" />
                </div>
              </div>
              <div className="admin-form-group">
                <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
                  <input
                    type="checkbox"
                    checked={rapportpflicht}
                    onChange={e => setRapportpflicht(e.target.checked)}
                  />
                  <span className="admin-form-label" style={{ margin: 0 }}>Rapportpflicht</span>
                </label>
                <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 4 }}>
                  Wenn deaktiviert, erscheinen keine «Fehlender Rapport»-Verstösse für diesen Mitarbeiter (z.&nbsp;B. Admin, Projektleitung).
                </div>
              </div>
              <div className="admin-form-group">
                <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
                  <input
                    type="checkbox"
                    checked={projektleiter}
                    onChange={e => setProjektleiter(e.target.checked)}
                  />
                  <span className="admin-form-label" style={{ margin: 0 }}>Projektleiter</span>
                </label>
                <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 4 }}>
                  Wenn aktiviert, kann dieser Mitarbeiter in Projekten als Projektleiter ausgewählt werden.
                </div>
              </div>
            </div>

            <div style={{ marginTop: 20, display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
              <button type="button" className="admin-btn admin-btn-secondary" onClick={onClose}>Abbrechen</button>
              <button type="submit" className="admin-btn admin-btn-primary" disabled={saving || !name.trim()}>
                {saving ? 'Speichern…' : 'Speichern'}
              </button>
            </div>
          </div>
        </form>

        {/* Seiteninfo */}
        {!isNew && member?.email && (
          <div className="admin-table-wrap" style={{ padding: 20 }}>
            <div className="admin-section-title">Benutzerkonto</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 8 }}>
              <div style={{ fontSize: 13, color: 'var(--muted)' }}>E-Mail</div>
              <div style={{ fontSize: 13.5 }}>{member.email}</div>
              {member.username && (
                <>
                  <div style={{ fontSize: 13, color: 'var(--muted)', marginTop: 4 }}>Benutzername</div>
                  <div style={{ fontSize: 13.5, fontFamily: 'var(--mono)' }}>{member.username}</div>
                </>
              )}
              <div style={{ fontSize: 13, color: 'var(--muted)', marginTop: 4 }}>Rolle</div>
              <div>
                <span className={`admin-badge ${member.role === 'admin' ? 'admin-badge-admin' : 'admin-badge-active'}`}>
                  {member.role || 'worker'}
                </span>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
