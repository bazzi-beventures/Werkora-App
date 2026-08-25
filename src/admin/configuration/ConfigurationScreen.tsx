import { useState } from 'react'
import { useTabStrip } from '../hooks/useTabStrip'
import { WeeklyPlanTab } from './tabs/WeeklyPlanTab'
import { YearEndTab } from './tabs/YearEndTab'
import { ModulesTab } from './tabs/ModulesTab'
import { WorkflowsTab } from './tabs/WorkflowsTab'
import { TravelCostTab } from './tabs/TravelCostTab'
import { SchedulingTab } from './tabs/SchedulingTab'
import { HelpDocsTab } from './tabs/HelpDocsTab'

interface ConfigProps {
  userRole?: string
}

export default function ConfigurationScreen({ userRole }: ConfigProps) {
  const isSuperadmin = userRole === 'superadmin'
  const [tab, setTab] = useState<'weekly-plan' | 'year-end' | 'modules' | 'notifications' | 'workflows' | 'travel-cost' | 'scheduling' | 'help-docs'>('weekly-plan')
  const tabsRef = useTabStrip(tab)

  return (
    <div className="admin-page">
      <div className="admin-page-header">
        <div>
          <div className="admin-page-title">Konfiguration</div>
          <div className="admin-page-subtitle">Wochenplan und Jahresabschluss</div>
        </div>
      </div>

      <div className="kpi-admin-tabs" ref={tabsRef}>
        <button
          className={`kpi-admin-tab${tab === 'weekly-plan' ? ' active' : ''}`}
          onClick={() => setTab('weekly-plan')}
        >
          Wochenplan
        </button>
        <button
          className={`kpi-admin-tab${tab === 'year-end' ? ' active' : ''}`}
          onClick={() => setTab('year-end')}
        >
          Jahresabschluss
        </button>
        {isSuperadmin && (
          <button
            className={`kpi-admin-tab${tab === 'modules' ? ' active' : ''}`}
            onClick={() => setTab('modules')}
          >
            Module
          </button>
        )}
        {isSuperadmin && (
          <button
            className={`kpi-admin-tab${tab === 'notifications' ? ' active' : ''}`}
            onClick={() => setTab('notifications')}
          >
            Benachrichtigungen
          </button>
        )}
        {isSuperadmin && (
          <button
            className={`kpi-admin-tab${tab === 'workflows' ? ' active' : ''}`}
            onClick={() => setTab('workflows')}
          >
            Workflows
          </button>
        )}
        {isSuperadmin && (
          <button
            className={`kpi-admin-tab${tab === 'travel-cost' ? ' active' : ''}`}
            onClick={() => setTab('travel-cost')}
          >
            Fahrtkosten
          </button>
        )}
        {isSuperadmin && (
          <button
            className={`kpi-admin-tab${tab === 'scheduling' ? ' active' : ''}`}
            onClick={() => setTab('scheduling')}
          >
            Einsatzplanung
          </button>
        )}
        {isSuperadmin && (
          <button
            className={`kpi-admin-tab${tab === 'help-docs' ? ' active' : ''}`}
            onClick={() => setTab('help-docs')}
          >
            Hilfe-Bot
          </button>
        )}
      </div>

      {tab === 'weekly-plan' && <WeeklyPlanTab />}
      {tab === 'year-end' && <YearEndTab />}
      {tab === 'modules' && isSuperadmin && <ModulesTab view="modules" />}
      {tab === 'notifications' && isSuperadmin && <ModulesTab view="notifications" />}
      {tab === 'workflows' && isSuperadmin && <WorkflowsTab />}
      {tab === 'travel-cost' && isSuperadmin && <TravelCostTab />}
      {tab === 'scheduling' && isSuperadmin && <SchedulingTab />}
      {tab === 'help-docs' && isSuperadmin && <HelpDocsTab />}

    </div>
  )
}
