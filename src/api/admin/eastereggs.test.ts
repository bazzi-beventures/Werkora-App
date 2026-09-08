import { beforeEach, describe, expect, it, vi } from 'vitest'
import { generateInvoice } from './invoices'
import { setProjectStatus } from './projects'
import { EASTEREGG_RECHECK_EVENT, getEasterEggs } from './eastereggs'
import { apiFetch } from '../client'

// Spec docs/specs/eastereggs.md §2.
//
// Der Anlass für diesen Test: die Eastereggs fragten nur beim Öffnen der
// Admin-App nach einem Meilenstein. Wer eine Rechnung erstellte, sah seinen
// Geldregen erst beim nächsten Neuladen. Das Ereignis hängt jetzt an der
// Aktion selbst — und dieser Test hält fest, dass es beim Umbauen der beiden
// Schreibpfade nicht wieder verloren geht.

vi.mock('../client', () => ({
  apiFetch: vi.fn(async () => ({})),
  apiBlobFetch: vi.fn(async () => new Blob()),
  apiFormFetch: vi.fn(async () => ({})),
  apiUrl: (p: string) => `https://api.example${p}`,
}))

const fetchMock = vi.mocked(apiFetch)

function zaehleEreignisse() {
  let n = 0
  const handler = () => { n++ }
  window.addEventListener(EASTEREGG_RECHECK_EVENT, handler)
  return {
    get anzahl() { return n },
    ab: () => window.removeEventListener(EASTEREGG_RECHECK_EVENT, handler),
  }
}

beforeEach(() => { fetchMock.mockClear(); fetchMock.mockResolvedValue({}) })

describe('Nachfrage-Ereignis der Eastereggs', () => {
  it('meldet sich nach einer erstellten Rechnung', async () => {
    const z = zaehleEreignisse()
    await generateInvoice({ project_id: 'p1', project_name: 'Test', remark: '', use_quote: false })
    z.ab()
    expect(z.anzahl).toBe(1)
  })

  it('meldet sich nach einem Status-Wechsel am Projekt', async () => {
    const z = zaehleEreignisse()
    await setProjectStatus('p1', 'abgeschlossen')
    z.ab()
    expect(z.anzahl).toBe(1)
  })

  it('meldet sich NICHT, wenn die Rechnung gar nicht entstanden ist', async () => {
    // Sonst liefe bei jedem fehlgeschlagenen Versuch eine Abfrage mit.
    fetchMock.mockRejectedValueOnce(new Error('409 quote_mismatch'))
    const z = zaehleEreignisse()
    await expect(
      generateInvoice({ project_id: 'p1', project_name: 'Test', remark: '', use_quote: false }),
    ).rejects.toThrow()
    z.ab()
    expect(z.anzahl).toBe(0)
  })

  it('liefert null statt zu werfen, wenn der Endpunkt nicht antwortet', async () => {
    // Ein Easteregg, das eine Fehlermeldung über die Admin-App legt, hat
    // seinen Zweck verfehlt (Spec §6).
    fetchMock.mockRejectedValueOnce(new Error('403 feature_disabled'))
    await expect(getEasterEggs()).resolves.toBeNull()
  })
})
