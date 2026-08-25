import { beforeEach, describe, expect, it } from 'vitest'
import {
  clearBreadcrumbs,
  getBreadcrumbs,
  MAX_BREADCRUMBS,
  trackApiError,
  trackNav,
} from './breadcrumbs'

// Spec docs/specs/support-ticket.md §5.3

describe('breadcrumbs', () => {
  beforeEach(() => clearBreadcrumbs())

  it('startet leer', () => {
    expect(getBreadcrumbs()).toEqual([])
  })

  it('hält Navigation fest', () => {
    trackNav('rapport')
    const [crumb] = getBreadcrumbs()
    expect(crumb.kind).toBe('nav')
    expect(crumb.detail).toBe('rapport')
    expect(crumb.t).toMatch(/^\d{2}:\d{2}:\d{2}$/)
  })

  it('entprellt denselben Screen zweimal hintereinander', () => {
    // Re-Renders desselben Screens sind Rauschen und würden den Puffer füllen,
    // bevor der interessante Teil passiert.
    trackNav('rapport')
    trackNav('rapport')
    expect(getBreadcrumbs()).toHaveLength(1)
  })

  it('entprellt NICHT, wenn dazwischen etwas anderes passierte', () => {
    trackNav('rapport')
    trackApiError('/pwa/reports', 500)
    trackNav('rapport')
    expect(getBreadcrumbs()).toHaveLength(3)
  })

  it('hält API-Fehler mit Pfad und Status fest', () => {
    trackApiError('/pwa/reports/draft', 500)
    expect(getBreadcrumbs()[0]).toMatchObject({
      kind: 'api_error',
      detail: '/pwa/reports/draft → 500',
    })
  })

  it('kappt bei MAX_BREADCRUMBS und behält die jüngsten', () => {
    for (let i = 0; i < MAX_BREADCRUMBS + 20; i++) trackNav(`screen-${i}`)
    const crumbs = getBreadcrumbs()
    expect(crumbs).toHaveLength(MAX_BREADCRUMBS)
    expect(crumbs[crumbs.length - 1].detail).toBe(`screen-${MAX_BREADCRUMBS + 19}`)
    // Die ältesten sind weg — genau das ist der Sinn des Ringpuffers.
    expect(crumbs[0].detail).not.toBe('screen-0')
  })

  it('kürzt überlange Details', () => {
    trackApiError('x'.repeat(500), 500)
    expect(getBreadcrumbs()[0].detail.length).toBeLessThanOrEqual(200)
  })

  it('gibt eine Kopie heraus, keine Referenz auf den Puffer', () => {
    trackNav('a')
    const first = getBreadcrumbs()
    first.push({ t: '00:00:00', kind: 'nav', detail: 'geschmuggelt' })
    expect(getBreadcrumbs()).toHaveLength(1)
  })

  it('ignoriert leere Screen-Namen', () => {
    trackNav('')
    expect(getBreadcrumbs()).toEqual([])
  })
})
