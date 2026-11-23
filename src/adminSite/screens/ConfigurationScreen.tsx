import { Fragment, useState } from 'react'
import { useTabStrip } from '../../admin/hooks/useTabStrip'
import { ModulesTab } from './tabs/ModulesTab'
import { WorkflowsTab } from './tabs/WorkflowsTab'
import { TestingTab } from './tabs/TestingTab'
import { TravelCostTab } from './tabs/TravelCostTab'
import { SchedulingTab } from './tabs/SchedulingTab'
import { HelpDocsTab } from './tabs/HelpDocsTab'
import { BexioTab } from './tabs/BexioTab'
import { MailEingangTab } from './tabs/MailEingangTab'
import { MicrosoftTab } from './tabs/MicrosoftTab'
import { ServiceBegleitungTab } from './tabs/ServiceBegleitungTab'
import { RapportBotTab } from './tabs/RapportBotTab'

type Tab =
  | 'modules' | 'notifications' | 'workflows'
  | 'testing' | 'travel-cost' | 'scheduling' | 'help-docs' | 'bexio' | 'microsoft' | 'mail-eingang' | 'service-begleitung' | 'rapport-bot'

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
                  <button
            className={`kpi-admin-tab${tab === 'bexio' ? ' active' : ''}`}
            onClick={() => setTab('bexio')}
          >
            bexio
          </button>
                  <button
            className={`kpi-admin-tab${tab === 'microsoft' ? ' active' : ''}`}
            onClick={() => setTab('microsoft')}
          >
            Microsoft 365
          </button>
                  <button
            className={`kpi-admin-tab${tab === 'mail-eingang' ? ' active' : ''}`}
            onClick={() => setTab('mail-eingang')}
          >
            Mail-Eingang
          </button>
                  <button
            className={`kpi-admin-tab${tab === 'service-begleitung' ? ' active' : ''}`}
            onClick={() => setTab('service-begleitung')}
          >
            Servicebegleitung
          </button>
          <button
            className={`kpi-admin-tab${tab === 'rapport-bot' ? ' active' : ''}`}
            onClick={() => setTab('rapport-bot')}
          >
            Rapport-Bot
          </button>
      </div>

      {/* key: Ein Wechsel im Mandanten-Wähler lässt diesen Screen (und den
          gewählten Reiter) stehen — die Tabs darunter müssen aber neu
          aufgebaut werden. Ohne key liefen Module, Benachrichtigungen,
          Workflows, Tests, Reisekosten, Disposition und Hilfe-Bot bis 2026-11
          mit dem Stand des VORIGEN Mandanten weiter (sie laden nur beim
          Mount), und «Speichern» schrieb diesen Stand beim neuen Mandanten ein.
          Ebenso darf kein halb ausgefülltes Formular stehen bleiben. */}
      <Fragment key={tenantId}>
        {tab === 'modules' && <ModulesTab view="modules" tenantId={tenantId} />}
        {tab === 'notifications' && <ModulesTab view="notifications" tenantId={tenantId} />}
        {tab === 'workflows' && <WorkflowsTab tenantId={tenantId} />}
        {tab === 'testing' && <TestingTab tenantId={tenantId} />}
        {tab === 'travel-cost' && <TravelCostTab tenantId={tenantId} />}
        {tab === 'scheduling' && <SchedulingTab tenantId={tenantId} />}
        {tab === 'help-docs' && <HelpDocsTab tenantId={tenantId} />}
        {tab === 'bexio' && <BexioTab tenantId={tenantId} />}
        {tab === 'microsoft' && <MicrosoftTab tenantId={tenantId} />}
        {tab === 'mail-eingang' && <MailEingangTab tenantId={tenantId} />}
        {tab === 'service-begleitung' && <ServiceBegleitungTab tenantId={tenantId} />}
        {tab === 'rapport-bot' && <RapportBotTab tenantId={tenantId} />}
      </Fragment>

    </div>
  )
}
