/**
 * Wunsch-Formular (docs/specs/feature-anfragen.md §5.2/§5.3).
 *
 * Die Regeln, um die es geht:
 * 1. Vor dem Absenden steht, was es schon gibt — und «Brauchen wir auch»
 *    ersetzt das Absenden (F5/F6).
 * 2. Ohne Netz wird gesperrt statt abgelehnt, der Text bleibt (Spec §5.8).
 * 3. Der Bereich wird aus dem Screen vorbelegt — aber nie still «Sonstiges».
 * 4. Screenshots gehen erst nach dem Einreichen hoch; ein verlorenes Bild
 *    nimmt den Wunsch nicht zurück, die Quittung sagt es.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'

const api = {
  searchSimilarFeatures: vi.fn(),
  submitWish: vi.fn(),
  supportFeatureWish: vi.fn(),
  uploadWishScreenshots: vi.fn(),
}

vi.mock('../api/featureRequests', async () => {
  const actual = await vi.importActual<typeof import('../api/featureRequests')>('../api/featureRequests')
  return {
    ...actual,
    searchSimilarFeatures: (q: string) => api.searchSimilarFeatures(q),
    submitWish: (b: unknown) => api.submitWish(b),
    supportFeatureWish: (id: string, b: unknown) => api.supportFeatureWish(id, b),
    uploadWishScreenshots: (id: string, f: File[]) => api.uploadWishScreenshots(id, f),
  }
})

import WishForm from './WishForm'

const CARD = {
  id: 'f-1', feature_no: 12, reference: 'WF-12', title: 'Offerten als Vorlage speichern',
  area: 'offerten', phase: 'geplant', phase_label: 'Geplant', phase_since: '2026-08-20',
  target_label: 'Q4 2026', request_count: 3, tenant_count: 2, own_count: 0, other_tenants: 2, mine: null,
}

function setOnline(value: boolean) {
  Object.defineProperty(window.navigator, 'onLine', { value, configurable: true })
}

beforeEach(() => {
  vi.clearAllMocks()
  setOnline(true)
  api.searchSimilarFeatures.mockResolvedValue({ features: [CARD] })
  api.submitWish.mockResolvedValue({ id: 'r-9', request_no: 2001, reference: 'WW-2001', created_at: '' })
  api.supportFeatureWish.mockResolvedValue({ ok: true, already: false })
  api.uploadWishScreenshots.mockResolvedValue({ attachment_count: 1 })
})

function fillAndPick(files: File[]) {
  fireEvent.change(screen.getByLabelText(/in einem Satz/), { target: { value: 'Nächster Termin' } })
  fireEvent.change(screen.getByLabelText(/Wie soll es funktionieren/), { target: { value: 'Auf der ersten Maske' } })
  fireEvent.change(screen.getByLabelText('Screenshot wählen'), { target: { files } })
}

const png = (name = 'maske.png') => new File(['x'], name, { type: 'image/png' })

describe('WishForm', () => {
  it('zeigt ähnliche Features und unterstützt statt neu einzureichen', async () => {
    const onSubmitted = vi.fn()
    render(<WishForm route="offerten" appContext="pwa" onSubmitted={onSubmitted} />)
    fireEvent.change(screen.getByLabelText(/in einem Satz/), { target: { value: 'Offerte Vorlage' } })
    expect(await screen.findByText(/Offerten als Vorlage speichern/, {}, { timeout: 2000 })).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Brauchen wir auch' }))
    fireEvent.change(screen.getByPlaceholderText(/Wofür braucht ihr das/), { target: { value: 'Für Bäder' } })
    fireEvent.click(screen.getByRole('button', { name: 'Unterstützen' }))
    await waitFor(() => expect(api.supportFeatureWish).toHaveBeenCalledWith(
      'f-1', { text: 'Für Bäder', importance: 'wichtig', app_context: 'pwa' }))
    expect(await screen.findByText(/Unterstützt/)).toBeTruthy()
    expect(api.submitWish).not.toHaveBeenCalled()
    expect(onSubmitted).toHaveBeenCalled()
  })

  it('reicht ein und quittiert mit der Nummer; Bereich aus dem Screen vorbelegt', async () => {
    render(<WishForm route="offerten" appContext="admin" />)
    fireEvent.change(screen.getByLabelText(/in einem Satz/), { target: { value: 'Neu' } })
    fireEvent.change(screen.getByLabelText(/Wie soll es funktionieren/), { target: { value: 'So und so' } })
    fireEvent.click(screen.getByRole('button', { name: 'Wunsch senden' }))
    await waitFor(() => expect(api.submitWish).toHaveBeenCalledWith(expect.objectContaining({
      title: 'Neu', description: 'So und so', area: 'offerten', importance: 'wichtig',
      route: 'offerten', app_context: 'admin',
    })))
    expect(await screen.findByText('WW-2001')).toBeTruthy()
  })

  it('ohne Bild kein Upload-Request', async () => {
    render(<WishForm route="projekte" appContext="pwa" />)
    fireEvent.change(screen.getByLabelText(/in einem Satz/), { target: { value: 'Neu' } })
    fireEvent.change(screen.getByLabelText(/Wie soll es funktionieren/), { target: { value: 'So' } })
    fireEvent.click(screen.getByRole('button', { name: 'Wunsch senden' }))
    expect(await screen.findByText('WW-2001')).toBeTruthy()
    expect(api.uploadWishScreenshots).not.toHaveBeenCalled()
  })

  it('lädt den Screenshot nach dem Einreichen an den neuen Wunsch hoch', async () => {
    render(<WishForm route="projekte" appContext="pwa" />)
    const file = png()
    fillAndPick([file])
    expect(screen.getByText('maske.png')).toBeTruthy()
    expect(screen.getByRole('button', { name: /Screenshot anhängen \(1\/3\)/ })).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Wunsch senden' }))
    await waitFor(() => expect(api.uploadWishScreenshots).toHaveBeenCalledWith('r-9', [file]))
    expect(await screen.findByText('WW-2001')).toBeTruthy()
    expect(screen.queryByText(/nicht gespeichert/)).toBeNull()
  })

  it('verlorenes Bild: Wunsch steht trotzdem, Quittung sagt es', async () => {
    api.uploadWishScreenshots.mockRejectedValue(new Error('net'))
    render(<WishForm route="projekte" appContext="pwa" />)
    fillAndPick([png()])
    fireEvent.click(screen.getByRole('button', { name: 'Wunsch senden' }))
    expect(await screen.findByText('WW-2001')).toBeTruthy()
    expect(screen.getByText(/Ein Bild konnte nicht gespeichert/)).toBeTruthy()
  })

  it('höchstens drei Bilder, zu grosse fallen raus', () => {
    render(<WishForm route="projekte" appContext="pwa" />)
    const big = new File(['x'], 'riesig.png', { type: 'image/png' })
    Object.defineProperty(big, 'size', { value: 11 * 1024 * 1024 })
    fillAndPick([big])
    expect(screen.getByRole('alert').textContent).toMatch(/zu gross/)
    fireEvent.change(screen.getByLabelText('Screenshot wählen'), {
      target: { files: [png('a.png'), png('b.png'), png('c.png'), png('d.png')] },
    })
    expect(screen.getByRole('alert').textContent).toMatch(/Maximal 3/)
    expect(screen.queryByText('d.png')).toBeNull()
    expect(screen.getByRole('button', { name: /Screenshot anhängen \(3\/3\)/ })).toHaveProperty('disabled', true)
  })

  it('unbekannter Screen belegt keinen Bereich vor — Senden bleibt gesperrt', () => {
    render(<WishForm route="home" appContext="pwa" />)
    fireEvent.change(screen.getByLabelText(/in einem Satz/), { target: { value: 'Etwas' } })
    fireEvent.change(screen.getByLabelText(/Wie soll es funktionieren/), { target: { value: 'So' } })
    expect(screen.getByRole('button', { name: 'Wunsch senden' })).toBeDisabled()
  })

  it('offline: gesperrt statt abgelehnt, der Text bleibt', () => {
    setOnline(false)
    render(<WishForm route="offerten" appContext="pwa" />)
    fireEvent.change(screen.getByLabelText(/in einem Satz/), { target: { value: 'Neu' } })
    fireEvent.change(screen.getByLabelText(/Wie soll es funktionieren/), { target: { value: 'So' } })
    expect(screen.getByRole('button', { name: 'Wunsch senden' })).toBeDisabled()
    expect(screen.getByText(/Ohne Netz/)).toBeTruthy()
    expect((screen.getByLabelText(/in einem Satz/) as HTMLInputElement).value).toBe('Neu')
  })
})
