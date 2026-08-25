import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import ProfileScreen from './ProfileScreen'

// Im eigenen Profil stand bisher bei drei der fünf Rollen der technische
// Schlüssel («user_light», «management», «superadmin») — die Übersetzungstabelle
// kannte nur 'admin', 'user' und ein 'manager', das es als Rolle nie gab.

vi.mock('../api/auth', () => ({ logout: vi.fn() }))
vi.mock('../api/push', () => ({
  getPushState: vi.fn().mockResolvedValue('unsupported'),
  enablePush: vi.fn(),
  disablePush: vi.fn(),
}))

function renderProfile(role: string) {
  return render(
    <ProfileScreen
      displayName="Kevin De Florian"
      email="kevin@example.ch"
      role={role}
      tenantName="Gehlhaar GmbH"
      onBack={() => {}}
      onLoggedOut={() => {}}
    />
  )
}

describe('ProfileScreen — Rollen-Anzeige', () => {
  it.each([
    ['user_light', 'Mitarbeiter (Zeiterfassung)'],
    ['user', 'Mitarbeiter'],
    ['admin', 'Administrator'],
    ['management', 'Geschäftsleitung'],
    ['superadmin', 'Superadmin'],
  ])('zeigt für %s den Klartext «%s»', (role, label) => {
    renderProfile(role)
    expect(screen.getAllByText(label).length).toBeGreaterThan(0)
  })

  it('zeigt einen unbekannten Wert unverändert an', () => {
    // Neue Rolle im Backend, alte PWA: der Schlüssel ist im Support-Fall
    // brauchbarer als eine leere Zeile.
    renderProfile('user_xy')
    expect(screen.getAllByText('user_xy').length).toBeGreaterThan(0)
  })
})
