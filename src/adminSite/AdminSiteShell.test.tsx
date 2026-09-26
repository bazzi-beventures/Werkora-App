/**
 * Rahmen der Betreiber-Seite (docs/specs/admin-werkora-ch.md §4.1, §6.2).
 *
 * Zwei Zusicherungen, die man sonst erst im Betrieb bemerkt:
 *
 * 1. Der **Mandanten-Bereich ist ohne Auswahl leer** — mit Hinweis, nicht mit
 *    Fehler und nicht mit Einträgen, die ins Nichts führen.
 * 2. Das **Umgebungs-Badge** kommt aus dem Build, nicht aus einer Einstellung.
 *    Produktion und Staging sehen sonst identisch aus, und eine Schaltaktion im
 *    falschen System ist der teuerste Fehler dieser Seite.
 */
import { describe, it, expect, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'

vi.mock('../admin/useIsMobile', () => ({ useIsMobile: () => false }))

import AdminSiteShell from './AdminSiteShell'
import type { TenantScope } from './useTenantScope'
import type { AdminSiteScreen } from './useAdminSiteNav'

const GEHLHAAR = { id: 't-1', slug: 'gehlhaar', name: 'Gehlhaar AG', enabled_modules: [], beta_modules: [] }

function scopeMit(tenantId: string | null): TenantScope {
  return {
    tenants: [GEHLHAAR],
    loading: false,
    error: null,
    tenant: tenantId ? GEHLHAAR : null,
    tenantId,
    requireTenantId: () => { throw new Error('nicht in diesem Test') },
    selectTenant: vi.fn(),
    reload: vi.fn(),
  }
}

function zeige(
  tenantId: string | null,
  scope = scopeMit(tenantId),
  zeigeRechnungen = false,
  aktuellerScreen: AdminSiteScreen = 'uebersicht',
) {
  return render(
    <AdminSiteShell
      screen={aktuellerScreen}
      onNav={vi.fn()}
      scope={scope}
      displayName="Luca"
      onLogout={vi.fn()}
      onChangePassword={vi.fn()}
      zeigeRechnungen={zeigeRechnungen}
    >
      <div>inhalt</div>
    </AdminSiteShell>,
  )
}

describe('AdminSiteShell', () => {
  it('zeigt beide Bereiche', () => {
    zeige('t-1')
    expect(screen.getByText('Plattform')).toBeTruthy()
    // «Mandant» steht zweimal: als Bereichs-Überschrift und als Beschriftung
    // des Wählers im Kopf. Beides ist gewollt.
    expect(screen.getAllByText('Mandant')).toHaveLength(2)
  })

  it('führt die Plattform-Werkzeuge immer auf — auch ohne Mandant', () => {
    zeige(null)
    for (const titel of ['Übersicht', 'Service-Status', 'Error-Logs', 'Support', 'Push-Test', 'Newsletter']) {
      expect(screen.getByRole('button', { name: titel })).toBeTruthy()
    }
  })

  it('der Mandanten-Bereich ist ohne Auswahl leer, mit Hinweis', () => {
    zeige(null)
    expect(screen.getByText(/einen Mandanten wählen/i)).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Konfiguration' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Nutzung' })).toBeNull()
  })

  it('mit Mandant erscheinen dessen Werkzeuge samt Name', () => {
    zeige('t-1')
    expect(screen.getByRole('button', { name: 'Konfiguration' })).toBeTruthy()
    // Einmal unter der Bereichs-Überschrift, einmal als gewählte Zeile im
    // Wähler — der Name steht bewusst an beiden Stellen (§4.2).
    expect(screen.getAllByText('Gehlhaar AG').length).toBeGreaterThanOrEqual(2)
    expect(screen.getByRole('combobox')).toHaveProperty('value', 't-1')
  })

  it('graut den Wähler auf Seiten aus, die ihn ignorieren (support-uebersicht.md §3.5)', () => {
    // Sonst liest sich «Gehlhaar AG» im Kopf als Filter über dem Support-Eingang,
    // der aber alle Mandanten zeigt.
    zeige('t-1', scopeMit('t-1'), false, 'support')
    expect(screen.getByRole('combobox')).toBeDisabled()
    expect(screen.getByTitle('Diese Seite zeigt alle Mandanten')).toBeTruthy()
  })

  it('lässt den Wähler dort aktiv, wo er wirkt', () => {
    zeige('t-1', scopeMit('t-1'), false, 'fehler')
    expect(screen.getByRole('combobox')).not.toBeDisabled()
  })

  it('nennt die Umgebung — ohne VITE_ENV_SUFFIX ist das Produktion', () => {
    // Der Suffix ist im Test nicht gesetzt, also der Produktions-Build.
    zeige('t-1')
    expect(screen.getByText('Produktion')).toBeTruthy()
  })

  it('meldet einen Fehler der Mandantenliste, statt ihn zu verschlucken', () => {
    zeige(null, { ...scopeMit(null), error: 'Netzwerkfehler' })
    expect(screen.getByText(/Netzwerkfehler/)).toBeTruthy()
  })

  it('bietet bei einem Fehler der Mandantenliste «Erneut laden» an', () => {
    const scope = { ...scopeMit(null), error: 'Sitzung abgelaufen' }
    zeige(null, scope)
    fireEvent.click(screen.getByRole('button', { name: 'Erneut laden' }))
    expect(scope.reload).toHaveBeenCalled()
  })

  it('zeigt den Rechnungs-Bereich NICHT, solange das Konto die Module nicht hat', () => {
    // Ein Superadmin in einem Kundenmandanten (Übergangszeit, §8.6) haette
    // dort die Rechnungen dieses Kunden vor sich — der Bereich bleibt weg.
    zeige('t-1')
    expect(screen.queryByRole('button', { name: 'Rechnungen' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Kundenstamm' })).toBeNull()
  })

  it('zeigt ihn im Betreiber-Mandanten, unabhängig vom gewählten Mandanten', () => {
    // Ohne Mandant im Wähler: der Bereich haengt am eigenen Konto, nicht an
    // der Auswahl oben (§8.3).
    zeige(null, scopeMit(null), true)
    for (const titel of ['Rechnungen', 'Zahlungsabgleich', 'Kundenstamm']) {
      expect(screen.getByRole('button', { name: titel })).toBeTruthy()
    }
  })

  it('reicht den Inhalt durch', () => {
    zeige('t-1')
    expect(screen.getByText('inhalt')).toBeTruthy()
  })
})
