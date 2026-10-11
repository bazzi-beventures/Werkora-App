// Hagelschaden-Disposition — Planungs-Parameter: Depot, Equipen, Fristen,
// Regler. Spec: docs/specs/hagelschaden-disposition.md §4.3, §5.3, §6.2, §7.2.
//
// Die Equipen stellt die Disposition zusammen, nie der Optimierer (§2 Punkt 2).
// Kalibrierungs-Vorschläge aus den Rapporten stehen hier, weil sie die
// Dauer-Matrix betreffen — übernommen wird nur per Klick (§5.3).

import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import {
  putHagelDispoParameter,
  type HagelDispoInfo, type HagelEquipe, type HagelKampagne, type HagelPlanParameter,
} from '../../../../api/admin/hagelschaden'
import { depotSuchen, getKalibrierung, type DispoKalibrierung } from '../../../../api/admin/hagelschadenDispo'
import { getAdminStaff, type StaffMember } from '../../../../api/admin/staff'
import { FARBNAMEN, PALETTE } from './dispoFormat'

const FRISTEN: { key: string; label: string }[] = [
  { key: 'sicherung', label: 'Sicherung' },
  { key: 'sehr_dringend', label: 'Sehr dringend (Arbeit nach der Sicherung)' },
  { key: 'dringend', label: 'Dringend' },
  { key: 'normal', label: 'Normal' },
  { key: 'nicht_dringend', label: 'Nicht dringend' },
]

export function PlanParameterDialog({ info, kampagne, onClose, onSaved }: {
  info: HagelDispoInfo
  kampagne: HagelKampagne
  onClose: () => void
  onSaved: () => void
}) {
  const [plan, setPlan] = useState<HagelPlanParameter>(() => structuredClone(info.parameter.plan))
  const [staff, setStaff] = useState<StaffMember[]>([])
  const [depotText, setDepotText] = useState(info.parameter.plan.depot?.adresse ?? '')
  const [kalib, setKalib] = useState<DispoKalibrierung[]>([])
  const [matrix, setMatrix] = useState(() => ({ ...info.parameter.min_je_element }))
  const [laeuft, setLaeuft] = useState(false)
  const [fehler, setFehler] = useState<string | null>(null)

  useEffect(() => {
    getAdminStaff().then(s => setStaff(s.filter(x => x.is_active))).catch(() => setStaff([]))
    getKalibrierung(kampagne.key).then(r => setKalib(r.vorschlaege)).catch(() => setKalib([]))
  }, [kampagne.key])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  const set = <K extends keyof HagelPlanParameter>(k: K, v: HagelPlanParameter[K]) => setPlan(p => ({ ...p, [k]: v }))
  const setEquipe = (i: number, e: Partial<HagelEquipe>) =>
    setPlan(p => ({ ...p, equipen: p.equipen.map((x, j) => (j === i ? { ...x, ...e } : x)) }))

  function neueEquipe() {
    setPlan(p => {
      const n = p.equipen.length + 1
      let id = `e${n}`
      while (p.equipen.some(e => e.id === id)) id = `${id}x`
      return { ...p, equipen: [...p.equipen, { id, name: `Equipe ${n}`, monteur_ids: [], faehigkeiten: [], farbe: PALETTE[(n - 1) % PALETTE.length] }] }
    })
  }

  async function depotFinden() {
    setFehler(null)
    try {
      const d = await depotSuchen(depotText)
      set('depot', d)
    } catch (e) {
      setFehler(e instanceof Error ? e.message : 'Adresse nicht gefunden.')
    }
  }

  async function speichern() {
    setLaeuft(true)
    setFehler(null)
    try {
      await putHagelDispoParameter({ ...info.parameter, min_je_element: matrix, plan }, kampagne.key)
      onSaved()
      onClose()
    } catch (e) {
      setFehler(e instanceof Error && e.message ? e.message : 'Speichern fehlgeschlagen.')
    } finally {
      setLaeuft(false)
    }
  }

  const zahl = (v: string) => (v === '' ? 0 : Number(v))
  const produktLabel = (k: string) => kampagne.produkte.find(p => p.key === k)?.label ?? k

  return createPortal(
    <div className="admin-modal-overlay" onClick={onClose}>
      <div className="admin-modal dispo-dialog" role="dialog" aria-label="Planungs-Parameter" onClick={e => e.stopPropagation()}>
        <div className="admin-modal-header">
          <div className="admin-modal-title">Planung</div>
          <button className="admin-modal-close" aria-label="Schliessen" onClick={onClose}>×</button>
        </div>
        <div className="admin-modal-body">
          <h4 className="hagel-dispo-dialog-titel">Depot (Startpunkt der Touren)</h4>
          <div className="dispo-depot">
            <input className="admin-form-input" aria-label="Depot-Adresse" placeholder="Strasse Nr, PLZ Ort"
              value={depotText} onChange={e => setDepotText(e.target.value)} />
            <button type="button" className="admin-btn admin-btn-secondary" onClick={() => void depotFinden()}>Suchen</button>
          </div>
          <div className="hagel-sub">
            {plan.depot ? `Gefunden: ${plan.depot.adresse} (${plan.depot.lat.toFixed(4)}, ${plan.depot.lon.toFixed(4)})`
              : 'Noch kein Depot — ohne Startpunkt rechnet die Planung nicht.'}
          </div>

          <h4 className="hagel-dispo-dialog-titel">Equipen</h4>
          {plan.equipen.length === 0 && <div className="hagel-sub">Noch keine Equipe.</div>}
          {plan.equipen.map((e, i) => (
            <fieldset key={e.id} className="dispo-equipe">
              <legend>
                <input className="admin-form-input" aria-label={`Name Equipe ${i + 1}`} value={e.name}
                  onChange={ev => setEquipe(i, { name: ev.target.value })} />
              </legend>
              <div className="dispo-equipe-monteure" role="group" aria-label={`Monteure ${e.name}`}>
                {staff.map(s => (
                  <label key={s.id} className="hagel-check">
                    <input type="checkbox" checked={e.monteur_ids.includes(s.id)}
                      onChange={ev => setEquipe(i, {
                        monteur_ids: ev.target.checked ? [...e.monteur_ids, s.id].slice(0, 6)
                          : e.monteur_ids.filter(m => m !== s.id),
                      })} />
                    {s.name}
                  </label>
                ))}
              </div>
              <div className="dispo-equipe-zeile">
                {(['glas', 'dach'] as const).map(f => (
                  <label key={f} className="hagel-check">
                    <input type="checkbox" checked={e.faehigkeiten.includes(f)}
                      onChange={ev => setEquipe(i, {
                        faehigkeiten: ev.target.checked ? [...e.faehigkeiten, f] : e.faehigkeiten.filter(x => x !== f),
                      })} />
                    kann {f === 'glas' ? 'Glas/Pergola' : 'Dach'}
                  </label>
                ))}
                <select className="admin-form-select" aria-label={`Farbe ${e.name}`} value={e.farbe}
                  onChange={ev => setEquipe(i, { farbe: ev.target.value })} style={{ color: e.farbe }}>
                  {PALETTE.map(c => <option key={c} value={c} style={{ color: c }}>● {FARBNAMEN[c] ?? c}</option>)}
                </select>
                <button type="button" className="dispo-link"
                  onClick={() => setPlan(p => ({ ...p, equipen: p.equipen.filter((_x, j) => j !== i) }))}>
                  entfernen
                </button>
              </div>
            </fieldset>
          ))}
          <button type="button" className="admin-btn admin-btn-secondary" onClick={neueEquipe}>+ Equipe</button>

          <h4 className="hagel-dispo-dialog-titel">Gewichtung</h4>
          <label className="dispo-regler">
            <span>Kurze Wege</span>
            <input type="range" min={0} max={100} step={5} aria-label="Gewichtung kurze Wege gegen Dringendes"
              value={plan.gewichtung} onChange={e => set('gewichtung', Number(e.target.value))} />
            <span>Dringendes zuerst</span>
          </label>

          <h4 className="hagel-dispo-dialog-titel">Planung</h4>
          <div className="hagel-dispo-grid">
            <label><span>Tagesbeginn</span>
              <input type="time" className="admin-form-input" value={plan.tagesbeginn}
                onChange={e => set('tagesbeginn', e.target.value)} /></label>
            <label><span>Horizont (Arbeitstage)</span>
              <input type="number" className="admin-form-input" value={plan.horizont_tage}
                onChange={e => set('horizont_tage', zahl(e.target.value))} /></label>
            <label><span>Tempo (km/h)</span>
              <input type="number" className="admin-form-input" value={plan.tempo_kmh}
                onChange={e => set('tempo_kmh', zahl(e.target.value))} /></label>
            <label><span>Umwegfaktor (%)</span>
              <input type="number" className="admin-form-input" value={plan.umwegfaktor_pct}
                onChange={e => set('umwegfaktor_pct', zahl(e.target.value))} /></label>
            <label><span>Parkzeit je Stopp (min)</span>
              <input type="number" className="admin-form-input" value={plan.parkzeit_min}
                onChange={e => set('parkzeit_min', zahl(e.target.value))} /></label>
            <label><span>Lieferfrist Material (Arbeitstage)</span>
              <input type="number" className="admin-form-input" value={plan.lieferfrist_arbeitstage}
                onChange={e => set('lieferfrist_arbeitstage', zahl(e.target.value))} /></label>
            <label><span>Rechenzeit (s)</span>
              <input type="number" className="admin-form-input" value={plan.budget_s}
                onChange={e => set('budget_s', zahl(e.target.value))} /></label>
            <label><span>Plan stabil halten</span>
              <select className="admin-form-select" value={plan.stabil}
                onChange={e => set('stabil', e.target.value as HagelPlanParameter['stabil'])}>
                <option value="aus">aus</option><option value="normal">normal</option><option value="stark">stark</option>
              </select></label>
          </div>
          <label className="hagel-check">
            <input type="checkbox" checked={plan.samstag} onChange={e => set('samstag', e.target.checked)} />
            Samstag einplanen
          </label>
          {plan.samstag && (
            <label className="dispo-inline"><span>Samstag (min)</span>
              <input type="number" className="admin-form-input" value={plan.samstag_min}
                onChange={e => set('samstag_min', zahl(e.target.value))} /></label>
          )}
          <label className="hagel-check">
            <input type="checkbox" checked={plan.nur_bestaetigte_freigeben}
              onChange={e => set('nur_bestaetigte_freigeben', e.target.checked)} />
            Nur vom Kunden bestätigte Einsätze freigeben
          </label>

          <h4 className="hagel-dispo-dialog-titel">Fristen (Arbeitstage ab Antwort)</h4>
          <div className="hagel-dispo-grid">
            {FRISTEN.map(f => (
              <label key={f.key}><span>{f.label}</span>
                <input type="number" className="admin-form-input" value={plan.fristen[f.key] ?? 0}
                  onChange={e => set('fristen', { ...plan.fristen, [f.key]: zahl(e.target.value) })} /></label>
            ))}
          </div>

          {kalib.length > 0 && (
            <>
              <h4 className="hagel-dispo-dialog-titel">Aus den Rapporten</h4>
              <ul className="dispo-liste">
                {kalib.map(k => (
                  <li key={k.produkt}>
                    <strong>{produktLabel(k.produkt)}</strong>: geplant {k.aktuell_min} min je Element, rapportiert
                    ×{k.faktor.toLocaleString('de-CH')} ({k.einsaetze} Einsätze, {k.min_faktor}–{k.max_faktor}).{' '}
                    {matrix[k.produkt] === k.vorschlag_min ? <span className="hagel-sub">übernommen</span> : (
                      <button type="button" className="dispo-link"
                        onClick={() => setMatrix(m => ({ ...m, [k.produkt]: k.vorschlag_min }))}>
                        auf {k.vorschlag_min} min setzen
                      </button>
                    )}
                  </li>
                ))}
              </ul>
            </>
          )}
          {fehler && <div className="admin-form-error" role="alert">{fehler}</div>}
        </div>
        <div className="admin-modal-footer">
          <button className="admin-btn admin-btn-secondary" onClick={onClose}>Abbrechen</button>
          <button className="admin-btn admin-btn-primary" disabled={laeuft} onClick={() => void speichern()}>
            {laeuft ? 'Speichern…' : 'Speichern'}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  )
}
