// Hagelschaden — Arbeitsliste der Kunden-Rückmeldung (Modul `hagelschaden`).
// Spec: docs/specs/hagelschaden-dashboard.md §7.
//
// Zeigt dieselben Zeilen wie die Excel-Liste aus dem Superadmin und macht sie
// bearbeitbar: Aktiv, Kontaktiert, Einsatz geplant (aus der Einsatzplanung, sonst
// Schalter) und eine interne Notiz. Die drei Schalter sitzen direkt in der Zeile —
// «angerufen, eingeplant» ist die häufigste Handlung, ein Dialog dafür wäre zu viel.

import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  downloadHagelschadenExcel, getHagelschaden, patchHagelschaden,
  type HagelKampagne, type HagelListe, type HagelPatch, type HagelZeile,
} from '../../../api/admin/hagelschaden'
import { listProjectFiles, projectFileUrl } from '../../../api/projectFiles'
import type { ProjectFile } from '../../../shared/projectDetail/types'
import type { ProjectTab } from '../projectDetail/ProjectTabBar'
import { AdminCardList } from '../../components/AdminCardList'
import { useToast, ToastHost } from '../../components/useToast'
import { useIsMobile } from '../../useIsMobile'
import {
  STANDARD_FILTER, STATUS_LABELS, filtereZeilen, istStandard, kachelAktiv, kacheln, kennzahlen,
  ladeFilter, prioKlasse, speichereFilter, terminKurz, umfang,
  type HagelFilter, type JaNeinAlle, type Kachel, type UmfrageStatus,
} from './hagelschadenFilter'
import './hagelschaden.css'

const NOTIZ_MAX = 2000

function fehlerText(e: unknown, fallback: string): string {
  return e instanceof Error && e.message ? e.message : fallback
}

function fmtZeit(iso: string | null): string {
  if (!iso) return ''
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  return d.toLocaleString('de-CH', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })
}

export default function HagelschadenScreen({ userId, onOpenProject, onOpenSchedule }: {
  userId: string
  onOpenProject: (projectId: string, tab?: ProjectTab) => void
  onOpenSchedule?: () => void
}) {
  const isMobile = useIsMobile()
  const { toast, showToast } = useToast()
  const [daten, setDaten] = useState<HagelListe | null>(null)
  const [zeilen, setZeilen] = useState<HagelZeile[]>([])
  const [kampagneKey, setKampagneKey] = useState<string | undefined>(undefined)
  const [laedt, setLaedt] = useState(true)
  const [fehler, setFehler] = useState<string | null>(null)
  const [filter, setFilterState] = useState<HagelFilter>(() => ladeFilter(userId))
  const [offen, setOffen] = useState<string | null>(null)

  const setFilter = useCallback((f: HagelFilter) => {
    setFilterState(f)
    speichereFilter(userId, f)
  }, [userId])

  const laden = useCallback(async (key?: string) => {
    setLaedt(true)
    setFehler(null)
    try {
      const d = await getHagelschaden(key)
      setDaten(d)
      setZeilen(d.zeilen)
    } catch (e) {
      setFehler(fehlerText(e, 'Die Liste konnte nicht geladen werden.'))
    } finally {
      setLaedt(false)
    }
  }, [])

  useEffect(() => { void laden(kampagneKey) }, [laden, kampagneKey])

  const kampagne = daten?.kampagne ?? null
  const gefiltert = useMemo(() => filtereZeilen(zeilen, filter), [zeilen, filter])
  const zahlen = useMemo(() => (kampagne ? kennzahlen(zeilen, kampagne) : null), [zeilen, kampagne])
  const detail = offen ? zeilen.find(z => z.project_id === offen) ?? null : null
  const aktiveKampagne = kampagne?.key

  /** Optimistisch: sofort umschalten, bei Fehler zurück + Meldung. */
  const speichern = useCallback(async (z: HagelZeile, felder: HagelPatch, vorschau: Partial<HagelZeile>) => {
    const vorher = z
    setZeilen(rows => rows.map(r => (r.project_id === z.project_id ? { ...r, ...vorschau } : r)))
    try {
      const neu = await patchHagelschaden(z.project_id, felder, aktiveKampagne)
      setZeilen(rows => rows.map(r => (r.project_id === z.project_id ? { ...r, ...neu } : r)))
      return true
    } catch (e) {
      setZeilen(rows => rows.map(r => (r.project_id === z.project_id ? vorher : r)))
      showToast(fehlerText(e, 'Speichern fehlgeschlagen.'), 'error')
      return false
    }
  }, [aktiveKampagne, showToast])

  const toggleAktiv = (z: HagelZeile) =>
    speichern(z, { aktiv: !z.aktiv }, { aktiv: !z.aktiv })
  const toggleKontaktiert = (z: HagelZeile) =>
    speichern(z, { kontaktiert: !z.kontaktiert }, { kontaktiert: !z.kontaktiert })
  const toggleEinsatz = (z: HagelZeile) => {
    if (z.termin) return Promise.resolve(false)
    const neu = !z.einsatz_geplant_manuell
    return speichern(z, { einsatz_geplant_manuell: neu }, { einsatz_geplant_manuell: neu, einsatz_geplant: neu })
  }

  async function exportieren() {
    try {
      await downloadHagelschadenExcel(kampagne?.key)
    } catch (e) {
      showToast(fehlerText(e, 'Export fehlgeschlagen.'), 'error')
    }
  }

  if (laedt && !daten) {
    return (
      <div className="admin-page admin-page-wide">
        <div className="admin-page-header"><div className="admin-page-title">Hagelschaden</div></div>
        <div className="admin-loading"><div className="admin-spinner" /> Laden…</div>
      </div>
    )
  }

  if (fehler && !daten) {
    return (
      <div className="admin-page admin-page-wide">
        <div className="admin-page-header"><div className="admin-page-title">Hagelschaden</div></div>
        <div className="admin-table-empty">
          {fehler}
          <div><button className="admin-btn admin-btn-secondary" onClick={() => void laden(kampagneKey)}>Erneut versuchen</button></div>
        </div>
      </div>
    )
  }

  if (!kampagne || !zahlen) {
    return (
      <div className="admin-page admin-page-wide">
        <div className="admin-page-header"><div className="admin-page-title">Hagelschaden</div></div>
        <div className="admin-table-empty">Für diesen Betrieb läuft keine Hagelschaden-Umfrage.</div>
      </div>
    )
  }

  const statusOptionen = Object.keys(STATUS_LABELS) as UmfrageStatus[]

  return (
    <div className="admin-page admin-page-wide hagel-page">
      <div className="admin-page-header">
        <div>
          <div className="admin-page-title">Hagelschaden</div>
          <div className="admin-page-subtitle">
            {kampagne.kurzname} · {gefiltert.length} von {zeilen.length} Projekten
          </div>
        </div>
        <div className="admin-page-actions">
          {(daten?.kampagnen.length ?? 0) > 1 && (
            <select
              className="admin-form-select"
              aria-label="Umfrage"
              value={kampagne.key}
              onChange={e => setKampagneKey(e.target.value)}
            >
              {daten!.kampagnen.map(k => <option key={k.key} value={k.key}>{k.kurzname}</option>)}
            </select>
          )}
          <button className="admin-btn admin-btn-secondary" onClick={() => void laden(kampagne.key)} disabled={laedt}>
            Aktualisieren
          </button>
          <button className="admin-btn admin-btn-primary" onClick={() => void exportieren()}>
            Excel exportieren
          </button>
        </div>
      </div>

      <div className="hagel-gruppen">
        <KachelGruppe
          titel="Rückmeldung der Kunden"
          hinweis="Was die Kunden in der Umfrage gemeldet haben"
          kacheln={kacheln(zahlen).filter(k => k.gruppe === 'kunde')}
          filter={filter}
          onFilter={setFilter}
        />
        <KachelGruppe
          titel="Unsere Bearbeitung"
          hinweis="Was wir daraus machen — Aktiv, Kontaktiert, Einsatz"
          betrieb
          kacheln={kacheln(zahlen).filter(k => k.gruppe === 'betrieb')}
          filter={filter}
          onFilter={setFilter}
        />
      </div>

      {daten?.termine_bekannt === false && (
        <div className="hagel-hinweis">
          Die Einsatzplanung war gerade nicht lesbar — Termine fehlen in dieser Ansicht. «Einsatz geplant» zeigt nur die Schalter.
        </div>
      )}

      <div className="admin-table-wrap">
        <div className="admin-filter-bar hagel-filter">
          <input
            className="admin-search"
            placeholder="Projekt, Kunde, Adresse, Bemerkung, Notiz suchen…"
            value={filter.suche}
            onChange={e => setFilter({ ...filter, suche: e.target.value })}
          />
          {!istStandard(filter) && (
            <button className="admin-btn admin-btn-secondary" onClick={() => setFilter({ ...STANDARD_FILTER, suche: filter.suche })}>
              Filter zurücksetzen
            </button>
          )}
        </div>
        <div className="hagel-filter-gruppen">
          <fieldset className="hagel-filter-gruppe">
            <legend>Rückmeldung der Kunden</legend>
            <select className="admin-form-select" aria-label="Umfrage-Status" value={filter.status}
              onChange={e => setFilter({ ...filter, status: e.target.value as UmfrageStatus })}>
              {statusOptionen.map(s => <option key={s} value={s}>{STATUS_LABELS[s]}</option>)}
            </select>
            <select className="admin-form-select" aria-label="Dringlichkeit"
              value={filter.prioritaeten[0] ?? ''}
              onChange={e => setFilter({ ...filter, prioritaeten: e.target.value ? [e.target.value] : [] })}>
              <option value="">Jede Dringlichkeit</option>
              {[...kampagne.prioritaeten].sort((a, b) => (a.rang ?? 0) - (b.rang ?? 0))
                .map(o => <option key={o.key} value={o.key}>{o.label}</option>)}
            </select>
            <select className="admin-form-select" aria-label="Betroffen"
              value={filter.produkte[0] ?? ''}
              onChange={e => setFilter({ ...filter, produkte: e.target.value ? [e.target.value] : [] })}>
              <option value="">Alles Betroffene</option>
              {kampagne.produkte.map(o => <option key={o.key} value={o.key}>{o.label}</option>)}
            </select>
            <label className="hagel-check">
              <input type="checkbox" checked={filter.nurFotos}
                onChange={e => setFilter({ ...filter, nurFotos: e.target.checked })} />
              nur mit Fotos
            </label>
          </fieldset>
          <fieldset className="hagel-filter-gruppe betrieb">
            <legend>Unsere Bearbeitung</legend>
            <JaNeinSelect label="Aktiv" value={filter.aktiv} onChange={v => setFilter({ ...filter, aktiv: v })} />
            <JaNeinSelect label="Einsatz" value={filter.einsatz} onChange={v => setFilter({ ...filter, einsatz: v })} />
            <JaNeinSelect label="Kontaktiert" value={filter.kontaktiert} onChange={v => setFilter({ ...filter, kontaktiert: v })} />
          </fieldset>
        </div>


        {isMobile ? (
          <AdminCardList
            items={gefiltert}
            keyFor={z => z.project_id}
            empty="Keine Projekte für diesen Filter."
            onItemClick={z => setOffen(z.project_id)}
            renderCard={z => (
              <>
                <div className="admin-card-head">
                  <div className="admin-card-title">{z.projekt_nr} {z.projekt_name}</div>
                  <PrioBadge z={z} kampagne={kampagne} />
                </div>
                <div className="admin-card-meta">{z.kunde}{z.objekt_adresse ? ` · ${z.objekt_adresse}` : ''}</div>
                <div className="hagel-karte-block">
                  <div className="hagel-block-titel">Kunde meldet</div>
                  <div className="admin-card-meta">{[z.art, umfang(z), z.fotos ? `${z.fotos} Fotos` : ''].filter(Boolean).join(' · ') || z.status}</div>
                </div>
                <div className="hagel-karte-block betrieb" onClick={e => e.stopPropagation()}>
                  <div className="hagel-block-titel">Unsere Bearbeitung</div>
                  <div className="hagel-schalter-reihe">
                    <Schalter label="Aktiv" an={z.aktiv} onClick={() => void toggleAktiv(z)} />
                    <Schalter label="Kontaktiert" an={z.kontaktiert} onClick={() => void toggleKontaktiert(z)} />
                    <EinsatzZelle z={z} onToggle={() => void toggleEinsatz(z)} />
                  </div>
                </div>
              </>
            )}
          />
        ) : (
          <div className="hagel-table-scroll">
            <table className="admin-table hagel-table">
              <thead>
                <tr className="hagel-gruppenkopf">
                  <th colSpan={2} />
                  <th colSpan={5} className="hagel-kopf-kunde">Rückmeldung der Kunden</th>
                  <th colSpan={4} className="hagel-kopf-betrieb">Unsere Bearbeitung</th>
                </tr>
                <tr>
                  <th>Projekt</th>
                  <th>Kunde / Objekt</th>
                  <th className="hagel-start-kunde">Dringlichkeit</th>
                  <th>Betroffen</th>
                  <th>Umfang</th>
                  <th>Fotos</th>
                  <th>Beantwortet</th>
                  <th className="hagel-start-betrieb" title="Wir bearbeiten den Fall gerade">Aktiv</th>
                  <th>Kontaktiert</th>
                  <th>Einsatz</th>
                  <th>Notiz</th>
                </tr>
              </thead>
              <tbody>
                {gefiltert.length === 0 && (
                  <tr><td colSpan={11} className="admin-table-empty">Keine Projekte für diesen Filter.</td></tr>
                )}
                {gefiltert.map(z => (
                  <tr key={z.project_id} onClick={() => setOffen(z.project_id)}
                    className={z.project_id === offen ? 'hagel-zeile-offen' : undefined}>
                    <td className="primary">
                      <div>{z.projekt_name}</div>
                      <div className="hagel-sub">{z.projekt_nr}{!z.projekt_offen ? ' · nicht mehr offen' : ''}</div>
                    </td>
                    <td>
                      <div>{z.kunde || '—'}</div>
                      <div className="hagel-sub">{z.objekt_adresse}</div>
                    </td>
                    <td className="hagel-start-kunde"><PrioBadge z={z} kampagne={kampagne} /></td>
                    <td className="secondary">{z.art}</td>
                    <td className="secondary">{umfang(z)}</td>
                    <td className="secondary">{z.fotos || ''}</td>
                    <td className="secondary">{z.beantwortet_am ? z.beantwortet_am.slice(0, 10) : ''}</td>
                    <td className="hagel-betrieb hagel-start-betrieb" onClick={e => e.stopPropagation()}>
                      <Schalter label="Aktiv" an={z.aktiv} onClick={() => void toggleAktiv(z)} kurz />
                    </td>
                    <td className="hagel-betrieb" onClick={e => e.stopPropagation()}>
                      <Schalter label="Kontaktiert" an={z.kontaktiert} onClick={() => void toggleKontaktiert(z)} kurz />
                    </td>
                    <td className="hagel-betrieb" onClick={e => e.stopPropagation()}>
                      <EinsatzZelle z={z} onToggle={() => void toggleEinsatz(z)} kurz />
                    </td>
                    <td className="secondary hagel-betrieb hagel-notiz-zelle" title={z.notiz}>{z.notiz}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {detail && (
        <DetailPanel
          key={detail.project_id}
          z={detail}
          kampagne={kampagne}
          onClose={() => setOffen(null)}
          onSave={speichern}
          onOpenProject={onOpenProject}
          onOpenSchedule={onOpenSchedule}
        />
      )}
      <ToastHost toast={toast} />
    </div>
  )
}

function KachelGruppe({ titel, hinweis, kacheln: liste, filter, onFilter, betrieb = false }: {
  titel: string
  hinweis: string
  kacheln: Kachel[]
  filter: HagelFilter
  onFilter: (f: HagelFilter) => void
  betrieb?: boolean
}) {
  return (
    <section className={`hagel-gruppe${betrieb ? ' betrieb' : ''}`} aria-label={`${titel} — Klick filtert`}>
      <div className="hagel-gruppe-kopf">
        <h3>{titel}</h3>
        <span className="hagel-sub">{hinweis}</span>
      </div>
      <div className="hagel-kacheln">
        {liste.map(k => {
          const an = kachelAktiv(k, filter)
          return (
            <button
              key={k.key}
              type="button"
              className={`hagel-kachel${an ? ' aktiv' : ''}${k.rang !== undefined ? ` hagel-prio-${Math.min(k.rang, 3)}` : ''}`}
              aria-pressed={an}
              onClick={() => onFilter(an ? STANDARD_FILTER : { ...k.filter, suche: filter.suche })}
            >
              <span className="hagel-kachel-wert">{k.wert}</span>
              <span className="hagel-kachel-label">{k.label}</span>
            </button>
          )
        })}
      </div>
    </section>
  )
}

function JaNeinSelect({ label, value, onChange }: {
  label: string; value: JaNeinAlle; onChange: (v: JaNeinAlle) => void
}) {
  return (
    <select className="admin-form-select" aria-label={label} value={value}
      onChange={e => onChange(e.target.value as JaNeinAlle)}>
      <option value="alle">{label}: alle</option>
      <option value="ja">{label}: ja</option>
      <option value="nein">{label}: nein</option>
    </select>
  )
}

function PrioBadge({ z, kampagne }: { z: HagelZeile; kampagne: HagelKampagne }) {
  const text = z.status_key === 1 ? 'Erledigt' : z.dringlichkeit || (z.status_key === 2 ? 'Keine Antwort' : z.status_key === 4 ? 'Keine E-Mail' : z.status_key === 3 ? 'Nicht angeschrieben' : '—')
  return <span className={`hagel-prio ${prioKlasse(z, kampagne)}`}>{text}</span>
}

function Schalter({ label, an, onClick, kurz = false, gesperrt = false, titel }: {
  label: string; an: boolean; onClick: () => void; kurz?: boolean; gesperrt?: boolean; titel?: string
}) {
  return (
    <button
      type="button"
      className={`hagel-schalter${an ? ' an' : ''}`}
      role="switch"
      aria-checked={an}
      aria-label={label}
      title={titel}
      disabled={gesperrt}
      onClick={onClick}
    >
      {kurz ? (an ? 'ja' : 'nein') : `${label}: ${an ? 'ja' : 'nein'}`}
    </button>
  )
}

function EinsatzZelle({ z, onToggle, kurz = false }: { z: HagelZeile; onToggle: () => void; kurz?: boolean }) {
  if (z.termin) {
    return (
      <span className="hagel-termin" title="Aus der Einsatzplanung — dort ändern">
        {kurz ? '' : 'Einsatz: '}{terminKurz(z.termin.datum)}{z.termin.zeit ? ` ${z.termin.zeit}` : ''} · {z.termin.art}
      </span>
    )
  }
  return (
    <Schalter
      label="Einsatz geplant"
      an={z.einsatz_geplant_manuell}
      onClick={onToggle}
      kurz={kurz}
      titel={z.termine_bekannt ? 'Kein Termin in der Einsatzplanung — von Hand gesetzt' : 'Termin unbekannt (Einsatzplanung nicht lesbar)'}
    />
  )
}

function DetailPanel({ z, kampagne, onClose, onSave, onOpenProject, onOpenSchedule }: {
  z: HagelZeile
  kampagne: HagelKampagne
  onClose: () => void
  onSave: (z: HagelZeile, felder: HagelPatch, vorschau: Partial<HagelZeile>) => Promise<boolean>
  onOpenProject: (projectId: string, tab?: ProjectTab) => void
  onOpenSchedule?: () => void
}) {
  const [notiz, setNotiz] = useState(z.notiz)
  const [fotos, setFotos] = useState<ProjectFile[] | null>(null)
  const prio = kampagne.prioritaeten.find(o => o.key === z.prioritaet)
  const notizGeaendert = notiz.trim() !== (z.notiz || '').trim()

  useEffect(() => {
    let weg = false
    listProjectFiles('/pwa/admin', z.project_id)
      .then(files => { if (!weg) setFotos(files.filter(f => f.category === 'fotos')) })
      .catch(() => { if (!weg) setFotos([]) })
    return () => { weg = true }
  }, [z.project_id])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  async function notizSpeichern() {
    if (!notizGeaendert) return
    const text = notiz.trim().slice(0, NOTIZ_MAX)
    await onSave(z, { notiz: text }, { notiz: text })
  }

  return (
    <div className="hagel-detail-overlay" onClick={onClose}>
      <aside className="hagel-detail" role="dialog" aria-label={`Hagelschaden ${z.projekt_name}`} onClick={e => e.stopPropagation()}>
        <div className="hagel-detail-kopf">
          <div>
            <div className="hagel-detail-titel">{z.projekt_name}</div>
            <div className="hagel-sub">{z.projekt_nr}{z.objekt_adresse ? ` · ${z.objekt_adresse}` : ''}</div>
          </div>
          <button className="admin-btn admin-btn-secondary" onClick={onClose} aria-label="Schliessen">✕</button>
        </div>

        <section className="hagel-detail-block">
          <h4>Rückmeldung des Kunden</h4>
          <dl className="hagel-dl">
            <dt>Status</dt><dd>{z.status}</dd>
            {prio && <><dt>Dringlichkeit</dt><dd><PrioBadge z={z} kampagne={kampagne} />{prio.hinweis ? <div className="hagel-sub">{prio.hinweis}</div> : null}</dd></>}
            {z.art && <><dt>Betroffen</dt><dd>{z.art}</dd></>}
            {umfang(z) && <><dt>Umfang</dt><dd>{umfang(z)}</dd></>}
            {z.bemerkung_kunde && <><dt>Bemerkung</dt><dd className="hagel-bemerkung">«{z.bemerkung_kunde}»</dd></>}
            <dt>Kunde</dt><dd>{z.kunde || '—'}{z.email && z.email !== '(keine)' ? <div className="hagel-sub">{z.email}</div> : <div className="hagel-sub">keine E-Mail-Adresse</div>}</dd>
            {z.gesendet_am && <><dt>Angeschrieben</dt><dd>{z.gesendet_am}</dd></>}
            {z.beantwortet_am && <><dt>Beantwortet</dt><dd>{z.beantwortet_am}{z.antworten > 1 ? ` (${z.antworten} Antworten)` : ''}</dd></>}
          </dl>
        </section>

        <section className="hagel-detail-block">
          <h4>Fotos des Kunden und im Projekt</h4>
          {fotos === null ? (
            <div className="hagel-sub">Laden…</div>
          ) : fotos.length === 0 ? (
            <div className="hagel-sub">Keine Fotos.</div>
          ) : (
            <div className="hagel-fotos">
              {fotos.map(f => (
                <a key={f.id} href={projectFileUrl('/pwa/admin', z.project_id, f.id)} target="_blank" rel="noreferrer" title={f.filename}>
                  <img src={projectFileUrl('/pwa/admin', z.project_id, f.id)} alt={f.filename} loading="lazy"
                    onError={e => { (e.currentTarget as HTMLImageElement).style.display = 'none' }} />
                  <span>{f.filename}</span>
                </a>
              ))}
            </div>
          )}
        </section>

        <section className="hagel-detail-block betrieb">
          <h4>Unsere Bearbeitung</h4>
          <div className="hagel-feld">
            <span title="Wir bearbeiten den Fall gerade">Aktiv (in Bearbeitung)</span>
            <Schalter label="Aktiv" an={z.aktiv} kurz
              onClick={() => void onSave(z, { aktiv: !z.aktiv }, { aktiv: !z.aktiv })} />
          </div>
          <div className="hagel-feld">
            <span>Kontaktiert</span>
            <Schalter label="Kontaktiert" an={z.kontaktiert} kurz
              onClick={() => void onSave(z, { kontaktiert: !z.kontaktiert }, { kontaktiert: !z.kontaktiert })} />
          </div>
          <div className="hagel-feld">
            <span>Einsatz geplant</span>
            <EinsatzZelle z={z} kurz onToggle={() => {
              const neu = !z.einsatz_geplant_manuell
              void onSave(z, { einsatz_geplant_manuell: neu }, { einsatz_geplant_manuell: neu, einsatz_geplant: neu })
            }} />
          </div>
          <label className="hagel-notiz">
            <span>Interne Notiz</span>
            <textarea
              className="admin-form-input"
              rows={4}
              maxLength={NOTIZ_MAX}
              value={notiz}
              placeholder="Nur für den Betrieb sichtbar"
              onChange={e => setNotiz(e.target.value)}
              onBlur={() => void notizSpeichern()}
            />
          </label>
          {notizGeaendert && (
            <button className="admin-btn admin-btn-primary" onClick={() => void notizSpeichern()}>Notiz speichern</button>
          )}
          {z.bearbeitet_von && (
            <div className="hagel-sub">Zuletzt bearbeitet von {z.bearbeitet_von}{z.bearbeitet_am ? ` am ${fmtZeit(z.bearbeitet_am)}` : ''}</div>
          )}
        </section>

        <div className="hagel-detail-aktionen">
          <button className="admin-btn admin-btn-secondary" onClick={() => onOpenProject(z.project_id, 'details')}>Projekt öffnen</button>
          <button className="admin-btn admin-btn-secondary" onClick={() => onOpenProject(z.project_id, 'documents')}>Fotos im Projekt</button>
          {onOpenSchedule && (
            <button className="admin-btn admin-btn-secondary" onClick={onOpenSchedule}>In Einsatzplanung</button>
          )}
        </div>
      </aside>
    </div>
  )
}
