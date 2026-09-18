/**
 * Konfiguration — welche Reiter der Betreiber sieht, und welche nicht.
 *
 * Spec: docs/specs/admin-werkora-ch.md §6.4/§6.5 (Wochenplan und
 * Jahresabschluss ziehen nicht um) und §12 (Schreibaktion im falschen
 * Mandanten).
 *
 * Bis zum Rückbau (P4) hatte dieser Bildschirm zwei Aufrufer: die Mandanten-App
 * mit `tenantId === null` und die Betreiber-Seite mit einer UUID. Der erste ist
 * weg — «Admin-Tools» gibt es nicht mehr, `tenantId` ist Pflicht.
 *
 * Was bleibt, ist die Aussage, auf die es ankommt: **Wochenplan und
 * Jahresabschluss dürfen hier nicht auftauchen.** Ihre Routen (`/pwa/admin/hr/…`)
 * lesen den Mandanten aus der Sitzung, nicht aus dem Pfad — unter der
 * Überschrift eines gewählten Mandanten läsen und schrieben sie beim Betreiber.
 * Sie stehen in der Mandanten-App unter «Einstellungen»
 * (`admin/configuration/SettingsScreen.tsx`, eigener Test).
 */
import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

vi.mock('./tabs/ModulesTab', () => ({
  ModulesTab: ({ view }: { view: string }) => <div>MODULE-INHALT:{view}</div>,
}))
vi.mock('./tabs/WorkflowsTab', () => ({ WorkflowsTab: () => <div>WORKFLOWS</div> }))
vi.mock('./tabs/TestingTab', () => ({ TestingTab: () => <div>TESTING</div> }))
vi.mock('./tabs/TravelCostTab', () => ({ TravelCostTab: () => <div>FAHRTKOSTEN</div> }))
vi.mock('./tabs/SchedulingTab', () => ({ SchedulingTab: () => <div>EINSATZPLANUNG</div> }))
vi.mock('./tabs/HelpDocsTab', () => ({ HelpDocsTab: () => <div>HILFE-BOT</div> }))

import ConfigurationScreen from './ConfigurationScreen'

const FREMDER_MANDANT = '11111111-1111-1111-1111-111111111111'

describe('ConfigurationScreen', () => {
  it('kennt Wochenplan und Jahresabschluss gar nicht erst', () => {
    // Nicht bloss «nicht vorausgewählt»: es darf keinen Knopf geben, der die
    // HR-Einstellungen des Betreiber-Mandanten unter fremdem Namen öffnet.
    render(<ConfigurationScreen tenantId={FREMDER_MANDANT} />)

    expect(screen.queryByRole('button', { name: 'Wochenplan' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Jahresabschluss' })).toBeNull()
  })

  it('startet auf Module statt auf einem leeren Bildschirm', () => {
    // Die Konfiguration ist der Standard-Screen nach der Mandantenwahl
    // (route.ts). Ein Startreiter, den es nicht gibt, wäre eine leere Seite.
    render(<ConfigurationScreen tenantId={FREMDER_MANDANT} />)

    expect(screen.getByText('MODULE-INHALT:modules')).toBeInTheDocument()
  })

  it('die übrigen Reiter bleiben vollständig', async () => {
    render(<ConfigurationScreen tenantId={FREMDER_MANDANT} />)

    for (const name of ['Module', 'Benachrichtigungen', 'Workflows', 'Testing',
      'Fahrtkosten', 'Einsatzplanung', 'Hilfe-Bot']) {
      expect(screen.getByRole('button', { name })).toBeInTheDocument()
    }

    await userEvent.click(screen.getByRole('button', { name: 'Einsatzplanung' }))
    expect(screen.getByText('EINSATZPLANUNG')).toBeInTheDocument()
  })
})
