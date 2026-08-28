import { useState } from 'react'
import UebersichtTab from './tabs/UebersichtTab'
import PipelineTab from './tabs/PipelineTab'
import ProjekteTab from './tabs/ProjekteTab'
import FinanzenTab from './tabs/FinanzenTab'
import ArbeitszeitTab from './tabs/ArbeitszeitTab'
import MaterialTab from './tabs/MaterialTab'
import PricingTab from './tabs/PricingTab'
import WartungTab from './tabs/WartungTab'
import LeistungsartTab from './tabs/LeistungsartTab'
import KundenTab from './tabs/KundenTab'
import LieferantenTab from './tabs/LieferantenTab'
import DeckungsbeitragTab from './tabs/DeckungsbeitragTab'
import { useTabStrip } from '../hooks/useTabStrip'
import './kpi-dashboard.css'

type Tab = 'uebersicht' | 'pipeline' | 'projekte' | 'kunden' | 'finanzen' | 'deckungsbeitrag' | 'arbeitszeit' | 'material' | 'lieferanten' | 'pricing' | 'wartung' | 'leistungsart'

// Die Kennfarbe kommt als Token, nicht als Hex: ein Literal im Inline-Style
// kennt kein Theme (dieselbe Regel wie bei den Karten-Farben in tokens.css).
const TABS: { id: Tab; label: string; color: string }[] = [
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
  { id: 'leistungsart',label: 'Leistungsart',       color: 'var(--kpi-tab-leistungsart)' },
]

export default function KpiScreen() {
  const [activeTab, setActiveTab] = useState<Tab>('uebersicht')
  const tabsRef = useTabStrip(activeTab)

  function renderTab() {
    switch (activeTab) {
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
      case 'leistungsart': return <LeistungsartTab />
    }
  }

  return (
    <div className="admin-page">
      <div className="admin-page-header">
        <div>
          <div className="admin-page-title">Kennzahlen</div>
          <div className="admin-page-subtitle">Business Intelligence — Live-Daten aus allen Bereichen</div>
        </div>
      </div>

      <div className="kpi-admin-tabs" ref={tabsRef}>
        {TABS.map((t) => (
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
