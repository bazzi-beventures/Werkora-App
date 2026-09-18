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

type Tab =
  | 'weekly-plan' | 'year-end' | 'modules' | 'notifications' | 'workflows'
  | 'testing' | 'travel-cost' | 'scheduling' | 'help-docs'

interface ConfigProps {
  userRole?: string
  /** Mandant der Betreiber-Seite; `null` = eigener Mandant (Mandanten-App, bis
   *  zum Rückbau P4). Wochenplan und Jahresabschluss bleiben davon unberührt —
   *  sie sind Mandanten-Einstellungen und ziehen nicht um (Spec E7). */
  tenantId?: string | null
}

export default function ConfigurationScreen({ userRole, tenantId = null }: ConfigProps) {
  const isSuperadmin = userRole === 'superadmin'

  // Wochenplan und Jahresabschluss ziehen NICHT auf die Betreiber-Seite um
  // (§6.4, E7) — und das ist hier keine Geschmacksfrage, sondern die Bedingung
  // dafür, dass die Seite nicht lügt: beide Reiter rufen `/pwa/admin/hr/…` auf,
  // und diese Routen nehmen den Mandanten aus der SITZUNG, nicht aus einem
  // Parameter. Mit einem gewählten Fremdmandanten stünden sie also unter dessen
  // Überschrift, läsen und schrieben aber den Wochenplan des Betreiber-
  // Mandanten. Genau die Verwechslung, die §12 als teuerste dieser Oberfläche
  // führt — und sie träfe den Standard-Reiter, also den ersten Blick nach der
  // Mandantenwahl.
  //
  // `tenantId === null` heisst «eigener Mandant»: die Mandanten-App, wo beide
  // Reiter richtig sind und bis zum Rückbau P4 auch ihr einziger Weg bleiben.
  const eigenerMandant = tenantId === null

  const [tab, setTab] = useState<Tab>(eigenerMandant ? 'weekly-plan' : 'modules')
  const tabsRef = useTabStrip(tab)

  return (
    <div className="admin-page">
      <div className="admin-page-header">
        <div>
          <div className="admin-page-title">Konfiguration</div>
          <div className="admin-page-subtitle">
            {eigenerMandant
              ? 'Wochenplan und Jahresabschluss'
              : 'Module, Feature-Flags und Hilfe-Dokumente dieses Mandanten'}
          </div>
        </div>
      </div>

      <div className="kpi-admin-tabs" ref={tabsRef}>
        {eigenerMandant && (
          <button
            className={`kpi-admin-tab${tab === 'weekly-plan' ? ' active' : ''}`}
            onClick={() => setTab('weekly-plan')}
          >
            Wochenplan
          </button>
        )}
        {eigenerMandant && (
          <button
            className={`kpi-admin-tab${tab === 'year-end' ? ' active' : ''}`}
            onClick={() => setTab('year-end')}
          >
            Jahresabschluss
          </button>
        )}
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

      {tab === 'weekly-plan' && eigenerMandant && <WeeklyPlanTab />}
      {tab === 'year-end' && eigenerMandant && <YearEndTab />}
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
