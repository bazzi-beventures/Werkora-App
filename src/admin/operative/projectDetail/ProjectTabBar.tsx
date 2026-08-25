// Die Reiterleiste des Projekt-Details (Charge H, H3). Eigene Datei, weil die
// Reiter-Namen die einzige Stelle sind, an der die Struktur des Screens
// vollstaendig aufgezaehlt steht — im Screen selbst gingen sie zwischen den
// Dialogen unter.

import { useTabStrip } from '../../hooks/useTabStrip'

export type ProjectTab =
  | 'details' | 'documents' | 'supplier' | 'quotes' | 'reports'
  | 'invoices' | 'approvals' | 'tasks' | 'status'

const TABS: { key: ProjectTab; label: string }[] = [
  { key: 'details', label: 'Projekt Details' },
  { key: 'tasks', label: 'Aufgaben' },
  { key: 'documents', label: 'Dokumente' },
  { key: 'supplier', label: 'Lieferantendokumente' },
  { key: 'quotes', label: 'Offerten' },
  { key: 'reports', label: 'Rapporte' },
  { key: 'invoices', label: 'Rechnungen' },
  { key: 'approvals', label: 'Visierung' },
  { key: 'status', label: 'Status' },
]

export function ProjectTabBar({ active, onSelect }: {
  active: ProjectTab
  onSelect: (tab: ProjectTab) => void
}) {
  const tabsRef = useTabStrip(active)

  return (
    <div className="kpi-admin-tabs" ref={tabsRef} style={{ marginBottom: 20 }}>
      {TABS.map(t => (
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
