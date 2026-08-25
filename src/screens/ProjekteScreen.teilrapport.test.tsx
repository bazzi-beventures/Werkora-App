import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import ProjekteScreen, { reportStatusLabel } from './ProjekteScreen'
import { apiFetch } from '../api/client'
import { UserInfo } from '../api/auth'

// Teilrapport im Projekt-Detail der Mitarbeiter-PWA (docs/specs/teilrapport.md §6.2).
//
// Zwei Hälften: die Badges (Zustand der Daten — hängen NICHT am Feature-Flag, sonst
// sähe ein gebündelter Rapport bei abgeschaltetem Feature aus wie ein gewöhnlicher)
// und der Bündeln-Knopf (Bedienelement — hängt am Flag).

vi.mock('../api/client', () => ({
  apiFetch: vi.fn(),
  apiFormFetch: vi.fn(),
  apiUrl: (p: string) => p,
  isNetworkError: () => false,
  ApiError: class ApiError extends Error {
    status: number
    constructor(status = 500, msg = '') { super(msg); this.status = status }
  },
}))

vi.mock('../chat/SignaturePad', () => ({
  default: ({ reportId }: { reportId: number }) => (
    <div data-testid="signature-pad">Unterschrift für Rapport {reportId}</div>
  ),
}))

const mockFetch = vi.mocked(apiFetch)

const PROJECT = {
  id: 'p1', name: 'MFH Sonnhalde', kind: 'project', art_der_arbeit: ['Montage'],
  customer_id: null, customer: null, object_name: null, object_address: null,
  start_date: null, end_date: null, start_time: null, end_time: null,
  kontakte: [], bemerkung: null, geruestfach: null,
}

function report(over: Record<string, unknown> = {}) {
  return {
    id: 1, report_date: '2026-08-05', description: 'Storen montiert',
    created_by: 'Max Muster', signature_timestamp: null, invoice_id: null,
    invoice_locked: false, created_at: '2026-08-05T16:00:00Z', source: 'chat',
    is_own: true, is_partial: false, is_aggregate: false,
    merged_into_report_id: null, dissolved_at: null, pl_accepted_at: null,
    ...over,
  }
}

function makeUser(teilrapport: boolean): UserInfo {
  return {
    authorized_user_id: 'u-1', display_name: 'Max Muster', role: 'user',
    tenant_id: 'tenant-1', enabled_modules: [],
    feature_flags: teilrapport ? { teilrapport: { enabled: true } } : {},
  } as unknown as UserInfo
}

function routeFetch(routes: Record<string, unknown> = {}) {
  mockFetch.mockImplementation((path: string) => {
    if (path === '/pwa/projects') return Promise.resolve([PROJECT])
    if (path in routes) return Promise.resolve(routes[path])
    return Promise.resolve([])
  })
}

const NOOP = {
  onNavHome: () => {}, onNavRapport: () => {}, onNavArbeitszeit: () => {},
  onNavProfile: () => {}, onLoggedOut: () => {}, onStartRapport: () => {},
}

async function openDetail(teilrapport: boolean, routes: Record<string, unknown> = {}) {
  const user = userEvent.setup()
  routeFetch(routes)
  render(<ProjekteScreen {...NOOP} user={makeUser(teilrapport)} />)
  await waitFor(() => expect(screen.getByText('MFH Sonnhalde')).toBeInTheDocument())
  await user.click(screen.getByText('MFH Sonnhalde'))
  await screen.findByRole('button', { name: /Rapport erstellen/ })
  return user
}

beforeEach(() => {
  vi.clearAllMocks()
})

// ── Badges (rein) ────────────────────────────────────────────

describe('reportStatusLabel', () => {
  it('nennt den freien Teilrapport «offen» — in Warnfarbe', () => {
    expect(reportStatusLabel(report({ is_partial: true }), false))
      .toEqual({ text: 'Teilrapport – offen', tone: 'warn' })
  })

  it('nennt den gebündelten Teilrapport bei seinem Gesamtrapport', () => {
    expect(reportStatusLabel(report({ is_partial: true, merged_into_report_id: 100 }), false))
      .toEqual({ text: 'Teilrapport – im Gesamtrapport', tone: 'neutral' })
  })

  it('unterscheidet den unterschriebenen vom unsignierten Gesamtrapport', () => {
    expect(reportStatusLabel(report({ is_aggregate: true }), false).text)
      .toBe('Gesamtrapport – ohne Unterschrift')
    expect(reportStatusLabel(
      report({ is_aggregate: true, signature_timestamp: '2026-08-08T10:00:00Z' }), false,
    )).toEqual({ text: 'Gesamtrapport – unterschrieben', tone: 'neutral' })
  })

  it('zeigt den aufgelösten Gesamtrapport als solchen', () => {
    expect(reportStatusLabel(report({
      is_aggregate: true, signature_timestamp: '2026-08-08T10:00:00Z',
      dissolved_at: '2026-08-09T08:00:00Z',
    }), false)).toEqual({ text: 'Gesamtrapport – aufgelöst', tone: 'warn' })
  })

  it('lässt «abgerechnet» alles andere schlagen', () => {
    expect(reportStatusLabel(
      report({ is_partial: true, merged_into_report_id: 100, invoice_id: 9 }), true,
    ).text).toBe('abgerechnet')
  })

  it('lässt den gewöhnlichen Rapport unverändert', () => {
    expect(reportStatusLabel(report(), false).text).toBe('ohne Unterschrift')
    expect(reportStatusLabel(report({ signature_timestamp: 'x' }), false).text).toBe('unterschrieben')
  })
})

// ── Bündeln-Knopf ────────────────────────────────────────────

describe('ProjekteScreen — Gesamtrapport erstellen', () => {
  it('erscheint erst ab einem freien Teilrapport', async () => {
    await openDetail(true, {
      '/pwa/projects/p1/reports': [report()],
      '/pwa/projects/p1/partial-reports': [],
    })
    expect(screen.queryByRole('button', { name: /Gesamtrapport erstellen/ })).not.toBeInTheDocument()
  })

  it('erscheint mit einem freien Teilrapport', async () => {
    await openDetail(true, {
      '/pwa/projects/p1/reports': [report({ is_partial: true })],
      '/pwa/projects/p1/partial-reports': [report({ is_partial: true })],
    })
    expect(await screen.findByRole('button', { name: /Gesamtrapport erstellen/ })).toBeInTheDocument()
  })

  it('bleibt ohne Feature weg — auch mit freien Teilrapporten', async () => {
    await openDetail(false, {
      '/pwa/projects/p1/reports': [report({ is_partial: true })],
      '/pwa/projects/p1/partial-reports': [report({ is_partial: true })],
    })
    expect(screen.queryByRole('button', { name: /Gesamtrapport erstellen/ })).not.toBeInTheDocument()
    // Das Badge dagegen steht da: es beschreibt die Daten, nicht das Feature.
    expect(screen.getByText('Teilrapport – offen')).toBeInTheDocument()
  })

  it('schickt genau die angehakten IDs und führt danach in die Unterschrift', async () => {
    const partials = [
      report({ id: 1, report_date: '2026-08-05' }),
      report({ id: 2, report_date: '2026-08-06' }),
      report({ id: 3, report_date: '2026-08-07' }),
    ].map(r => ({ ...r, is_partial: true }))
    const aggregate = report({ id: 100, is_aggregate: true, description: 'Gebündelt' })
    // Nach dem Bündeln liefert der Server die Liste mit dem Behälter — der trägt das
    // Unterschriftsfeld, an das die PWA direkt weiterreicht. Der Schalter steht VOR
    // dem Rendern, damit die Detail-Ladung dieselbe Implementierung benutzt.
    let bundled = false
    mockFetch.mockImplementation((path: string) => {
      if (path === '/pwa/projects') return Promise.resolve([PROJECT])
      if (path === '/pwa/projects/p1/aggregate-report') {
        bundled = true
        return Promise.resolve({ status: 'ok', report_id: 100 })
      }
      if (path === '/pwa/projects/p1/reports') {
        return Promise.resolve(bundled
          ? [aggregate, ...partials.map(p => ({ ...p, merged_into_report_id: 100 }))]
          : partials)
      }
      if (path === '/pwa/projects/p1/partial-reports') {
        return Promise.resolve(bundled ? [] : partials)
      }
      return Promise.resolve([])
    })
    const user = userEvent.setup()
    render(<ProjekteScreen {...NOOP} user={makeUser(true)} />)
    await waitFor(() => expect(screen.getByText('MFH Sonnhalde')).toBeInTheDocument())
    await user.click(screen.getByText('MFH Sonnhalde'))

    await user.click(await screen.findByRole('button', { name: /Gesamtrapport erstellen/ }))
    // Alle vorausgewählt — der Normalfall ist «die ganze Woche».
    const boxes = screen.getAllByRole('checkbox') as HTMLInputElement[]
    expect(boxes.map(b => b.checked)).toEqual([true, true, true])

    await user.click(boxes[1])   // den 06.08. abwählen
    await user.click(screen.getByRole('button', { name: /Unterschrift holen/ }))

    await waitFor(() => {
      const call = mockFetch.mock.calls.find(c => c[0] === '/pwa/projects/p1/aggregate-report')
      expect(call).toBeDefined()
      expect(JSON.parse((call![1] as { body: string }).body)).toEqual({ report_ids: [1, 3] })
    })
    // Direkt in die Unterschrift — dafür wurde gebündelt.
    expect(await screen.findByTestId('signature-pad')).toBeInTheDocument()
  })

  it('meldet einen Bündel-Konflikt, statt ihn zu verschlucken', async () => {
    const partials = [{ ...report({ id: 1 }), is_partial: true }]
    const { ApiError } = await import('../api/client')
    const user = await openDetail(true, {
      '/pwa/projects/p1/reports': partials,
      '/pwa/projects/p1/partial-reports': partials,
    })
    mockFetch.mockImplementation((path: string) => {
      if (path === '/pwa/projects/p1/aggregate-report') {
        return Promise.reject(new ApiError(409, 'Nicht alle Teilrapporte konnten zugeordnet werden — bitte Liste neu laden.'))
      }
      if (path === '/pwa/projects') return Promise.resolve([PROJECT])
      return Promise.resolve([])
    })

    await user.click(await screen.findByRole('button', { name: /Gesamtrapport erstellen/ }))
    await user.click(screen.getByRole('button', { name: /Unterschrift holen/ }))

    expect(await screen.findByText(/bitte Liste neu laden/)).toBeInTheDocument()
  })
})

describe('ProjekteScreen — Unterschrift auf dem Gesamtrapport', () => {
  it('lässt auch einen vom Kollegen oder vom Büro gebündelten Gesamtrapport unterschreiben', async () => {
    // Wer am Freitag beim Kunden steht, holt die Unterschrift — auch wenn der
    // Projektleiter gebündelt hat (Spec §3.8/§6.3). Beim gewöhnlichen Rapport
    // bliebe es beim eigenen.
    await openDetail(true, {
      '/pwa/projects/p1/reports': [report({ id: 100, is_aggregate: true, is_own: false })],
      '/pwa/projects/p1/partial-reports': [],
    })
    expect(await screen.findByRole('button', { name: /Unterschrift/ })).toBeInTheDocument()
  })

  it('bietet die Unterschrift auf dem Teilrapport NICHT an', async () => {
    await openDetail(true, {
      '/pwa/projects/p1/reports': [report({ is_partial: true })],
      '/pwa/projects/p1/partial-reports': [report({ is_partial: true })],
    })
    await screen.findByText('Teilrapport – offen')
    expect(screen.queryByRole('button', { name: /Unterschrift$/ })).not.toBeInTheDocument()
  })

  it('bietet sie nicht mehr an, wenn das Büro ohne Unterschrift abgeschlossen hat', async () => {
    // Der Gesamtrapport ist abgenommen — eine Unterschrift danach änderte nichts
    // mehr an der Verrechenbarkeit und würde den Beleg nur verwirren.
    await openDetail(true, {
      '/pwa/projects/p1/reports': [report({
        id: 100, is_aggregate: true, pl_accepted_at: '2026-08-20T09:00:00Z',
      })],
      '/pwa/projects/p1/partial-reports': [],
    })
    await screen.findByText('Gesamtrapport – vom Büro abgeschlossen')
    expect(screen.queryByRole('button', { name: /Unterschrift$/ })).not.toBeInTheDocument()
  })

  it('bietet sie auf dem aufgelösten Gesamtrapport nicht mehr an', async () => {
    await openDetail(true, {
      '/pwa/projects/p1/reports': [report({
        id: 100, is_aggregate: true, dissolved_at: '2026-08-09T08:00:00Z',
      })],
      '/pwa/projects/p1/partial-reports': [],
    })
    await screen.findByText('Gesamtrapport – aufgelöst')
    expect(screen.queryByRole('button', { name: /Unterschrift$/ })).not.toBeInTheDocument()
  })

  it('lässt einen fremden gewöhnlichen Rapport weiterhin nicht unterschreiben', async () => {
    await openDetail(true, {
      '/pwa/projects/p1/reports': [report({ is_own: false })],
      '/pwa/projects/p1/partial-reports': [],
    })
    await screen.findByText('ohne Unterschrift')
    expect(screen.queryByRole('button', { name: /Unterschrift$/ })).not.toBeInTheDocument()
  })
})

describe('ProjekteScreen — Bündelung auflösen', () => {
  it('bietet das Auflösen beim eigenen unsignierten Gesamtrapport an', async () => {
    await openDetail(true, {
      '/pwa/projects/p1/reports': [report({ id: 100, is_aggregate: true })],
      '/pwa/projects/p1/partial-reports': [],
    })
    expect(await screen.findByRole('button', { name: 'Bündelung auflösen' })).toBeInTheDocument()
  })

  it('bietet es beim unterschriebenen Gesamtrapport NICHT an — das ist Sache des Projektleiters', async () => {
    await openDetail(true, {
      '/pwa/projects/p1/reports': [report({
        id: 100, is_aggregate: true, signature_timestamp: '2026-08-08T10:00:00Z',
      })],
      '/pwa/projects/p1/partial-reports': [],
    })
    await screen.findByText('Gesamtrapport – unterschrieben')
    expect(screen.queryByRole('button', { name: 'Bündelung auflösen' })).not.toBeInTheDocument()
  })

  it('sperrt Löschen und Unterschrift am gebündelten Teilrapport', async () => {
    await openDetail(true, {
      '/pwa/projects/p1/reports': [report({ is_partial: true, merged_into_report_id: 100 })],
      '/pwa/projects/p1/partial-reports': [],
    })
    await screen.findByText('Teilrapport – im Gesamtrapport')
    expect(screen.queryByRole('button', { name: 'Löschen' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Unterschrift$/ })).not.toBeInTheDocument()
  })
})
