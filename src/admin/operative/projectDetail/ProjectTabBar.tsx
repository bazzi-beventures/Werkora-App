// Die Reiterleiste des Projekt-Details (Charge H, H3). Eigene Datei, weil die
// Reiter-Namen die einzige Stelle sind, an der die Struktur des Screens
// vollstaendig aufgezaehlt steht — im Screen selbst gingen sie zwischen den
// Dialogen unter.

import { useTabStrip } from '../../hooks/useTabStrip'

export type ProjectTab =
  | 'details' | 'documents' | 'supplier' | 'quotes' | 'reports'
  | 'invoices' | 'approvals' | 'tasks' | 'nachkalkulation' | 'status'

const TABS: { key: ProjectTab; label: string }[] = [
  { key: 'details', label: 'Projekt Details' },
  { key: 'tasks', label: 'Aufgaben' },
  { key: 'documents', label: 'Dokumente' },
  { key: 'supplier', label: 'Lieferantendokumente' },
  { key: 'quotes', label: 'Offerten' },
  { key: 'reports', label: 'Rapporte' },
  { key: 'invoices', label: 'Rechnungen' },
  { key: 'approvals', label: 'Visierung' },
  { key: 'nachkalkulation', label: 'Nachkalkulation' },
  { key: 'status', label: 'Status' },
]

// Die Liste oben ist der KATALOG aller Reiter (und wird als solcher gegen
// services/app_links.PROJECT_TABS gehalten). Was ein Benutzer tatsächlich sieht,
// entscheidet `showNachkalkulation`: Eigenkosten und Gewinn gehen nur das
// Management etwas an, und ohne Modul `kpis` antwortet der Endpunkt ohnehin 403.
export function ProjectTabBar({ active, onSelect, showNachkalkulation = false }: {
  active: ProjectTab
  onSelect: (tab: ProjectTab) => void
  showNachkalkulation?: boolean
}) {
  const tabsRef = useTabStrip(active)
  const visible = TABS.filter(t => t.key !== 'nachkalkulation' || showNachkalkulation)

  return (
    <div className="kpi-admin-tabs" ref={tabsRef} style={{ marginBottom: 20 }}>
      {visible.map(t => (
        <button
          key={t.key}
          type="button"
          className={`kpi-admin-tab ${active === t.key ? 'active' : ''}`}
          onClick={() => onSelect(t.key)}
        >
          {t.label}
        </button>
      ))}
    </div>
  )
}
