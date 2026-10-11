// Hagelschaden-Disposition — der berechnete Plan: Kennzahlen, Hinweise, Karte,
// Tagesplan je Equipe. Spec: docs/specs/hagelschaden-disposition.md §9, §10.1.
//
// «Vormerken» schreibt keine Termine (§10.3) — es legt Vormerkungen an, die in
// der Anrufliste abgestimmt und unter «Vorgemerkt» freigegeben werden.

import { lazy, Suspense, useMemo, useState } from 'react'
import type { DispoPlan, DispoTour } from '../../../../api/admin/hagelschadenDispo'
import type { HagelEquipe } from '../../../../api/admin/hagelschaden'
import { EINSATZART_LABELS } from '../dispoAnzeige'
import { equipenFarbe, minuten, tagKurz } from './dispoFormat'

const DispoKarte = lazy(() => import('./DispoKarte'))

const HINWEIS_LABELS: Record<string, string> = {
  kapazitaet: 'Kapazität', frist: 'Frist', buendel: 'Bündel', auslastung: 'Auslastung',
  ausreisser: 'Ausreisser', daten: 'Daten',
}

export function PlanAnsicht({ plan, equipen, laeuft, onVormerken, onTourenblatt, onProjekt }: {
  plan: DispoPlan
  equipen: HagelEquipe[]
  laeuft: boolean
  onVormerken: (tage: string[] | null) => void
  onTourenblatt: (datum: string, equipe: string) => void
  onProjekt: (projectId: string) => void
}) {
  const [karteTag, setKarteTag] = useState<string | 'alle' | null>(null)
  const k = plan.kennzahlen
  const farbe = useMemo(() => {
    const m = new Map<string, string>()
    equipen.forEach((e, i) => m.set(e.id, equipenFarbe(e.farbe, i)))
    return (t: DispoTour) => m.get(t.equipe_id) ?? equipenFarbe(t.farbe, 0)
  }, [equipen])

  return (
    <div className="dispo-plan">
      <div className="dispo-kennzahlen" role="list" aria-label="Kennzahlen des Plans">
        <Zahl wert={`${k.geplant} / ${k.faelle}`} label="Fälle geplant" />
        <Zahl wert={k.fertig_am ? tagKurz(k.fertig_am) : '—'} label="alles erledigt am" />
        <Zahl wert={`${k.km.toLocaleString('de-CH')} km`} label="Fahrstrecke (geschätzt)" />
        <Zahl wert={minuten(k.fahrt_min)} label={`Fahrzeit · ${k.fahranteil_pct} % des Tages`} />
        <Zahl wert={String(k.zu_spaet)} label="nach der Frist" warnung={k.zu_spaet > 0} />
        {(k.ungeplant > 0 || k.ohne_koordinaten > 0) && (
          <Zahl wert={String(k.ungeplant + k.ohne_koordinaten)} label="nicht planbar" warnung />
        )}
      </div>
      {k.budget_erreicht && (
        <div className="hagel-hinweis">Das Zeitbudget war erreicht — der Plan ist gut, aber vielleicht nicht der beste.
          Ein zweiter Lauf mit mehr Budget (Parameter) kann ihn verbessern.</div>
      )}

      {plan.hinweise.length > 0 && (
        <section className="dispo-hinweise" aria-label="Hinweise">
          <h4>Hinweise</h4>
          <ul>
            {plan.hinweise.map((h, i) => (
              <li key={i} className={`dispo-hinweis dispo-hinweis-${h.typ}`}>
                <span className="dispo-hinweis-typ">{HINWEIS_LABELS[h.typ] ?? h.typ}</span>
                <span>{h.text}</span>
              </li>
            ))}
          </ul>
        </section>
      )}

      <div className="dispo-aktionen">
        <button type="button" className="admin-btn admin-btn-primary" disabled={laeuft || plan.tage.length === 0}
          onClick={() => onVormerken(null)}>
          Ganzen Plan vormerken
        </button>
        <button type="button" className="admin-btn admin-btn-secondary"
          onClick={() => setKarteTag(karteTag ? null : 'alle')}>
          {karteTag ? 'Karte ausblenden' : 'Karte zeigen'}
        </button>
        <span className="hagel-sub">Vormerken legt keine Termine an — die entstehen erst bei der Freigabe.</span>
      </div>

      {karteTag && (
        <section className="dispo-karte-rahmen" aria-label="Karte der Touren">
          <div className="dispo-karte-filter">
            <select className="admin-form-select" aria-label="Tag auf der Karte" value={karteTag}
              onChange={e => setKarteTag(e.target.value)}>
              <option value="alle">Alle Tage</option>
              {plan.tage.map(t => <option key={t.datum} value={t.datum}>{tagKurz(t.datum)}</option>)}
            </select>
          </div>
          <Suspense fallback={<div className="admin-loading"><div className="admin-spinner" /> Karte laden…</div>}>
            <DispoKarte plan={plan} tag={karteTag} farbe={farbe} />
          </Suspense>
        </section>
      )}

      {plan.tage.length === 0 && <div className="admin-table-empty">Der Plan enthält keine Touren.</div>}
      {plan.tage.map(tag => (
        <section key={tag.datum} className="dispo-tag" aria-label={`Touren ${tagKurz(tag.datum)}`}>
          <div className="dispo-tag-kopf">
            <h4>{tagKurz(tag.datum)}</h4>
            <span className="hagel-sub">
              {einsaetze(tag.touren.reduce((n, t) => n + t.stopps.length, 0))} · {tag.touren.length} {tag.touren.length === 1 ? 'Equipe' : 'Equipen'}
            </span>
            <button type="button" className="admin-btn admin-btn-secondary dispo-tag-knopf" disabled={laeuft}
              onClick={() => onVormerken([tag.datum])}>
              Tag vormerken
            </button>
          </div>
          <div className="dispo-touren">
            {tag.touren.map(t => (
              <article key={t.equipe_id} className="dispo-tour" style={{ borderTopColor: farbe(t) }}>
                <div className="dispo-tour-kopf">
                  <span className="dispo-tour-name">
                    <span className="dispo-punkt" style={{ background: farbe(t) }} aria-hidden="true" />
                    {t.equipe_name}
                  </span>
                  <span className="hagel-sub">{t.start}–{t.ende} · {minuten(t.fahrt_min)} Fahrt · {t.km} km</span>
                </div>
                <div className="dispo-auslastung" title={`${t.auslastung_pct} % ausgelastet`}>
                  <div style={{ width: `${Math.min(100, t.auslastung_pct)}%`, background: farbe(t) }} />
                </div>
                <ol className="dispo-stopps">
                  {t.stopps.map(s => (
                    <li key={s.project_id} className={s.zu_spaet ? 'zu-spaet' : undefined}>
                      <span className="dispo-zeit">{s.start}{s.ende ? `–${s.ende}` : ''}</span>
                      <button type="button" className="dispo-link" onClick={() => onProjekt(s.project_id)}>
                        {s.projekt_nr} {s.projekt_name}
                      </button>
                      <span className="hagel-sub dispo-ort">{s.adresse}</span>
                      <span className="dispo-meta">
                        {EINSATZART_LABELS[s.einsatzart]} · {s.tage > 1 ? `${s.tage} Tage` : minuten(s.dauer_min)}
                        {s.personen > 1 ? ` · ${s.personen} Pers.` : ''}
                        {s.dringlichkeit ? ` · ${s.dringlichkeit}` : ''}
                        {s.zu_spaet ? ' · nach Frist' : ''}
                      </span>
                    </li>
                  ))}
                </ol>
                <button type="button" className="admin-btn admin-btn-secondary dispo-blatt"
                  onClick={() => onTourenblatt(tag.datum, t.equipe_id)}>
                  Tourenblatt (PDF)
                </button>
              </article>
            ))}
          </div>
        </section>
      ))}

      {(plan.ungeplant.length > 0 || plan.ohne_koordinaten.length > 0) && (
        <section className="dispo-tag" aria-label="Nicht planbar">
          <h4>Nicht planbar</h4>
          <ul className="dispo-liste">
            {plan.ungeplant.map(u => (
              <li key={u.project_id}>
                <button type="button" className="dispo-link" onClick={() => onProjekt(u.project_id)}>
                  {u.projekt_nr} {u.projekt_name}
                </button>
                <span className="hagel-sub"> — {u.grund}</span>
              </li>
            ))}
            {plan.ohne_koordinaten.map(u => (
              <li key={u.project_id}>
                <button type="button" className="dispo-link" onClick={() => onProjekt(u.project_id)}>
                  {u.projekt_nr} {u.projekt_name}
                </button>
                <span className="hagel-sub"> — ohne Koordinaten{u.adresse ? ` («${u.adresse}»)` : ''}</span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  )
}

function einsaetze(n: number): string {
  return `${n} ${n === 1 ? 'Einsatz' : 'Einsätze'}`
}

function Zahl({ wert, label, warnung = false }: { wert: string; label: string; warnung?: boolean }) {
  return (
    <div className={`dispo-zahl${warnung ? ' warnung' : ''}`} role="listitem">
      <span className="dispo-zahl-wert">{wert}</span>
      <span className="dispo-zahl-label">{label}</span>
    </div>
  )
}
