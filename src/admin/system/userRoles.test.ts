import { describe, it, expect } from 'vitest'
import { assignableRoles, mayAnonymize, mayEditTarget } from './userRoles'

// Muss zur Backend-Matrix in agents/routers/admin_users.py passen — laufen die
// beiden auseinander, zeigt die Oberfläche Knöpfe, die in einem 403 enden.

describe('assignableRoles', () => {
  it('lässt den Admin Mitarbeiter anlegen, aber keine Admins', () => {
    expect(assignableRoles('admin')).toEqual(['user_light', 'user'])
  })

  it('lässt Management bis Admin vergeben', () => {
    expect(assignableRoles('management')).toEqual(['user_light', 'user', 'admin'])
  })

  it('gibt für unbekannte/fehlende Rollen nichts frei', () => {
    expect(assignableRoles('user')).toEqual([])
    expect(assignableRoles(null)).toEqual([])
  })
})

describe('mayEditTarget', () => {
  it('erlaubt dem Admin nur Mitarbeiter-Konten', () => {
    expect(mayEditTarget('admin', 'user')).toBe(true)
    expect(mayEditTarget('admin', 'user_light')).toBe(true)
    expect(mayEditTarget('admin', 'admin')).toBe(false)
    expect(mayEditTarget('admin', 'management')).toBe(false)
  })

  it('lässt Management sich untereinander verwalten, aber keine Superadmins', () => {
    expect(mayEditTarget('management', 'management')).toBe(true)
    expect(mayEditTarget('management', 'superadmin')).toBe(false)
  })

  it('behandelt eine fehlende Ziel-Rolle als nicht bearbeitbar', () => {
    expect(mayEditTarget('superadmin', null)).toBe(false)
  })
})

describe('mayAnonymize', () => {
  it('bleibt Management und Superadmin vorbehalten', () => {
    expect(mayAnonymize('management')).toBe(true)
    expect(mayAnonymize('superadmin')).toBe(true)
    expect(mayAnonymize('admin')).toBe(false)
  })
})
