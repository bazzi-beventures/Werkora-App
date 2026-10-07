/**
 * Kunden-Rückmeldung (docs/specs/kunden-rueckmeldung-kampagne.md §8).
 *
 * Der Versand schreibt die Kunden eines Mandanten in dessen Namen an und lässt
 * sich nicht zurücknehmen. Geprüft wird deshalb vor allem:
 *   - angeschrieben wird nur, was angehakt ist — und die Auswahl geht so an
 *     den Server, wie sie angehakt wurde;
 *   - kein Versand ohne Bestätigung, und im Dialog stehen Mandant und Anzahl;
 *   - Projekte ohne E-Mail sind sichtbar, aber nicht anhakbar;
 *   - es gibt keinen Editor für den Inhalt — der lebt im Code.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react'

const listKampagnen = vi.fn()
const listProjekte = vi.fn()
const probelauf = vi.fn()
const stand = vi.fn()
const vorschauMail = vi.fn()
const vorschauSeite = vi.fn()
const starteVersand = vi.fn()
const testmail = vi.fn()

vi.mock('../../api/rueckmeldung', () => ({
  listKampagnen: () => listKampagnen(),
  listProjekte: (k: string) => listProjekte(k),
  probelauf: (k: string, ids: string[]) => probelauf(k, ids),
  stand: (k: string) => stand(k),
  vorschauMail: (k: string) => vorschauMail(k),
  vorschauSeite: (k: string) => vorschauSeite(k),
  starteVersand: (k: string, ids: string[], n: number) => starteVersand(k, ids, n),
  stoppeVersand: vi.fn(),
  testmail: (k: string, e?: string) => testmail(k, e),
  downloadExport: vi.fn(),
}))

import RueckmeldungScreen from './RueckmeldungScreen'
import { filtere, FILTER_START, auswaehlbar, sperrGrund } from './rueckmeldungFilter'
import type { AuswahlProjekt } from '../../api/rueckmeldung'

const KAMPAGNE = {
  key: 'gehlhaar_unwetter_2026',
  titel: 'Gehlhaar — Rückmeldung offene HS-Projekte',
  tenant: { id: 't-1', slug: 'gehlhaar', name: 'Gehlhaar GmbH' },
  name_muster: '\\bHS\\b',
  nur_status: ['offen'],
  gueltig_bis: '2026-12-31',
  offen: true,
  betreff: 'Ihr Auftrag bei {firma}',
  mail_text: 'Text',
  pendent_frage: 'Ist Ihr Auftrag noch pendent?',
  mehrere_frage: 'Sind mehrere Objekte betroffen?',
  objekte_label: 'Wie viele Objekte sind betroffen?',
  anlagen_label: 'Wie viele Storen bzw. Markisen sind betroffen?',
  produkte: [{ key: 'storen', label: 'Storen', hinweis: '' }],
  prioritaeten: [{ key: 'dringend', label: 'Dringend', hinweis: 'nicht nutzbar' }],
  pause_s: 3,
  max_fotos: 6,
}

const projekt = (p: Partial<AuswahlProjekt>): AuswahlProjekt => ({
  project_id: 'x', projekt_nr: '1', projekt_name: 'X', kunde_name: '', email: '',
  objekt_adresse: '', passt_regel: true, offerte: 'keine', offerten: [], umfrage: '', adresse_angeschrieben: false, ...p,
})

const PROJEKTE: AuswahlProjekt[] = [
  projekt({ project_id: 'p1', projekt_nr: '2601549', projekt_name: 'Stahel Neftenbach HS',
            kunde_name: 'Stahel', email: 'stahel@example.ch', offerte: 'versendet', offerten: ['OFF-1'] }),
  projekt({ project_id: 'p2', projekt_nr: '2601550', projekt_name: 'Meier Seuzach HS',
            kunde_name: 'Meier', email: 'meier@example.ch', offerte: 'entwurf' }),
  projekt({ project_id: 'p3', projekt_nr: '2601551', projekt_name: 'Keller Dinhard HS',
            kunde_name: 'Keller', email: '' }),
  projekt({ project_id: 'p4', projekt_nr: '2601552', projekt_name: 'Brunner Elsau',
            kunde_name: 'Brunner', email: 'b@example.ch', passt_regel: false }),
  projekt({ project_id: 'p5', projekt_nr: '2601553', projekt_name: 'Huber Wiesendangen HS',
            kunde_name: 'Huber', email: 'huber@example.ch' }),
  projekt({ project_id: 'p6', projekt_nr: '2601554', projekt_name: 'Graf Hettlingen HS',
            kunde_name: 'Graf', email: 'graf@example.ch' }),
  projekt({ project_id: 'p7', projekt_nr: '2601555', projekt_name: 'Vogel Rickenbach HS',
            kunde_name: 'Verwaltung', email: 'verwaltung@example.ch', adresse_angeschrieben: true }),
]

const PLAN = {
  treffer: 2, mails: 2, offene_projekte: 2, bereits_gesendet: 0, mit_offerte: 0,
  adresse_angeschrieben: 0, ohne_email: [], gruppen: [],
}

beforeEach(() => {
  listKampagnen.mockReset().mockResolvedValue([KAMPAGNE])
  listProjekte.mockReset().mockResolvedValue(PROJEKTE)
  probelauf.mockReset().mockResolvedValue({ plan: PLAN, lauf: null })
  stand.mockReset().mockResolvedValue({ gesendet: 0, beantwortet: 0, erledigt: 0, fehler: 0, fotos: 0, je_prioritaet: [], lauf: null })
  vorschauMail.mockReset().mockResolvedValue('<p>Mail</p>')
  vorschauSeite.mockReset().mockResolvedValue('<p>Seite</p>')
  starteVersand.mockReset().mockResolvedValue({ gestartet: true, mails: 2, lauf: null })
  testmail.mockReset().mockResolvedValue({ ok: true, empfaenger: 'luca.bazzi@beventures.ch' })
})

describe('rueckmeldungFilter', () => {
  it('filtert nach Regel, Offerte, E-Mail und Suche', () => {
    expect(filtere(PROJEKTE, FILTER_START).map((p) => p.project_id)).toEqual(['p1', 'p2', 'p3', 'p5', 'p6', 'p7'])
    expect(filtere(PROJEKTE, { ...FILTER_START, nurRegel: false })).toHaveLength(7)
    expect(filtere(PROJEKTE, { ...FILTER_START, offerte: 'versendet' }).map((p) => p.project_id)).toEqual(['p1'])
    expect(filtere(PROJEKTE, { ...FILTER_START, offerte: 'nicht_versendet' }).map((p) => p.project_id)).toEqual(['p2', 'p3', 'p5', 'p6', 'p7'])
    expect(filtere(PROJEKTE, { ...FILTER_START, email: 'ohne' }).map((p) => p.project_id)).toEqual(['p3'])
    expect(filtere(PROJEKTE, { ...FILTER_START, suche: 'seuzach' }).map((p) => p.project_id)).toEqual(['p2'])
    expect(filtere(PROJEKTE, { ...FILTER_START, suche: 'off-1' }).map((p) => p.project_id)).toEqual(['p1'])
  })

  it('nur ohne Offerte und ohne Mail anhakbar', () => {
    expect(auswaehlbar(PROJEKTE[4])).toBe(true)
    expect(auswaehlbar(PROJEKTE[2])).toBe(false)                       // keine Adresse
    expect(auswaehlbar(PROJEKTE[0])).toBe(false)                       // Offerte versendet
    expect(auswaehlbar(PROJEKTE[1])).toBe(false)                       // Offerte als Entwurf
    expect(auswaehlbar(PROJEKTE[6])).toBe(false)                       // Adresse schon angeschrieben
    expect(sperrGrund(PROJEKTE[1])).toBe('Hat schon eine Offerte')
    expect(auswaehlbar({ ...PROJEKTE[4], umfrage: 'gesendet' })).toBe(false)
    // Ein fehlgeschlagener Versand darf erneut angehakt werden.
    expect(auswaehlbar({ ...PROJEKTE[4], umfrage: 'fehler' })).toBe(true)
  })
})

describe('RueckmeldungScreen', () => {
  it('zeigt die Projekte der Regel mit E-Mail bzw. «keine E-Mail» und Offerten-Stand', async () => {
    render(<RueckmeldungScreen />)
    expect(await screen.findByText('Stahel Neftenbach HS')).toBeTruthy()
    expect(screen.getByText('stahel@example.ch')).toBeTruthy()
    expect(screen.getByText('keine E-Mail')).toBeTruthy()
    expect(screen.getByText('nur Entwurf')).toBeTruthy()
    // Ohne «HS» erst sichtbar, wenn die Regel ausgeschaltet ist.
    expect(screen.queryByText('Brunner Elsau')).toBeNull()
    fireEvent.click(screen.getByLabelText(/Nur Kampagnen-Regel/))
    expect(screen.getByText('Brunner Elsau')).toBeTruthy()
  })

  it('Projekte ohne E-Mail lassen sich nicht anhaken', async () => {
    render(<RueckmeldungScreen />)
    const box = await screen.findByLabelText('Keller Dinhard HS auswählen')
    expect((box as HTMLInputElement).disabled).toBe(true)
  })

  it('Projekte mit Offerte oder schon angeschriebener Adresse lassen sich nicht anhaken', async () => {
    render(<RueckmeldungScreen />)
    for (const name of ['Stahel Neftenbach HS', 'Meier Seuzach HS', 'Vogel Rickenbach HS']) {
      const box = await screen.findByLabelText(`${name} auswählen`)
      expect((box as HTMLInputElement).disabled).toBe(true)
    }
  })

  it('bietet keinen Editor für den Inhalt an', async () => {
    render(<RueckmeldungScreen />)
    await screen.findByText('Stahel Neftenbach HS')
    // Textfelder: Suche und Testadresse — kein Betreff, kein Mailtext.
    const felder = screen.queryAllByRole('textbox').concat(screen.queryAllByRole('searchbox'))
    expect(felder).toHaveLength(2)
  })

  it('versendet nur die angehakten Projekte, erst nach Bestätigung', async () => {
    render(<RueckmeldungScreen />)
    const knopf = await screen.findByText(/Versand vorbereiten \(0 Projekte ausgewählt\)/)
    expect((knopf as HTMLButtonElement).disabled).toBe(true)

    fireEvent.click(await screen.findByLabelText('Huber Wiesendangen HS auswählen'))
    fireEvent.click(screen.getByLabelText('Graf Hettlingen HS auswählen'))
    fireEvent.click(screen.getByText(/Versand vorbereiten \(2 Projekte ausgewählt\)/))

    await waitFor(() => expect(probelauf).toHaveBeenCalledWith(KAMPAGNE.key, ['p5', 'p6']))
    expect(starteVersand).not.toHaveBeenCalled()
    // Mandant und Anzahl stehen im Dialog — die Verwechslung ist der teuerste Fehler.
    expect(await screen.findByText(/2 Mails \(2 Projekte\) an Kunden von Gehlhaar GmbH/)).toBeTruthy()
    fireEvent.click(screen.getByText('2 Mails versenden'))
    await waitFor(() => expect(starteVersand).toHaveBeenCalledWith(KAMPAGNE.key, ['p5', 'p6'], 2))
  })

  it('«Sichtbare auswählen» nimmt nur anhakbare Zeilen', async () => {
    render(<RueckmeldungScreen />)
    fireEvent.click(await screen.findByText(/Sichtbare auswählen \(2\)/))
    expect(screen.getByText(/Versand vorbereiten \(2 Projekte ausgewählt\)/)).toBeTruthy()
    const zeile = screen.getByText('Keller Dinhard HS').closest('tr') as HTMLElement
    expect((within(zeile).getByRole('checkbox') as HTMLInputElement).checked).toBe(false)
  })

  it('sperrt den Versand ohne Mandant in dieser Umgebung', async () => {
    listKampagnen.mockResolvedValue([{ ...KAMPAGNE, tenant: null }])
    render(<RueckmeldungScreen />)
    expect(await screen.findByText(/ist in dieser Umgebung aktiv/)).toBeTruthy()
    expect(screen.queryByText(/Versand vorbereiten/)).toBeNull()
    expect(listProjekte).not.toHaveBeenCalled()
  })

  it('schickt die Testmail an die eingegebene Adresse', async () => {
    render(<RueckmeldungScreen />)
    await screen.findByText('Stahel Neftenbach HS')
    fireEvent.change(screen.getByPlaceholderText('leer = eigene Adresse'), { target: { value: 'test@example.ch' } })
    fireEvent.click(screen.getByText('Testmail senden'))
    await waitFor(() => expect(testmail).toHaveBeenCalledWith(KAMPAGNE.key, 'test@example.ch'))
  })
})
