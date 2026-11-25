// Reiter «Gruppen» der Ferienplanung (Spec §4.3): dynamisch nach Funktion,
// Projektleiter oder App-Rolle — pflegen sich selbst — oder von Hand (Stellvertretung).
// «Führungskräfte» = alle Admin-App-Rollen (Entscheid E3).
import { useState } from 'react'
import { fehlerText, type FerienGruppe, type FerienStammdaten } from '../../api/admin/ferienplanung'
import { ToastHost, useToast } from '../components/useToast'
import { loeschen, speichern } from './useFerienStammdaten'

type GruppenArt = 'funktion' | 'projektleiter' | 'app_rolle' | 'manuell'

const ARTEN: { key: GruppenArt; text: string }[] = [
  { key: 'funktion', text: 'Nach Funktion' },
  { key: 'projektleiter', text: 'Alle Projektleiter' },
  { key: 'app_rolle', text: 'Nach App-Rolle' },
  { key: 'manuell', text: 'Von Hand' },
]

const ROLLEN: { key: string; text: string }[] = [
  { key: 'admin', text: 'Admin' },
  { key: 'management_light', text: 'Management light' },
  { key: 'management', text: 'Management' },
  { key: 'superadmin', text: 'Superadmin' },
  { key: 'user', text: 'Mitarbeiter' },
  { key: 'user_light', text: 'Mitarbeiter light' },
]

/** Vorlage «Führungskräfte»: alle Admin-App-Rollen (Entscheid E3). */
export const FUEHRUNGSKRAEFTE = { name: 'Führungskräfte', art: 'app_rolle' as const,
  kriterium: ['admin', 'management_light', 'management', 'superadmin'] }

interface Eingabe { name: string; art: GruppenArt; kriterium: string[]; mitglieder: string[] }

function Auswahl({ werte, gewaehlt, onChange, label }: {
  werte: { key: string; text: string }[]; gewaehlt: string[]; onChange: (w: string[]) => void; label: string
}) {
  return (
    <div className="ferien-auswahl" aria-label={label}>
      {werte.map(w => (
        <label key={w.key}>
          <input type="checkbox" checked={gewaehlt.includes(w.key)}
            onChange={e => onChange(e.target.checked ? [...gewaehlt, w.key] : gewaehlt.filter(x => x !== w.key))} />
          {' '}{w.text}
        </label>
      ))}
    </div>
  )
}

export function GruppenTab({ daten, darfPflegen }: { daten: FerienStammdaten; darfPflegen: boolean }) {
  const { toast, showToast } = useToast()
  const [eingabe, setEingabe] = useState<Eingabe | null>(null)
  const [bearbeitet, setBearbeitet] = useState<string | undefined>()
  const personName = (id: string) => daten.personen.find(p => p.id === id)?.name ?? '?'
  const setze = (teil: Partial<Eingabe>) => setEingabe(e => (e ? { ...e, ...teil } : e))

  function oeffnen(g?: FerienGruppe) {
    setBearbeitet(g?.id)
    setEingabe(g ? { name: g.name, art: g.art as GruppenArt, kriterium: g.kriterium, mitglieder: g.mitglieder }
      : { name: '', art: 'funktion', kriterium: [], mitglieder: [] })
  }

  async function sichern() {
    if (!eingabe) return
    try {
      await speichern('gruppen', { name: eingabe.name.trim(), art: eingabe.art, kriterium: eingabe.kriterium, status: 'aktiv' },
        bearbeitet, eingabe.art === 'manuell' ? eingabe.mitglieder : undefined)
      setEingabe(null)
      showToast('Gruppe gespeichert')
    } catch (err) {
      showToast(fehlerText(err), 'error')
    }
  }

  async function weg(g: FerienGruppe) {
    try {
      await loeschen('gruppen', g.id)
      showToast('Gruppe gelöscht')
    } catch (err) {
      showToast(fehlerText(err), 'error')
    }
  }

  return (
    <div className="admin-table-wrap ferien-panel">
      {daten.gruppen.length === 0 && <p className="admin-empty">Noch keine Gruppe.</p>}
      {daten.gruppen.map(g => (
        <div key={g.id} className="ferien-liste-zeile" data-testid="ferien-gruppe">
          <span className="ferien-liste-titel">{g.name}</span>
          <span className="ferien-liste-meta">
            {ARTEN.find(a => a.key === g.art)?.text ?? g.art} · {g.mitglieder.length} Personen
            {g.mitglieder.length > 0 && `: ${g.mitglieder.slice(0, 6).map(personName).join(', ')}${g.mitglieder.length > 6 ? ' …' : ''}`}
          </span>
          {darfPflegen && (
            <>
              <button className="admin-btn admin-btn-secondary admin-btn-sm" onClick={() => oeffnen(g)}>Bearbeiten</button>
              <button className="admin-btn admin-btn-danger admin-btn-sm" onClick={() => void weg(g)}>Löschen</button>
            </>
          )}
        </div>
      ))}

      {darfPflegen && !eingabe && (
        <div className="ferien-vorlagen" style={{ marginTop: 12 }}>
          <button className="admin-btn admin-btn-primary admin-btn-sm" onClick={() => oeffnen()}>Neue Gruppe</button>
          {!daten.gruppen.some(g => g.name === FUEHRUNGSKRAEFTE.name) && (
            <button className="admin-btn admin-btn-secondary admin-btn-sm"
              onClick={() => { setBearbeitet(undefined); setEingabe({ ...FUEHRUNGSKRAEFTE, mitglieder: [] }) }}>
              Vorlage: Führungskräfte
            </button>
          )}
        </div>
      )}

      {eingabe && (
        <div className="ferien-panel" aria-label="Gruppe bearbeiten">
          <div className="ferien-formular">
            <label className="admin-form-group">
              <span className="admin-form-label">Name</span>
              <input className="admin-form-input" aria-label="Name der Gruppe" value={eingabe.name}
                onChange={e => setze({ name: e.target.value })} />
            </label>
            <label className="admin-form-group">
              <span className="admin-form-label">Wer gehört dazu</span>
              <select className="admin-form-select" aria-label="Art der Gruppe" value={eingabe.art}
                onChange={e => setze({ art: e.target.value as GruppenArt, kriterium: [] })}>
                {ARTEN.map(a => <option key={a.key} value={a.key}>{a.text}</option>)}
              </select>
            </label>
          </div>
          {eingabe.art === 'funktion' && (
            <Auswahl label="Funktionen" werte={daten.funktionen.map(f => ({ key: f, text: f }))}
              gewaehlt={eingabe.kriterium} onChange={kriterium => setze({ kriterium })} />
          )}
          {eingabe.art === 'app_rolle' && (
            <Auswahl label="Rollen" werte={ROLLEN} gewaehlt={eingabe.kriterium} onChange={kriterium => setze({ kriterium })} />
          )}
          {eingabe.art === 'manuell' && (
            <Auswahl label="Personen" werte={daten.personen.map(p => ({ key: p.id, text: p.name }))}
              gewaehlt={eingabe.mitglieder} onChange={mitglieder => setze({ mitglieder })} />
          )}
          <div className="ferien-panel-aktionen">
            <button className="admin-btn admin-btn-primary" onClick={() => void sichern()}>Speichern</button>
            <button className="admin-btn admin-btn-secondary" onClick={() => setEingabe(null)}>Abbrechen</button>
          </div>
        </div>
      )}
      <ToastHost toast={toast} />
    </div>
  )
}
