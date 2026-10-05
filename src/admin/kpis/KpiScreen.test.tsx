import { describe, it, expect, vi, beforeEach } from 'vitest'
import { act, render, screen } from '@testing-library/react'
import KpiScreen from './KpiScreen'

// Manager light sieht von den Kennzahlen nur «Projekt-Pipeline» und «Projekte &
// Reports» — dieselbe Grenze zieht agents/routers/kpi.py (403 für alles andere).

const getMe = vi.fn()
vi.mock('../../api/auth', () => ({ getMe: () => getMe() }))
vi.mock('../hooks/useTabStrip', () => ({ useTabStrip: () => ({ current: null }) }))
vi.mock('./tabs/UebersichtTab', () => ({ default: () => <div>Übersicht-Inhalt</div> }))
vi.mock('./tabs/PipelineTab', () => ({ default: () => <div>Pipeline-Inhalt</div> }))

beforeEach(() => getMe.mockReset())

function me(role: string) {
  return { role, enabled_modules: ['kpis'], feature_flags: {} }
}

describe('KpiScreen — Reiter je Rolle', () => {
  it('zeigt Manager light nur Pipeline und Projekte & Reports, Start auf der Pipeline', async () => {
    getMe.mockResolvedValue(me('management_light'))
    await act(async () => { render(<KpiScreen />) })
    expect(screen.getByText('Projekt-Pipeline')).toBeTruthy()
    expect(screen.getByText('Projekte & Reports')).toBeTruthy()
    expect(screen.getByText('Pipeline-Inhalt')).toBeTruthy()
    for (const label of ['Übersicht', 'Finanzen', 'Kunden', 'Deckungsbeitrag', 'Arbeitszeit & HR',
      'Material & Lager', 'Lieferanten-Marge', 'Pricing & Supplier', 'Wartungen', 'Leistungsart']) {
      expect(screen.queryByText(label)).toBeNull()
    }
    expect(screen.queryByText('Übersicht-Inhalt')).toBeNull()
  })

  it('zeigt der Geschäftsleitung alle Reiter, Start auf der Übersicht', async () => {
    getMe.mockResolvedValue(me('management'))
    await act(async () => { render(<KpiScreen />) })
    expect(screen.getByText('Projekt-Pipeline')).toBeTruthy()
    expect(screen.getByText('Projekte & Reports')).toBeTruthy()
    expect(screen.getByText('Finanzen')).toBeTruthy()
    expect(screen.getByText('Übersicht-Inhalt')).toBeTruthy()
  })
})
