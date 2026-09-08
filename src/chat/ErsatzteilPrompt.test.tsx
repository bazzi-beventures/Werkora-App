import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, waitFor } from '@testing-library/react'
import ErsatzteilPrompt from './ErsatzteilPrompt'
import * as catalog from '../api/materialCatalog'
import * as chatApi from './../api/chat'

// Der Ersatzteil-Schritt überspringt sich selbst, wenn es nichts zu wählen gibt.
// Das ist richtig — ausser der Monteur hat schon gewählt: dann wäre es ein
// stilles Löschen (docs/specs/offline-modus.md §4.5.3). Der Fall tritt offline
// auf einem Gerät auf, dessen Katalog-Spiegel noch leer ist.

beforeEach(() => {
  vi.spyOn(catalog, 'loadFrequentMaterials').mockResolvedValue({ items: [], offline: true, savedAt: '' })
  vi.spyOn(catalog, 'galleryCountOffline').mockResolvedValue(0)
  vi.spyOn(chatApi, 'fetchMaterialGalleryCount').mockResolvedValue(0)
})
afterEach(() => vi.restoreAllMocks())

describe('Leerer Katalog', () => {
  it('überspringt sich, wenn nichts gewählt ist', async () => {
    const onSubmit = vi.fn()
    render(<ErsatzteilPrompt userId="u-1" onSubmit={onSubmit} />)
    await waitFor(() => expect(onSubmit).toHaveBeenCalledWith([]))
  })

  it('überspringt sich NICHT, wenn schon Teile gewählt sind', async () => {
    const onSubmit = vi.fn()
    const gewaehlt = [{ art_nr: 'A-1', amount: 3, name: 'Motor', unit: 'Stk' }]
    const { findByText } = render(
      <ErsatzteilPrompt userId="u-1" initial={gewaehlt} onSubmit={onSubmit} />,
    )
    // Die Wahl bleibt sichtbar statt lautlos zu verschwinden.
    expect(await findByText(/Motor/)).toBeInTheDocument()
    expect(onSubmit).not.toHaveBeenCalled()
  })
})
