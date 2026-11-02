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

// Kennzahlen-Assistent (docs/specs/kennzahlen-assistent.md §5.1): erster Reiter,
// nur mit Modul «kpi_assistent» UND voller Kennzahlen-Rolle.
vi.mock('./tabs/AssistentTab', () => ({
  default: ({ initialBriefingId }: { initialBriefingId: string | null }) =>
    <div>Assistent-Inhalt {initialBriefingId ?? 'neuste'}</div>,
}))

describe('KpiScreen — Reiter «Assistent»', () => {
  function mit(role: string, modules: string[]) {
    return { role, enabled_modules: modules, feature_flags: {} }
  }

  it('steht mit Modul vorne und ist der Start-Reiter der Geschäftsleitung', async () => {
    getMe.mockResolvedValue(mit('management', ['kpis', 'kpi_assistent']))
    await act(async () => { render(<KpiScreen />) })
    const reiter = screen.getAllByRole('button').map(b => b.textContent)
    expect(reiter[0]).toBe('Assistent')
    expect(screen.getByText('Assistent-Inhalt neuste')).toBeTruthy()
  })

  it('fehlt ohne Modul', async () => {
    getMe.mockResolvedValue(mit('management', ['kpis']))
    await act(async () => { render(<KpiScreen />) })
    expect(screen.queryByText('Assistent')).toBeNull()
    expect(screen.getByText('Übersicht-Inhalt')).toBeTruthy()
  })

  it('fehlt für Manager light, auch mit Modul', async () => {
    getMe.mockResolvedValue(mit('management_light', ['kpis', 'kpi_assistent']))
    await act(async () => { render(<KpiScreen />) })
    expect(screen.queryByText('Assistent')).toBeNull()
    expect(screen.getByText('Pipeline-Inhalt')).toBeTruthy()
  })

  it('öffnet aus der Montags-Push genau die verlinkte Woche', async () => {
    getMe.mockResolvedValue(mit('superadmin', ['kpis', 'kpi_assistent']))
    await act(async () => { render(<KpiScreen detailId="assistent:b-45" />) })
    expect(screen.getByText('Assistent-Inhalt b-45')).toBeTruthy()
  })
})
