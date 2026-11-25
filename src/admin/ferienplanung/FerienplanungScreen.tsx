// Ferienplanung im Admin (Modul `ferienplanung`, docs/specs/ferienplanung.md §7.1):
// Plantafel über Monate, Pflege von Sperrfristen, Regeln und Gruppen. Bedienung wie
// die Einsatzplanung (vor/zurück, Heute, Zoom); ein Klick auf einen Antrag öffnet
// das Panel mit Befunden und Freigabe. Pflegen darf die Geschäftsleitung.
// Beta: im Schattenbetrieb blockiert nichts — Befunde sind Hinweise (Spec §4.7).
import { useState } from 'react'
import { approveAbsence, rejectAbsence } from '../../api/admin/absences'
import type { Befund, PlanerAbsenz } from '../../api/admin/ferienplanung'
import { queryClient } from '../../shared/queryClient'
import { BetaBadge } from '../../shared/BetaBadge'
import { ToastHost, useToast } from '../components/useToast'
import { BefundListe, hatHartenBefund } from './BefundListe'
import { GruppenTab } from './GruppenTab'
import { PLANER_KEY, Plantafel, zeitraum, type Zoom } from './Plantafel'
import { RegelnTab } from './RegelnTab'
import { SperrfristenTab } from './SperrfristenTab'
import { UebersteuernDialog } from './UebersteuernDialog'
import { useFerienStammdaten } from './useFerienStammdaten'
import './ferienplanung.css'

type Reiter = 'plantafel' | 'sperrfristen' | 'regeln' | 'gruppen'
const REITER: { key: Reiter; text: string }[] = [
  { key: 'plantafel', text: 'Plantafel' },
  { key: 'sperrfristen', text: 'Sperrfristen' },
  { key: 'regeln', text: 'Regeln' },
  { key: 'gruppen', text: 'Gruppen' },
]
const ZOOMS: { key: Zoom; text: string }[] = [
  { key: 'monat', text: 'Monat' }, { key: 'quartal', text: 'Quartal' }, { key: 'jahr', text: 'Jahr' },
]

function datum(iso: string): string {
  const [j, m, t] = iso.split('-')
  return `${t}.${m}.${j}`
}

function AntragPanel({ absenz, befunde, onFertig, onOpenSchedule }: {
  absenz: PlanerAbsenz
  befunde: Befund[]
  onFertig: (meldung: string) => void
  onOpenSchedule?: (iso: string) => void
}) {
  const [dialog, setDialog] = useState(false)
  const [laeuft, setLaeuft] = useState(false)
  const offen = absenz.status === 'requested'

  async function entscheiden(genehmigen: boolean, grund?: string) {
    setLaeuft(true)
    try {
      if (genehmigen) await approveAbsence(absenz.id, undefined, grund)
      else await rejectAbsence(absenz.id)
      onFertig(genehmigen ? 'Antrag genehmigt' : 'Antrag abgelehnt')
    } catch {
      onFertig('Entscheid hat nicht geklappt')
    } finally {
      setLaeuft(false)
      setDialog(false)
    }
  }

  return (
    <div className="ferien-panel" aria-label="Antrag">
      <div className="admin-section-title">
        {absenz.staff_name} · {datum(absenz.date_start)}{absenz.date_end !== absenz.date_start && `–${datum(absenz.date_end)}`}
        {' · '}{offen ? 'beantragt' : 'genehmigt'}
      </div>
      {befunde.length ? <BefundListe befunde={befunde} /> : offen && <p className="admin-empty">Keine Befunde.</p>}
      <div className="ferien-panel-aktionen">
        {offen && (
          <>
            <button className="admin-btn admin-btn-success" disabled={laeuft}
              onClick={() => (hatHartenBefund(befunde) ? setDialog(true) : void entscheiden(true))}>✓ Genehmigen</button>
            <button className="admin-btn admin-btn-danger" disabled={laeuft} onClick={() => void entscheiden(false)}>✕ Ablehnen</button>
          </>
        )}
        {onOpenSchedule && (
          <button className="admin-btn admin-btn-secondary" onClick={() => onOpenSchedule(absenz.date_start)}>
            In Einsatzplanung öffnen
          </button>
        )}
      </div>
      {dialog && (
        <UebersteuernDialog name={absenz.staff_name ?? ''} befunde={befunde} onAbbrechen={() => setDialog(false)}
          onBestaetigen={grund => void entscheiden(true, grund)} />
      )}
    </div>
  )
}

export default function FerienplanungScreen({ darfPflegen, onBadgeChange, onOpenSchedule }: {
  /** Geschäftsleitung: Sperrfristen, Regeln, Gruppen pflegen. */
  darfPflegen: boolean
  onBadgeChange?: () => void
  onOpenSchedule?: (iso: string) => void
}) {
  const [reiter, setReiter] = useState<Reiter>('plantafel')
  const [anker, setAnker] = useState(() => new Date())
  const [zoom, setZoom] = useState<Zoom>('quartal')
  const [gruppe, setGruppe] = useState<string | null>(null)
  const [auswahl, setAuswahl] = useState<{ absenz: PlanerAbsenz; befunde: Befund[] } | null>(null)
  const { data, isLoading, isError } = useFerienStammdaten()
  const { toast, showToast } = useToast()
  const { von, bis } = zeitraum(anker, zoom)
  const schritt = zoom === 'monat' ? 1 : zoom === 'quartal' ? 3 : 12
  const titel = new Date(`${von}T12:00:00`).toLocaleDateString('de-CH', { month: 'long', year: 'numeric' })

  function fertig(meldung: string) {
    showToast(meldung, meldung.includes('nicht') ? 'error' : 'success')
    setAuswahl(null)
    void queryClient.invalidateQueries({ queryKey: PLANER_KEY })
    onBadgeChange?.()
  }

  return (
    <div className="admin-page">
      <div className="admin-page-header">
        <div>
          <div className="admin-page-title">Ferienplanung <BetaBadge /></div>
          <div className="admin-page-subtitle">Plantafel, Sperrfristen und Regeln — im Betatest nur Hinweise, nichts wird abgewiesen</div>
        </div>
      </div>

      <div className="kpi-admin-tabs">
        {REITER.map(r => (
          <button key={r.key} className={`kpi-admin-tab${reiter === r.key ? ' active' : ''}`} onClick={() => setReiter(r.key)}>
            {r.text}
          </button>
        ))}
      </div>

      {reiter === 'plantafel' && (
        <>
          <div className="ferien-toolbar">
            <button className="admin-btn admin-btn-secondary admin-btn-sm" aria-label="Zurück"
              onClick={() => setAnker(a => new Date(a.getFullYear(), a.getMonth() - schritt, 1))}>‹</button>
            <button className="admin-btn admin-btn-secondary admin-btn-sm" onClick={() => setAnker(new Date())}>Heute</button>
            <button className="admin-btn admin-btn-secondary admin-btn-sm" aria-label="Vor"
              onClick={() => setAnker(a => new Date(a.getFullYear(), a.getMonth() + schritt, 1))}>›</button>
            <span className="ferien-toolbar-titel">{titel}</span>
            {ZOOMS.map(z => (
              <button key={z.key} className={`admin-btn admin-btn-sm ${zoom === z.key ? 'admin-btn-primary' : 'admin-btn-secondary'}`}
                onClick={() => setZoom(z.key)}>{z.text}</button>
            ))}
            {data && data.gruppen.length > 0 && (
              <select className="admin-form-select" aria-label="Gruppe" value={gruppe ?? ''}
                onChange={e => setGruppe(e.target.value || null)}>
                <option value="">Alle Personen</option>
                {data.gruppen.map(g => <option key={g.id} value={g.id}>{g.name}</option>)}
              </select>
            )}
          </div>
          <Plantafel von={von} bis={bis} zoom={zoom} gruppe={gruppe}
            onAntrag={(absenz, befunde) => setAuswahl({ absenz, befunde })} />
          {auswahl && (
            <AntragPanel key={auswahl.absenz.id} absenz={auswahl.absenz} befunde={auswahl.befunde}
              onFertig={fertig} onOpenSchedule={onOpenSchedule} />
          )}
        </>
      )}

      {reiter !== 'plantafel' && isLoading && <div className="admin-loading"><div className="admin-spinner" /> Laden…</div>}
      {reiter !== 'plantafel' && (isError || (!isLoading && !data)) && (
        <div className="admin-form-error" role="alert">Ferienplanung konnte nicht geladen werden.</div>
      )}
      {data && reiter === 'sperrfristen' && <SperrfristenTab daten={data} darfPflegen={darfPflegen} />}
      {data && reiter === 'regeln' && <RegelnTab daten={data} darfPflegen={darfPflegen} />}
      {data && reiter === 'gruppen' && <GruppenTab daten={data} darfPflegen={darfPflegen} />}
      <ToastHost toast={toast} />
    </div>
  )
}
