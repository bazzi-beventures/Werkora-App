// Hagelschaden — docs/specs/hagelschaden-dashboard.md §10 (Frontend).
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import HagelschadenScreen from './HagelschadenScreen'
import { apiFetch } from '../../../api/client'
import type { HagelKampagne, HagelListe, HagelZeile } from '../../../api/admin/hagelschaden'
import {
  STANDARD_FILTER, filtereZeilen, kacheln, kennzahlen, terminKurz, umfang,
} from './hagelschadenFilter'

vi.mock('../../../api/client', () => ({
  apiFetch: vi.fn(),
  apiBlobFetch: vi.fn(),
  apiFormFetch: vi.fn(),
  apiUrl: (p: string) => p,
  ApiError: class ApiError extends Error {},
}))
vi.mock('../../useIsMobile', () => ({ useIsMobile: () => false }))

const mockFetch = vi.mocked(apiFetch)

const KAMPAGNE: HagelKampagne = {
  key: 'gehlhaar_unwetter_2026',
  titel: 'Gehlhaar',
  kurzname: 'Umfrage Unwetter 2026',
  gueltig_bis: '2026-12-31',
  prioritaeten: [
    { key: 'nicht_dringend', label: 'Nicht dringend', rang: 3 },
    { key: 'normal', label: 'Normal', rang: 2 },
    { key: 'dringend', label: 'Dringend', rang: 1 },
    { key: 'sehr_dringend', label: 'Sehr dringend', rang: 0 },
  ],
  produkte: [{ key: 'storen', label: 'Storen' }, { key: 'markise', label: 'Markise' }],
}

function zeile(over: Partial<HagelZeile>): HagelZeile {
  return {
    project_id: 'p', status_key: 0, status: 'Beantwortet, pendent', projekt_nr: '2600',
    projekt_name: 'X HS', projekt_offen: true, kunde: 'Kunde', email: 'k@x.ch',
    objekt_adresse: 'Weg 1', gesendet_am: '02.10.2026 10:00', beantwortet_am: '03.10.2026 09:00',
    noch_pendent: 'ja', prioritaet: 'normal', dringlichkeit: 'Normal', produkt: 'storen',
    art: 'Storen', mehrere_objekte: 'nein', anzahl_objekte: '', anzahl_anlagen: 4, fotos: 0,
    antworten: 1, bemerkung_kunde: '', versandfehler: '',
    aktiv: true, aktiv_automatisch: true, kontaktiert: false, einsatz_geplant: false,
    einsatz_geplant_manuell: false, termin: null, termine_bekannt: true, notiz: '',
    bearbeitet_von: '', bearbeitet_am: null,
    ...over,
  }
}

const ZEILEN: HagelZeile[] = [
  zeile({ project_id: 'p2', projekt_name: 'B HS', prioritaet: 'sehr_dringend', dringlichkeit: 'Sehr dringend',
    produkt: 'storen,markise', fotos: 3 }),
  zeile({ project_id: 'p1', projekt_name: 'A HS', prioritaet: 'normal',
    termin: { datum: '2026-10-14', bis: null, zeit: '07:30', art: 'Demontage' }, einsatz_geplant: true }),
  zeile({ project_id: 'p4', projekt_name: 'D HS', objekt_adresse: 'Seestrasse 4', status_key: 1, status: 'Erledigt gemeldet',
    prioritaet: '', dringlichkeit: '', aktiv: false }),
  zeile({ project_id: 'p5', projekt_name: 'E HS', status_key: 2, antworten: 0, beantwortet_am: '',
    prioritaet: '', dringlichkeit: '' }),
  zeile({ project_id: 'p3', projekt_name: 'C HS', status_key: 4, antworten: 0, gesendet_am: '',
    beantwortet_am: '', email: '(keine)', prioritaet: '', dringlichkeit: '', kontaktiert: true }),
]

function liste(zeilen = ZEILEN): HagelListe {
  return { kampagnen: [{ key: KAMPAGNE.key, titel: '', kurzname: KAMPAGNE.kurzname }],
    kampagne: KAMPAGNE, kennzahlen: null, zeilen, termine_bekannt: true }
}

// ─── reine Funktionen ─────────────────────────────────────────────

describe('hagelschadenFilter', () => {
  it('Standard zeigt die Planungsliste: beantwortet und aktiv', () => {
    expect(filtereZeilen(ZEILEN, STANDARD_FILTER).map(z => z.project_id)).toEqual(['p2', 'p1'])
  })

  it('filtert nach Betroffen, Einsatz und Suche', () => {
    const alle = { ...STANDARD_FILTER, status: 'alle' as const, aktiv: 'alle' as const }
    expect(filtereZeilen(ZEILEN, { ...alle, produkte: ['markise'] }).map(z => z.project_id)).toEqual(['p2'])
    expect(filtereZeilen(ZEILEN, { ...alle, einsatz: 'ja' }).map(z => z.project_id)).toEqual(['p1'])
    expect(filtereZeilen(ZEILEN, { ...alle, suche: 'seestrasse 4' }).map(z => z.project_id)).toEqual(['p4'])
  })

  it('Kennzahlen und Kacheln wie im Superadmin', () => {
    const z = kennzahlen(ZEILEN, KAMPAGNE)
    expect(z.gesendet).toBe(4)
    expect(z.beantwortet).toBe(3)
    expect(z.erledigt).toBe(1)
    expect(z.fotos).toBe(3)
    expect(z.jePrioritaet.map(p => [p.key, p.anzahl])).toEqual([
      ['sehr_dringend', 1], ['dringend', 0], ['normal', 1], ['nicht_dringend', 0]])
    expect(z.aktiv).toBe(4)
    expect(z.aktivOhneEinsatz).toBe(3)
    const prio = kacheln(z).find(k => k.key === 'prio:sehr_dringend')!
    expect(filtereZeilen(ZEILEN, prio.filter).map(r => r.project_id)).toEqual(['p2'])
  })

  it('Anzeige: Termin kurz und Umfang', () => {
    expect(terminKurz('2026-10-14')).toBe('Mi 14.10.')
    expect(umfang(zeile({ mehrere_objekte: 'ja', anzahl_objekte: 3 }))).toBe('3 Objekte')
    expect(umfang(zeile({ anzahl_anlagen: 1 }))).toBe('1 Element')
  })
})

// ─── Screen ───────────────────────────────────────────────────────

describe('HagelschadenScreen', () => {
  beforeEach(() => {
    mockFetch.mockReset()
    try { localStorage.clear() } catch { /* jsdom ohne Storage */ }
  })

  function route(daten: HagelListe, patch?: (path: string, body: unknown) => unknown) {
    mockFetch.mockImplementation(async (path: string, opts?: RequestInit) => {
      if (path.startsWith('/pwa/admin/hagelschaden/projekte/')) {
        const body = JSON.parse(String(opts?.body ?? '{}'))
        if (patch) return patch(path, body)
        return {}
      }
      if (path.startsWith('/pwa/admin/hagelschaden')) return daten
      if (path.includes('/files')) return []
      return {}
    })
  }

  it('zeigt standardmässig die Planungsliste, dringendste zuerst', async () => {
    route(liste())
    render(<HagelschadenScreen userId="u1" onOpenProject={() => {}} />)
    await screen.findByText('B HS')
    const zeilen = screen.getAllByRole('row').slice(1)
    expect(zeilen.map(r => within(r).getAllByRole('cell')[1].textContent)).toEqual(
      [expect.stringContaining('B HS'), expect.stringContaining('A HS')])
    expect(screen.queryByText('D HS')).toBeNull()
  })

  it('ein Klick auf eine Kachel setzt den Filter', async () => {
    route(liste())
    render(<HagelschadenScreen userId="u1" onOpenProject={() => {}} />)
    await screen.findByText('B HS')
    await userEvent.click(screen.getByRole('button', { name: /davon erledigt gemeldet/ }))
    expect(await screen.findByText('D HS')).toBeTruthy()
    expect(screen.queryByText('B HS')).toBeNull()
  })

  it('schaltet optimistisch um und nimmt bei Fehler zurück', async () => {
    let fail = false
    route(liste(), () => {
      if (fail) throw new Error('Speichern fehlgeschlagen — bitte erneut versuchen.')
      return { ...ZEILEN[0], kontaktiert: true }
    })
    render(<HagelschadenScreen userId="u1" onOpenProject={() => {}} />)
    const row = (await screen.findByText('B HS')).closest('tr')!
    const kontaktiert = within(row).getByRole('switch', { name: 'Kontaktiert' })
    await userEvent.click(kontaktiert)
    await waitFor(() => expect(kontaktiert.getAttribute('aria-checked')).toBe('true'))
    const [path, opts] = mockFetch.mock.calls.find(c => String(c[0]).includes('/projekte/'))!
    expect(path).toBe('/pwa/admin/hagelschaden/projekte/p2?kampagne=gehlhaar_unwetter_2026')
    expect(JSON.parse(String(opts!.body))).toEqual({ kontaktiert: true })

    fail = true
    await userEvent.click(kontaktiert)
    await screen.findByText('Speichern fehlgeschlagen — bitte erneut versuchen.')
    expect(kontaktiert.getAttribute('aria-checked')).toBe('true')
  })

  it('ein Termin aus der Einsatzplanung ersetzt den Einsatz-Schalter', async () => {
    route(liste())
    render(<HagelschadenScreen userId="u1" onOpenProject={() => {}} />)
    const row = (await screen.findByText('A HS')).closest('tr')!
    expect(within(row).getByText(/Mi 14\.10\. 07:30 · Demontage/)).toBeTruthy()
    expect(within(row).queryByRole('switch', { name: 'Einsatz geplant' })).toBeNull()
    const andere = (await screen.findByText('B HS')).closest('tr')!
    expect(within(andere).getByRole('switch', { name: 'Einsatz geplant' })).toBeTruthy()
  })

  it('ohne Kampagne ein leerer Zustand statt eines Fehlers', async () => {
    route({ kampagnen: [], kampagne: null, kennzahlen: null, zeilen: [] })
    render(<HagelschadenScreen userId="u1" onOpenProject={() => {}} />)
    expect(await screen.findByText('Für diesen Betrieb läuft keine Hagelschaden-Umfrage.')).toBeTruthy()
  })

  it('Detail öffnet das Projekt im gewünschten Reiter', async () => {
    route(liste())
    const open = vi.fn()
    render(<HagelschadenScreen userId="u1" onOpenProject={open} />)
    await userEvent.click(await screen.findByText('B HS'))
    await userEvent.click(await screen.findByRole('button', { name: 'Fotos im Projekt' }))
    expect(open).toHaveBeenCalledWith('p2', 'documents')
  })
})
