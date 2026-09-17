import { useState } from 'react'
import { useTabStrip } from '../../admin/hooks/useTabStrip'
import { WeeklyPlanTab } from '../../admin/configuration/tabs/WeeklyPlanTab'
import { YearEndTab } from '../../admin/configuration/tabs/YearEndTab'
import { ModulesTab } from './tabs/ModulesTab'
import { WorkflowsTab } from './tabs/WorkflowsTab'
import { TestingTab } from './tabs/TestingTab'
import { TravelCostTab } from './tabs/TravelCostTab'
import { SchedulingTab } from './tabs/SchedulingTab'
import { HelpDocsTab } from './tabs/HelpDocsTab'

interface ConfigProps {
  userRole?: string
  /** Mandant der Betreiber-Seite; `null` = eigener Mandant (Mandanten-App, bis
   *  zum Rückbau P4). Wochenplan und Jahresabschluss bleiben davon unberührt —
   *  sie sind Mandanten-Einstellungen und ziehen nicht um (Spec E7). */
  tenantId?: string | null
}

export default function ConfigurationScreen({ userRole, tenantId = null }: ConfigProps) {
  const isSuperadmin = userRole === 'superadmin'
  const [tab, setTab] = useState<'weekly-plan' | 'year-end' | 'modules' | 'notifications' | 'workflows' | 'testing' | 'travel-cost' | 'scheduling' | 'help-docs'>('weekly-plan')
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
        {/* Testing steht direkt hinter Workflows: dort setzt man das Beta-Häkchen
            am Modul bzw. am Feature, hier die Menschen, für die es gilt. */}
        {isSuperadmin && (
          <button
            className={`kpi-admin-tab${tab === 'testing' ? ' active' : ''}`}
            onClick={() => setTab('testing')}
          >
            Testing
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
      {tab === 'modules' && isSuperadmin && <ModulesTab view="modules" tenantId={tenantId} />}
      {tab === 'notifications' && isSuperadmin && <ModulesTab view="notifications" tenantId={tenantId} />}
      {tab === 'workflows' && isSuperadmin && <WorkflowsTab tenantId={tenantId} />}
      {tab === 'testing' && isSuperadmin && <TestingTab tenantId={tenantId} />}
      {tab === 'travel-cost' && isSuperadmin && <TravelCostTab tenantId={tenantId} />}
      {tab === 'scheduling' && isSuperadmin && <SchedulingTab tenantId={tenantId} />}
      {tab === 'help-docs' && isSuperadmin && <HelpDocsTab tenantId={tenantId} />}

    </div>
  )
}
