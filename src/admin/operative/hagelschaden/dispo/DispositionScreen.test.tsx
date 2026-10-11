// Hagelschaden-Disposition — Reiter «Disposition». Spec docs/specs/hagelschaden-disposition.md §10, §16.
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import DispositionScreen from './DispositionScreen'
import { kartenDaten } from './DispoKarte'
import { apiFetch } from '../../../../api/client'
import type { HagelDispoInfo, HagelKampagne } from '../../../../api/admin/hagelschaden'
import type { DispoPlan, Vormerkung } from '../../../../api/admin/hagelschadenDispo'

vi.mock('../../../../api/client', () => ({
  apiFetch: vi.fn(),
  apiBlobFetch: vi.fn(),
  apiFormFetch: vi.fn(),
  apiUrl: (p: string) => p,
  ApiError: class ApiError extends Error {},
}))
vi.mock('../../../useIsMobile', () => ({ useIsMobile: () => false }))
vi.mock('./DispoKarte', async () => ({
  ...(await vi.importActual<typeof import('./DispoKarte')>('./DispoKarte')),
  default: () => <div>Karte</div>,
}))

const mockFetch = vi.mocked(apiFetch)

const KAMPAGNE: HagelKampagne = {
  key: 'k1', titel: 'G', kurzname: 'Umfrage', gueltig_bis: '2026-12-31', prioritaeten: [],
  produkte: [{ key: 'storen', label: 'Storen' }],
}

function info(bereit = true): HagelDispoInfo {
  const parameter = {
    plan: {
      depot: bereit ? { adresse: 'Werkstrasse 1, 8400 Winterthur', lat: 47.5, lon: 8.72 } : null,
      equipen: bereit ? [{ id: 'e1', name: 'Equipe Nord', monteur_ids: ['s1', 's2'], faehigkeiten: [], farbe: '#2563eb' }] : [],
      tempo_kmh: 42, umwegfaktor_pct: 135, parkzeit_min: 5, tagesbeginn: '07:00', samstag: false, samstag_min: 300,
      horizont_tage: 30, budget_s: 2, gewichtung: 50, stabil: 'normal' as const, lieferfrist_arbeitstage: 20,
      nur_bestaetigte_freigeben: true,
      fristen: { sicherung: 1, sehr_dringend: 10, dringend: 7, normal: 20, nicht_dringend: 40, ohne: 40 },
    },
    grundzeit_min: 20, min_je_element: { storen: 35 }, zuschlag_zusatzprodukt_min: 15, elemente_ohne_angabe: 2,
    elemente_je_objekt: 4, sicherung_min: 35, aufnahme_grund_min: 15, aufnahme_je_element_min: 4, tageskapazitaet_min: 480,
  }
  return { parameter, defaults: parameter, einsatzarten: [], kategorien: [] }
}

const PLAN: DispoPlan = {
  id: 7, created_at: '2026-10-11T10:00:00Z', created_by_name: 'Tina',
  tage: [{ datum: '2026-10-12', wochentag: 'Mo', touren: [{
    equipe_id: 'e1', equipe_name: 'Equipe Nord', farbe: '#2563eb', monteur_ids: ['s1', 's2'],
    fahrt_min: 74, km: 31.5, start: '07:00', ende: '15:18', kapazitaet_min: 480, auslastung_pct: 98,
    stopps: [{ project_id: 'p1', projekt_nr: '2600461', projekt_name: 'MFH Steinmann Seuzach HS', kunde: 'Steinmann',
      adresse: 'Breitestr. 9, 8472 Seuzach', lat: 47.53, lon: 8.73, einsatzart: 'sicherung', kategorie: 'storen_markise',
      dringlichkeit: 'Sehr dringend', prioritaet: 'sehr_dringend', start: '07:10', ende: '07:45', tage: 1, end_datum: null,
      dauer_min: 35, personen: 1, fahrt_min: 10, km: 3.7, zu_spaet: false, zeitfenster: null }],
  }] }],
  ungeplant: [], ohne_koordinaten: [],
  kennzahlen: { faelle: 1, geplant: 1, ungeplant: 0, km: 31, fahrt_min: 74, arbeit_min: 35, fahranteil_pct: 68,
    letzter_tag: 0, zu_spaet: 0, fertig_am: '2026-10-12', ohne_koordinaten: 0, budget_erreicht: false },
  horizont: { von: '2026-10-12', bis: '2026-11-20' },
  depot: { adresse: 'Werkstrasse 1', lat: 47.5, lon: 8.72 },
  hinweise: [{ typ: 'buendel', text: 'Elgg: 5 Fälle über 4 Anfahrten verteilt.', gewicht: 60, project_ids: [] }],
}

function vm(id: number, status: Vormerkung['status']): Vormerkung {
  return { id, project_id: `p${id}`, plan_id: 7, einsatzart: 'aufnahme', datum: '2026-10-15', end_datum: null,
    start_time: '07:10:00', end_time: '07:45:00', equipe: { id: 'e1', name: 'Equipe Nord', monteur_ids: ['s1'] },
    reihenfolge: 0, status, appointment_id: null, notiz: null, updated_by_name: null, projekt_nr: `26${id}`,
    projekt_name: `Fall ${id}`, adresse: 'Weg 1, 8472 Seuzach', lat: 47.5, lon: 8.7, kunde: 'Kunde', telefon: ['079 123 45 67'],
    kontakt_vor_ort: '' }
}

type Route = (path: string, body: unknown, method: string) => unknown
function route(fn: Route) {
  mockFetch.mockImplementation(async (path: string, opts?: RequestInit) =>
    fn(path, JSON.parse(String(opts?.body ?? '{}')), opts?.method ?? 'GET') as never)
}

describe('DispositionScreen', () => {
  // Klammern: ein zurückgegebener Mock wäre für Vitest eine Aufräum-Funktion.
  beforeEach(() => { mockFetch.mockReset() })

  it('zeigt Plan, Hinweise und merkt einen Tag vor', async () => {
    const calls: unknown[] = []
    route((path, body) => {
      if (path.includes('/vormerken')) { calls.push(body); return { vorgemerkt: 1 } }
      return { dispo: info(), plan: PLAN, vormerkungen_offen: 0 }
    })
    render(<DispositionScreen kampagne={KAMPAGNE} onOpenProject={() => {}} showToast={() => {}} />)
    expect(await screen.findByText('2600461 MFH Steinmann Seuzach HS')).toBeTruthy()
    expect(screen.getByText(/Elgg: 5 Fälle/)).toBeTruthy()
    expect(screen.getByText('31 km')).toBeTruthy()
    await userEvent.click(screen.getByRole('button', { name: 'Tag vormerken' }))
    await waitFor(() => expect(calls).toEqual([{ tage: ['2026-10-12'] }]))
  })

  it('ohne Depot und Equipe kein Berechnen, sondern ein Hinweis', async () => {
    route(() => ({ dispo: info(false), plan: null, vormerkungen_offen: 0 }))
    render(<DispositionScreen kampagne={KAMPAGNE} onOpenProject={() => {}} showToast={() => {}} />)
    expect(await screen.findByText(/Depot festlegen/)).toBeTruthy()
    expect((screen.getByRole('button', { name: 'Plan berechnen' }) as HTMLButtonElement).disabled).toBe(true)
  })

  it('Anrufliste: bestätigt schickt den Status und nimmt den Fall aus der Liste', async () => {
    const patches: unknown[] = []
    route((path, body, method) => {
      if (method === 'PATCH') { patches.push(body); return { ...vm(1, 'bestaetigt') } }
      if (path.includes('/vormerkungen')) return { vormerkungen: [vm(1, 'vorgeschlagen')] }
      return { dispo: info(), plan: PLAN, vormerkungen_offen: 1 }
    })
    render(<DispositionScreen kampagne={KAMPAGNE} onOpenProject={() => {}} showToast={() => {}} />)
    await userEvent.click(await screen.findByRole('tab', { name: 'Anrufliste' }))
    const eintrag = (await screen.findByText('261 Fall 1')).closest('li')!
    expect(within(eintrag).getByRole('link', { name: '079 123 45 67' }).getAttribute('href')).toBe('tel:0791234567')
    await userEvent.click(within(eintrag).getByRole('button', { name: 'bestätigt' }))
    await waitFor(() => expect(patches).toEqual([{ status: 'bestaetigt' }]))
    await waitFor(() => expect(screen.queryByText('261 Fall 1')).toBeNull())
  })

  it('Freigabe: Absenz hält einen Stopp auf, «trotzdem» schickt nur diesen erneut', async () => {
    const freigaben: unknown[] = []
    route((path, body) => {
      if (path.includes('/freigeben')) {
        freigaben.push(body)
        const b = body as { ignore_absence_conflicts: boolean }
        return b.ignore_absence_conflicts
          ? { ergebnisse: [{ id: 2, ok: true, appointment_id: 't2' }], freigegeben: 1 }
          : { ergebnisse: [{ id: 1, ok: true, appointment_id: 't1' },
              { id: 2, ok: false, konflikt: 'Peter ist vom 15.10. bis 16.10. in den Ferien.' }], freigegeben: 1 }
      }
      if (path.includes('/vormerkungen')) return { vormerkungen: [vm(1, 'bestaetigt'), vm(2, 'bestaetigt')] }
      return { dispo: info(), plan: PLAN, vormerkungen_offen: 2 }
    })
    render(<DispositionScreen kampagne={KAMPAGNE} onOpenProject={() => {}} showToast={() => {}} />)
    await userEvent.click(await screen.findByRole('tab', { name: /Vorgemerkt/ }))
    await userEvent.click(await screen.findByRole('button', { name: /Alle bestätigten freigeben/ }))
    expect(await screen.findByText(/in den Ferien/)).toBeTruthy()
    await userEvent.click(screen.getByRole('button', { name: /Trotzdem freigeben/ }))
    await waitFor(() => expect(freigaben).toEqual([
      { ids: [1, 2], ignore_absence_conflicts: false },
      { ids: [2], ignore_absence_conflicts: true },
    ]))
  })
})

describe('kartenDaten', () => {
  it('Linien beginnen und enden am Depot, Punkte nummeriert', () => {
    const { linien, punkte } = kartenDaten(PLAN, 'alle', () => '#123456')
    const g = linien[0].geometry as { coordinates: [number, number][] }
    expect(g.coordinates[0]).toEqual([8.72, 47.5])
    expect(g.coordinates[g.coordinates.length - 1]).toEqual([8.72, 47.5])
    expect(punkte.map(p => p.properties.nr)).toEqual(['1'])
    expect(kartenDaten(PLAN, '2026-10-13', () => '#000').punkte).toEqual([])
  })
})
