import { useEffect, useState } from 'react'
import UebersichtTab from './tabs/UebersichtTab'
import PipelineTab from './tabs/PipelineTab'
import ProjekteTab from './tabs/ProjekteTab'
import FinanzenTab from './tabs/FinanzenTab'
import ArbeitszeitTab from './tabs/ArbeitszeitTab'
import MaterialTab from './tabs/MaterialTab'
import PricingTab from './tabs/PricingTab'
import WartungTab from './tabs/WartungTab'
import GarantieTab from './tabs/GarantieTab'
import LeistungsartTab from './tabs/LeistungsartTab'
import KundenTab from './tabs/KundenTab'
import LieferantenTab from './tabs/LieferantenTab'
import DeckungsbeitragTab from './tabs/DeckungsbeitragTab'
import AssistentTab from './tabs/AssistentTab'
import { parseAssistentLink } from './assistent'
import type { KpiReiter } from '../../api/admin/kpiAssistent'
import type { AdminScreen } from '../useAdminNav'
import { useTabStrip } from '../hooks/useTabStrip'
import { getMe } from '../../api/auth'
import { hasModule } from '../../api/modules'
import { isManagementRole } from '../../shared/roles'
import './kpi-dashboard.css'

// Manager light (`management_light`) sieht NUR diese Reiter. Spiegel von
// agents/routers/kpi.py (Pipeline-Route + MANAGER_LIGHT_VIEWS = vw_kpi_projekt):
// jeder andere Reiter liefe in ein 403.
const MANAGER_LIGHT_TABS: ReadonlySet<string> = new Set(['pipeline', 'projekte'])

type Tab = 'assistent' | 'uebersicht' | 'pipeline' | 'projekte' | 'kunden' | 'finanzen' | 'deckungsbeitrag' | 'arbeitszeit' | 'material' | 'lieferanten' | 'pricing' | 'wartung' | 'garantie' | 'leistungsart'

// Die Kennfarbe kommt als Token, nicht als Hex: ein Literal im Inline-Style
// kennt kein Theme (dieselbe Regel wie bei den Karten-Farben in tokens.css).
const TABS: { id: Tab; label: string; color: string }[] = [
  // Nur mit Modul «kpi_assistent» und voller Kennzahlen-Rolle — siehe `visible`
  // (docs/specs/kennzahlen-assistent.md §5.1).
  { id: 'assistent',   label: 'Assistent',          color: 'var(--primary)' },
  { id: 'uebersicht',  label: 'Übersicht',          color: 'var(--kpi-tab-uebersicht)' },
  { id: 'pipeline',    label: 'Projekt-Pipeline',   color: 'var(--kpi-tab-pipeline)' },
  { id: 'projekte',    label: 'Projekte & Reports', color: 'var(--kpi-tab-projekte)' },
  { id: 'kunden',      label: 'Kunden',             color: 'var(--kpi-tab-kunden)' },
  { id: 'finanzen',    label: 'Finanzen',            color: 'var(--kpi-tab-finanzen)' },
  { id: 'deckungsbeitrag', label: 'Deckungsbeitrag', color: 'var(--kpi-tab-deckungsbeitrag)' },
  { id: 'arbeitszeit', label: 'Arbeitszeit & HR',   color: 'var(--kpi-tab-arbeitszeit)' },
  { id: 'material',    label: 'Material & Lager',   color: 'var(--kpi-tab-material)' },
  { id: 'lieferanten', label: 'Lieferanten-Marge',  color: 'var(--kpi-tab-lieferanten)' },
  { id: 'pricing',     label: 'Pricing & Supplier', color: 'var(--kpi-tab-pricing)' },
  { id: 'wartung',     label: 'Wartungen',          color: 'var(--kpi-tab-wartung)' },
  // Nur mit Modul «warranty» (docs/specs/garantiefall.md §6.4) — siehe `visible`.
  { id: 'garantie',    label: 'Garantie',           color: 'var(--kpi-tab-garantie)' },
  { id: 'leistungsart',label: 'Leistungsart',       color: 'var(--kpi-tab-leistungsart)' },
]

interface Props {
  /** `detailId` des Admin-Screens (Montags-Push), siehe `parseAssistentLink`. */
  detailId?: string | null
  /** Für Reiter-Knöpfe, die aus den Kennzahlen hinausführen (Rechnungen). */
  onNavigate?: (screen: AdminScreen) => void
}

export default function KpiScreen({ detailId, onNavigate }: Props = {}) {
  const assistentLink = parseAssistentLink(detailId)
  const [activeTab, setActiveTab] = useState<Tab | null>(null)
  const tabsRef = useTabStrip(activeTab ?? '')
  // /pwa/me filtert Module pro Konto (Beta-Häkchen): ohne «warranty» kein Tab —
  // die View antwortete ohnehin mit 403.
  const [showGarantie, setShowGarantie] = useState(false)
  // Ebenso der Assistent: /pwa/me filtert das Beta-Häkchen je Konto.
  const [showAssistent, setShowAssistent] = useState(false)
  // Bis /pwa/me da ist, steht kein Reiter: sonst lüde «Übersicht» schon los und
  // liefe für Manager light in ein 403, bevor die Rolle bekannt ist.
  const [fullAccess, setFullAccess] = useState<boolean | null>(null)
  useEffect(() => {
    getMe().then(me => {
      const voll = isManagementRole(me.role)
      const assistent = voll && hasModule(me, 'kpi_assistent')
      setShowGarantie(hasModule(me, 'warranty'))
      setShowAssistent(assistent)
      setFullAccess(voll)
      setActiveTab(assistent ? 'assistent' : voll ? 'uebersicht' : 'pipeline')
    }).catch(() => {
      // Ohne /pwa/me: wie bisher die volle Sicht — das Backend sperrt ohnehin.
      setFullAccess(true)
      setActiveTab('uebersicht')
    })
  }, [])
  // Kommt die Push, während die Kennzahlen schon offen sind, wechselt nur der
  // detailId — der Reiter springt trotzdem, und der `key` unten lädt die Woche neu.
  useEffect(() => {
    if (assistentLink && showAssistent) setActiveTab('assistent')
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [detailId, showAssistent])

  const visible = fullAccess === null ? [] : TABS.filter(t =>
    (t.id !== 'garantie' || showGarantie) && (t.id !== 'assistent' || showAssistent)
      && (fullAccess || MANAGER_LIGHT_TABS.has(t.id)),
  )

  // Reiter-Knopf aus dem Assistenten: ein Kennzahlen-Reiter wechselt hier, die
  // offenen Rechnungen führen in den Rechnungen-Screen.
  function oeffneReiter(reiter: KpiReiter) {
    if (reiter.id === 'rechnungen') {
      onNavigate?.('invoices')
      return
    }
    const ziel = visible.find(t => t.id === reiter.id)
    if (ziel) setActiveTab(ziel.id)
  }

  function renderTab() {
    switch (activeTab) {
      case null:          return null
      case 'assistent':   return (
        <AssistentTab
          key={assistentLink?.briefingId ?? 'neuste'}
          initialBriefingId={assistentLink?.briefingId ?? null}
          onOpenReiter={oeffneReiter}
        />
      )
      case 'uebersicht':  return <UebersichtTab />
      case 'pipeline':    return <PipelineTab />
      case 'projekte':    return <ProjekteTab />
      case 'kunden':      return <KundenTab />
      case 'finanzen':    return <FinanzenTab />
      case 'deckungsbeitrag': return <DeckungsbeitragTab />
      case 'arbeitszeit': return <ArbeitszeitTab />
      case 'material':    return <MaterialTab />
      case 'lieferanten': return <LieferantenTab />
      case 'pricing':     return <PricingTab />
      case 'wartung':     return <WartungTab />
      case 'garantie':    return <GarantieTab />
      case 'leistungsart': return <LeistungsartTab />
    }
  }

  return (
    // admin-page-wide: alle Tabs sind Charts + breite Tabellen (Kunden hat
    // 9 Spalten, Projekte noch mehr). Bei den 1200px von .admin-page bleibt
    // auf grossen Bildschirmen die halbe Breite leer, waehrend die Tabelle
    // rechts abgeschnitten wird und nur per Scrollbalken erreichbar ist.
    // Die Grids (auto-fit) und Charts (100%) dehnen sich von selbst aus.
    <div className="admin-page admin-page-wide">
      <div className="admin-page-header">
        <div>
          <div className="admin-page-title">Kennzahlen</div>
          <div className="admin-page-subtitle">Business Intelligence — Live-Daten aus allen Bereichen</div>
        </div>
      </div>

      <div className="kpi-admin-tabs" ref={tabsRef}>
        {visible.map((t) => (
          <button
            key={t.id}
            className={`kpi-admin-tab${activeTab === t.id ? ' active' : ''}`}
            style={activeTab === t.id ? { borderBottomColor: t.color, color: t.color } : {}}
            onClick={() => setActiveTab(t.id)}
          >
            {t.label}
          </button>
        ))}
      </div>

      <div className="kpi-admin-content">
        {renderTab()}
      </div>
    </div>
  )
}
