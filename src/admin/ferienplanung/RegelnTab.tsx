// Reiter «Regeln» der Ferienplanung (Spec §4.2, §7.1): Liste mit Satz je Regel und
// eine Maske mit Formulierungshilfe. Pflegen darf nur die Geschäftsleitung; die
// Prüfung (auch «nicht unter zwei Wochen am Stück») macht der Server.
import { useState } from 'react'
import { fehlerText, type FerienRegel, type FerienStammdaten } from '../../api/admin/ferienplanung'
import { ToastHost, useToast } from '../components/useToast'
import {
  FORMULIERUNGEN, LEERE_REGEL, regelDaten, regelEingabe, regelSatz, vorlageAlsRegel, type RegelEingabe,
} from './regelFormular'
import { loeschen, speichern } from './useFerienStammdaten'
import { VorschlagAktionen } from './VorschlagAktionen'

export function RegelnTab({ daten, darfPflegen }: { daten: FerienStammdaten; darfPflegen: boolean }) {
  const { toast, showToast } = useToast()
  const [eingabe, setEingabe] = useState<RegelEingabe | null>(null)
  const [bearbeitet, setBearbeitet] = useState<string | undefined>()
  const gruppenName = (id: string) => daten.gruppen.find(g => g.id === id)?.name ?? '?'
  const personName = (id: string) => daten.personen.find(p => p.id === id)?.name ?? '?'
  const vorlagen = daten.vorlagen.filter(v => v.art === 'regel')

  function oeffnen(r?: FerienRegel) {
    setBearbeitet(r?.id)
    setEingabe(r ? regelEingabe(r) : { ...LEERE_REGEL })
  }

  async function sichern() {
    if (!eingabe) return
    try {
      await speichern('regeln', regelDaten(eingabe), bearbeitet)
      setEingabe(null)
      showToast('Regel gespeichert')
    } catch (err) {
      showToast(fehlerText(err), 'error')
    }
  }

  async function weg(r: FerienRegel) {
    try {
      await loeschen('regeln', r.id)
      showToast('Regel gelöscht')
    } catch (err) {
      showToast(fehlerText(err), 'error')
    }
  }

  const setze = (teil: Partial<RegelEingabe>) => setEingabe(e => (e ? { ...e, ...teil } : e))
  const mitGruppe = eingabe && eingabe.formulierung !== 'personen_nicht_gleichzeitig'

  return (
    <div className="admin-table-wrap ferien-panel">
      {daten.regeln.length === 0 && <p className="admin-empty">Noch keine Regel.</p>}
      {daten.regeln.map(r => (
        <div key={r.id} className="ferien-liste-zeile" data-testid="ferien-regel">
          <span className="ferien-liste-titel">{r.titel}</span>
          <span className="ferien-liste-meta">
            {regelSatz(r, gruppenName, personName)} · {r.haerte === 'hart' ? 'hart' : 'Hinweis'}
            {r.status !== 'aktiv' && ` · ${r.status}`}
          </span>
          {darfPflegen && r.status === 'vorschlag' && (
            <VorschlagAktionen art="regeln" id={r.id} onMeldung={showToast} />
          )}
          {darfPflegen && r.status !== 'vorschlag' && (
            <>
              <button className="admin-btn admin-btn-secondary admin-btn-sm" onClick={() => oeffnen(r)}>Bearbeiten</button>
              <button className="admin-btn admin-btn-danger admin-btn-sm" onClick={() => void weg(r)}>Löschen</button>
            </>
          )}
        </div>
      ))}

      {darfPflegen && !eingabe && (
        <div className="ferien-vorlagen" style={{ marginTop: 12 }}>
          <button className="admin-btn admin-btn-primary admin-btn-sm" onClick={() => oeffnen()}>Neue Regel</button>
          {vorlagen.map(v => (
            <button key={v.key} className="admin-btn admin-btn-secondary admin-btn-sm" title={v.beschreibung}
              onClick={() => { setBearbeitet(undefined); setEingabe(regelEingabe(vorlageAlsRegel(v.daten))) }}>
              Vorlage: {v.titel}
            </button>
          ))}
        </div>
      )}

      {eingabe && (
        <div className="ferien-panel" aria-label="Regel bearbeiten">
          <div className="ferien-formular">
            <label className="admin-form-group">
              <span className="admin-form-label">Art</span>
              <select className="admin-form-select" aria-label="Art der Regel" value={eingabe.formulierung}
                onChange={e => setze({ formulierung: e.target.value as RegelEingabe['formulierung'] })}>
                {FORMULIERUNGEN.map(f => <option key={f.key} value={f.key}>{f.text}</option>)}
              </select>
            </label>
            <label className="admin-form-group">
              <span className="admin-form-label">Titel</span>
              <input className="admin-form-input" aria-label="Titel der Regel" value={eingabe.titel}
                onChange={e => setze({ titel: e.target.value })} />
            </label>
            {mitGruppe && (
              <label className="admin-form-group">
                <span className="admin-form-label">Gruppe</span>
                <select className="admin-form-select" aria-label="Gruppe" value={eingabe.gruppeId}
                  onChange={e => setze({ gruppeId: e.target.value })}>
                  <option value="">{eingabe.formulierung.startsWith('gruppe') ? 'Gruppe wählen…' : 'alle'}</option>
                  {daten.gruppen.map(g => <option key={g.id} value={g.id}>{g.name}</option>)}
                </select>
              </label>
            )}
            {mitGruppe && (
              <label className="admin-form-group">
                <span className="admin-form-label">Anzahl</span>
                <input className="admin-form-input" type="number" min={0} aria-label="Anzahl" value={eingabe.zahl}
                  onChange={e => setze({ zahl: Number(e.target.value) })} />
              </label>
            )}
            <label className="admin-form-group" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <input type="checkbox" checked={eingabe.hart} onChange={e => setze({ hart: e.target.checked })} />
              <span>Hart (sonst nur Hinweis)</span>
            </label>
          </div>
          {eingabe.formulierung === 'personen_nicht_gleichzeitig' && (
            <div className="ferien-auswahl" aria-label="Personen">
              {daten.personen.map(p => (
                <label key={p.id}>
                  <input type="checkbox" checked={eingabe.personen.includes(p.id)} onChange={e => setze({
                    personen: e.target.checked ? [...eingabe.personen, p.id] : eingabe.personen.filter(x => x !== p.id),
                  })} /> {p.name}
                </label>
              ))}
            </div>
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
