/**
 * «Eingang» des Büros — docs/specs/mail-eingang-triage.md §4, §6.3, §6.4, §10.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { EingangItem, EingangListe, EingangVorschlag } from '../../api/admin/mailEingang'
import { ApiError } from '../../api/client'

const listMailEingang = vi.fn()
const getMailEingangText = vi.fn()
const acceptMailVorschlag = vi.fn()
const rejectMailVorschlag = vi.fn()
const dismissMailEingang = vi.fn()
const searchMailEingangProjekte = vi.fn()
vi.mock('../../api/admin/mailEingang', () => ({
  listMailEingang: (...a: unknown[]) => listMailEingang(...a),
  getMailEingangText: (...a: unknown[]) => getMailEingangText(...a),
  acceptMailVorschlag: (...a: unknown[]) => acceptMailVorschlag(...a),
  rejectMailVorschlag: (...a: unknown[]) => rejectMailVorschlag(...a),
  dismissMailEingang: (...a: unknown[]) => dismissMailEingang(...a),
  searchMailEingangProjekte: (...a: unknown[]) => searchMailEingangProjekte(...a),
}))

// «Kontakt ergänzen» öffnet die echte Kundenmaske (Spec §4.2) — gemockt ist nur,
// was sie ans Netz schickt.
const getCustomer = vi.fn()
const saveCustomer = vi.fn()
vi.mock('../../api/admin/customers', async importOriginal => ({
  ...await importOriginal<typeof import('../../api/admin/customers')>(),
  getCustomer: (...a: unknown[]) => getCustomer(...a),
  saveCustomer: (...a: unknown[]) => saveCustomer(...a),
  checkCustomerName: vi.fn().mockResolvedValue([]),
  getCustomerComments: vi.fn().mockResolvedValue([]),
  getCustomerProjects: vi.fn().mockResolvedValue([]),
}))
vi.mock('../../api/auth', () => ({ getMe: vi.fn().mockResolvedValue({}) }))
vi.mock('../../shared/AddressAutocomplete', () => ({
  AddressAutocomplete: ({ value, onChange }: { value: string; onChange: (v: string) => void }) => (
    <input aria-label="Adresse" value={value} onChange={e => onChange(e.target.value)} />
  ),
}))
vi.mock('../../shared/CompanySearch', () => ({ CompanySearch: () => null }))

import MailEingangScreen from './MailEingangScreen'

const P1 = { project_id: 'p1', number: '2600515', name: 'Bad Muster', customer: 'Muster AG', locality: 'Chur' }
const P2 = { project_id: 'p2', number: '2600520', name: 'Küche Muster', customer: 'Muster AG', locality: 'Chur' }

const offen = { status: 'offen' as const, created: null, decided_by_name: null, decided_at: null }

const ENTWURF: EingangVorschlag = {
  id: 's-entwurf', typ: 'projekt_entwurf', ...offen,
  payload: {
    title: 'Storen Balkon', customer_name: 'Hans Muster', customer_phone: '', customer_email: 'hans@muster.ch',
    customer_address: '', object_name: '', object_address: '', description: 'Zwei Storen ersetzen',
  },
}
const NOTIZ: EingangVorschlag = {
  id: 's-notiz', typ: 'projektnotiz', ...offen,
  payload: { project_id: null, projects: [P1, P2], text: 'Kunde bestätigt den Termin.' },
}

const DOKUMENT: EingangVorschlag = {
  id: 's-dok', typ: 'projektdokument', ...offen,
  payload: {
    project_id: null, projects: [P1, P2], attachment_id: 'att-1', filename: 'Auftrag.pdf',
    mime_type: 'application/pdf', size: 120 * 1024,
  },
}
const KONTAKT: EingangVorschlag = {
  id: 's-kontakt', typ: 'kontakt_ergaenzen', ...offen,
  payload: { customer_id: 'c1', customer_name: 'Hans Muster', feld: 'email', feld_label: 'E-Mail', wert: 'hans@muster.ch' },
}
const KUNDE = {
  id: 'c1', name: 'Hans Muster', first_name: 'Hans', last_name: 'Muster', salutation: null, company: null,
  email: null, additional_emails: [], phone: '079 111 22 33', phone_landline: null, address: null,
  billing_name: null, billing_address: null, object_address: null, local_contact_name: null,
  local_contact_phone: null, owner_contact_name: null, owner_contact_phone: null, notes: null,
  created_at: '2026-01-01T00:00:00Z',
}

function item(over: Partial<EingangItem> = {}): EingangItem {
  return {
    id: 'm1', received_at: '2026-11-12T08:00:00Z', subject: 'Anfrage Storen', kategorie: 'neue_anfrage',
    summary: 'Hans Muster möchte zwei Storen ersetzen lassen.',
    weitergeleitet_von: { name: 'Petra Büro', email: 'petra@betrieb.ch' },
    absender: { name: 'Hans Muster', email: 'hans@muster.ch' },
    customer: null, status: 'offen', decided_at: null, suggestions: [ENTWURF],
    ...over,
  }
}

function liste(items: EingangItem[], over: Partial<EingangListe> = {}): EingangListe {
  return { items, abgewiesen: [], abgewiesen_tage: 7, ...over }
}

beforeEach(() => {
  listMailEingang.mockReset().mockResolvedValue(liste([item()]))
  getMailEingangText.mockReset().mockResolvedValue({ vorhanden: true, text: 'Guten Tag\n\nBitte um Offerte.\nhttps://boese.example/x' })
  acceptMailVorschlag.mockReset()
  rejectMailVorschlag.mockReset()
  dismissMailEingang.mockReset().mockResolvedValue(undefined)
  searchMailEingangProjekte.mockReset().mockResolvedValue([])
  getCustomer.mockReset().mockResolvedValue(KUNDE)
  saveCustomer.mockReset().mockImplementation(async (input: Record<string, unknown>) => ({ ...KUNDE, ...input }))
})

async function oeffne(user: ReturnType<typeof userEvent.setup>, betreff = 'Anfrage Storen') {
  const karte = await screen.findByRole('article', { name: betreff })
  await user.click(within(karte).getByRole('button', { name: /öffnen$/ }))
  return karte
}

describe('MailEingangScreen — Liste', () => {
  it('zeigt die Karte mit Kopfdaten und weist den Absender als «aus der Mail gelesen» aus', async () => {
    render(<MailEingangScreen />)
    const karte = await screen.findByRole('article', { name: 'Anfrage Storen' })
    expect(listMailEingang).toHaveBeenCalledWith('offen')
    expect(within(karte).getByText(/weitergeleitet von/)).toHaveTextContent('Petra Büro (petra@betrieb.ch)')
    expect(within(karte).getByText(/Ursprünglicher Absender/)).toHaveTextContent(
      'Ursprünglicher Absender: Hans Muster (hans@muster.ch) — aus der Mail gelesen',
    )
    expect(within(karte).getByText('Hans Muster möchte zwei Storen ersetzen lassen.')).toBeInTheDocument()
    expect(screen.getByText(/1 offen/)).toBeInTheDocument()
    // Der Text wird erst beim Öffnen aus dem Postfach geholt.
    expect(getMailEingangText).not.toHaveBeenCalled()
  })

  it('stellt die neueste Mail zuoberst', async () => {
    listMailEingang.mockResolvedValue(liste([
      item({ id: 'alt', subject: 'Alt', received_at: '2026-11-10T08:00:00Z' }),
      item({ id: 'neu', subject: 'Neu', received_at: '2026-11-12T08:00:00Z' }),
    ]))
    render(<MailEingangScreen />)
    await screen.findByRole('article', { name: 'Neu' })
    expect(screen.getAllByRole('article').map(a => a.getAttribute('aria-label'))).toEqual(['Neu', 'Alt'])
  })

  it('zeigt die Zähler der nicht ausgewerteten Mails über der Liste', async () => {
    listMailEingang.mockResolvedValue(liste([], {
      abgewiesen: [{ grund: 'fremde_domain', anzahl: 3 }, { grund: 'automatisch', anzahl: 1 }],
    }))
    render(<MailEingangScreen />)
    expect(await screen.findByRole('note')).toHaveTextContent(
      'In den letzten 7 Tagen nicht ausgewertet: 3 × nicht aus den Domains des Betriebs, 1 × automatische Antwort oder Massenmail',
    )
    expect(screen.getByText(/Der Eingang ist leer/)).toBeInTheDocument()
  })

  it('ohne Abgewiesenes steht dort nichts', async () => {
    render(<MailEingangScreen />)
    await screen.findByRole('article')
    expect(screen.queryByRole('note')).toBeNull()
  })

  it('schaltet auf «Erledigt» um und lädt diese Ansicht', async () => {
    const user = userEvent.setup()
    render(<MailEingangScreen />)
    await screen.findByRole('article')
    listMailEingang.mockResolvedValue(liste([]))
    await user.click(screen.getByRole('button', { name: 'Erledigt' }))
    await waitFor(() => expect(listMailEingang).toHaveBeenLastCalledWith('erledigt'))
    expect(await screen.findByText('Noch nichts erledigt.')).toBeInTheDocument()
  })

  it('meldet einen Ladefehler und lässt es erneut versuchen', async () => {
    const user = userEvent.setup()
    listMailEingang.mockRejectedValueOnce(new ApiError(500, 'kaputt'))
    render(<MailEingangScreen />)
    expect(await screen.findByRole('alert')).toHaveTextContent('Der Eingang konnte nicht geladen werden.')
    await user.click(screen.getByRole('button', { name: 'Erneut versuchen' }))
    expect(await screen.findByRole('article', { name: 'Anfrage Storen' })).toBeInTheDocument()
  })

  it('bietet keinen Filter und keine Auswertung je Mitarbeiter an (Spec §7.4)', async () => {
    render(<MailEingangScreen />)
    await screen.findByRole('article')
    expect(screen.queryByRole('combobox')).toBeNull()
    expect(screen.queryByRole('searchbox')).toBeNull()
  })
})

describe('MailEingangScreen — Original', () => {
  it('holt den Text beim Öffnen und zeigt ihn als reinen Text über den Vorschlägen', async () => {
    const user = userEvent.setup()
    render(<MailEingangScreen />)
    const karte = await oeffne(user)
    expect(getMailEingangText).toHaveBeenCalledWith('m1')
    const original = await within(karte).findByLabelText('Originaltext der Mail')
    expect(original.tagName).toBe('PRE')
    expect(original.textContent).toBe('Guten Tag\n\nBitte um Offerte.\nhttps://boese.example/x')
    // Kein HTML, kein anklickbarer Link (Spec §9, R4/R5).
    expect(original.children).toHaveLength(0)
    expect(within(karte).queryByRole('link')).toBeNull()
    // Das Original steht vor den Vorschlägen, nicht dahinter.
    const vorschlag = within(karte).getByTestId('vorschlag-s-entwurf')
    expect(original.compareDocumentPosition(vorschlag) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
  })

  it('setzt eingeschleustes HTML nicht um', async () => {
    const user = userEvent.setup()
    getMailEingangText.mockResolvedValue({ vorhanden: true, text: '<img src=x onerror=alert(1)><a href="https://x">klick</a>' })
    render(<MailEingangScreen />)
    const karte = await oeffne(user)
    const original = await within(karte).findByLabelText('Originaltext der Mail')
    expect(original.querySelector('img, a')).toBeNull()
    expect(original.textContent).toContain('<img src=x onerror=alert(1)>')
  })

  it('sagt, wenn das Original nicht mehr im Postfach liegt', async () => {
    const user = userEvent.setup()
    getMailEingangText.mockResolvedValue({ vorhanden: false, text: null })
    render(<MailEingangScreen />)
    const karte = await oeffne(user)
    expect(await within(karte).findByText('Original nicht mehr im Postfach vorhanden.')).toBeInTheDocument()
  })
})

describe('MailEingangScreen — Vorschläge', () => {
  it('übernimmt mit den geänderten Feldern und zeigt danach, wer übernommen hat und wo es liegt', async () => {
    const user = userEvent.setup()
    const onChanged = vi.fn()
    const onNav = vi.fn()
    acceptMailVorschlag.mockResolvedValue({
      suggestion: {
        ...ENTWURF, status: 'uebernommen', created: { type: 'project_draft', id: 'd1' },
        decided_by_name: 'Petra Büro', decided_at: '2026-11-12T13:05:00Z',
      },
      item_status: 'erledigt',
    })
    render(<MailEingangScreen onChanged={onChanged} onNav={onNav} />)
    const karte = await oeffne(user)

    const titel = within(karte).getByLabelText('Titel')
    await user.clear(titel)
    await user.type(titel, 'Storen Balkon Süd')
    await user.click(within(karte).getByRole('button', { name: 'Übernehmen' }))

    expect(acceptMailVorschlag).toHaveBeenCalledWith('m1', 's-entwurf', { title: 'Storen Balkon Süd' })
    expect(await within(karte).findByText('Übernommen von Petra Büro am 12.11.26, 14:05')).toBeInTheDocument()
    expect(within(karte).getByText(/unter Projekt-Entwürfe/)).toBeInTheDocument()
    // Entschieden ist entschieden: keine Knöpfe mehr, die Karte bleibt aber stehen.
    expect(within(karte).queryByRole('button', { name: 'Übernehmen' })).toBeNull()
    expect(within(karte).getByText('Erledigt')).toBeInTheDocument()
    expect(onChanged).toHaveBeenCalled()

    await user.click(within(karte).getByRole('button', { name: 'Zu den Projekt-Entwürfen' }))
    expect(onNav).toHaveBeenCalledWith('project-drafts')
  })

  it('löst bei einem Doppelklick nur eine Anfrage aus', async () => {
    const user = userEvent.setup()
    let fertig: (v: unknown) => void = () => {}
    acceptMailVorschlag.mockReturnValue(new Promise(resolve => { fertig = resolve }))
    render(<MailEingangScreen />)
    const karte = await oeffne(user)
    const knopf = within(karte).getByRole('button', { name: 'Übernehmen' })
    await user.dblClick(knopf)
    expect(acceptMailVorschlag).toHaveBeenCalledTimes(1)
    // Solange die Anfrage läuft, sind beide Knöpfe gesperrt.
    expect(within(karte).getByRole('button', { name: 'Wird übernommen…' })).toBeDisabled()
    expect(within(karte).getByRole('button', { name: 'Verwerfen' })).toBeDisabled()
    fertig({ suggestion: { ...ENTWURF, status: 'uebernommen' }, item_status: 'erledigt' })
    await waitFor(() => expect(within(karte).queryByRole('button', { name: 'Verwerfen' })).toBeNull())
  })

  it('verlangt bei einer Projektnotiz ohne Zuordnung zuerst die Projektwahl', async () => {
    const user = userEvent.setup()
    listMailEingang.mockResolvedValue(liste([item({ kategorie: 'laufendes_projekt', suggestions: [NOTIZ] })]))
    acceptMailVorschlag.mockResolvedValue({
      suggestion: { ...NOTIZ, status: 'uebernommen', payload: { ...NOTIZ.payload, project_id: 'p2' }, decided_by_name: 'Petra Büro' },
      item_status: 'erledigt',
    })
    render(<MailEingangScreen />)
    const karte = await oeffne(user)

    const uebernehmen = within(karte).getByRole('button', { name: 'Übernehmen' })
    expect(uebernehmen).toBeDisabled()
    expect(within(karte).getByText('Bitte zuerst das Projekt wählen.')).toBeInTheDocument()

    await user.click(within(karte).getByRole('button', { name: '2600520 Küche Muster' }))
    expect(uebernehmen).toBeEnabled()
    await user.click(uebernehmen)
    expect(acceptMailVorschlag).toHaveBeenCalledWith('m1', 's-notiz', { project_id: 'p2' })
    expect(await within(karte).findByText('Steht als Kommentar am Projekt 2600520 · Küche Muster.')).toBeInTheDocument()
  })

  it('findet ein Projekt über die Suche, wenn kein Kandidat passt', async () => {
    const user = userEvent.setup()
    const P3 = { project_id: 'p3', number: '2600601', name: 'Dach Beispiel', customer: 'Beispiel GmbH', locality: 'Thusis' }
    listMailEingang.mockResolvedValue(liste([
      item({ suggestions: [{ ...NOTIZ, payload: { ...NOTIZ.payload, projects: [] } } as EingangVorschlag] }),
    ]))
    searchMailEingangProjekte.mockResolvedValue([P3])
    acceptMailVorschlag.mockResolvedValue({ suggestion: { ...NOTIZ, status: 'uebernommen' }, item_status: 'erledigt' })
    render(<MailEingangScreen />)
    const karte = await oeffne(user)

    await user.type(within(karte).getByLabelText('Projekt suchen'), 'Dach')
    await user.click(await within(karte).findByRole('button', { name: '2600601 Dach Beispiel' }))
    expect(searchMailEingangProjekte).toHaveBeenLastCalledWith('Dach')
    await user.click(within(karte).getByRole('button', { name: 'Übernehmen' }))
    expect(acceptMailVorschlag).toHaveBeenCalledWith('m1', 's-notiz', { project_id: 'p3' })
  })

  it('verwirft einen einzelnen Vorschlag', async () => {
    const user = userEvent.setup()
    rejectMailVorschlag.mockResolvedValue({
      suggestion: { ...ENTWURF, status: 'verworfen', decided_by_name: 'Petra Büro', decided_at: '2026-11-12T13:05:00Z' },
      item_status: 'erledigt',
    })
    render(<MailEingangScreen />)
    const karte = await oeffne(user)
    await user.click(within(karte).getByRole('button', { name: 'Verwerfen' }))
    expect(rejectMailVorschlag).toHaveBeenCalledWith('m1', 's-entwurf')
    expect(await within(karte).findByText('Verworfen von Petra Büro am 12.11.26, 14:05')).toBeInTheDocument()
  })

  it('sagt bei 409, dass jemand schneller war, und lädt neu', async () => {
    const user = userEvent.setup()
    acceptMailVorschlag.mockRejectedValue(new ApiError(409, 'nicht_mehr_offen'))
    render(<MailEingangScreen />)
    const karte = await oeffne(user)
    listMailEingang.mockResolvedValue(liste([item({
      status: 'erledigt',
      suggestions: [{ ...ENTWURF, status: 'uebernommen', decided_by_name: 'Urs Chef', decided_at: '2026-11-12T13:00:00Z' }],
    })]))
    await user.click(within(karte).getByRole('button', { name: 'Übernehmen' }))

    expect(await screen.findByText(/inzwischen von jemand anderem bearbeitet/)).toBeInTheDocument()
    await waitFor(() => expect(listMailEingang).toHaveBeenCalledTimes(2))
    expect(await within(karte).findByText(/Übernommen von Urs Chef/)).toBeInTheDocument()
  })
})

describe('MailEingangScreen — Fehler beim Übernehmen', () => {
  it('zeigt den Grund des Servers und lässt den Vorschlag offen', async () => {
    const user = userEvent.setup()
    acceptMailVorschlag.mockRejectedValue(new ApiError(400, 'Die E-Mail-Adresse des Kunden ist ungültig.'))
    render(<MailEingangScreen />)
    const karte = await oeffne(user)
    await user.click(within(karte).getByRole('button', { name: 'Übernehmen' }))
    expect(await screen.findByText('Übernehmen fehlgeschlagen: Die E-Mail-Adresse des Kunden ist ungültig.')).toBeInTheDocument()
    expect(within(karte).getByRole('button', { name: 'Übernehmen' })).toBeEnabled()
    expect(listMailEingang).toHaveBeenCalledTimes(1)
  })
})

describe('MailEingangScreen — «Nicht für Werkora»', () => {
  it('verwirft erst nach Rückfrage und nimmt die Karte dann weg', async () => {
    const user = userEvent.setup()
    const onChanged = vi.fn()
    render(<MailEingangScreen onChanged={onChanged} />)
    const karte = await screen.findByRole('article', { name: 'Anfrage Storen' })
    await user.click(within(karte).getByRole('button', { name: 'Nicht für Werkora' }))
    expect(dismissMailEingang).not.toHaveBeenCalled()

    const dialog = screen.getByRole('dialog', { name: 'Nicht für Werkora?' })
    expect(dialog).toHaveTextContent(/Zusammenfassung wird sofort gelöscht/)
    await user.click(within(dialog).getByRole('button', { name: 'Ja, verwerfen' }))

    expect(dismissMailEingang).toHaveBeenCalledWith('m1')
    await waitFor(() => expect(screen.queryByRole('article')).toBeNull())
    expect(onChanged).toHaveBeenCalled()
  })

  it('lässt sich abbrechen', async () => {
    const user = userEvent.setup()
    render(<MailEingangScreen />)
    const karte = await screen.findByRole('article', { name: 'Anfrage Storen' })
    await user.click(within(karte).getByRole('button', { name: 'Nicht für Werkora' }))
    await user.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Abbrechen' }))
    expect(dismissMailEingang).not.toHaveBeenCalled()
    expect(screen.getByRole('article', { name: 'Anfrage Storen' })).toBeInTheDocument()
  })

  it('bietet den Knopf bei erledigten Karten nicht mehr an', async () => {
    listMailEingang.mockResolvedValue(liste([item({ status: 'verworfen', summary: null, suggestions: [] })]))
    render(<MailEingangScreen />)
    const karte = await screen.findByRole('article', { name: 'Anfrage Storen' })
    expect(within(karte).queryByRole('button', { name: 'Nicht für Werkora' })).toBeNull()
    expect(within(karte).getByText('Die Zusammenfassung wurde gelöscht.')).toBeInTheDocument()
  })
})

describe('MailEingangScreen — Anhänge', () => {
  it('nennt die Anhänge der Mail als Text', async () => {
    listMailEingang.mockResolvedValue(liste([item({
      anhaenge: [
        { name: 'Auftrag.pdf', size: 120 * 1024, gelesen: true },
        { name: '<b>Foto</b>.jpg', size: 2.1 * 1024 * 1024, gelesen: false },
      ],
    })]))
    render(<MailEingangScreen />)
    const zeile = await screen.findByTestId('eingang-anhaenge')
    expect(zeile).toHaveTextContent('Anhänge: Auftrag.pdf (120 KB, gelesen), <b>Foto</b>.jpg (2.1 MB)')
    // Dateinamen sind Fremdtext: kein Markup, kein Link.
    expect(zeile.querySelector('b, a')).toBeNull()
  })

  it('zeigt ohne Anhänge keine Zeile — auch bei einem Server ohne das Feld', async () => {
    render(<MailEingangScreen />)
    await screen.findByRole('article')
    expect(screen.queryByTestId('eingang-anhaenge')).toBeNull()
  })

  it('legt einen Anhang erst nach der Projektwahl ab und führt danach zu den Projektdokumenten', async () => {
    const user = userEvent.setup()
    const onNav = vi.fn()
    let fertig: (v: unknown) => void = () => {}
    acceptMailVorschlag.mockReturnValue(new Promise(resolve => { fertig = resolve }))
    listMailEingang.mockResolvedValue(liste([item({ suggestions: [DOKUMENT] })]))
    render(<MailEingangScreen onNav={onNav} />)
    const karte = await oeffne(user)

    const vorschlag = within(karte).getByTestId('vorschlag-s-dok')
    expect(within(vorschlag).getByText('Anhang am Projekt ablegen')).toBeInTheDocument()
    expect(within(vorschlag).getByText('Auftrag.pdf · 120 KB')).toBeInTheDocument()
    const uebernehmen = within(vorschlag).getByRole('button', { name: 'Übernehmen' })
    expect(uebernehmen).toBeDisabled()

    await user.click(within(vorschlag).getByRole('button', { name: '2600520 Küche Muster' }))
    await user.click(uebernehmen)
    expect(acceptMailVorschlag).toHaveBeenCalledWith('m1', 's-dok', { project_id: 'p2' })
    // Download und Upload dauern: gesperrt, mit eigener Beschriftung.
    expect(within(vorschlag).getByRole('button', { name: 'Wird abgelegt…' })).toBeDisabled()
    expect(within(vorschlag).getByRole('button', { name: 'Verwerfen' })).toBeDisabled()

    fertig({
      suggestion: {
        ...DOKUMENT, status: 'uebernommen', payload: { ...DOKUMENT.payload, project_id: 'p2' },
        created: { type: 'project_file', id: 'f1' }, decided_by_name: 'Petra Büro', decided_at: '2026-11-12T13:05:00Z',
      },
      item_status: 'erledigt',
    })
    expect(await within(vorschlag).findByText('Liegt bei den Projektdokumenten.')).toBeInTheDocument()
    await user.click(within(vorschlag).getByRole('button', { name: 'Projekt öffnen' }))
    expect(onNav).toHaveBeenCalledWith('projects', 'p2', 'documents')
  })

  it.each([
    [404, 'Der Anhang liegt nicht mehr im Postfach.'],
    [400, 'Dieser Dateityp wird nicht abgelegt.'],
  ])('zeigt bei %i den Satz des Servers und lässt den Vorschlag offen', async (status, satz) => {
    const user = userEvent.setup()
    acceptMailVorschlag.mockRejectedValue(new ApiError(status, satz))
    listMailEingang.mockResolvedValue(liste([item({
      suggestions: [{ ...DOKUMENT, payload: { ...DOKUMENT.payload, project_id: 'p1' } } as EingangVorschlag],
    })]))
    render(<MailEingangScreen />)
    const karte = await oeffne(user)
    await user.click(within(karte).getByRole('button', { name: 'Übernehmen' }))
    expect(await screen.findByText(`Übernehmen fehlgeschlagen: ${satz}`)).toBeInTheDocument()
    expect(within(karte).getByRole('button', { name: 'Übernehmen' })).toBeEnabled()
  })
})

describe('MailEingangScreen — «Kontakt ergänzen» über das Kundenformular', () => {
  const mitKontakt = () => listMailEingang.mockResolvedValue(liste([item({ suggestions: [KONTAKT] })]))
  const emailFeld = (dialog: HTMLElement) => dialog.querySelector('input[type="email"]') as HTMLInputElement
  // Der Speichern-Knopf der Maske — die Kommentare darunter haben einen eigenen.
  const speichern = (dialog: HTMLElement) => dialog.querySelector('button[type="submit"]') as HTMLButtonElement

  it('öffnet die Kundenmaske vorbefüllt und bestätigt den Vorschlag erst nach dem Speichern', async () => {
    const user = userEvent.setup()
    const onChanged = vi.fn()
    mitKontakt()
    acceptMailVorschlag.mockResolvedValue({
      suggestion: {
        ...KONTAKT, status: 'uebernommen', created: { type: 'customer', id: 'c1' },
        decided_by_name: 'Petra Büro', decided_at: '2026-11-12T13:05:00Z',
      },
      item_status: 'erledigt',
    })
    render(<MailEingangScreen onChanged={onChanged} />)
    const karte = await oeffne(user)

    // Es gibt keinen Knopf, der den Kontakt direkt schreibt.
    expect(within(karte).queryByRole('button', { name: 'Übernehmen' })).toBeNull()
    await user.click(within(karte).getByRole('button', { name: 'Im Kundenformular öffnen' }))
    expect(getCustomer).toHaveBeenCalledWith('c1')

    const dialog = await screen.findByRole('dialog', { name: 'Kunde bearbeiten' })
    expect(emailFeld(dialog).value).toBe('hans@muster.ch')
    expect(within(dialog).getByTestId('customer-ergaenzung')).toHaveTextContent(/noch nicht gespeichert/)
    // Bis hierher ist nichts geschrieben und nichts bestätigt.
    expect(saveCustomer).not.toHaveBeenCalled()
    expect(acceptMailVorschlag).not.toHaveBeenCalled()

    await user.click(speichern(dialog))
    await waitFor(() => expect(saveCustomer).toHaveBeenCalledTimes(1))
    expect(saveCustomer.mock.calls[0][0]).toMatchObject({ email: 'hans@muster.ch', phone: '079 111 22 33' })
    expect(saveCustomer.mock.calls[0][1]).toBe('c1')

    // Erst jetzt, und ohne payload: der Server prüft nur noch das Feld beim Kunden.
    await waitFor(() => expect(acceptMailVorschlag).toHaveBeenCalledWith('m1', 's-kontakt', undefined))
    expect(saveCustomer.mock.invocationCallOrder[0]).toBeLessThan(acceptMailVorschlag.mock.invocationCallOrder[0])
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
    expect(await within(karte).findByText('Übernommen von Petra Büro am 12.11.26, 14:05')).toBeInTheDocument()
    expect(within(karte).getByText('Im Kundenstamm bei Hans Muster gespeichert (E-Mail).')).toBeInTheDocument()
    expect(onChanged).toHaveBeenCalled()
  })

  it('lässt ein schon ausgefülltes Feld stehen und nennt den Vorschlag', async () => {
    const user = userEvent.setup()
    mitKontakt()
    getCustomer.mockResolvedValue({ ...KUNDE, email: 'alt@muster.ch' })
    render(<MailEingangScreen />)
    const karte = await oeffne(user)
    await user.click(within(karte).getByRole('button', { name: 'Im Kundenformular öffnen' }))
    const dialog = await screen.findByRole('dialog', { name: 'Kunde bearbeiten' })
    expect(emailFeld(dialog).value).toBe('alt@muster.ch')
    expect(within(dialog).getByTestId('customer-ergaenzung')).toHaveTextContent(
      'Vorschlag aus dem Mail-Eingang für «E-Mail»: «hans@muster.ch». Im Feld steht bereits «alt@muster.ch»',
    )
  })

  it('tut beim Abbrechen nichts — der Vorschlag bleibt offen', async () => {
    const user = userEvent.setup()
    mitKontakt()
    render(<MailEingangScreen />)
    const karte = await oeffne(user)
    await user.click(within(karte).getByRole('button', { name: 'Im Kundenformular öffnen' }))
    const dialog = await screen.findByRole('dialog', { name: 'Kunde bearbeiten' })
    await user.click(within(dialog).getByRole('button', { name: 'Abbrechen' }))

    expect(screen.queryByRole('dialog')).toBeNull()
    expect(saveCustomer).not.toHaveBeenCalled()
    expect(acceptMailVorschlag).not.toHaveBeenCalled()
    expect(within(karte).getByRole('button', { name: 'Im Kundenformular öffnen' })).toBeEnabled()
  })

  it('zeigt den Satz des Servers, wenn der Kontakt beim Kunden noch fehlt', async () => {
    const user = userEvent.setup()
    mitKontakt()
    acceptMailVorschlag.mockRejectedValue(new ApiError(409, 'Der Kontakt ist beim Kunden noch nicht gespeichert.'))
    render(<MailEingangScreen />)
    const karte = await oeffne(user)
    await user.click(within(karte).getByRole('button', { name: 'Im Kundenformular öffnen' }))
    const dialog = await screen.findByRole('dialog', { name: 'Kunde bearbeiten' })
    // Jemand leert das vorbefüllte Feld und speichert trotzdem.
    await user.clear(emailFeld(dialog))
    await user.click(speichern(dialog))

    expect(await screen.findByText(/Der Kontakt ist beim Kunden noch nicht gespeichert\./)).toBeInTheDocument()
    expect(await within(karte).findByRole('button', { name: 'Im Kundenformular öffnen' })).toBeEnabled()
  })

  it('meldet, wenn sich der Kunde nicht öffnen lässt', async () => {
    const user = userEvent.setup()
    mitKontakt()
    getCustomer.mockRejectedValue(new ApiError(404, 'not_found'))
    render(<MailEingangScreen />)
    const karte = await oeffne(user)
    await user.click(within(karte).getByRole('button', { name: 'Im Kundenformular öffnen' }))
    expect(await within(karte).findByText('Der Kunde liess sich nicht öffnen.')).toBeInTheDocument()
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(acceptMailVorschlag).not.toHaveBeenCalled()
  })

  it('lässt den Vorschlag weiterhin ohne Formular verwerfen', async () => {
    const user = userEvent.setup()
    mitKontakt()
    rejectMailVorschlag.mockResolvedValue({ suggestion: { ...KONTAKT, status: 'verworfen' }, item_status: 'erledigt' })
    render(<MailEingangScreen />)
    const karte = await oeffne(user)
    await user.click(within(karte).getByRole('button', { name: 'Verwerfen' }))
    expect(rejectMailVorschlag).toHaveBeenCalledWith('m1', 's-kontakt')
    expect(getCustomer).not.toHaveBeenCalled()
  })
})
