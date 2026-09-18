import { useState } from 'react'
import { useTabStrip } from '../hooks/useTabStrip'
import { WeeklyPlanTab } from './tabs/WeeklyPlanTab'
import { YearEndTab } from './tabs/YearEndTab'

/**
 * Einstellungen des Mandanten — Wochenplan und Jahresabschluss.
 *
 * Spec: docs/specs/admin-werkora-ch.md §6.5, Entscheid E7.
 *
 * Was hier steht, ist der Rest der alten «Konfiguration», nachdem der Rückbau
 * (P4) den Container «Admin-Tools» entfernt hat. Alles Übrige — Module,
 * Feature-Flags, Testing, Fahrtkosten, Einsatzplanung, Hilfe-Dokumente — ist
 * Kalibrierung durch den Betreiber und lebt auf `admin.werkora.ch`.
 *
 * Diese beiden nicht: Wochen-Soll und Überstunden-Reset sind Einstellungen des
 * Mandanten, die sein Management selbst trifft. Sie waren nur deshalb
 * superadmin-only, weil sie im selben Container sassen — ein Nebeneffekt, kein
 * Entscheid. Das Backend stand ohnehin auf `require_admin`.
 *
 * Und sie können gar nicht umziehen: beide Reiter rufen `/pwa/admin/hr/…` auf,
 * und diese Routen nehmen den Mandanten aus der **Sitzung**, nicht aus einem
 * Pfad-Parameter. Auf der Betreiber-Seite stünden sie unter der Überschrift des
 * gewählten Mandanten, läsen und schrieben aber den Wochenplan des
 * Betreiber-Mandanten (§12).
 *
 * Sichtbar für `management` (und damit auch `superadmin`), nicht für
 * eingeschränkte Adminkonten — geführt wird das über `isManagement` in
 * AdminSidebar/MobileNav, durchgesetzt vom Backend.
 */
export default function SettingsScreen() {
  const [tab, setTab] = useState<'weekly-plan' | 'year-end'>('weekly-plan')
  const tabsRef = useTabStrip(tab)

  return (
    <div className="admin-page">
      <div className="admin-page-header">
        <div>
          <div className="admin-page-title">Einstellungen</div>
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
      </div>

      {tab === 'weekly-plan' && <WeeklyPlanTab />}
      {tab === 'year-end' && <YearEndTab />}
    </div>
  )
}
