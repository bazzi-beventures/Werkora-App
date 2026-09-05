import { describe, it, expect, vi, beforeEach } from 'vitest'
import {
  loadSchedulingConfig, readCachedSchedulingConfig, clearCachedSchedulingConfig,
  updateSchedulingConfig, type SchedulingConfig,
} from './tenant'
import { apiFetch } from '../client'
import { SK } from '../storageKeys'

// Warum es diesen Cache gibt: an der Anzeige-Config hängt, WELCHE Reiter die
// Einsatzplanung anbietet. Solange sie fehlt, gilt «fehlender Key = Ansicht an»
// — ohne Cache sah der Planer beim Öffnen erst alle sechs Ansichten und danach
// die drei seines Mandanten. Der Test hält fest, dass der zweite Aufruf sofort
// die richtige Liste hat und dass der Eintrag am Mandanten hängt.

vi.mock('../client', () => ({
  apiFetch: vi.fn(),
}))

const fetchMock = vi.mocked(apiFetch)

const RESPONSE = {
  config: { views: { month: false }, colors: { project: '#111' } },
  defaults: {
    fields: { address: true },
    colors: { project: '#000', blocker: '#999' },
    views: { month: true, week: true, staff: true, plantafel: true, gantt: true, map: true },
    show_distances: true,
    grey_after: '',
    grey_until: '',
    day_capacity_hours: 8,
  },
}

beforeEach(() => {
  window.localStorage.clear()
  fetchMock.mockReset()
  fetchMock.mockResolvedValue(RESPONSE as never)
  window.localStorage.setItem(SK.TENANT_SLUG, 'gehlhaar')
})

describe('Cache der Einsatzplanung-Anzeige', () => {
  it('ohne vorherigen Lauf gibt es nichts zu lesen', () => {
    expect(readCachedSchedulingConfig()).toBeUndefined()
  })

  it('legt die gemergte Config ab und liefert sie beim nächsten Öffnen', async () => {
    const loaded = await loadSchedulingConfig()
    // Tenant-Override sticht den Default, fehlende Keys erben ihn.
    expect(loaded.views).toMatchObject({ month: false, week: true, map: true })
    expect(loaded.colors).toMatchObject({ project: '#111', blocker: '#999' })

    const cached = readCachedSchedulingConfig() as SchedulingConfig
    expect(cached).toEqual(loaded)
  })

  it('gilt nur für den Mandanten, unter dem er geschrieben wurde', async () => {
    await loadSchedulingConfig()
    window.localStorage.setItem(SK.TENANT_SLUG, 'anderer-mandant')
    expect(readCachedSchedulingConfig()).toBeUndefined()
  })

  it('überlebt einen kaputten Eintrag ohne zu werfen', () => {
    window.localStorage.setItem(SK.SCHEDULING_CONFIG, '{kein json')
    expect(readCachedSchedulingConfig()).toBeUndefined()
  })

  it('Speichern in der Konfiguration verwirft den Eintrag', async () => {
    await loadSchedulingConfig()
    expect(readCachedSchedulingConfig()).toBeDefined()

    fetchMock.mockResolvedValueOnce({ config: { views: { plantafel: false } } } as never)
    await updateSchedulingConfig({ fields: {}, colors: {}, views: { plantafel: false } })
    // Kein Überschreiben: die neuen Defaults kennt nur die GET-Antwort.
    expect(readCachedSchedulingConfig()).toBeUndefined()
  })

  it('clear ist auch ohne Eintrag folgenlos', () => {
    expect(() => clearCachedSchedulingConfig()).not.toThrow()
  })
})
