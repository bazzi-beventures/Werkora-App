/**
 * Konfiguration — welche Reiter in welchem Bau erscheinen.
 *
 * Spec: docs/specs/admin-werkora-ch.md §6.4 (Wochenplan und Jahresabschluss
 * ziehen nicht um) und §12 (Schreibaktion im falschen Mandanten).
 *
 * Der Bildschirm hat zwei Aufrufer mit verschiedenen Datenräumen:
 *
 * * **Mandanten-App** (`tenantId === null`) — alles gilt dem eigenen Mandanten,
 *   Wochenplan und Jahresabschluss inklusive. Bis zum Rückbau P4 ist das ihr
 *   einziger Weg.
 * * **Betreiber-Seite** (`tenantId = '<uuid>'`) — jeder Reiter nimmt seinen
 *   Mandanten aus dem Pfad. Wochenplan und Jahresabschluss können das nicht:
 *   ihre Routen (`/pwa/admin/hr/…`) lesen den Mandanten aus der Sitzung. Sie
 *   stünden dort unter fremder Überschrift und schrieben beim Betreiber.
 *
 * Deshalb prüfen diese Tests nicht das Aussehen, sondern **wer wann überhaupt
 * gerendert wird**. Die Reiter selbst sind ersetzt: Gegenstand ist die Weiche.
 */
import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

vi.mock('../../admin/configuration/tabs/WeeklyPlanTab', () => ({
  WeeklyPlanTab: () => <div>WOCHENPLAN-INHALT</div>,
}))
vi.mock('../../admin/configuration/tabs/YearEndTab', () => ({
  YearEndTab: () => <div>JAHRESABSCHLUSS-INHALT</div>,
}))
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

describe('ConfigurationScreen — Mandanten-App (eigener Mandant)', () => {
  it('zeigt Wochenplan und Jahresabschluss und startet beim Wochenplan', () => {
    render(<ConfigurationScreen userRole="superadmin" />)

    expect(screen.getByRole('button', { name: 'Wochenplan' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Jahresabschluss' })).toBeInTheDocument()
    expect(screen.getByText('WOCHENPLAN-INHALT')).toBeInTheDocument()
  })

  it('der Jahresabschluss ist erreichbar', async () => {
    render(<ConfigurationScreen userRole="superadmin" />)

    await userEvent.click(screen.getByRole('button', { name: 'Jahresabschluss' }))

    expect(screen.getByText('JAHRESABSCHLUSS-INHALT')).toBeInTheDocument()
  })
})

describe('ConfigurationScreen — Betreiber-Seite (fremder Mandant)', () => {
  it('kennt Wochenplan und Jahresabschluss gar nicht erst', () => {
    // Nicht bloss «nicht vorausgewählt»: es darf keinen Knopf geben, der die
    // HR-Einstellungen des Betreiber-Mandanten unter fremdem Namen öffnet.
    render(<ConfigurationScreen userRole="superadmin" tenantId={FREMDER_MANDANT} />)

    expect(screen.queryByRole('button', { name: 'Wochenplan' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Jahresabschluss' })).toBeNull()
    expect(screen.queryByText('WOCHENPLAN-INHALT')).toBeNull()
    expect(screen.queryByText('JAHRESABSCHLUSS-INHALT')).toBeNull()
  })

  it('startet auf Module statt auf einem leeren Bildschirm', () => {
    // Die Konfiguration ist der Standard-Screen nach der Mandantenwahl
    // (route.ts). Ein Startreiter, den es nicht gibt, wäre eine leere Seite.
    render(<ConfigurationScreen userRole="superadmin" tenantId={FREMDER_MANDANT} />)

    expect(screen.getByText('MODULE-INHALT:modules')).toBeInTheDocument()
  })

  it('die übrigen Reiter bleiben vollständig', async () => {
    render(<ConfigurationScreen userRole="superadmin" tenantId={FREMDER_MANDANT} />)

    for (const name of ['Module', 'Benachrichtigungen', 'Workflows', 'Testing',
      'Fahrtkosten', 'Einsatzplanung', 'Hilfe-Bot']) {
      expect(screen.getByRole('button', { name })).toBeInTheDocument()
    }

    await userEvent.click(screen.getByRole('button', { name: 'Einsatzplanung' }))
    expect(screen.getByText('EINSATZPLANUNG')).toBeInTheDocument()
  })
})
