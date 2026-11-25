// Reiter «Sperrfristen» der Ferienplanung (Spec §4.4, §4.5, §8): Sperren und
// Betriebsferien, einmalig oder jährlich, für alle oder für Gruppen. Vorlagen
// füllen die Maske nur vor — aktiv wird erst, was jemand speichert.
import { useState } from 'react'
import { fehlerText, type FerienStammdaten, type Sperrfrist } from '../../api/admin/ferienplanung'
import { ToastHost, useToast } from '../components/useToast'
import { loeschen, speichern } from './useFerienStammdaten'

interface Eingabe {
  titel: string
  art: 'sperre' | 'betriebsferien'
  datum_von: string
  datum_bis: string
  jaehrlich: boolean
  gruppe_ids: string[]
  hart: boolean
  notiz: string
}

const LEER: Eingabe = {
  titel: '', art: 'sperre', datum_von: '', datum_bis: '', jaehrlich: true, gruppe_ids: [], hart: true, notiz: '',
}

function ausZeile(s: Partial<Sperrfrist>): Eingabe {
  return {
    titel: s.titel ?? '', art: s.art === 'betriebsferien' ? 'betriebsferien' : 'sperre',
    datum_von: s.datum_von ?? '', datum_bis: s.datum_bis ?? '', jaehrlich: s.jaehrlich ?? true,
    gruppe_ids: s.gruppe_ids ?? [], hart: (s.haerte ?? 'hart') === 'hart', notiz: s.notiz ?? '',
  }
}

function datum(iso: string, jaehrlich: boolean): string {
  const [j, m, t] = iso.split('-')
  return jaehrlich ? `${t}.${m}.` : `${t}.${m}.${j}`
}

export function SperrfristenTab({ daten, darfPflegen }: { daten: FerienStammdaten; darfPflegen: boolean }) {
  const { toast, showToast } = useToast()
  const [eingabe, setEingabe] = useState<Eingabe | null>(null)
  const [bearbeitet, setBearbeitet] = useState<string | undefined>()
  const vorlagen = daten.vorlagen.filter(v => v.art === 'sperrfrist')
  const gruppenName = (id: string) => daten.gruppen.find(g => g.id === id)?.name ?? '?'
  const setze = (teil: Partial<Eingabe>) => setEingabe(e => (e ? { ...e, ...teil } : e))

  async function sichern() {
    if (!eingabe) return
    const { hart, ...rest } = eingabe
    try {
      await speichern('sperrfristen', { ...rest, titel: rest.titel.trim(), haerte: hart ? 'hart' : 'weich', status: 'aktiv' },
        bearbeitet)
      setEingabe(null)
      showToast('Sperrfrist gespeichert')
    } catch (err) {
      showToast(fehlerText(err), 'error')
    }
  }

  async function weg(s: Sperrfrist) {
    try {
      await loeschen('sperrfristen', s.id)
      showToast('Sperrfrist gelöscht')
    } catch (err) {
      showToast(fehlerText(err), 'error')
    }
  }

  return (
    <div className="admin-table-wrap ferien-panel">
      {daten.sperrfristen.length === 0 && <p className="admin-empty">Noch keine Sperrfrist.</p>}
      {daten.sperrfristen.map(s => (
        <div key={s.id} className="ferien-liste-zeile" data-testid="ferien-sperrfrist">
          <span className="ferien-liste-titel">{s.titel}</span>
          <span className="ferien-liste-meta">
            {s.art === 'betriebsferien' ? 'Betriebsferien' : s.haerte === 'hart' ? 'Sperre' : 'Hinweis'}
            {' · '}{datum(s.datum_von, s.jaehrlich)}–{datum(s.datum_bis, s.jaehrlich)}{s.jaehrlich ? ' jährlich' : ''}
            {' · '}{s.gruppe_ids.length ? s.gruppe_ids.map(gruppenName).join(', ') : 'ganzer Betrieb'}
            {s.status !== 'aktiv' && ` · ${s.status}`}
          </span>
          {darfPflegen && (
            <>
              <button className="admin-btn admin-btn-secondary admin-btn-sm"
                onClick={() => { setBearbeitet(s.id); setEingabe(ausZeile(s)) }}>Bearbeiten</button>
              <button className="admin-btn admin-btn-danger admin-btn-sm" onClick={() => void weg(s)}>Löschen</button>
            </>
          )}
        </div>
      ))}

      {darfPflegen && !eingabe && (
        <div className="ferien-vorlagen" style={{ marginTop: 12 }}>
          <button className="admin-btn admin-btn-primary admin-btn-sm"
            onClick={() => { setBearbeitet(undefined); setEingabe({ ...LEER }) }}>Neue Sperrfrist</button>
          {vorlagen.map(v => (
            <button key={v.key} className="admin-btn admin-btn-secondary admin-btn-sm" title={v.beschreibung}
              onClick={() => { setBearbeitet(undefined); setEingabe(ausZeile(v.daten as Partial<Sperrfrist>)) }}>
              Vorlage: {v.titel}
            </button>
          ))}
        </div>
      )}

      {eingabe && (
        <div className="ferien-panel" aria-label="Sperrfrist bearbeiten">
          <div className="ferien-formular">
            <label className="admin-form-group">
              <span className="admin-form-label">Titel</span>
              <input className="admin-form-input" aria-label="Titel der Sperrfrist" value={eingabe.titel}
                onChange={e => setze({ titel: e.target.value })} />
            </label>
            <label className="admin-form-group">
              <span className="admin-form-label">Art</span>
              <select className="admin-form-select" aria-label="Art der Sperrfrist" value={eingabe.art}
                onChange={e => setze({ art: e.target.value as Eingabe['art'] })}>
                <option value="sperre">Sperre — keine Ferien</option>
                <option value="betriebsferien">Betriebsferien — Betrieb zu</option>
              </select>
            </label>
            <label className="admin-form-group">
              <span className="admin-form-label">Von</span>
              <input className="admin-form-input" type="date" aria-label="Von" value={eingabe.datum_von}
                onChange={e => setze({ datum_von: e.target.value })} />
            </label>
            <label className="admin-form-group">
              <span className="admin-form-label">Bis</span>
              <input className="admin-form-input" type="date" aria-label="Bis" value={eingabe.datum_bis}
                onChange={e => setze({ datum_bis: e.target.value })} />
            </label>
            <label className="admin-form-group" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <input type="checkbox" checked={eingabe.jaehrlich} onChange={e => setze({ jaehrlich: e.target.checked })} />
              <span>Jedes Jahr</span>
            </label>
            {eingabe.art === 'sperre' && (
              <label className="admin-form-group" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <input type="checkbox" checked={eingabe.hart} onChange={e => setze({ hart: e.target.checked })} />
                <span>Hart (sonst nur Hinweis)</span>
              </label>
            )}
          </div>
          <div className="admin-form-label">Gilt für (leer = ganzer Betrieb)</div>
          <div className="ferien-auswahl" aria-label="Gruppen">
            {daten.gruppen.map(g => (
              <label key={g.id}>
                <input type="checkbox" checked={eingabe.gruppe_ids.includes(g.id)} onChange={e => setze({
                  gruppe_ids: e.target.checked ? [...eingabe.gruppe_ids, g.id] : eingabe.gruppe_ids.filter(x => x !== g.id),
                })} /> {g.name}
              </label>
            ))}
          </div>
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
