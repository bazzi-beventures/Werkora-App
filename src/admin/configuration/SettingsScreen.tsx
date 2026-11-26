import { useState } from 'react'
import { useTabStrip } from '../hooks/useTabStrip'
import { WeeklyPlanTab } from './tabs/WeeklyPlanTab'
import { YearEndTab } from './tabs/YearEndTab'
import { TerminDauerTab } from './tabs/TerminDauerTab'
import { TerminFarbenTab } from './tabs/TerminFarbenTab'
import { FilialenTab } from './tabs/FilialenTab'
import { StundensaetzeTab } from './tabs/StundensaetzeTab'

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
 * Dritter Reiter «Termindauer» (Servicebegleitung, nur mit Werkzeug `terminwahl`):
 * Dauer-Vorgaben je Termin-Art. Ebenfalls eine Entscheidung des Betriebs — jeder hat
 * andere Einsätze —, Schreiben verlangt im Backend `require_management`.
 *
 * Vierter Reiter «Terminfarben» (Feature `termin_farbkategorien`): Farbkategorien je
 * Termin für den Einsatzplan (docs/specs/termin-farbkategorien.md) — auch eine
 * Frage des Betriebs, Schreiben verlangt `require_management`.
 *
 * Fünfter Reiter «Filialen» (Feature `filialen`): Filialen in anderen Kantonen und ihr
 * Kanton (docs/specs/ferienplanung.md §10.3) — Schreiben verlangt `require_management`.
 *
 * Sechster Reiter «Stundensätze»: die Funktionen und ihre Verrechnungssätze
 * (Baustelle/Werkstatt). Sass bis 2026-11 unter Stammdaten → «Personal» und wurde
 * dort mit der Menügruppe «Personal» verwechselt — der Satz je Funktion ist eine
 * Einstellung des Betriebs. Schreiben verlangt `require_management`.
 *
 * Sichtbar für `management` (und damit auch `superadmin`) und für Adminkonten mit
 * dem Recht «Arbeitszeiten verwalten» (docs/specs/zeit-verwalten-recht.md) —
 * geführt über `showSettings` in AdminSidebar/MobileNav (`/pwa/me.zeit_einstellungen`),
 * durchgesetzt vom Backend. Termin-Reiter, Filialen und Stundensätze bekommt nur
 * die Geschäftsleitung.
 */
type SettingsTab = 'weekly-plan' | 'year-end' | 'termin-dauer' | 'termin-farben' | 'filialen' | 'stundensaetze'

export default function SettingsScreen({ terminDauer = false, terminFarben = false, filialen = false, stundensaetze = false }: {
  terminDauer?: boolean
  terminFarben?: boolean
  filialen?: boolean
  stundensaetze?: boolean
}) {
  const [tab, setTab] = useState<SettingsTab>('weekly-plan')
  const tabsRef = useTabStrip(tab)

  return (
    <div className="admin-page">
      <div className="admin-page-header">
        <div>
          <div className="admin-page-title">Einstellungen</div>
          <div className="admin-page-subtitle">
            Wochenplan und Jahresabschluss{terminDauer ? ', Termindauer' : ''}{terminFarben ? ', Terminfarben' : ''}{filialen ? ', Filialen' : ''}{stundensaetze ? ', Stundensätze' : ''}
          </div>
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
        {terminDauer && (
          <button
            className={`kpi-admin-tab${tab === 'termin-dauer' ? ' active' : ''}`}
            onClick={() => setTab('termin-dauer')}
          >
            Termindauer
          </button>
        )}
        {terminFarben && (
          <button
            className={`kpi-admin-tab${tab === 'termin-farben' ? ' active' : ''}`}
            onClick={() => setTab('termin-farben')}
          >
            Terminfarben
          </button>
        )}
        {filialen && (
          <button
            className={`kpi-admin-tab${tab === 'filialen' ? ' active' : ''}`}
            onClick={() => setTab('filialen')}
          >
            Filialen
          </button>
        )}
        {stundensaetze && (
          <button
            className={`kpi-admin-tab${tab === 'stundensaetze' ? ' active' : ''}`}
            onClick={() => setTab('stundensaetze')}
          >
            Stundensätze
          </button>
        )}
      </div>

      {tab === 'weekly-plan' && <WeeklyPlanTab />}
      {tab === 'year-end' && <YearEndTab />}
      {tab === 'termin-dauer' && terminDauer && <TerminDauerTab />}
      {tab === 'termin-farben' && terminFarben && <TerminFarbenTab />}
      {tab === 'filialen' && filialen && <FilialenTab />}
      {tab === 'stundensaetze' && stundensaetze && <StundensaetzeTab />}
    </div>
  )
}
