import { useState } from 'react'
import { useTabStrip } from '../../admin/hooks/useTabStrip'
import { ModulesTab } from './tabs/ModulesTab'
import { WorkflowsTab } from './tabs/WorkflowsTab'
import { TestingTab } from './tabs/TestingTab'
import { TravelCostTab } from './tabs/TravelCostTab'
import { SchedulingTab } from './tabs/SchedulingTab'
import { HelpDocsTab } from './tabs/HelpDocsTab'

type Tab =
  | 'modules' | 'notifications' | 'workflows'
  | 'testing' | 'travel-cost' | 'scheduling' | 'help-docs'

/**
 * Kalibrierung eines Mandanten durch den Betreiber.
 *
 * Spec: docs/specs/admin-werkora-ch.md §4.4, Rückbau §6.5.
 *
 * **Zwei Reiter sind mit P4 hier ausgezogen**, nicht gelöscht: Wochenplan und
 * Jahresabschluss stehen in der Mandanten-App unter «Einstellungen»
 * (`admin/configuration/SettingsScreen.tsx`). Sie konnten nie hierher: beide
 * rufen `/pwa/admin/hr/…` auf, und diese Routen nehmen den Mandanten aus der
 * **Sitzung**. Unter der Überschrift des gewählten Mandanten hätten sie den
 * Wochenplan des Betreiber-Mandanten gelesen und geschrieben (§12).
 *
 * Eine Rollen-Weiche braucht es hier ebenfalls nicht mehr. Auf dieser Seite
 * kommt nur herein, wer `superadmin` ist — der Anmeldeschirm meldet jeden
 * anderen wieder ab, und jede Route dahinter trägt `require_superadmin`. Das
 * frühere `isSuperadmin` war der Rest aus der Zeit, als derselbe Screen auch
 * in der Mandanten-App hing.
 */
export default function ConfigurationScreen({ tenantId }: { tenantId: string }) {
  const [tab, setTab] = useState<Tab>('modules')
  const tabsRef = useTabStrip(tab)

  return (
    <div className="admin-page">
      <div className="admin-page-header">
        <div>
          <div className="admin-page-title">Konfiguration</div>
          <div className="admin-page-subtitle">
            Module, Feature-Flags und Hilfe-Dokumente dieses Mandanten
          </div>
        </div>
      </div>

      <div className="kpi-admin-tabs" ref={tabsRef}>
                  <button
            className={`kpi-admin-tab${tab === 'modules' ? ' active' : ''}`}
            onClick={() => setTab('modules')}
          >
            Module
          </button>
                  <button
            className={`kpi-admin-tab${tab === 'notifications' ? ' active' : ''}`}
            onClick={() => setTab('notifications')}
          >
            Benachrichtigungen
          </button>
                  <button
            className={`kpi-admin-tab${tab === 'workflows' ? ' active' : ''}`}
            onClick={() => setTab('workflows')}
          >
            Workflows
          </button>
        {/* Testing steht direkt hinter Workflows: dort setzt man das Beta-Häkchen
            am Modul bzw. am Feature, hier die Menschen, für die es gilt. */}
                  <button
            className={`kpi-admin-tab${tab === 'testing' ? ' active' : ''}`}
            onClick={() => setTab('testing')}
          >
            Testing
          </button>
                  <button
            className={`kpi-admin-tab${tab === 'travel-cost' ? ' active' : ''}`}
            onClick={() => setTab('travel-cost')}
          >
            Fahrtkosten
          </button>
                  <button
            className={`kpi-admin-tab${tab === 'scheduling' ? ' active' : ''}`}
            onClick={() => setTab('scheduling')}
          >
            Einsatzplanung
          </button>
                  <button
            className={`kpi-admin-tab${tab === 'help-docs' ? ' active' : ''}`}
            onClick={() => setTab('help-docs')}
          >
            Hilfe-Bot
          </button>
      </div>

      {tab === 'modules' && <ModulesTab view="modules" tenantId={tenantId} />}
      {tab === 'notifications' && <ModulesTab view="notifications" tenantId={tenantId} />}
      {tab === 'workflows' && <WorkflowsTab tenantId={tenantId} />}
      {tab === 'testing' && <TestingTab tenantId={tenantId} />}
      {tab === 'travel-cost' && <TravelCostTab tenantId={tenantId} />}
      {tab === 'scheduling' && <SchedulingTab tenantId={tenantId} />}
      {tab === 'help-docs' && <HelpDocsTab tenantId={tenantId} />}

    </div>
  )
}
