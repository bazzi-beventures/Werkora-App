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
import { useTabStrip } from '../hooks/useTabStrip'
import './kpi-dashboard.css'

type Tab = 'uebersicht' | 'pipeline' | 'projekte' | 'finanzen' | 'arbeitszeit' | 'material' | 'pricing' | 'wartung' | 'leistungsart'

const TABS: { id: Tab; label: string; color: string }[] = [
  { id: 'uebersicht',  label: 'Übersicht',          color: '#0d9488' },
  { id: 'pipeline',    label: 'Projekt-Pipeline',   color: '#c026d3' },
  { id: 'projekte',    label: 'Projekte & Reports', color: '#b45309' },
  { id: 'finanzen',    label: 'Finanzen',            color: '#be123c' },
  { id: 'arbeitszeit', label: 'Arbeitszeit & HR',   color: '#15803d' },
  { id: 'material',    label: 'Material & Lager',   color: '#4338ca' },
  { id: 'pricing',     label: 'Pricing & Supplier', color: '#7c3aed' },
  { id: 'wartung',     label: 'Wartungen',          color: '#0ea5e9' },
  { id: 'leistungsart',label: 'Leistungsart',       color: '#0891b2' },
]

export default function KpiScreen() {
  const [activeTab, setActiveTab] = useState<Tab>('uebersicht')
  const tabsRef = useTabStrip(activeTab)

  function renderTab() {
    switch (activeTab) {
      case 'uebersicht':  return <UebersichtTab />
      case 'pipeline':    return <PipelineTab />
      case 'projekte':    return <ProjekteTab />
      case 'finanzen':    return <FinanzenTab />
      case 'arbeitszeit': return <ArbeitszeitTab />
      case 'material':    return <MaterialTab />
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
