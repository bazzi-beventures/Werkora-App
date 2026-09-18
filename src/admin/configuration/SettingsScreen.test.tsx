/**
 * Einstellungen — der Rest der alten «Konfiguration» in der Mandanten-App.
 *
 * Spec: docs/specs/admin-werkora-ch.md §6.5, Entscheid E7.
 *
 * Der Test hält fest, was der Rückbau (P4) **nicht** wegnehmen durfte:
 * Wochenplan und Jahresabschluss waren nur über «Admin-Tools» erreichbar und
 * damit superadmin-only. Mit dem Container wäre auch der Zugang verschwunden —
 * für Einstellungen, die dem Management gehören.
 */
import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

vi.mock('./tabs/WeeklyPlanTab', () => ({
  WeeklyPlanTab: () => <div>WOCHENPLAN-INHALT</div>,
}))
vi.mock('./tabs/YearEndTab', () => ({
  YearEndTab: () => <div>JAHRESABSCHLUSS-INHALT</div>,
}))

import SettingsScreen from './SettingsScreen'

describe('SettingsScreen', () => {
  it('startet beim Wochenplan', () => {
    render(<SettingsScreen />)

    expect(screen.getByRole('button', { name: 'Wochenplan' })).toBeInTheDocument()
    expect(screen.getByText('WOCHENPLAN-INHALT')).toBeInTheDocument()
  })

  it('der Jahresabschluss ist erreichbar', async () => {
    render(<SettingsScreen />)

    await userEvent.click(screen.getByRole('button', { name: 'Jahresabschluss' }))

    expect(screen.getByText('JAHRESABSCHLUSS-INHALT')).toBeInTheDocument()
  })
})
