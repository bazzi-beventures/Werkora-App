import { useState } from 'react'
import { useIsMobile } from '../useIsMobile'
import ConfigurationScreen from '../configuration/ConfigurationScreen'
import ServiceStatusScreen from './ServiceStatusScreen'
import PushTestScreen from './PushTestScreen'
import LlmCostsScreen from '../llm/LlmCostsScreen'
import UsageScreen from '../usage/UsageScreen'
import MaterialCleanupScreen from './MaterialCleanupScreen'
import UnitsPanel from './UnitsPanel'
import ErrorLogsScreen from './ErrorLogsScreen'
import SupportTicketsScreen from './SupportTicketsScreen'
import WerkoraBonusScreen from './WerkoraBonusScreen'

// Admin-Tools bündelt den ganzen Werkzeugkasten unter einem Sidebar-Eintrag.
// Alle Tools sind superadmin-only — der Zugriff wird vom Sidebar-Eintrag bzw.
// dem Guard in AdminApp.renderScreen erzwungen, hier erscheint daher immer die
// vollständige Liste. Jeder Tool-Screen bringt seinen eigenen admin-page-Rahmen
// (Titel + Aktionen) mit; die Navigation daneben macht nur die Auswahl.
//
// Warum eine senkrechte Liste und keine Reiterleiste wie sonst im Admin: bei
// zehn Werkzeugen mit langen Namen ("Materialdatenbereinigung") passte die
// Leiste nicht mehr in eine Zeile und bekam auf dem Desktop eine waagrechte
// Bildlaufleiste — die Hälfte der Werkzeuge war unsichtbar, obwohl daneben
// Platz frei war. Senkrecht stehen alle zehn gleichzeitig da und die Liste
// verträgt auch das elfte. Auf dem Handy fehlt diese Spalte schlicht an
// Breite; dort wird dieselbe Liste zu einem Auswahlfeld über dem Werkzeug.
type Tool = 'configuration' | 'service-status' | 'push-test' | 'llm-costs' | 'usage' | 'units' | 'material-cleanup' | 'error-logs' | 'support' | 'werkora-bonus'

interface Props {
  userRole: string
  /** Module dieses Mandanten — durchgereicht an das Nutzungs-Dashboard, das
   *  daraus das Modul-Inventar baut (Spec docs/specs/nutzungs-dashboard.md §7c). */
  enabledModules: string[]
}

const TABS: { id: Tool; label: string }[] = [
  { id: 'configuration',  label: 'Konfiguration' },
  { id: 'service-status', label: 'Service-Status' },
  { id: 'push-test',      label: 'Push-Test' },
  { id: 'llm-costs',      label: 'LLM-Kosten' },
  { id: 'usage',          label: 'Nutzung' },
  { id: 'units',          label: 'Einheiten' },
  { id: 'material-cleanup', label: 'Materialdatenbereinigung' },
  { id: 'error-logs',     label: 'Error-Logs' },
  // Support-Eingang (Spec docs/specs/support-ticket.md): Dashboard + Liste.
  // Neben den Error-Logs, weil man beim Bearbeiten einer Meldung regelmässig
  // in den Fehlerbestand desselben Zeitfensters schaut.
  { id: 'support',        label: 'Support' },
  // Bewusst immer sichtbar statt nur bei aktivem Feature: der Reiter ist ohnehin
  // superadmin-only, und der Screen sagt selbst, wenn das Feature aus ist. Ihn
  // auszublenden hiesse, dass ein Superadmin nach dem Einschalten erst neu laden
  // muss — und dass der Bestand aus der Zeit, in der es lief, unerreichbar wird.
  { id: 'werkora-bonus',  label: 'Werkora Bonus' },
]

export default function AdminToolsScreen({ userRole, enabledModules }: Props) {
  const [active, setActive] = useState<Tool>('configuration')
  const isMobile = useIsMobile()

  function renderTool() {
    switch (active) {
      case 'configuration':  return <ConfigurationScreen userRole={userRole} />
      case 'service-status': return <ServiceStatusScreen />
      case 'push-test':      return <PushTestScreen />
      case 'llm-costs':      return <LlmCostsScreen />
      case 'usage':          return <UsageScreen enabledModules={enabledModules} />
      case 'units':          return <UnitsPanel />
      case 'material-cleanup': return <MaterialCleanupScreen />
      case 'error-logs':     return <ErrorLogsScreen />
      case 'support':        return <SupportTicketsScreen />
      case 'werkora-bonus':  return <WerkoraBonusScreen />
    }
  }

  if (isMobile) {
    return (
      <>
        <div className="admin-tools-picker">
          <label>
            <span>Werkzeug</span>
            <select value={active} onChange={e => setActive(e.target.value as Tool)}>
              {TABS.map(t => <option key={t.id} value={t.id}>{t.label}</option>)}
            </select>
          </label>
        </div>
        {renderTool()}
      </>
    )
  }

  return (
    <div className="admin-tools-layout">
      <nav className="admin-tools-nav" aria-label="Werkzeuge">
        {TABS.map(t => (
          <button
            key={t.id}
            type="button"
            className={`admin-tools-nav-item${active === t.id ? ' active' : ''}`}
            // aria-current statt aria-selected: das hier ist eine Navigation,
            // kein ARIA-Tablist — ein tablist müsste Pfeiltasten-Steuerung
            // mitbringen, die es hier weder gibt noch braucht.
            aria-current={active === t.id ? 'page' : undefined}
            onClick={() => setActive(t.id)}
          >
            {t.label}
          </button>
        ))}
      </nav>
      <div className="admin-tools-panel">{renderTool()}</div>
    </div>
  )
}
