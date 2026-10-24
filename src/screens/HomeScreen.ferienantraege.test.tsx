import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import HomeScreen from './HomeScreen'

// Spec docs/specs/ferien-freigabe-recht.md §3.3: die Kachel hängt am Handler,
// den App.tsx nur für ein Konto ohne Admin-Rolle mit `absence_approver` setzt.

function props(over: Record<string, unknown> = {}) {
  return {
    displayName: 'Tina Teamleiterin',
    role: 'user',
    enabledModules: ['timekeeping', 'hr'],
    onNavRapport: vi.fn(),
    onNavArbeitszeit: vi.fn(),
    onNavProjekte: vi.fn(),
    onNavOfferten: vi.fn(),
    onNavProjektEntwurf: vi.fn(),
    onNavProfile: vi.fn(),
    onLoggedOut: vi.fn(),
    ...over,
  }
}

describe('Kachel «Ferienanträge»', () => {
  it('fehlt ohne Recht', () => {
    render(<HomeScreen {...props()} />)
    expect(screen.queryByText(/Ferienanträge/)).toBeNull()
  })

  it('führt mit dem Recht in die Freigabe', () => {
    const onNavFerienantraege = vi.fn()
    render(<HomeScreen {...props({ onNavFerienantraege })} />)
    fireEvent.click(screen.getByText('Anträge der Kollegen freigeben'))
    expect(onNavFerienantraege).toHaveBeenCalled()
  })
})
