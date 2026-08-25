import { useEffect, useState } from 'react'
import {
  StaffRole, getStaffRoles, upsertStaffRole, deleteStaffRole, reorderStaffRoles,
} from '../../api/admin'
import { useToast, ToastHost } from '../components/useToast'
import { useTabStrip } from '../hooks/useTabStrip'

// "Personal"-Screen: Tab-Layout analog zum Material-Screen. Vorerst nur der Tab
// "Stundensätze" (die früheren "Funktionen"). Weitere Tabs können hier andocken.
type PersonalTab = 'rates'

export default function StaffRolesScreen() {
  const [tab, setTab] = useState<PersonalTab>('rates')
  const tabsRef = useTabStrip(tab)

  return (
    <div className="admin-page">
      <div className="kpi-admin-tabs" ref={tabsRef} style={{ marginBottom: 20 }}>
        <button
          className={`kpi-admin-tab${tab === 'rates' ? ' active' : ''}`}
          onClick={() => setTab('rates')}
        >
          Stundensätze
        </button>
      </div>

      {tab === 'rates' && <StaffRatesPanel />}
    </div>
  )
}

function StaffRatesPanel() {
  const [roles, setRoles] = useState<StaffRole[]>([])
  const [loading, setLoading] = useState(true)
  // Pro Funktion der aktuell im Eingabefeld stehende Satz (als String, damit man frei tippen kann)
  const [drafts, setDrafts] = useState<Record<string, string>>({})
  // Dasselbe für den optionalen Werkstatt-Satz. Leer = kein eigener Tarif → es gilt
  // der Baustellensatz (der Server speichert dann NULL).
  const [werkstattDrafts, setWerkstattDrafts] = useState<Record<string, string>>({})
  const [savingName, setSavingName] = useState<string | null>(null)
  const [deletingName, setDeletingName] = useState<string | null>(null)
  const [savingOrder, setSavingOrder] = useState(false)
  const [error, setError] = useState('')
  const { toast, showToast } = useToast()

  const [newName, setNewName] = useState('')
  const [newRate, setNewRate] = useState('')
  const [newWerkstattRate, setNewWerkstattRate] = useState('')

  async function load() {
    setLoading(true)
    try {
      const data = await getStaffRoles()
      setRoles(data)
      setDrafts(Object.fromEntries(data.map(r => [r.name, String(r.hourly_rate ?? '')])))
      setWerkstattDrafts(Object.fromEntries(
        data.map(r => [r.name, r.hourly_rate_werkstatt == null ? '' : String(r.hourly_rate_werkstatt)]),
      ))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [])

  function parseRate(v: string): number | null {
    const n = parseFloat(v.replace(',', '.'))
    return Number.isFinite(n) && n >= 0 ? n : null
  }

  // Leeres Feld = bewusst kein eigener Werkstatt-Satz (null). Alles andere muss
  // eine Zahl ≥ 0 sein; `undefined` signalisiert hier «ungültig».
  function parseOptionalRate(v: string): number | null | undefined {
    if (v.trim() === '') return null
    const n = parseRate(v)
    return n === null ? undefined : n
  }

  async function saveRole(name: string) {
    const rate = parseRate(drafts[name] ?? '')
    if (rate === null) {
      setError(`Ungültiger Satz für "${name}" — bitte eine Zahl ≥ 0 eingeben.`)
      return
    }
    const werkstattRate = parseOptionalRate(werkstattDrafts[name] ?? '')
    if (werkstattRate === undefined) {
      setError(`Ungültiger Werkstatt-Satz für "${name}" — Zahl ≥ 0 oder leer lassen.`)
      return
    }
    setError('')
    setSavingName(name)
    try {
      await upsertStaffRole(name, rate, werkstattRate)
      showToast(`Stundensatz für "${name}" gespeichert`)
      await load()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Fehler beim Speichern')
    } finally {
      setSavingName(null)
    }
  }

  async function addRole(e: React.FormEvent) {
    e.preventDefault()
    const name = newName.trim()
    const rate = parseRate(newRate)
    const werkstattRate = parseOptionalRate(newWerkstattRate)
    if (!name) { setError('Bitte einen Funktionsnamen eingeben.'); return }
    if (rate === null) { setError('Bitte einen gültigen Stundensatz eingeben.'); return }
    if (werkstattRate === undefined) {
      setError('Ungültiger Werkstatt-Satz — Zahl ≥ 0 oder leer lassen.'); return
    }
    if (roles.some(r => r.name.toLowerCase() === name.toLowerCase())) {
      setError(`Funktion "${name}" existiert bereits.`); return
    }
    setError('')
    setSavingName('__new__')
    try {
      await upsertStaffRole(name, rate, werkstattRate)
      showToast(`Funktion "${name}" angelegt`)
      setNewName('')
      setNewRate('')
      setNewWerkstattRate('')
      await load()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Fehler beim Anlegen')
    } finally {
      setSavingName(null)
    }
  }

  async function removeRole(name: string) {
    if (!window.confirm(
      `Funktion "${name}" wirklich löschen?\n\n` +
      'Sie verschwindet aus der Auswahl in Offerten. Bestehende Mitarbeiter und ' +
      'Offerten bleiben unverändert.'
    )) return
    setError('')
    setDeletingName(name)
    try {
      await deleteStaffRole(name)
      showToast(`Funktion "${name}" gelöscht`)
      await load()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Fehler beim Löschen')
    } finally {
      setDeletingName(null)
    }
  }

  // Rang ändern: Zeile mit ihrer Nachbarin tauschen, sofort optimistisch anzeigen
  // und die neue Reihenfolge persistieren. Bei Fehler serverseitigen Stand laden.
  async function moveRole(index: number, dir: -1 | 1) {
    const j = index + dir
    if (j < 0 || j >= roles.length || savingOrder) return
    const next = [...roles]
    ;[next[index], next[j]] = [next[j], next[index]]
    setRoles(next)
    setError('')
    setSavingOrder(true)
    try {
      await reorderStaffRoles(next.map(r => r.name))
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Reihenfolge konnte nicht gespeichert werden')
      await load()
    } finally {
      setSavingOrder(false)
    }
  }

  const busy = savingOrder || deletingName !== null

  return (
    <>
      <div className="admin-page-header">
        <div>
          <div className="admin-page-title">Personal</div>
          <div className="admin-page-subtitle">
            Stundensätze pro Funktion — werden in Offerten als Lohnpositionen und bei der
            Verrechnung der Rapportstunden verwendet. Der Werkstatt-Satz gilt für Stunden,
            die im Rapport als «Werkstatt» erfasst sind; bleibt er leer, zählt der Baustellensatz.
          </div>
        </div>
      </div>

      {error && <div className="admin-form-error" style={{ marginBottom: 16 }}>{error}</div>}

      <div className="admin-table-wrap">
        {loading ? (
          <div className="admin-loading"><div className="admin-spinner" /> Laden…</div>
        ) : (
          <table className="admin-table">
            <thead>
              <tr>
                <th style={{ width: 64 }}>Rang</th>
                <th>Funktion</th>
                <th style={{ width: 180 }}>Baustelle (CHF/h)</th>
                <th style={{ width: 180 }}>Werkstatt (CHF/h)</th>
                <th style={{ width: 160 }}></th>
              </tr>
            </thead>
            <tbody>
              {roles.length === 0 ? (
                <tr><td colSpan={5} className="admin-table-empty">Noch keine Funktionen vorhanden.</td></tr>
              ) : roles.map((r, i) => {
                const savedWerkstatt = r.hourly_rate_werkstatt == null ? '' : String(r.hourly_rate_werkstatt)
                const changed = (drafts[r.name] ?? '') !== String(r.hourly_rate ?? '')
                  || (werkstattDrafts[r.name] ?? '') !== savedWerkstatt
                return (
                  <tr key={r.name}>
                    <td>
                      <div style={{ display: 'inline-flex', gap: 4 }}>
                        <button
                          className="admin-btn-icon"
                          title="Nach oben"
                          aria-label={`"${r.name}" nach oben`}
                          onClick={() => moveRole(i, -1)}
                          disabled={i === 0 || busy}
                        >↑</button>
                        <button
                          className="admin-btn-icon"
                          title="Nach unten"
                          aria-label={`"${r.name}" nach unten`}
                          onClick={() => moveRole(i, 1)}
                          disabled={i === roles.length - 1 || busy}
                        >↓</button>
                      </div>
                    </td>
                    <td><strong>{r.name}</strong></td>
                    <td>
                      <input
                        className="admin-form-input"
                        style={{ maxWidth: 160 }}
                        value={drafts[r.name] ?? ''}
                        onChange={e => setDrafts(prev => ({ ...prev, [r.name]: e.target.value }))}
                        placeholder="z.B. 121.00"
                        inputMode="decimal"
                        aria-label={`Baustellen-Stundensatz ${r.name}`}
                      />
                    </td>
                    <td>
                      <input
                        className="admin-form-input"
                        style={{ maxWidth: 160 }}
                        value={werkstattDrafts[r.name] ?? ''}
                        onChange={e => setWerkstattDrafts(prev => ({ ...prev, [r.name]: e.target.value }))}
                        placeholder="wie Baustelle"
                        inputMode="decimal"
                        aria-label={`Werkstatt-Stundensatz ${r.name}`}
                      />
                    </td>
                    <td style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
                      <button
                        className="admin-btn admin-btn-primary admin-btn-sm"
                        onClick={() => saveRole(r.name)}
                        disabled={!changed || savingName === r.name}
                      >
                        {savingName === r.name ? 'Speichern…' : 'Speichern'}
                      </button>
                      <button
                        className="admin-btn admin-btn-danger admin-btn-sm"
                        style={{ marginLeft: 6 }}
                        onClick={() => removeRole(r.name)}
                        disabled={deletingName === r.name || busy}
                        title="Funktion löschen"
                      >
                        {deletingName === r.name ? 'Löschen…' : 'Löschen'}
                      </button>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        )}
      </div>

      <form onSubmit={addRole} style={{ display: 'flex', gap: 8, alignItems: 'flex-end', marginTop: 20, flexWrap: 'wrap' }}>
        <div className="admin-form-group" style={{ margin: 0 }}>
          <label className="admin-form-label">Neue Funktion</label>
          <input
            className="admin-form-input"
            value={newName}
            onChange={e => setNewName(e.target.value)}
            placeholder="z.B. Polier"
          />
        </div>
        <div className="admin-form-group" style={{ margin: 0 }}>
          <label className="admin-form-label">Baustelle (CHF/h)</label>
          <input
            className="admin-form-input"
            style={{ maxWidth: 160 }}
            value={newRate}
            onChange={e => setNewRate(e.target.value)}
            placeholder="z.B. 110.00"
            inputMode="decimal"
          />
        </div>
        <div className="admin-form-group" style={{ margin: 0 }}>
          <label className="admin-form-label">Werkstatt (CHF/h)</label>
          <input
            className="admin-form-input"
            style={{ maxWidth: 160 }}
            value={newWerkstattRate}
            onChange={e => setNewWerkstattRate(e.target.value)}
            placeholder="wie Baustelle"
            inputMode="decimal"
          />
        </div>
        <button className="admin-btn admin-btn-secondary" type="submit" disabled={savingName === '__new__'}>
          {savingName === '__new__' ? 'Anlegen…' : '+ Funktion'}
        </button>
      </form>

      <ToastHost toast={toast} />
    </>
  )
}
