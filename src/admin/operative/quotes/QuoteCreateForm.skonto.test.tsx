import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QuoteCreateForm } from './QuoteCreateForm'
import { apiFetch } from '../../../api/client'

// Skonto-Satz und -Frist sind pro Firma praktisch immer gleich. Die Vorgabe aus den
// Offert-Vorlagen belegt die beiden Felder vor, statt sie jedes Mal eintippen zu lassen.
vi.mock('../../../api/client', () => ({
  apiFetch: vi.fn(),
  apiFormFetch: vi.fn(async () => ({})),
  apiUrl: (p: string) => p,
  ApiError: class ApiError extends Error {},
}))
vi.mock('../../../api/auth', () => ({ getMe: vi.fn(async () => ({ feature_flags: {} })) }))
vi.mock('../../../api/modules', () => ({ isFeatureEnabled: () => false }))

const mockFetch = vi.mocked(apiFetch)

/** Antworten nach Endpunkt; alles Unbekannte ist eine leere Liste. */
function routeApi(skonto: { pct: number | null; days: number | null }) {
  mockFetch.mockImplementation(async (path: string) => {
    if (path === '/pwa/admin/quote-skonto-defaults') return skonto
    if (path === '/pwa/admin/quote-standard-notes') return { notes: '' }
    return []
  })
}

/** Die beiden Felder des Skonto-Fieldsets (Satz, Frist) — Labels sind dort nicht
 *  per htmlFor verknüpft, darum über die Legende eingegrenzt. */
function skontoFelder() {
  const fieldset = screen.getByText('Skonto', { selector: 'legend' }).closest('fieldset') as HTMLElement
  const [pct, days] = within(fieldset).getAllByRole('textbox') as HTMLInputElement[]
  return { pct, days }
}

describe('QuoteCreateForm — Skonto-Vorgabe', () => {
  beforeEach(() => {
    localStorage.clear()
    mockFetch.mockReset()
  })

  it('belegt Satz und Frist mit der Vorgabe des Mandanten vor', async () => {
    routeApi({ pct: 2, days: 10 })
    render(<QuoteCreateForm onDone={() => {}} onCancel={() => {}} />)

    await waitFor(() => expect(skontoFelder().pct.value).toBe('2'))
    expect(skontoFelder().days.value).toBe('10')
  })

  it('lässt die Felder leer, wenn keine Vorgabe gepflegt ist', async () => {
    routeApi({ pct: null, days: null })
    render(<QuoteCreateForm onDone={() => {}} onCancel={() => {}} />)

    await waitFor(() => expect(mockFetch).toHaveBeenCalledWith('/pwa/admin/quote-skonto-defaults'))
    expect(skontoFelder().pct.value).toBe('')
    expect(skontoFelder().days.value).toBe('')
  })

  it('speichert das frisch geöffnete Formular nicht als Entwurf', async () => {
    // Sonst böte das Projekt sofort «Entwurf fortsetzen» an, obwohl niemand
    // etwas eingegeben hat — die Vorgabe allein ist kein Inhalt.
    routeApi({ pct: 2, days: 10 })
    render(<QuoteCreateForm onDone={() => {}} onCancel={() => {}} lockedProjectName="Projekt A" lockedProjectId="p-1" />)

    await waitFor(() => expect(skontoFelder().pct.value).toBe('2'))
    expect(localStorage.getItem('quote-draft:Projekt A')).toBeNull()
  })

  it('überschreibt einen wiederhergestellten Entwurf nicht', async () => {
    // Der Entwurf gewinnt: wer das Skonto bewusst geleert hat, will es leer.
    localStorage.setItem('quote-draft:Projekt A', JSON.stringify({
      savedAt: 1, data: { projectName: 'Projekt A', laborRows: [], materialRows: [], extraProducts: [], extraCharges: [], installationRows: [], specialRows: [], laborDiscount: '', materialDiscount: '', fixedPrice: '', skontoPct: '', skontoDays: '', notes: 'Eigener Text', productDescription: 'Etwas', useStandardNotes: false },
    }))
    routeApi({ pct: 2, days: 10 })
    render(
      <QuoteCreateForm
        onDone={() => {}}
        onCancel={() => {}}
        lockedProjectName="Projekt A"
        lockedProjectId="p-1"
      />,
    )

    await waitFor(() => expect(mockFetch).toHaveBeenCalledWith('/pwa/admin/quote-skonto-defaults'))
    await waitFor(() => expect(screen.getByDisplayValue('Etwas')).toBeInTheDocument())
    expect(skontoFelder().pct.value).toBe('')
    expect(skontoFelder().days.value).toBe('')
  })
})

// Das Häkchen macht die Absicht explizit. Vorher hiess "Feld leer" stillschweigend
// "kein Skonto" — eine vergessene Eingabe ging unbemerkt zum Kunden. Es startet
// immer abgewählt, auch bei gepflegter Mandanten-Vorgabe.
describe('QuoteCreateForm — Skonto-Häkchen', () => {
  beforeEach(() => {
    localStorage.clear()
    mockFetch.mockReset()
  })

  function skontoHaken() {
    const fieldset = screen.getByText('Skonto', { selector: 'legend' }).closest('fieldset') as HTMLElement
    return within(fieldset).getByRole('checkbox') as HTMLInputElement
  }

  it('lässt das Häkchen auch mit gepflegter Vorgabe aus', async () => {
    // Skonto ist eine Entscheidung pro Offerte: die Vorgabe füllt nur die Felder,
    // angehakt wird von Hand. Vorher stand es angehakt da und ging mit, wenn
    // niemand hinsah.
    routeApi({ pct: 2, days: 10 })
    render(<QuoteCreateForm onDone={() => {}} onCancel={() => {}} />)

    await waitFor(() => expect(skontoFelder().pct.value).toBe('2'))
    expect(skontoHaken()).not.toBeChecked()
    expect(skontoFelder().pct).toBeDisabled()
  })

  it('gibt die vorbelegten Felder frei, sobald von Hand angehakt wird', async () => {
    routeApi({ pct: 2, days: 10 })
    const user = userEvent.setup()
    render(<QuoteCreateForm onDone={() => {}} onCancel={() => {}} />)

    await waitFor(() => expect(skontoFelder().pct.value).toBe('2'))
    await user.click(skontoHaken())

    expect(skontoHaken()).toBeChecked()
    expect(skontoFelder().pct).toBeEnabled()
    expect(skontoFelder().pct.value).toBe('2')
    expect(skontoFelder().days.value).toBe('10')
  })

  it('lässt das Häkchen ohne Vorgabe aus und sperrt die Felder', async () => {
    routeApi({ pct: null, days: null })
    render(<QuoteCreateForm onDone={() => {}} onCancel={() => {}} />)

    await waitFor(() => expect(mockFetch).toHaveBeenCalledWith('/pwa/admin/quote-skonto-defaults'))
    expect(skontoHaken()).not.toBeChecked()
    expect(skontoFelder().pct).toBeDisabled()
    expect(skontoFelder().days).toBeDisabled()
  })

  it('meldet einen Fehler und speichert nicht, wenn das Häkchen gesetzt und das Feld leer ist', async () => {
    // Der Anwender hakt an, leert den Satz und will speichern.
    routeApi({ pct: 2, days: 10 })
    const user = userEvent.setup()
    render(<QuoteCreateForm onDone={() => {}} onCancel={() => {}} lockedProjectName="Projekt A" lockedProjectId="p-1" />)

    await waitFor(() => expect(skontoFelder().pct.value).toBe('2'))
    await user.click(skontoHaken())
    await user.clear(skontoFelder().pct)

    // Eine Position, damit nicht schon «Mindestens eine Position erforderlich» greift.
    await user.click(screen.getByRole('button', { name: '+ Freie Position' }))
    await user.type(screen.getByPlaceholderText('Beschreibung'), 'Montage')

    mockFetch.mockClear()
    await user.click(screen.getByRole('button', { name: /Offerte erstellen/i }))

    expect(await screen.findByRole('alert')).toHaveTextContent(/Prozentsatz/i)
    expect(mockFetch).not.toHaveBeenCalledWith('/pwa/admin/quotes', expect.anything())
  })
})
