/**
 * Dialog «Sicherheit» (docs/specs/betreiber-mfa.md §5.1).
 *
 * Die Pflicht kommt erst mit abgelegten Codes: «Fertig» bleibt gesperrt, bis
 * das Häkchen gesetzt ist, und schaltet die Pflicht nur ein, wenn sie noch
 * nicht gilt. Fehlt eine frische Bestätigung, fragt der Dialog einmal nach dem
 * Passkey und wiederholt.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { ApiError } from '../api/client'

const ladeGeraete = vi.fn()
const erzeugeCodes = vi.fn()
const aktiviere = vi.fn()
const entfernePasskey = vi.fn()
const bestaetige = vi.fn()
vi.mock('./betreiberMfa', async (importOriginal) => {
  const echt = await importOriginal<typeof import('./betreiberMfa')>()
  return {
    ...echt,
    ladeGeraete: () => ladeGeraete(),
    erzeugeCodes: () => erzeugeCodes(),
    aktiviere: () => aktiviere(),
    entfernePasskey: (id: string) => entfernePasskey(id),
    bestaetigeMitPasskey: (art: string) => bestaetige(art),
    // Nachgebaut statt echt: die echte ruft modulintern die ECHTE
    // bestaetigeMitPasskey (navigator.credentials), nicht den Mock oben.
    mitBestaetigung: async <T,>(aktion: () => Promise<T>) => {
      try { return await aktion() } catch (err) {
        if (!echt.brauchtBestaetigung(err)) throw err
        await bestaetige('auto')
        return aktion()
      }
    },
  }
})
const einrichten = vi.fn()
vi.mock('./adminPasskey', async (importOriginal) => {
  const echt = await importOriginal<typeof import('./adminPasskey')>()
  return { ...echt, adminPasskeyEinrichten: () => einrichten() }
})

import SicherheitDialog from './SicherheitDialog'
import { SchonEingerichtet } from './adminPasskey'

const OHNE_PFLICHT = {
  pflicht: false, pflicht_seit: null, bestaetigt: true, methode: 'passkey', frisch: true,
  codes_uebrig: 0,
  passkeys: [{ id: 'p1', domain: 'admin.werkora.ch', betreiber_seite: true, geraet: null,
    transports: ['internal'], angelegt: '2026-11-12T08:00:00Z', zuletzt: null }],
}
const CODES = {
  codes: ['AAAAA-00000', 'BBBBB-11111', 'CCCCC-22222', 'DDDDD-33333', 'EEEEE-44444',
    'FFFFF-55555', 'GGGGG-66666', 'HHHHH-77777', 'JJJJJ-88888', 'KKKKK-99999'],
  text: 'Werkora Admin — Wiederherstellungscodes\n',
  pflicht: false,
}

beforeEach(() => {
  ladeGeraete.mockReset().mockResolvedValue(OHNE_PFLICHT)
  erzeugeCodes.mockReset().mockResolvedValue(CODES)
  aktiviere.mockReset().mockResolvedValue(undefined)
  entfernePasskey.mockReset().mockResolvedValue(undefined)
  bestaetige.mockReset().mockResolvedValue(undefined)
  einrichten.mockReset().mockResolvedValue({})
})

function hintergrundKlick() {
  const overlay = document.querySelector('.admin-modal-overlay') as HTMLElement
  fireEvent.mouseDown(overlay)
  fireEvent.click(overlay)
}

describe('SicherheitDialog', () => {
  it('Codes erzeugen, ablegen, Pflicht einschalten', async () => {
    const onMeldung = vi.fn()
    render(<SicherheitDialog onClose={vi.fn()} onMeldung={onMeldung} />)
    expect(await screen.findByText(/noch nicht aktiv/)).toBeTruthy()

    fireEvent.click(screen.getByRole('button', { name: 'Neue Wiederherstellungscodes erzeugen' }))
    expect(await screen.findByText('AAAAA-00000')).toBeTruthy()
    expect(screen.getAllByRole('listitem').filter((li) => /-\d{5}$/.test(li.textContent ?? ''))).toHaveLength(10)

    const fertig = screen.getByRole('button', { name: /Fertig/ })
    expect((fertig as HTMLButtonElement).disabled).toBe(true)
    fireEvent.click(screen.getByLabelText('Ich habe die Codes sicher abgelegt.'))
    fireEvent.click(fertig)

    await waitFor(() => expect(aktiviere).toHaveBeenCalledTimes(1))
    expect(onMeldung).toHaveBeenCalledWith('Zwei-Faktor-Anmeldung eingeschaltet')
  })

  it('mit Pflicht: neue Codes ersetzen die alten, ohne erneutes Einschalten', async () => {
    ladeGeraete.mockResolvedValue({ ...OHNE_PFLICHT, pflicht: true, pflicht_seit: '2026-11-12T08:00:00Z', codes_uebrig: 2 })
    erzeugeCodes.mockResolvedValue({ ...CODES, pflicht: true })
    render(<SicherheitDialog onClose={vi.fn()} onMeldung={vi.fn()} />)
    expect(await screen.findByText(/Noch 2 Codes übrig/)).toBeTruthy()

    fireEvent.click(screen.getByRole('button', { name: 'Neue Wiederherstellungscodes erzeugen' }))
    // Es gibt noch Codes — erst nachfragen, dass die alten verfallen.
    fireEvent.click(await screen.findByRole('button', { name: 'Neue Codes erzeugen' }))
    await screen.findByText('AAAAA-00000')
    fireEvent.click(screen.getByLabelText('Ich habe die Codes sicher abgelegt.'))
    fireEvent.click(screen.getByRole('button', { name: 'Fertig' }))
    await waitFor(() => expect(ladeGeraete).toHaveBeenCalledTimes(3))
    expect(aktiviere).not.toHaveBeenCalled()
  })

  it('zu alte Bestätigung: einmal Passkey, dann wiederholt', async () => {
    erzeugeCodes
      .mockRejectedValueOnce(new ApiError(403, 'Bitte zuerst mit Passkey bestätigen.', 'bestaetigung_erforderlich'))
      .mockResolvedValueOnce(CODES)
    render(<SicherheitDialog onClose={vi.fn()} onMeldung={vi.fn()} />)
    fireEvent.click(await screen.findByRole('button', { name: 'Neue Wiederherstellungscodes erzeugen' }))
    expect(await screen.findByText('AAAAA-00000')).toBeTruthy()
    expect(bestaetige).toHaveBeenCalledTimes(1)
    expect(erzeugeCodes).toHaveBeenCalledTimes(2)
  })

  it('Codes erzeugt, «Fertig» nie geklickt: die Übersicht schaltet direkt ein', async () => {
    // So am 12.11. auf Produktion: Codes heruntergeladen, Fenster zu — die
    // Pflicht blieb aus, und ein Weg zum Einschalten fehlte.
    ladeGeraete.mockResolvedValue({ ...OHNE_PFLICHT, codes_uebrig: 10 })
    const onMeldung = vi.fn()
    render(<SicherheitDialog onClose={vi.fn()} onMeldung={onMeldung} />)
    expect(await screen.findByText(/es fehlt nur noch dieser Schritt/)).toBeTruthy()

    const knopf = screen.getByRole('button', { name: 'Zwei-Faktor-Anmeldung einschalten' })
    expect((knopf as HTMLButtonElement).disabled).toBe(true)
    fireEvent.click(screen.getByLabelText('Ich habe die Codes sicher abgelegt.'))
    fireEvent.click(knopf)

    await waitFor(() => expect(aktiviere).toHaveBeenCalledTimes(1))
    expect(onMeldung).toHaveBeenCalledWith('Zwei-Faktor-Anmeldung eingeschaltet')
    expect(erzeugeCodes).not.toHaveBeenCalled()
  })

  it('ohne Codes kein Einschalt-Knopf', async () => {
    render(<SicherheitDialog onClose={vi.fn()} onMeldung={vi.fn()} />)
    expect(await screen.findByText(/Sie wird mit dem ersten Satz/)).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Zwei-Faktor-Anmeldung einschalten' })).toBeNull()
  })

  it('ein Klick daneben schliesst die offenen Codes nicht, die Übersicht schon', async () => {
    const onClose = vi.fn()
    render(<SicherheitDialog onClose={onClose} onMeldung={vi.fn()} />)
    fireEvent.click(await screen.findByRole('button', { name: 'Neue Wiederherstellungscodes erzeugen' }))
    await screen.findByText('AAAAA-00000')

    hintergrundKlick()
    expect(onClose).not.toHaveBeenCalled()
    expect(screen.getByText('AAAAA-00000')).toBeTruthy()

    fireEvent.click(screen.getByLabelText('Ich habe die Codes sicher abgelegt.'))
    fireEvent.click(screen.getByRole('button', { name: /Fertig/ }))
    await waitFor(() => expect(screen.queryByText('AAAAA-00000')).toBeNull())
    hintergrundKlick()
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('Passkey schon auf dem Gerät (synchronisiert): Meldung sagt, dass es so geht', async () => {
    einrichten.mockRejectedValue(new SchonEingerichtet({ authorizedUserId: 'u1', tenantSlug: 'werkora', displayName: 'Luca' }))
    const onMeldung = vi.fn()
    render(<SicherheitDialog onClose={vi.fn()} onMeldung={onMeldung} />)
    fireEvent.click(await screen.findByRole('button', { name: /Diesen Computer merken/ }))
    await waitFor(() => expect(onMeldung).toHaveBeenCalledWith(expect.stringMatching(/Passwortmanager/)))
  })

  it('letzter Faktor: die Meldung des Servers steht im Dialog', async () => {
    entfernePasskey.mockRejectedValue(new ApiError(409, 'Das ist der letzte Faktor.', 'letzter_faktor'))
    render(<SicherheitDialog onClose={vi.fn()} onMeldung={vi.fn()} />)
    fireEvent.click(await screen.findByRole('button', { name: 'Entfernen' }))
    const knoepfe = screen.getAllByRole('button', { name: 'Entfernen' })
    const bestaetigen = knoepfe[knoepfe.length - 1]
    fireEvent.click(bestaetigen)
    expect(await screen.findByText('Das ist der letzte Faktor.')).toBeTruthy()
  })
})
