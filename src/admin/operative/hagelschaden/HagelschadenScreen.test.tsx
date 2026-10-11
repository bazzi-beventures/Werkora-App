// Hagelschaden — docs/specs/hagelschaden-dashboard.md §10 (Frontend).
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import HagelschadenScreen from './HagelschadenScreen'
import { apiFetch } from '../../../api/client'
import type {
  HagelDispo, HagelDispoInfo, HagelDispoParameter, HagelKampagne, HagelListe, HagelZeile,
} from '../../../api/admin/hagelschaden'
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
    aktiv: false, kontaktiert: false, einsatz_geplant: false,
    einsatz_geplant_manuell: false, termin: null, termine_bekannt: true, notiz: '',
    bearbeitet_von: '', bearbeitet_am: null,
    ...over,
  }
}

const ZEILEN: HagelZeile[] = [
  zeile({ project_id: 'p2', projekt_name: 'B HS', prioritaet: 'sehr_dringend', dringlichkeit: 'Sehr dringend',
    produkt: 'storen,markise', fotos: 3, aktiv: true }),
  zeile({ project_id: 'p1', projekt_name: 'A HS', prioritaet: 'normal',
    termin: { datum: '2026-10-14', bis: null, zeit: '07:30', art: 'Demontage' }, einsatz_geplant: true }),
  zeile({ project_id: 'p4', projekt_name: 'D HS', objekt_adresse: 'Seestrasse 4', status_key: 1, status: 'Erledigt gemeldet',
    prioritaet: '', dringlichkeit: '' }),
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
  it('Standard zeigt alle beantworteten — «Aktiv» filtert nicht mit', () => {
    expect(filtereZeilen(ZEILEN, STANDARD_FILTER).map(z => z.project_id)).toEqual(['p2', 'p1', 'p4'])
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
    // Bearbeitung: nur was der Betrieb gesetzt hat
    expect(z.aktiv).toBe(1)
    expect(z.aktivOhneEinsatz).toBe(1)
    expect(z.kontaktiert).toBe(1)
    // pendent p2 (aktiv), p1 (Termin) → nichts unbearbeitet
    expect(z.pendentUnbearbeitet).toBe(0)
    const prio = kacheln(z).find(k => k.key === 'prio:sehr_dringend')!
    expect(filtereZeilen(ZEILEN, prio.filter).map(r => r.project_id)).toEqual(['p2'])
  })

  it('trennt die Kacheln in Kundenrückmeldung und Bearbeitung', () => {
    const k = kacheln(kennzahlen(ZEILEN, KAMPAGNE))
    expect(k.filter(x => x.gruppe === 'kunde').map(x => x.key)).toEqual([
      'gesendet', 'beantwortet', 'erledigt', 'fotos',
      'prio:sehr_dringend', 'prio:dringend', 'prio:normal', 'prio:nicht_dringend'])
    expect(k.filter(x => x.gruppe === 'betrieb').map(x => x.key)).toEqual([
      'unbearbeitet', 'aktiv', 'ohne_einsatz', 'einsatz', 'kontaktiert'])
    const offen = k.find(x => x.key === 'unbearbeitet')!
    const ohneArbeit = ZEILEN.map(z => (z.project_id === 'p2' ? { ...z, aktiv: false } : z))
    expect(filtereZeilen(ohneArbeit, offen.filter).map(r => r.project_id)).toEqual(['p2'])
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
    const zeilen = screen.getAllByRole('row').slice(2)   // zwei Kopfzeilen
    expect(zeilen.map(r => within(r).getAllByRole('cell')[0].textContent)).toEqual(
      [expect.stringContaining('B HS'), expect.stringContaining('A HS'), expect.stringContaining('D HS')])
    expect(screen.queryByText('E HS')).toBeNull()
    // Die zwei Seiten stehen getrennt beschriftet da.
    expect(screen.getAllByText('Rückmeldung der Kunden').length).toBeGreaterThan(0)
    expect(screen.getAllByText('Unsere Bearbeitung').length).toBeGreaterThan(0)
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

// ─── Disposition — docs/specs/hagelschaden-disposition.md §15 ──

describe('HagelschadenScreen — Disposition', () => {
  const PARAM: HagelDispoParameter = {
    plan: {
      depot: null, equipen: [], tempo_kmh: 42, umwegfaktor_pct: 135, parkzeit_min: 5, tagesbeginn: '07:00',
      samstag: false, samstag_min: 300, horizont_tage: 30, budget_s: 2, gewichtung: 50, stabil: 'normal',
      lieferfrist_arbeitstage: 20, nur_bestaetigte_freigeben: true,
      fristen: { sicherung: 1, sehr_dringend: 10, dringend: 7, normal: 20, nicht_dringend: 40, ohne: 40 },
    },
    grundzeit_min: 20,
    min_je_element: { storen: 35, markise: 55, insektengitter: 10, dachfensterrollladen: 45, glasbruch_pergola: 80, fensterlaeden: 20 },
    zuschlag_zusatzprodukt_min: 15, elemente_ohne_angabe: 2, elemente_je_objekt: 4,
    sicherung_min: 35, aufnahme_grund_min: 15, aufnahme_je_element_min: 4, tageskapazitaet_min: 480,
  }
  const INFO: HagelDispoInfo = {
    parameter: PARAM, defaults: PARAM,
    einsatzarten: [{ key: 'sicherung', label: 'Sicherung' }, { key: 'aufnahme', label: 'Aufnahme' }, { key: 'reparatur', label: 'Reparatur' }],
    kategorien: [{ key: 'glas', label: 'Glas/Pergola' }, { key: 'storen_markise', label: 'Storen/Markise' }],
  }
  function dispo(over: Partial<HagelDispo> = {}): HagelDispo {
    return {
      einsatzart: 'aufnahme', einsatzart_regel: 'aufnahme', kategorie: 'storen_markise',
      kategorie_regel: 'storen_markise', dauer_min: 31, dauer_regel_min: 31, dauer_ueberschrieben: false,
      rest_min: 191, stufen_min: { aufnahme: 31, reparatur: 160 }, elemente: 4, umfang_geschaetzt: false,
      personen: 1, personen_regel: 1, nicht_vor: null, zeitfenster: null, ueberschrieben: [],
      ...over,
    }
  }
  function mitDispo(): HagelListe {
    const zeilen = ZEILEN.map(z => ({ ...z, dispo: z.antworten > 0 ? dispo() : null }))
    return { ...liste(zeilen), dispo: INFO }
  }

  beforeEach(() => {
    mockFetch.mockReset()
    try { localStorage.clear() } catch { /* jsdom ohne Storage */ }
  })

  function route(daten: HagelListe, onPatch?: (body: unknown) => unknown, onPut?: (body: unknown) => unknown) {
    mockFetch.mockImplementation(async (path: string, opts?: RequestInit) => {
      const body = JSON.parse(String(opts?.body ?? '{}'))
      if (path.startsWith('/pwa/admin/hagelschaden/projekte/')) return onPatch ? onPatch(body) : {}
      if (path.startsWith('/pwa/admin/hagelschaden/dispo/parameter')) return onPut ? onPut(body) : INFO
      if (path.startsWith('/pwa/admin/hagelschaden')) return daten
      if (path.includes('/files')) return []
      return {}
    })
  }

  it('ohne Dispo vom Server keine Spur davon', async () => {
    route(liste())
    render(<HagelschadenScreen userId="u1" onOpenProject={() => {}} />)
    await screen.findByText('B HS')
    expect(screen.queryByText(/Offene Arbeit/)).toBeNull()
    expect(screen.queryByText('Nächster Einsatz')).toBeNull()
  })

  it('zeigt offene Arbeit, Einsatzart und Dauer', async () => {
    route(mitDispo())
    render(<HagelschadenScreen userId="u1" onOpenProject={() => {}} />)
    await screen.findByText('B HS')
    // pendent ohne Einsatz: p2 (p1 hat einen Termin, p4 meldet erledigt)
    const summe = screen.getByRole('region', { name: 'Offene Arbeit' })
    expect(within(summe).getByText(/1 Fall pendent ohne Einsatz/)).toBeTruthy()
    expect(screen.getByText('Nächster Einsatz')).toBeTruthy()
    const row = screen.getByText('B HS').closest('tr')!
    expect(within(row).getByText(/Aufnahme · 31 min/)).toBeTruthy()
    expect(within(row).getByText('3 h 11')).toBeTruthy()
  })

  it('Dauer im Detail überschreiben schickt nur dieses Feld', async () => {
    let gesendet: unknown = null
    route(mitDispo(), body => {
      gesendet = body
      return { ...ZEILEN[0], dispo: dispo({ dauer_min: 300, dauer_ueberschrieben: true, ueberschrieben: ['dauer_min'] }) }
    })
    render(<HagelschadenScreen userId="u1" onOpenProject={() => {}} />)
    await userEvent.click(await screen.findByText('B HS'))
    const feld = await screen.findByLabelText('Dauer in Minuten')
    await userEvent.type(feld, '300')
    fireEvent.blur(feld)
    await waitFor(() => expect(gesendet).toEqual({ dauer_min: 300 }))
    const row = screen.getAllByText('B HS').map(e => e.closest('tr')).find(Boolean)!
    await waitFor(() => expect(within(row).getByLabelText('Dauer überschrieben')).toBeTruthy())
  })

  it('Parameter-Dialog speichert die Matrix', async () => {
    let gesendet: { parameter?: HagelDispoParameter } | null = null
    route(mitDispo(), undefined, body => { gesendet = body as typeof gesendet; return INFO })
    render(<HagelschadenScreen userId="u1" onOpenProject={() => {}} />)
    await userEvent.click(await screen.findByRole('button', { name: 'Dauer-Parameter' }))
    const markise = await screen.findByLabelText('Markise, Minuten je Element')
    await userEvent.clear(markise)
    await userEvent.type(markise, '65')
    await userEvent.click(screen.getByRole('button', { name: 'Speichern' }))
    await waitFor(() => expect(gesendet?.parameter?.min_je_element.markise).toBe(65))
    expect(gesendet!.parameter!.grundzeit_min).toBe(20)
  })
})
