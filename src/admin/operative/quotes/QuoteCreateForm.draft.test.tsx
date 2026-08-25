import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QuoteCreateForm } from './QuoteCreateForm'
import { hasQuoteDraft } from './quoteDraft'
import { apiFetch } from '../../../api/client'

// Der Auto-Entwurf ist der einzige Prüfgegenstand: beim Öffnen wird ein
// vorhandener Entwurf ohne Rückfrage übernommen, die Entscheidung
// (behalten/verwerfen) fällt erst beim Verlassen.

vi.mock('../../../api/client', () => ({
  apiFetch: vi.fn(),
  apiFormFetch: vi.fn(),
  apiUrl: (p: string) => p,
  ApiError: class ApiError extends Error {},
}))

vi.mock('../../../api/auth', () => ({
  getMe: vi.fn(async () => ({ feature_flags: {} })),
}))

// Portale/getBoundingClientRect sind im jsdom nicht sinnvoll bedienbar — der
// Kontrakt (value ⇄ onChange) bleibt erhalten. Vgl. ReportCreateForm.test.
vi.mock('../MaterialCombobox', () => ({
  MaterialCombobox: ({ value, onChange }: { value: string; onChange: (a: string) => void }) => (
    <select aria-label="Material" value={value} onChange={e => onChange(e.target.value)}>
      <option value="">— Material wählen —</option>
      <option value="STG123">STG123</option>
    </select>
  ),
}))

const mockFetch = vi.mocked(apiFetch)

const PROJECT = 'MFH Sonnhalde'
const DRAFT_KEY = `quote-draft:${PROJECT}`
const DESC_PLACEHOLDER = 'Beschreibung der angebotenen Produkte…'

beforeEach(() => {
  localStorage.clear()
  mockFetch.mockReset()
  mockFetch.mockImplementation(async (path: string) => {
    if (path.startsWith('/pwa/admin/projects')) return [{ id: 'p1', name: PROJECT, is_closed: false }]
    if (path.startsWith('/pwa/admin/quote-standard-notes')) return { notes: 'Standardtext' }
    return []
  })
})

function renderForm(onCancel = vi.fn()) {
  render(
    <QuoteCreateForm
      lockedProjectName={PROJECT}
      lockedProjectId="p1"
      onDone={vi.fn()}
      onCancel={onCancel}
    />,
  )
  return onCancel
}

/** Entwurf in den localStorage legen, wie ihn die Autospeicherung schreibt. */
function seedDraft(productDescription: string, savedAt = Date.parse('2026-08-14T09:30:00Z')) {
  localStorage.setItem(DRAFT_KEY, JSON.stringify({
    savedAt,
    data: {
      projectName: PROJECT,
      laborRows: [{ description: '', quantity: '', unit_price: null, hidden: false }],
      materialRows: [{ art_nr: '', quantity: '' }],
      extraProducts: [], extraCharges: [], includeTravelCost: true,
      installationRows: [], specialRows: [],
      laborDiscount: '', materialDiscount: '', fixedPrice: '', skontoPct: '', skontoDays: '',
      notes: 'Standardtext', productDescription, useStandardNotes: true,
    },
  }))
}

describe('QuoteCreateForm — Auto-Entwurf', () => {
  it('übernimmt einen vorhandenen Entwurf beim Öffnen, ohne zu fragen', async () => {
    seedDraft('Fenster EG ersetzen')
    renderForm()

    const desc = await screen.findByPlaceholderText(DESC_PLACEHOLDER)
    expect(desc).toHaveValue('Fenster EG ersetzen')
    expect(screen.getByText(/Entwurf.*übernommen/)).toBeInTheDocument()
    // Die frühere Entscheidung beim Öffnen gibt es nicht mehr.
    expect(screen.queryByRole('button', { name: 'Wiederherstellen' })).not.toBeInTheDocument()
  })

  it('«Leer starten» räumt Formular und Entwurf weg', async () => {
    const user = userEvent.setup()
    seedDraft('Fenster EG ersetzen')
    renderForm()

    await screen.findByPlaceholderText(DESC_PLACEHOLDER)
    await user.click(screen.getByRole('button', { name: 'Leer starten' }))

    expect(screen.getByPlaceholderText(DESC_PLACEHOLDER)).toHaveValue('')
    await waitFor(() => expect(hasQuoteDraft(PROJECT)).toBe(false))
  })

  it('speichert Eingaben laufend als Entwurf', async () => {
    const user = userEvent.setup()
    renderForm()

    await user.type(await screen.findByPlaceholderText(DESC_PLACEHOLDER), 'Dach neu')

    await waitFor(() => expect(hasQuoteDraft(PROJECT)).toBe(true))
  })

  it('fragt beim Verlassen mit Inhalt und behält den Entwurf auf Wunsch', async () => {
    const user = userEvent.setup()
    const onCancel = renderForm()

    await user.type(await screen.findByPlaceholderText(DESC_PLACEHOLDER), 'Dach neu')
    await user.click(screen.getByRole('button', { name: 'Abbrechen' }))

    expect(screen.getByText('Offerte verlassen')).toBeInTheDocument()
    expect(onCancel).not.toHaveBeenCalled()

    await user.click(screen.getByRole('button', { name: 'Entwurf behalten' }))

    expect(onCancel).toHaveBeenCalledTimes(1)
    expect(hasQuoteDraft(PROJECT)).toBe(true)
  })

  it('wirft den Entwurf weg, wenn man sich beim Verlassen dagegen entscheidet', async () => {
    const user = userEvent.setup()
    const onCancel = renderForm()

    await user.type(await screen.findByPlaceholderText(DESC_PLACEHOLDER), 'Dach neu')
    await user.click(screen.getByRole('button', { name: 'Abbrechen' }))
    await user.click(screen.getByRole('button', { name: 'Entwurf verwerfen' }))

    expect(onCancel).toHaveBeenCalledTimes(1)
    expect(hasQuoteDraft(PROJECT)).toBe(false)
  })

  it('bleibt bei «Zurück zum Formular» offen und behält die Eingaben', async () => {
    const user = userEvent.setup()
    const onCancel = renderForm()

    await user.type(await screen.findByPlaceholderText(DESC_PLACEHOLDER), 'Dach neu')
    await user.click(screen.getByRole('button', { name: 'Abbrechen' }))
    await user.click(screen.getByRole('button', { name: 'Zurück zum Formular' }))

    expect(onCancel).not.toHaveBeenCalled()
    expect(screen.queryByText('Offerte verlassen')).not.toBeInTheDocument()
    expect(screen.getByPlaceholderText(DESC_PLACEHOLDER)).toHaveValue('Dach neu')
  })

  it('schliesst ein leeres Formular ohne Rückfrage und räumt den Slot', async () => {
    const user = userEvent.setup()
    seedDraft('Fenster EG ersetzen')
    const onCancel = renderForm()

    await screen.findByPlaceholderText(DESC_PLACEHOLDER)
    await user.click(screen.getByRole('button', { name: 'Leer starten' }))
    await user.click(screen.getByRole('button', { name: 'Abbrechen' }))

    expect(screen.queryByText('Offerte verlassen')).not.toBeInTheDocument()
    expect(onCancel).toHaveBeenCalledTimes(1)
    expect(hasQuoteDraft(PROJECT)).toBe(false)
  })
})
