import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import HomeScreen from './HomeScreen'

// Spec docs/specs/rollierende-inventur.md §10.5.
//
// Die Regel, die hier festgehalten wird, ist ungewöhnlich und deshalb leicht
// wieder wegzurationalisieren: Die Kachel hängt an der **Zuteilung**, nicht an
// einem Modul-Häkchen und nicht an einer Rolle. Wem eine Tranche gehört, der
// darf sie zählen — und wem keine gehört, dem sagt eine Kachel «Inventur»
// nichts, ausser dass es etwas gibt, das ihn nichts angeht.

function props(over: Record<string, unknown> = {}) {
  return {
    displayName: 'Peter Lagerist',
    role: 'user',
    enabledModules: ['timekeeping'],
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

const tranche = {
  count_id: 'c1', title: 'Inventur KW 39', offen: 12, ueberfaellig: false,
}

describe('Inventur-Kachel auf dem Startbildschirm', () => {
  it('fehlt, solange mir keine Zählung zugeteilt ist', () => {
    render(<HomeScreen {...props({ inventur: null, onNavInventur: vi.fn() })} />)
    expect(screen.queryByText('Inventur')).toBeNull()
  })

  it('steht da, sobald eine Tranche mir gehört — mit der offenen Menge', () => {
    render(<HomeScreen {...props({ inventur: tranche, onNavInventur: vi.fn() })} />)
    expect(screen.getByText('Inventur')).toBeTruthy()
    expect(screen.getByText('12 offen')).toBeTruthy()
    expect(screen.getByText('Inventur KW 39')).toBeTruthy()
  })

  it('sagt es, wenn die Frist durch ist', () => {
    render(<HomeScreen {...props({
      inventur: { ...tranche, ueberfaellig: true }, onNavInventur: vi.fn(),
    })} />)
    expect(screen.getByText(/überfällig/)).toBeTruthy()
  })

  it('führt mit einem Tipp in die Inventur', () => {
    const onNavInventur = vi.fn()
    render(<HomeScreen {...props({ inventur: tranche, onNavInventur })} />)
    fireEvent.click(screen.getByText('Inventur'))
    expect(onNavInventur).toHaveBeenCalled()
  })

  it('erscheint auch für ein Konto ohne Admin-Rolle — darum geht es', () => {
    // `role: 'user'` kommt gar nicht in die Admin-App. Wäre die Kachel an eine
    // Rolle geknüpft, bliebe die Tranche für ihren Empfänger unerreichbar.
    render(<HomeScreen {...props({ role: 'user', inventur: tranche, onNavInventur: vi.fn() })} />)
    expect(screen.getByText('Inventur')).toBeTruthy()
  })
})
