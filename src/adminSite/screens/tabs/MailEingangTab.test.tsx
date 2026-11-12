import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { MailEingangTab } from './MailEingangTab'

// docs/specs/mail-eingang-triage.md §6.4, §10 — Reiter «Mail-Eingang» der Betreiber-Seite.

const getMailEingang = vi.fn()
const setMailEingang = vi.fn()

vi.mock('../../tenantScopedApi', () => ({
  getMailEingang: (...a: unknown[]) => getMailEingang(...a),
  setMailEingang: (...a: unknown[]) => setMailEingang(...a),
}))

const leer = {
  mailbox: '', domains: [], funktionsadressen: [], tageslimit: 50,
  last_poll_at: null, last_poll_fehler: null, graph_bereit: true, modul_aktiv: false, abgewiesen: [],
}

const eingerichtet = {
  ...leer,
  mailbox: 'triage@gehlhaar.ch', domains: ['gehlhaar.ch'], funktionsadressen: ['info@gehlhaar.ch'],
  last_poll_at: '2026-11-12T13:05:00Z', modul_aktiv: true,
  abgewiesen: [{ grund: 'fremde_domain', anzahl: 3 }, { grund: 'tageslimit', anzahl: 0 }],
}

beforeEach(() => {
  getMailEingang.mockReset().mockResolvedValue(leer)
  setMailEingang.mockReset().mockResolvedValue(eingerichtet)
})

describe('MailEingangTab', () => {
  it('warnt deutlich, dass eine leere Domain-Liste nichts auswertet', async () => {
    render(<MailEingangTab tenantId="t-1" />)
    expect(await screen.findByText('Leere Liste = nichts wird ausgewertet.')).toBeInTheDocument()
    expect(getMailEingang).toHaveBeenCalledWith('t-1')
    expect(screen.getByText('Modul aus — kein Abruf')).toBeInTheDocument()
    expect(screen.getByText(/Letzte Abholung/)).toHaveTextContent('noch nie')
    expect(screen.getByText(/Kein Triage-Postfach eingetragen/)).toBeInTheDocument()
  })

  it('zeigt Stand, letzte Abholung und die Zähler eines eingerichteten Mandanten', async () => {
    getMailEingang.mockResolvedValue({ ...eingerichtet, last_poll_fehler: 'Postfach nicht erreichbar (403)' })
    render(<MailEingangTab tenantId="t-1" />)
    expect(await screen.findByText('Modul eingeschaltet — Abruf läuft')).toBeInTheDocument()
    expect(screen.getByText('Postfach-Zugang eingerichtet')).toBeInTheDocument()
    expect(screen.getByText(/Letzte Abholung/)).toHaveTextContent('12.11.2026, 14:05')
    expect(screen.getByText(/Letzter Fehler beim Abholen/)).toHaveTextContent('Postfach nicht erreichbar (403)')
    expect(screen.getByText('3 × nicht aus den Domains des Betriebs')).toBeInTheDocument()
    // Ein Zähler auf 0 steht nicht da.
    expect(screen.queryByText(/Tagesgrenze erreicht/)).toBeNull()
    expect(screen.queryByText('Leere Liste = nichts wird ausgewertet.')).toBeNull()
    expect(screen.getByLabelText('Triage-Postfach')).toHaveValue('triage@gehlhaar.ch')
  })

  it('sagt, wenn der Postfach-Zugang in der Umgebung fehlt', async () => {
    getMailEingang.mockResolvedValue({ ...eingerichtet, graph_bereit: false })
    render(<MailEingangTab tenantId="t-1" />)
    expect(await screen.findByText('Postfach-Zugang fehlt')).toBeInTheDocument()
    expect(screen.getByText(/Postfach-Zugang ist in dieser Umgebung nicht eingerichtet/)).toBeInTheDocument()
  })

  it('speichert normalisiert — getrimmt, klein, ohne Duplikate', async () => {
    render(<MailEingangTab tenantId="t-1" />)
    const speichern = await screen.findByRole('button', { name: 'Speichern' })
    expect(speichern).toBeDisabled()

    fireEvent.change(screen.getByLabelText('Triage-Postfach'), { target: { value: ' Triage@Gehlhaar.ch ' } })
    fireEvent.change(screen.getByLabelText('Mail-Domains des Betriebs'), { target: { value: '@Gehlhaar.CH\ngehlhaar.ch' } })
    fireEvent.change(screen.getByLabelText('Funktionsadressen'), { target: { value: 'Info@gehlhaar.ch, info@gehlhaar.ch' } })
    fireEvent.change(screen.getByLabelText('Tageslimit'), { target: { value: '80' } })
    fireEvent.click(speichern)

    await waitFor(() => expect(setMailEingang).toHaveBeenCalledWith('t-1', {
      anbieter: 'graph', mailbox: 'triage@gehlhaar.ch', domains: ['gehlhaar.ch'], funktionsadressen: ['info@gehlhaar.ch'], tageslimit: 80,
    }))
    // Danach steht in der Maske, was der Server zurückgibt.
    await waitFor(() => expect(screen.getByLabelText('Mail-Domains des Betriebs')).toHaveValue('gehlhaar.ch'))
    expect(screen.getByRole('button', { name: 'Speichern' })).toBeDisabled()
  })

  it('stellt auf Google Workspace um und speichert das Mailsystem mit', async () => {
    render(<MailEingangTab tenantId="t-1" />)
    const auswahl = await screen.findByLabelText('Mailsystem')
    expect(auswahl).toHaveValue('graph')
    fireEvent.change(auswahl, { target: { value: 'gmail' } })
    expect(screen.getByText(/gmail\.readonly/)).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Speichern' }))
    await waitFor(() => expect(setMailEingang).toHaveBeenCalledWith('t-1', expect.objectContaining({ anbieter: 'gmail' })))
  })

  it('zeigt das Mailsystem und dessen Zugang im Stand', async () => {
    getMailEingang.mockResolvedValue({ ...eingerichtet, anbieter: 'gmail', postfach_bereit: false, graph_bereit: true })
    render(<MailEingangTab tenantId="t-1" />)
    expect(await screen.findByText('Postfach-Zugang fehlt')).toBeInTheDocument()
    expect(screen.getAllByText('Google Workspace').length).toBeGreaterThan(0)
  })

  it('schickt offensichtlich Falsches gar nicht erst ab', async () => {
    render(<MailEingangTab tenantId="t-1" />)
    fireEvent.change(await screen.findByLabelText('Mail-Domains des Betriebs'), { target: { value: 'info@gehlhaar.ch' } })
    expect(screen.getByText(/ist eine Adresse, keine Domain/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Speichern' })).toBeDisabled()
    expect(setMailEingang).not.toHaveBeenCalled()
  })

  it('lässt den Grund einer Ablehnung des Servers stehen', async () => {
    setMailEingang.mockRejectedValue(new Error('Die Domain gehlhaar.ch gehört bereits zu einem anderen Mandanten.'))
    render(<MailEingangTab tenantId="t-1" />)
    fireEvent.change(await screen.findByLabelText('Mail-Domains des Betriebs'), { target: { value: 'gehlhaar.ch' } })
    fireEvent.click(screen.getByRole('button', { name: 'Speichern' }))
    expect(await screen.findByText('Die Domain gehlhaar.ch gehört bereits zu einem anderen Mandanten.')).toBeInTheDocument()
    // Die Eingabe bleibt, damit man sie korrigieren kann.
    expect(screen.getByLabelText('Mail-Domains des Betriebs')).toHaveValue('gehlhaar.ch')
  })

  it('«Verwerfen» stellt den gespeicherten Stand wieder her', async () => {
    getMailEingang.mockResolvedValue(eingerichtet)
    render(<MailEingangTab tenantId="t-1" />)
    const domains = await screen.findByLabelText('Mail-Domains des Betriebs')
    fireEvent.change(domains, { target: { value: '' } })
    expect(screen.getByText('Leere Liste = nichts wird ausgewertet.')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Verwerfen' }))
    expect(domains).toHaveValue('gehlhaar.ch')
  })

  it('meldet, wenn die Einstellungen nicht geladen werden können', async () => {
    getMailEingang.mockRejectedValue(new Error('Serverfehler (HTTP 500)'))
    render(<MailEingangTab tenantId="t-1" />)
    expect(await screen.findByRole('alert')).toHaveTextContent('Serverfehler (HTTP 500)')
  })
})
