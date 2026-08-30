// Eine Maske für «neue Person im Betrieb» — Konto, Berechtigung, Personaldaten
// und Zugang in einem Formular.
//
// Vorher waren das zwei Masken in zwei Menüpunkten (Benutzerverwaltung legte das
// Konto an, Mitarbeiter die Stammdaten) und für eine neue Funktion noch ein
// dritter (Stammdaten → Funktionen). Der zweite Schritt wurde reihenweise
// vergessen, und das fällt nirgends als Fehler auf: Ohne `funktion` findet die
// Verrechnung keinen Stundensatz und ohne `pensum` rechnet die HR-Auswertung mit
// dem Tenant-Default — beides merkt man erst im Rechnungslauf oder im
// Monatssaldo. Darum geht jetzt alles in einem Request raus
// (services/user_onboarding.py).
//
// Bearbeitet wird weiterhin getrennt (UserDetailScreen / StaffDetailScreen) —
// beim Ändern weiss man, was man sucht; beim Anlegen weiss man es nicht.
import { useEffect, useMemo, useState } from 'react'
import { createUser } from '../../api/admin/users'
import type { CreateUserResult, StaffProfileInput } from '../../api/admin/users'
import { getStaffRoles, upsertStaff, upsertStaffRole } from '../../api/admin/staff'
import type { StaffRole } from '../../api/admin/staff'
import { assignableRoles } from '../system/userRoles'

// Spiegelt services/password_policy.py — verbindlich prüft das Backend.
const MIN_PASSWORD_LENGTH = 12

// Klartext für die Berechtigungen. Die rohen Rollennamen stehen im Backend und in
// der Benutzerliste; in der Anlage-Maske entscheidet der Admin fachlich, nicht
// technisch («Was darf die Person?», nicht «Welcher enum-Wert?»).
const ROLE_LABELS: Record<string, string> = {
  user_light: 'Monteur (eingeschränkt) — nur Stempeln und eigene Rapporte',
  user: 'Monteur — Stempeln, Rapporte, Projekte lesen',
  admin: 'Büro — Projekte, Offerten, Rechnungen, Benutzer anlegen',
  management: 'Geschäftsleitung — zusätzlich Löhne, KPI und Stammdaten',
  superadmin: 'Superadmin — mandantenübergreifend',
}

interface Props {
  // Rolle des eingeloggten Benutzers: begrenzt die vergebbaren Berechtigungen
  // und entscheidet, ob eine neue Funktion gleich hier angelegt werden darf.
  actingRole: string
  // Aus welcher Liste heraus angelegt wird. Nur der Startwert der Login-Frage
  // hängt daran: aus der Benutzerverwaltung will man ein Login, aus der
  // Mitarbeiterliste nicht zwingend (Temporäre stempeln nicht selbst).
  origin?: 'users' | 'staff'
  onClose: () => void
  onSaved: () => void
}

const NEW_FUNCTION = '__new__'

export default function NewPersonScreen({ actingRole, origin = 'users', onClose, onSaved }: Props) {
  const roleOptions = useMemo(() => assignableRoles(actingRole), [actingRole])
  const mayCreateFunction = actingRole === 'management' || actingRole === 'superadmin'

  // Person
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')

  // Zugang
  const [withLogin, setWithLogin] = useState(origin === 'users')
  const [role, setRole] = useState<string>(roleOptions[0] === 'user_light' && roleOptions.includes('user') ? 'user' : (roleOptions[0] ?? 'user'))
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [wantPin, setWantPin] = useState(false)

  // Personaldaten
  const [roles, setRoles] = useState<StaffRole[]>([])
  const [funktion, setFunktion] = useState('')
  const [newFunctionName, setNewFunctionName] = useState('')
  const [newFunctionRate, setNewFunctionRate] = useState('')
  const [kuerzel, setKuerzel] = useState('')
  const [dateOfBirth, setDateOfBirth] = useState('')
  const [pensum, setPensum] = useState('100')
  const [vacationDays, setVacationDays] = useState('')
  const [hourlyRate, setHourlyRate] = useState('')
  const [monthlySalary, setMonthlySalary] = useState('')
  const [rapportpflicht, setRapportpflicht] = useState(true)
  const [projektleiter, setProjektleiter] = useState(false)

  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  // Ergebnis nach dem Anlegen: Benutzername und PIN gibt es nur hier zu sehen —
  // der Benutzername wird automatisch vergeben, der PIN ist einmalig.
  const [result, setResult] = useState<CreateUserResult | null>(null)

  useEffect(() => {
    getStaffRoles().then(setRoles).catch(() => {})
  }, [])

  const creatingFunction = funktion === NEW_FUNCTION
  const funktionValid = !creatingFunction || (newFunctionName.trim() !== '' && newFunctionRate.trim() !== '')
  const passwordValid = password === '' || password.length >= MIN_PASSWORD_LENGTH
  const canSave = name.trim() !== '' && funktionValid && passwordValid && !saving

  function staffProfile(resolvedFunktion: string): StaffProfileInput {
    return {
      kuerzel: kuerzel.trim() || null,
      funktion: resolvedFunktion || null,
      hourly_rate: hourlyRate ? parseFloat(hourlyRate) : null,
      monthly_salary: monthlySalary ? parseFloat(monthlySalary) : null,
      rapportpflicht,
      projektleiter,
      vacation_days_per_year: vacationDays ? parseInt(vacationDays, 10) : null,
      date_of_birth: dateOfBirth || null,
      pensum: pensum ? Math.max(0, Math.min(100, parseInt(pensum, 10))) : 100,
    }
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault()
    if (!canSave) return
    setError('')
    setSaving(true)
    try {
      // Eine neue Funktion muss stehen, bevor der Mitarbeiter darauf zeigt —
      // sonst hätte er eine Funktion ohne Stundensatz und die Verrechnung
      // fände später keinen.
      const resolvedFunktion = creatingFunction ? newFunctionName.trim() : funktion
      if (creatingFunction) {
        await upsertStaffRole(resolvedFunktion, parseFloat(newFunctionRate))
      }

      if (!withLogin) {
        // Ohne Login: nur Stammdaten. Ein Konto lässt sich später jederzeit
        // nachziehen, umgekehrt wäre ein Login ohne Person sinnlos.
        await upsertStaff({
          ...staffProfile(resolvedFunktion),
          name: name.trim(),
          // Explizit: in `StaffMember` sind die beiden Flags nicht nullbar,
          // im optionalen Onboarding-Block schon.
          rapportpflicht,
          projektleiter,
        })
        onSaved()
        return
      }

      const created = await createUser({
        display_name: name.trim(),
        email: email.trim() || null,
        role,
        staff: staffProfile(resolvedFunktion),
        initial_password: password || null,
        generate_pin: wantPin,
      })
      // Nicht sofort schliessen: Benutzername und PIN stehen nur in dieser Antwort.
      setResult(created)
    } catch (err: unknown) {
      setError(err instanceof Error && err.message ? err.message : 'Fehler beim Anlegen')
    } finally {
      setSaving(false)
    }
  }

  if (result) {
    return (
      <div className="admin-page">
        <div className="admin-page-header">
          <div>
            <div className="admin-page-title">{name.trim()} angelegt</div>
            <div className="admin-page-subtitle">Konto, Personaldaten und Zugang</div>
          </div>
        </div>
        <div className="admin-table-wrap" style={{ padding: 24, maxWidth: 560 }}>
          <div className="admin-section-title">Zugangsdaten</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginTop: 12 }}>
            <div>
              <div className="admin-form-label">Benutzername</div>
              <div style={{ fontFamily: 'var(--mono)', fontSize: 16 }}>{result.username || '—'}</div>
              <div className="admin-form-hint">Wird automatisch vergeben und für den Login gebraucht.</div>
            </div>
            {result.pin && (
              <div>
                <div className="admin-form-label">Zugangs-PIN</div>
                <div style={{ fontFamily: 'var(--mono)', fontSize: 24, letterSpacing: 2 }}>{result.pin}</div>
                <div className="admin-form-hint">
                  Einmalig — für die Passkey-Einrichtung auf dem Gerät. Jetzt notieren,
                  er lässt sich später nicht mehr anzeigen (nur neu erzeugen).
                </div>
              </div>
            )}
            {result.warnings?.length > 0 && (
              <div className="admin-form-error">
                <strong>Teilweise nicht gespeichert:</strong>
                <ul style={{ margin: '6px 0 0', paddingLeft: 18 }}>
                  {result.warnings.map(w => <li key={w.code}>{w.message}</li>)}
                </ul>
              </div>
            )}
          </div>
          <div style={{ marginTop: 20, display: 'flex', justifyContent: 'flex-end' }}>
            <button className="admin-btn admin-btn-primary" onClick={onSaved}>Fertig</button>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="admin-page">
      <div className="admin-page-header">
        <div>
          <div className="admin-page-title">Neue Person</div>
          <div className="admin-page-subtitle">Konto, Personaldaten und Zugang in einem Schritt</div>
        </div>
        <button className="admin-btn admin-btn-secondary" onClick={onClose}>← Zurück</button>
      </div>

      <form onSubmit={handleSave} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        {error && <div className="admin-form-error">{error}</div>}

        {/* 1. Person */}
        <div className="admin-table-wrap" style={{ padding: 24 }}>
          <div className="admin-section-title">Person</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14, marginTop: 12 }}>
            <div className="admin-form-row">
              <div className="admin-form-group">
                <label className="admin-form-label" htmlFor="np-name">Name *</label>
                <input
                  id="np-name"
                  className="admin-form-input"
                  value={name}
                  onChange={e => setName(e.target.value)}
                  placeholder="Max Muster"
                  required
                />
                <div className="admin-form-hint">Gilt für Konto und Mitarbeiter — beide tragen denselben Namen.</div>
              </div>
              <div className="admin-form-group">
                <label className="admin-form-label" htmlFor="np-kuerzel">Kürzel</label>
                <input
                  id="np-kuerzel"
                  className="admin-form-input"
                  value={kuerzel}
                  onChange={e => setKuerzel(e.target.value)}
                  placeholder="z. B. MM"
                  maxLength={5}
                />
              </div>
            </div>
            <div className="admin-form-group">
              <label className="admin-form-label" htmlFor="np-email">E-Mail</label>
              <input
                id="np-email"
                className="admin-form-input"
                type="email"
                value={email}
                onChange={e => setEmail(e.target.value)}
                placeholder="max@firma.ch (optional)"
              />
              <div className="admin-form-hint">Optional. Nur für Benachrichtigungen — der Login läuft über den Benutzernamen.</div>
            </div>
          </div>
        </div>

        {/* 2. Personaldaten */}
        <div className="admin-table-wrap" style={{ padding: 24 }}>
          <div className="admin-section-title">Personaldaten</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14, marginTop: 12 }}>
            <div className="admin-form-row">
              <div className="admin-form-group">
                <label className="admin-form-label" htmlFor="np-funktion">Funktion</label>
                <select
                  id="np-funktion"
                  className="admin-form-input"
                  value={funktion}
                  onChange={e => setFunktion(e.target.value)}
                >
                  <option value="">— Bitte wählen —</option>
                  {roles.map(r => <option key={r.name} value={r.name}>{r.name}</option>)}
                  {mayCreateFunction && <option value={NEW_FUNCTION}>+ Neue Funktion anlegen…</option>}
                </select>
                <div className="admin-form-hint">
                  Bestimmt den Verrechnungssatz auf der Rechnung. Ohne Funktion findet die
                  Verrechnung später keinen Stundensatz.
                </div>
              </div>
              <div className="admin-form-group">
                <label className="admin-form-label" htmlFor="np-pensum">Pensum (%)</label>
                <input
                  id="np-pensum"
                  className="admin-form-input"
                  type="number"
                  min="0"
                  max="100"
                  value={pensum}
                  onChange={e => setPensum(e.target.value.replace(/[^0-9]/g, ''))}
                  placeholder="100"
                />
                <div className="admin-form-hint">100 % = Tenant-Soll. Bei 80 % und 40-h-Woche = 32 h Soll.</div>
              </div>
            </div>

            {creatingFunction && (
              <div className="admin-form-row" style={{ paddingLeft: 12, borderLeft: '2px solid var(--border, #ddd)' }}>
                <div className="admin-form-group">
                  <label className="admin-form-label" htmlFor="np-fn-name">Name der Funktion *</label>
                  <input
                    id="np-fn-name"
                    className="admin-form-input"
                    value={newFunctionName}
                    onChange={e => setNewFunctionName(e.target.value)}
                    placeholder="z. B. Sanitärmonteur"
                  />
                </div>
                <div className="admin-form-group">
                  <label className="admin-form-label" htmlFor="np-fn-rate">Verrechnungssatz (CHF/h) *</label>
                  <input
                    id="np-fn-rate"
                    className="admin-form-input"
                    inputMode="decimal"
                    value={newFunctionRate}
                    onChange={e => setNewFunctionRate(e.target.value.replace(/[^0-9.]/g, ''))}
                    placeholder="95.00"
                  />
                  <div className="admin-form-hint">Wird als neue Funktion gespeichert und steht danach allen zur Verfügung.</div>
                </div>
              </div>
            )}

            <div className="admin-form-row">
              <div className="admin-form-group">
                <label className="admin-form-label" htmlFor="np-dob">Geburtsdatum</label>
                <input
                  id="np-dob"
                  className="admin-form-input"
                  type="date"
                  value={dateOfBirth}
                  onChange={e => setDateOfBirth(e.target.value)}
                />
                <div className="admin-form-hint">Für die altersabhängige Ferienregel.</div>
              </div>
              <div className="admin-form-group">
                <label className="admin-form-label" htmlFor="np-vacation">Ferientage / Jahr</label>
                <input
                  id="np-vacation"
                  className="admin-form-input"
                  type="number"
                  min="0"
                  max="60"
                  value={vacationDays}
                  onChange={e => setVacationDays(e.target.value.replace(/[^0-9]/g, ''))}
                  placeholder="Tenant-Default"
                />
                <div className="admin-form-hint">Leer = Standard aus der Konfiguration.</div>
              </div>
            </div>

            <div className="admin-form-row">
              <div className="admin-form-group">
                <label className="admin-form-label" htmlFor="np-hourly">Stundenlohn (CHF)</label>
                <input
                  id="np-hourly"
                  className="admin-form-input"
                  inputMode="decimal"
                  value={hourlyRate}
                  onChange={e => setHourlyRate(e.target.value.replace(/[^0-9.]/g, ''))}
                  placeholder="35.00"
                />
                <div className="admin-form-hint">Interner Lohn für die Kostenrechnung — nicht der Satz auf der Rechnung.</div>
              </div>
              <div className="admin-form-group">
                <label className="admin-form-label" htmlFor="np-monthly">Monatslohn (CHF)</label>
                <input
                  id="np-monthly"
                  className="admin-form-input"
                  inputMode="decimal"
                  value={monthlySalary}
                  onChange={e => setMonthlySalary(e.target.value.replace(/[^0-9.]/g, ''))}
                  placeholder="5500.00"
                />
              </div>
            </div>

            <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
              <input type="checkbox" checked={rapportpflicht} onChange={e => setRapportpflicht(e.target.checked)} />
              <span className="admin-form-label" style={{ margin: 0 }}>Rapportpflicht</span>
            </label>
            <div className="admin-form-hint" style={{ marginTop: -8 }}>
              Aus für Büro und Projektleitung — sonst erscheinen «Fehlender Rapport»-Verstösse.
            </div>

            <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
              <input type="checkbox" checked={projektleiter} onChange={e => setProjektleiter(e.target.checked)} />
              <span className="admin-form-label" style={{ margin: 0 }}>Projektleiter</span>
            </label>
            <div className="admin-form-hint" style={{ marginTop: -8 }}>
              Kann in Projekten als Projektleiter ausgewählt werden.
            </div>
          </div>
        </div>

        {/* 3. Zugang */}
        <div className="admin-table-wrap" style={{ padding: 24 }}>
          <div className="admin-section-title">Zugang zur App</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14, marginTop: 12 }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
              <input type="checkbox" checked={withLogin} onChange={e => setWithLogin(e.target.checked)} />
              <span className="admin-form-label" style={{ margin: 0 }}>Login anlegen</span>
            </label>
            <div className="admin-form-hint" style={{ marginTop: -8 }}>
              Aus lassen für Personen, die nicht selbst stempeln (z. B. Temporäre, deren
              Stunden das Büro erfasst). Ein Konto lässt sich jederzeit nachziehen.
            </div>

            {withLogin && (
              <>
                <div className="admin-form-group">
                  <label className="admin-form-label" htmlFor="np-role">Berechtigung</label>
                  <select
                    id="np-role"
                    className="admin-form-select admin-form-input"
                    value={role}
                    onChange={e => setRole(e.target.value)}
                  >
                    {roleOptions.map(r => <option key={r} value={r}>{ROLE_LABELS[r] ?? r}</option>)}
                  </select>
                  {roleOptions.length <= 2 && (
                    <div className="admin-form-hint">Höhere Berechtigungen vergibt nur die Geschäftsleitung.</div>
                  )}
                </div>

                <div className="admin-form-group">
                  <label className="admin-form-label" htmlFor="np-password">Passwort (optional)</label>
                  <div style={{ position: 'relative' }}>
                    <input
                      id="np-password"
                      className="admin-form-input"
                      type={showPassword ? 'text' : 'password'}
                      value={password}
                      onChange={e => setPassword(e.target.value)}
                      placeholder="leer lassen = nur Passkey-Login"
                      style={{ width: '100%', paddingRight: 84, boxSizing: 'border-box' }}
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(v => !v)}
                      tabIndex={-1}
                      className="admin-btn admin-btn-secondary admin-btn-sm"
                      style={{ position: 'absolute', right: 6, top: '50%', transform: 'translateY(-50%)' }}
                    >
                      {showPassword ? 'Verbergen' : 'Zeigen'}
                    </button>
                  </div>
                  <div className="admin-form-hint">
                    Mindestens {MIN_PASSWORD_LENGTH} Zeichen, keine gängigen Passwörter oder
                    Tastaturreihen, nicht der eigene Name.
                  </div>
                  {password !== '' && password.length < MIN_PASSWORD_LENGTH && (
                    <div className="admin-form-hint" style={{ color: 'var(--danger)' }}>
                      Noch zu kurz — mindestens {MIN_PASSWORD_LENGTH} Zeichen.
                    </div>
                  )}
                </div>

                <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
                  <input type="checkbox" checked={wantPin} onChange={e => setWantPin(e.target.checked)} />
                  <span className="admin-form-label" style={{ margin: 0 }}>Zugangs-PIN erzeugen</span>
                </label>
                <div className="admin-form-hint" style={{ marginTop: -8 }}>
                  Einmal-PIN für die Passkey-Einrichtung auf dem Gerät. Wird nach dem
                  Anlegen einmalig angezeigt.
                </div>
              </>
            )}
          </div>
        </div>

        <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
          <button type="button" className="admin-btn admin-btn-secondary" onClick={onClose}>Abbrechen</button>
          <button type="submit" className="admin-btn admin-btn-primary" disabled={!canSave}>
            {saving ? 'Anlegen…' : 'Anlegen'}
          </button>
        </div>
      </form>
    </div>
  )
}
