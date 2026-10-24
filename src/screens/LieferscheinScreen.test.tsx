/**
 * «Lieferschein» in der Mitarbeiter-App — docs/specs/lieferschein-erfassung.md §4.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor, fireEvent } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ApiError } from '../api/client'
import type { LieferscheinProjekt } from '../api/lieferscheine'

const uploadLieferschein = vi.fn()
const assignLieferschein = vi.fn()
const listMeineLieferscheine = vi.fn()
const searchLieferscheinProjekte = vi.fn()
vi.mock('../api/lieferscheine', () => ({
  uploadLieferschein: (...a: unknown[]) => uploadLieferschein(...a),
  assignLieferschein: (...a: unknown[]) => assignLieferschein(...a),
  listMeineLieferscheine: () => listMeineLieferscheine(),
  searchLieferscheinProjekte: (q: string) => searchLieferscheinProjekte(q),
}))

const enqueueLieferschein = vi.fn()
const pendingLieferscheine = vi.fn()
const sendeWartendeLieferscheine = vi.fn()
vi.mock('../api/lieferscheinQueue', () => ({
  enqueueLieferschein: (...a: unknown[]) => enqueueLieferschein(...a),
  pendingLieferscheine: (u: string) => pendingLieferscheine(u),
  sendeWartendeLieferscheine: (u: string) => sendeWartendeLieferscheine(u),
}))

import LieferscheinScreen from './LieferscheinScreen'
import HomeScreen from './HomeScreen'

const P1: LieferscheinProjekt = { project_id: 'p1', number: '2600515', name: 'Bad Muster', customer: 'Muster', locality: 'Chur' }
const P2: LieferscheinProjekt = { project_id: 'p2', number: '2600600', name: 'Dach Huber', customer: 'Huber', locality: 'Thusis' }

beforeEach(() => {
  uploadLieferschein.mockReset().mockResolvedValue({
    inbox_id: 'e1', entry: {}, candidates: [P1], recent: [P2],
  })
  assignLieferschein.mockReset().mockResolvedValue({ status: 'ok', project: P1 })
  listMeineLieferscheine.mockReset().mockResolvedValue([])
  searchLieferscheinProjekte.mockReset().mockResolvedValue([])
  enqueueLieferschein.mockReset().mockResolvedValue('queued')
  pendingLieferscheine.mockReset().mockResolvedValue([])
  sendeWartendeLieferscheine.mockReset().mockResolvedValue({ sent: 0, dropped: 0, remaining: 0 })
  setOnline(true)
  globalThis.URL.createObjectURL = vi.fn(() => 'blob:vorschau')
  globalThis.URL.revokeObjectURL = vi.fn()
})

function setOnline(value: boolean) {
  Object.defineProperty(navigator, 'onLine', { configurable: true, get: () => value })
}

function waehleFoto() {
  const input = screen.getByTestId('ls-input') as HTMLInputElement
  const file = new File(['x'], 'ls.jpg', { type: 'image/jpeg' })
  fireEvent.change(input, { target: { files: [file] } })
  return file
}

describe('LieferscheinScreen', () => {
  it('öffnet die Kamera direkt', () => {
    render(<LieferscheinScreen userId="u1" onBack={vi.fn()} onLoggedOut={vi.fn()} />)
    expect(screen.getByTestId('ls-input').getAttribute('capture')).toBe('environment')
  })

  it('Foto → Senden → Vorschlag antippen legt ihn am Projekt ab', async () => {
    const user = userEvent.setup()
    render(<LieferscheinScreen userId="u1" onBack={vi.fn()} onLoggedOut={vi.fn()} />)
    const file = waehleFoto()
    expect(screen.getByAltText('Vorschau des Lieferscheins')).toBeTruthy()
    await user.click(screen.getByRole('button', { name: 'Senden' }))
    expect(uploadLieferschein).toHaveBeenCalledWith(file, 'ls.jpg')

    // Vorschlag zuoberst und markiert, darunter die eigenen Projekte.
    expect(await screen.findByText('auf dem Lieferschein gefunden')).toBeTruthy()
    expect(screen.getByRole('button', { name: /2600600 Dach Huber/ })).toBeTruthy()
    // Nichts wird ohne Tippen zugeordnet.
    expect(assignLieferschein).not.toHaveBeenCalled()

    await user.click(screen.getByRole('button', { name: /2600515 Bad Muster/ }))
    expect(assignLieferschein).toHaveBeenCalledWith('e1', 'p1')
    expect(await screen.findByRole('status')).toHaveTextContent('Liegt jetzt bei 2600515 Bad Muster')
  })

  it('«Weiss nicht» lässt ihn im Eingang des Büros', async () => {
    const user = userEvent.setup()
    render(<LieferscheinScreen userId="u1" onBack={vi.fn()} onLoggedOut={vi.fn()} />)
    waehleFoto()
    await user.click(screen.getByRole('button', { name: 'Senden' }))
    await user.click(await screen.findByRole('button', { name: /ans Büro/ }))
    expect(assignLieferschein).not.toHaveBeenCalled()
    expect(screen.getByRole('status')).toHaveTextContent('das Büro ordnet ihn zu')
  })

  it('sagt es, wenn das Senden scheitert', async () => {
    uploadLieferschein.mockRejectedValue(new ApiError(500, 'kaputt'))
    const user = userEvent.setup()
    render(<LieferscheinScreen userId="u1" onBack={vi.fn()} onLoggedOut={vi.fn()} />)
    waehleFoto()
    await user.click(screen.getByRole('button', { name: 'Senden' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('nicht gesendet')
    expect(screen.getByRole('button', { name: 'Senden' })).toBeTruthy()   // Foto bleibt, nochmal senden geht
  })

  it('sagt bei der Upload-Bremse, dass es später wieder geht — das Foto bleibt', async () => {
    uploadLieferschein.mockRejectedValue(new ApiError(429, 'rate_limited'))
    const user = userEvent.setup()
    render(<LieferscheinScreen userId="u1" onBack={vi.fn()} onLoggedOut={vi.fn()} />)
    waehleFoto()
    await user.click(screen.getByRole('button', { name: 'Senden' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('in ein paar Minuten')
    expect(screen.getByRole('button', { name: 'Senden' })).toBeTruthy()
  })

  it('offene eigene Lieferscheine lassen sich später zuordnen', async () => {
    listMeineLieferscheine.mockResolvedValue([{
      id: 'e9', status: 'offen', created_at: '2026-10-24T07:00:00Z', filename: 'a.jpg', mime_type: 'image/jpeg',
      uploaded_by_name: 'Ich', candidates: [P1], assigned_project: null, assigned_at: null, assigned_by_name: null,
    }])
    const user = userEvent.setup()
    render(<LieferscheinScreen userId="u1" onBack={vi.fn()} onLoggedOut={vi.fn()} />)
    await user.click(await screen.findByRole('button', { name: /Noch ohne Projekt/ }))
    await user.click(screen.getByRole('button', { name: /2600515 Bad Muster/ }))
    await waitFor(() => expect(assignLieferschein).toHaveBeenCalledWith('e9', 'p1'))
  })
})

describe('LieferscheinScreen offline (§3.4)', () => {
  it('puffert ohne Netz statt zu senden', async () => {
    setOnline(false)
    const user = userEvent.setup()
    render(<LieferscheinScreen userId="u1" onBack={vi.fn()} onLoggedOut={vi.fn()} />)
    expect(screen.getByText(/Kein Netz/)).toBeTruthy()
    const file = waehleFoto()
    await user.click(screen.getByRole('button', { name: 'Senden' }))
    expect(enqueueLieferschein).toHaveBeenCalledWith('u1', file)
    expect(uploadLieferschein).not.toHaveBeenCalled()
    expect(await screen.findByText('Lieferschein gespeichert, wird gesendet, sobald du online bist.')).toBeTruthy()
    expect(sendeWartendeLieferscheine).not.toHaveBeenCalled()
  })

  it('puffert auch, wenn das Netz beim Senden wegbricht', async () => {
    uploadLieferschein.mockRejectedValue(new ApiError(0, 'Keine Internetverbindung'))
    const user = userEvent.setup()
    render(<LieferscheinScreen userId="u1" onBack={vi.fn()} onLoggedOut={vi.fn()} />)
    const file = waehleFoto()
    await user.click(screen.getByRole('button', { name: 'Senden' }))
    expect(enqueueLieferschein).toHaveBeenCalledWith('u1', file)
    expect(await screen.findByText(/sobald du online bist/)).toBeTruthy()
    expect(screen.queryByRole('alert')).toBeNull()
  })

  it('sagt es, wenn der Puffer voll ist', async () => {
    setOnline(false)
    enqueueLieferschein.mockResolvedValue('full')
    const user = userEvent.setup()
    render(<LieferscheinScreen userId="u1" onBack={vi.fn()} onLoggedOut={vi.fn()} />)
    waehleFoto()
    await user.click(screen.getByRole('button', { name: 'Senden' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('zu viele Lieferscheine')
  })

  it('zeigt Wartende und sendet sie, sobald Netz da ist', async () => {
    setOnline(false)
    pendingLieferscheine.mockResolvedValue([{ id: 1 }, { id: 2 }])
    render(<LieferscheinScreen userId="u1" onBack={vi.fn()} onLoggedOut={vi.fn()} />)
    expect(await screen.findByText('2 Lieferscheine warten auf Netz.')).toBeTruthy()

    sendeWartendeLieferscheine.mockResolvedValue({ sent: 2, dropped: 0, remaining: 0 })
    setOnline(true)
    window.dispatchEvent(new Event('online'))
    await waitFor(() => expect(sendeWartendeLieferscheine).toHaveBeenCalledWith('u1'))
    await waitFor(() => expect(screen.queryByText(/warten auf Netz/)).toBeNull())
    // Gesendet heisst: «Meine Lieferscheine» neu laden.
    await waitFor(() => expect(listMeineLieferscheine).toHaveBeenCalledTimes(2))
  })
})

describe('Kachel «Lieferschein»', () => {
  const base = {
    displayName: 'Lea Lager', role: 'user', enabledModules: ['timekeeping'],
    onNavRapport: vi.fn(), onNavArbeitszeit: vi.fn(), onNavProjekte: vi.fn(), onNavOfferten: vi.fn(),
    onNavProjektEntwurf: vi.fn(), onNavProfile: vi.fn(), onLoggedOut: vi.fn(),
  }

  it('fehlt ohne Modul (kein Handler)', () => {
    render(<HomeScreen {...base} />)
    expect(screen.queryByText('Lieferschein')).toBeNull()
  })

  it('führt in den Lieferschein-Screen — mit Wareneingang als erste Kachel', () => {
    const onNavLieferschein = vi.fn()
    const { container } = render(<HomeScreen {...base} onNavLieferschein={onNavLieferschein} lieferscheinZuerst />)
    const tiles = container.querySelectorAll('.tile')
    expect(tiles[0].textContent).toContain('Lieferschein')
    fireEvent.click(screen.getByText('Lieferschein'))
    expect(onNavLieferschein).toHaveBeenCalled()
  })
})
