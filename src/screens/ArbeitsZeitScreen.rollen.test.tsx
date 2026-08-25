import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import ArbeitsZeitScreen from './ArbeitsZeitScreen'

// `user_light` ist reiner Zeiterfasser: kein Chat, keine Projekte
// (docs/Admin_Handbuch.md §12). Der HomeScreen blendet den Weg dorthin aus, die
// Arbeitszeit-Maske zeigte ihn trotzdem — `role` kam als Prop an, wurde aber nie
// benutzt. Der Tap endete über den Guard in App.tsx kommentarlos wieder auf Home:
// ein sichtbarer Weg, der nirgends hinführt.

vi.mock('../api/chat', () => ({
  zeitAction: vi.fn(),
  submitCorrectionRequest: vi.fn(),
  getCorrectionStatus: vi.fn(),
}))

function renderScreen(role?: string) {
  return render(
    <ArbeitsZeitScreen
      displayName="Kevin De Florian"
      role={role}
      onNavHome={() => {}}
      onNavRapport={() => {}}
      onNavProjekte={() => {}}
      onNavProfile={() => {}}
      onLoggedOut={() => {}}
      onOpenBericht={() => {}}
      onNavAbsenzen={() => {}}
    />
  )
}

describe('ArbeitsZeitScreen — Navigation je Rolle', () => {
  it('zeigt «Projekte» für normale Mitarbeiter', () => {
    renderScreen('user')
    expect(screen.getByText('Projekte')).toBeInTheDocument()
  })

  it('blendet «Projekte» für user_light aus', () => {
    renderScreen('user_light')
    expect(screen.queryByText('Projekte')).not.toBeInTheDocument()
  })

  it('zeigt «Projekte», wenn die Rolle fehlt (Alt-Client, unbekannter Stand)', () => {
    // Nicht ausblenden, was man nicht beurteilen kann: der Guard in App.tsx und
    // das Backend halten den Zugriff ohnehin dicht.
    renderScreen(undefined)
    expect(screen.getByText('Projekte')).toBeInTheDocument()
  })
})
