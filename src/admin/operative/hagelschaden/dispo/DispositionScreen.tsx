// Hagelschaden-Disposition — der Reiter «Disposition» (Phasen 2 und 3).
// Spec: docs/specs/hagelschaden-disposition.md §10.
//
// Drei Ansichten: Plan (berechnet), Anrufliste (abstimmen), Vorgemerkt
// (freigeben). Berechnen speichert nur einen Plan, Vormerken legt Vormerkungen
// an (für Monteure unsichtbar) — Termine entstehen erst bei der Freigabe.

import { useCallback, useEffect, useState } from 'react'
import type { HagelKampagne } from '../../../../api/admin/hagelschaden'
import {
  downloadTourenblatt, getDispo, planBerechnen, planVormerken, variantenRechnen,
  type DispoPlan, type DispoUebersicht, type DispoVariante,
} from '../../../../api/admin/hagelschadenDispo'
import { useIsMobile } from '../../../useIsMobile'
import { Anrufliste } from './Anrufliste'
import { PlanAnsicht } from './PlanAnsicht'
import { PlanParameterDialog } from './PlanParameterDialog'
import { VariantenDialog } from './VariantenDialog'
import { Vorgemerkt } from './Vorgemerkt'
import { tagKurz } from './dispoFormat'
import './dispo.css'

type Ansicht = 'plan' | 'anrufliste' | 'vorgemerkt'

const STUFEN = [
  { key: 'alle', label: 'Alles Planbare' },
  { key: 'sicherung', label: 'Nur Sicherungen' },
  { key: 'aufnahme', label: 'Nur Aufnahmen' },
  { key: 'reparatur', label: 'Nur Reparaturen' },
]

function fehlerText(e: unknown, fallback: string): string {
  return e instanceof Error && e.message ? e.message : fallback
}

export default function DispositionScreen({ kampagne, onOpenProject, showToast }: {
  kampagne: HagelKampagne
  onOpenProject: (projectId: string) => void
  showToast: (text: string, art?: 'success' | 'error') => void
}) {
  const isMobile = useIsMobile()
  const [daten, setDaten] = useState<DispoUebersicht | null>(null)
  const [plan, setPlan] = useState<DispoPlan | null>(null)
  const [ansicht, setAnsicht] = useState<Ansicht>(isMobile ? 'anrufliste' : 'plan')
  const [stufe, setStufe] = useState('alle')
  const [ab, setAb] = useState('')
  const [laeuft, setLaeuft] = useState(false)
  const [fehler, setFehler] = useState<string | null>(null)
  const [parameterOffen, setParameterOffen] = useState(false)
  const [varianten, setVarianten] = useState<DispoVariante[] | null>(null)
  const [variantenOffen, setVariantenOffen] = useState(false)

  const laden = useCallback(async () => {
    try {
      const d = await getDispo(kampagne.key)
      setDaten(d)
      setPlan(d.plan)
      setFehler(null)
    } catch (e) {
      setFehler(fehlerText(e, 'Die Disposition konnte nicht geladen werden.'))
    }
  }, [kampagne.key])

  useEffect(() => { void laden() }, [laden])

  const fehlerToast = useCallback((t: string) => showToast(t, 'error'), [showToast])
  const erfolgToast = useCallback((t: string) => showToast(t, 'success'), [showToast])

  async function berechnen() {
    setLaeuft(true)
    try {
      const p = await planBerechnen({ stufe, ab: ab || undefined }, kampagne.key)
      setPlan(p)
      setAnsicht('plan')
    } catch (e) {
      showToast(fehlerText(e, 'Der Plan konnte nicht berechnet werden.'), 'error')
    } finally {
      setLaeuft(false)
    }
  }

  async function vormerken(tage: string[] | null) {
    if (!plan) return
    setLaeuft(true)
    try {
      const r = await planVormerken(plan.id, tage, kampagne.key)
      showToast(`${r.vorgemerkt} ${r.vorgemerkt === 1 ? 'Einsatz' : 'Einsätze'} vorgemerkt${tage ? ` (${tage.map(tagKurz).join(', ')})` : ''}.`, 'success')
      await laden()
    } catch (e) {
      showToast(fehlerText(e, 'Vormerken fehlgeschlagen.'), 'error')
    } finally {
      setLaeuft(false)
    }
  }

  async function variantenVergleichen() {
    setVarianten(null)
    setVariantenOffen(true)
    try {
      const r = await variantenRechnen({ stufe, ab: ab || undefined }, kampagne.key)
      setVarianten(r.varianten)
    } catch (e) {
      setVariantenOffen(false)
      showToast(fehlerText(e, 'Varianten konnten nicht gerechnet werden.'), 'error')
    }
  }

  async function tourenblatt(datum: string, equipe: string) {
    if (!plan) return
    try {
      await downloadTourenblatt(plan.id, datum, equipe, kampagne.key)
    } catch (e) {
      showToast(fehlerText(e, 'Tourenblatt fehlgeschlagen.'), 'error')
    }
  }

  if (fehler && !daten) {
    return (
      <div className="admin-table-empty">
        {fehler}
        <div><button className="admin-btn admin-btn-secondary" onClick={() => void laden()}>Erneut versuchen</button></div>
      </div>
    )
  }
  if (!daten) return <div className="admin-loading"><div className="admin-spinner" /> Laden…</div>

  const pp = daten.dispo.parameter.plan
  const bereit = Boolean(pp.depot) && pp.equipen.length > 0

  return (
    <div className="dispo">
      <div className="dispo-kopf">
        <div className="dispo-steuerung">
          <select className="admin-form-select" aria-label="Was planen" value={stufe} onChange={e => setStufe(e.target.value)}>
            {STUFEN.map(s => <option key={s.key} value={s.key}>{s.label}</option>)}
          </select>
          <label className="dispo-inline">
            <span>ab</span>
            <input type="date" className="admin-form-input" aria-label="Planen ab" value={ab}
              onChange={e => setAb(e.target.value)} />
          </label>
          <button type="button" className="admin-btn admin-btn-primary" disabled={laeuft || !bereit}
            onClick={() => void berechnen()}>
            {laeuft ? 'Rechne…' : 'Plan berechnen'}
          </button>
          <button type="button" className="admin-btn admin-btn-secondary" disabled={laeuft || !bereit}
            onClick={() => void variantenVergleichen()}>
            Varianten vergleichen
          </button>
          <button type="button" className="admin-btn admin-btn-secondary" onClick={() => setParameterOffen(true)}>
            Planung ⚙
          </button>
        </div>
        {!bereit && (
          <div className="hagel-hinweis">
            Vor dem ersten Plan unter «Planung ⚙» das Depot festlegen und mindestens eine Equipe zusammenstellen.
          </div>
        )}
        <div className="dispo-reiter" role="tablist" aria-label="Ansicht der Disposition">
          {([['plan', 'Plan'], ['anrufliste', 'Anrufliste'], ['vorgemerkt', `Vorgemerkt (${daten.vormerkungen_offen})`]] as const)
            .map(([k, label]) => (
              <button key={k} type="button" role="tab" aria-selected={ansicht === k}
                className={`dispo-reiter-knopf${ansicht === k ? ' aktiv' : ''}`} onClick={() => setAnsicht(k)}>
                {label}
              </button>
            ))}
        </div>
      </div>

      {ansicht === 'plan' && (plan ? (
        <>
          <div className="hagel-sub dispo-planinfo">
            Plan vom {plan.created_at ? new Date(plan.created_at).toLocaleString('de-CH', { dateStyle: 'short', timeStyle: 'short' }) : '—'}
            {plan.created_by_name ? ` · ${plan.created_by_name}` : ''}
            {plan.horizont.von ? ` · ${tagKurz(plan.horizont.von)} bis ${tagKurz(plan.horizont.bis)}` : ''}
          </div>
          <PlanAnsicht plan={plan} equipen={pp.equipen} laeuft={laeuft}
            onVormerken={tage => void vormerken(tage)} onTourenblatt={(d, e) => void tourenblatt(d, e)}
            onProjekt={onOpenProject} />
        </>
      ) : (
        <div className="admin-table-empty">Noch kein Plan. «Plan berechnen» rechnet die Touren der nächsten Wochen.</div>
      ))}
      {ansicht === 'anrufliste' && (
        <Anrufliste kampagne={kampagne.key} onFehler={fehlerToast} onGeaendert={() => void laden()} />
      )}
      {ansicht === 'vorgemerkt' && (
        <Vorgemerkt kampagne={kampagne.key} nurBestaetigte={pp.nur_bestaetigte_freigeben}
          onFehler={fehlerToast} onErfolg={erfolgToast} onGeaendert={() => void laden()} />
      )}

      {parameterOffen && (
        <PlanParameterDialog info={daten.dispo} kampagne={kampagne} onClose={() => setParameterOffen(false)}
          onSaved={() => { showToast('Planung gespeichert.', 'success'); void laden() }} />
      )}
      {variantenOffen && (
        <VariantenDialog varianten={varianten} laeuft={varianten === null} onClose={() => setVariantenOffen(false)} />
      )}
    </div>
  )
}
