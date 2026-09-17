/**
 * Newsletter-Oberfläche (docs/specs/admin-werkora-ch.md §4.3/2).
 *
 * Der Versand erreicht Nutzer aller Mandanten und lässt sich nicht
 * zurücknehmen. Geprüft wird deshalb vor allem, dass er **nicht ohne
 * Bestätigung** losgeht und dass im Dialog steht, an wen — die Lehre aus §12:
 * die Mandanten-Verwechslung ist der teuerste Fehler dieser Seite.
 *
 * Und dass es **keinen Editor** gibt: der Inhalt lebt im Code
 * (docs/specs/newsletter.md), eine Eingabemöglichkeit hier wäre ein zweiter Ort
 * für denselben Text.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'

const listEditions = vi.fn()
const sendEdition = vi.fn()
const previewHtml = vi.fn()

vi.mock('../../api/newsletter', () => ({
  listEditions: () => listEditions(),
  sendEdition: (k: string, t: string | null) => sendEdition(k, t),
  previewHtml: (k: string, t: string, r: string) => previewHtml(k, t, r),
  previewPush: vi.fn(),
}))

import NewsletterScreen from './NewsletterScreen'

const TENANTS = [
  { id: 't-1', slug: 'gehlhaar', name: 'Gehlhaar AG', enabled_modules: [], beta_modules: [] },
  { id: 't-2', slug: 'staehli', name: 'Stähli GmbH', enabled_modules: [], beta_modules: [] },
]

const AUSGABE = {
  key: '2026-09',
  created_on: '2026-09-01',
  subject: 'Was neu ist',
  intro: 'Hallo',
  outro: 'Bis bald',
  items: [{ title: 'Offline-Rapport', text: 'Geht jetzt.', push: 'Neu: Offline', roles: ['user'], modules_any: ['ai'] }],
}

beforeEach(() => {
  listEditions.mockReset().mockResolvedValue([AUSGABE])
  sendEdition.mockReset().mockResolvedValue({ edition_key: '2026-09', results: [{}] })
  previewHtml.mockReset().mockResolvedValue('<p>Mail-HTML</p>')
})

describe('NewsletterScreen', () => {
  it('führt die Ausgabe mit ihren Beiträgen auf', async () => {
    render(<NewsletterScreen tenants={TENANTS} />)
    expect(await screen.findByText('Was neu ist')).toBeTruthy()
    expect(screen.getByText('Offline-Rapport')).toBeTruthy()
    expect(screen.getByText(/Neu: Offline/)).toBeTruthy()
  })

  it('bietet keinen Editor an — der Inhalt lebt im Code', async () => {
    render(<NewsletterScreen tenants={TENANTS} />)
    await screen.findByText('Was neu ist')
    // Nur Auswahlfelder, kein Textfeld: Betreff, Beitragstext und Push-Zeile
    // sind nirgends eingebbar.
    expect(screen.queryByRole('textbox')).toBeNull()
  })

  it('versendet NICHT ohne Bestätigung', async () => {
    render(<NewsletterScreen tenants={TENANTS} />)
    await screen.findByText('Was neu ist')

    fireEvent.click(screen.getByRole('button', { name: 'Jetzt versenden' }))

    expect(sendEdition).not.toHaveBeenCalled()
    expect(screen.getByText(/Newsletter versenden\?/)).toBeTruthy()
  })

  it('nennt das Ziel im Dialog — «alle» ist der Standard und heisst so', async () => {
    render(<NewsletterScreen tenants={TENANTS} />)
    await screen.findByText('Was neu ist')

    fireEvent.click(screen.getByRole('button', { name: 'Jetzt versenden' }))
    expect(screen.getByText(/ALLE Mandanten/)).toBeTruthy()
  })

  it('nennt den gewählten Mandanten im Dialog', async () => {
    render(<NewsletterScreen tenants={TENANTS} />)
    await screen.findByText('Was neu ist')

    const felder = screen.getAllByRole('combobox')
    const ziel = felder[felder.length - 1]
    fireEvent.change(ziel, { target: { value: 't-2' } })
    fireEvent.click(screen.getByRole('button', { name: 'Jetzt versenden' }))

    // Der Name steht auch in den Auswahlfeldern — hier zählt der Dialogtext.
    expect(screen.getByText(/an Stähli GmbH versenden/)).toBeTruthy()
  })

  it('versendet erst nach der Bestätigung, mit Ausgabe und Ziel', async () => {
    render(<NewsletterScreen tenants={TENANTS} />)
    await screen.findByText('Was neu ist')

    fireEvent.click(screen.getByRole('button', { name: 'Jetzt versenden' }))
    fireEvent.click(screen.getByRole('button', { name: 'Versenden' }))

    await waitFor(() => expect(sendEdition).toHaveBeenCalledWith('2026-09', null))
  })

  /**
   * Die Vorschau wird GEHOLT und als `srcdoc` gezeigt, nicht als `src` auf die
   * API verlinkt. Der Unterschied ist nicht kosmetisch: das Backend setzt auf
   * jeder Antwort `X-Frame-Options: DENY`, ein verlinkter Rahmen blieb deshalb
   * dauerhaft leer (graue Fläche mit Abbruch-Symbol, so gemeldet am
   * 2026-09-17). Ein `src` hier wäre ein Rückfall in genau diesen Zustand.
   */
  it('zeigt die Vorschau als srcdoc statt als Link auf die API', async () => {
    const { container } = render(<NewsletterScreen tenants={TENANTS} />)
    await screen.findByText('Was neu ist')

    const rahmen = await waitFor(() => {
      const r = container.querySelector('iframe')
      expect(r).toBeTruthy()
      return r!
    })
    expect(rahmen.getAttribute('sandbox')).toBe('')
    expect(rahmen.getAttribute('srcdoc')).toContain('Mail-HTML')
    expect(rahmen.getAttribute('src')).toBeNull()
    expect(previewHtml).toHaveBeenCalledWith('2026-09', 't-1', 'user')
  })

  it('laedt die Vorschau neu, wenn Mandant oder Rolle wechseln', async () => {
    render(<NewsletterScreen tenants={TENANTS} />)
    await screen.findByText('Was neu ist')
    await waitFor(() => expect(previewHtml).toHaveBeenCalledWith('2026-09', 't-1', 'user'))

    const felder = screen.getAllByRole('combobox')
    fireEvent.change(felder[2], { target: { value: 'admin' } })   // «In der Rolle»
    await waitFor(() => expect(previewHtml).toHaveBeenCalledWith('2026-09', 't-1', 'admin'))
  })

  it('sagt es, wenn die Vorschau nicht geladen werden kann', async () => {
    previewHtml.mockRejectedValue(new Error('403: kein Zugriff'))
    const { container } = render(<NewsletterScreen tenants={TENANTS} />)
    await screen.findByText('Was neu ist')

    expect(await screen.findByText('403: kein Zugriff')).toBeTruthy()
    // Kein leerer Rahmen daneben, der aussieht, als lade noch etwas.
    expect(container.querySelector('iframe')).toBeNull()
  })
})
