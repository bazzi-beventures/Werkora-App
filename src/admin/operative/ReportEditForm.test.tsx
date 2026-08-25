import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ReportCreateForm } from './ReportCreateForm'
import type { ReportFormProject, ReportFormStaff } from './ReportCreateForm'
import { apiFetch } from '../../api/client'
import { getMe } from '../../api/auth'

// Bearbeiten-Modus derselben Maske (editReportId gesetzt): der gespeicherte Stand
// wird nachgeladen, jede Änderung geht als PUT-Vollersetzung zurück. Was hier nicht
// in der Nutzlast landet, wäre nach dem Speichern weg — deshalb prüfen die Tests
// vor allem, dass ALLE Blöcke vorbelegt und wieder mitgeschickt werden.

vi.mock('../../api/client', () => ({
  apiFetch: vi.fn(),
  ApiError: class ApiError extends Error {},
}))

vi.mock('../../api/auth', () => ({
  getMe: vi.fn(async () => ({ feature_flags: {} })),
}))

vi.mock('./MaterialCombobox', () => ({
  MaterialCombobox: ({ value, onChange }: { value: string; onChange: (a: string) => void }) => (
    <select aria-label="Material" value={value} onChange={e => onChange(e.target.value)}>
      <option value="">— Material wählen —</option>
      <option value="STG123">STG123</option>
      <option value="STG999">STG999</option>
    </select>
  ),
}))

const mockFetch = vi.mocked(apiFetch)

const PROJECT: ReportFormProject = { id: 'p1', name: 'MFH Sonnhalde' }
const STAFF: ReportFormStaff[] = [
  { id: 's1', name: 'Anna' },
  { id: 's2', name: 'Bob' },
]

const CATALOG = [
  { art_nr: 'STG123', name: 'Getriebehalter', unit_price: 8, calc_vk: 12.5, unit: 'Stk' },
  { art_nr: 'STG999', name: 'Getriebelager', unit_price: 40, calc_vk: null, unit: 'Stk' },
]

function existingReport(over: Record<string, unknown> = {}) {
  return {
    report_date: '2026-08-03',
    description: 'Motor ersetzt',
    massaufnahme: false,
    beratung: true,
    is_warranty: true,
    art_der_arbeit: ['Reparatur'],
    staff: [{ staff_id: 's2', name: 'Bob', hours: 3.5, hour_type: 'werkstatt' }],
    materials: [{ art_nr: 'STG123', amount: 2, item_name: 'Getriebehalter' }],
    kleinmaterial: { item_name: 'Kleinmaterial', count: 1, amount_chf: 25 },
    fixed_materials: [{
      item_name: 'Storen grau', amount: 1, unit: 'Stk', unit_price: 480,
      // Herkunft der Position: aus Offerte 9 importiert. Muss das Bearbeiten
      // überleben — das PUT ersetzt vollständig (siehe Test unten).
      source_quote_id: 9,
    }],
    editable: true,
    edit_blocked_reason: null,
    ...over,
  }
}

// GET des Rapports und des Katalogs bedienen, alles Übrige (PUT) quittieren.
function withReport(report: Record<string, unknown> = existingReport()) {
  mockFetch.mockImplementation(async (path: string) => {
    if (path === '/pwa/admin/projects/p1/reports/77') return report
    if (path.startsWith('/pwa/admin/materials')) return CATALOG
    return { report_id: 77 }
  })
}

function renderEdit() {
  const onDone = vi.fn()
  render(
    <ReportCreateForm
      project={PROJECT}
      staff={STAFF}
      quotes={[]}
      editReportId={77}
      onDone={onDone}
      onCancel={vi.fn()}
    />,
  )
  return { onDone }
}

function lastPut(): { url: string; body: Record<string, unknown> } {
  const call = [...mockFetch.mock.calls].reverse().find(
    c => (c[1] as RequestInit | undefined)?.method === 'PUT',
  )
  return {
    url: call![0] as string,
    body: JSON.parse((call![1] as RequestInit).body as string),
  }
}

beforeEach(() => {
  mockFetch.mockReset()
  vi.mocked(getMe).mockResolvedValue({ feature_flags: {} } as never)
})

describe('ReportCreateForm — Bearbeiten-Modus', () => {
  it('lädt den gespeicherten Stand und belegt alle Blöcke vor', async () => {
    withReport()
    renderEdit()

    expect(await screen.findByRole('heading', { name: 'Rapport bearbeiten' })).toBeInTheDocument()
    await waitFor(() => expect(screen.getByLabelText('Datum *')).toHaveValue('2026-08-03'))

    expect(screen.getByLabelText('Arbeitsbeschrieb *')).toHaveValue('Motor ersetzt')
    expect(screen.getByLabelText('Mitarbeiter 1')).toHaveValue('s2')
    expect(screen.getByLabelText('Stunden 1')).toHaveValue('3.5')
    expect(screen.getByLabelText('Stundenart 1')).toHaveValue('werkstatt')
    expect(screen.getByLabelText('Beratung')).toBeChecked()
    expect(screen.getByLabelText('Massaufnahme')).not.toBeChecked()
    expect(screen.getByLabelText('Garantiefall')).toBeChecked()
    expect(screen.getByLabelText('Reparatur')).toBeChecked()
    expect(screen.getByLabelText('Materialmenge 1')).toHaveValue('2')
    expect(screen.getByLabelText('Fixposition Bezeichnung 1')).toHaveValue('Storen grau')
    expect(screen.getByLabelText('Kleinmaterial Betrag')).toHaveValue('25')
  })

  it('lädt den Materialkatalog nach, damit die geladene Zeile ihren Artikel zeigt', async () => {
    // Ohne den Katalog stünde die Combobox der geladenen Zeile leer da — und ein
    // Speichern würde die Position verlieren.
    withReport()
    renderEdit()
    await waitFor(() => expect(screen.getByLabelText('Material')).toHaveValue('STG123'))
    expect(mockFetch.mock.calls.some(c => (c[0] as string).startsWith('/pwa/admin/materials'))).toBe(true)
  })

  it('schickt den vollständigen Stand als PUT zurück', async () => {
    withReport()
    const user = userEvent.setup()
    const { onDone } = renderEdit()

    await waitFor(() => expect(screen.getByLabelText('Stunden 1')).toHaveValue('3.5'))
    await user.clear(screen.getByLabelText('Stunden 1'))
    await user.type(screen.getByLabelText('Stunden 1'), '5')
    await user.click(screen.getByRole('button', { name: 'Änderungen speichern' }))

    await waitFor(() => expect(onDone).toHaveBeenCalled())
    const { url, body } = lastPut()
    expect(url).toBe('/pwa/admin/projects/p1/reports/77')
    expect(body.report_date).toBe('2026-08-03')
    expect(body.staff).toEqual([{ staff_id: 's2', hours: 5, hour_type: 'werkstatt' }])
    // Das PUT ersetzt vollständig — Material, Fixpositionen und Pauschale müssen
    // wieder mit, obwohl sie niemand angefasst hat.
    expect(body.materials).toEqual([{ art_nr: 'STG123', amount: 2 }])
    // source_quote_id kommt mit zurück: ginge sie beim Bearbeiten verloren, sähe der
    // Guard die Offerte wieder als offen und der nächste Rapport übernähme sie erneut
    // (docs/specs/rapport-nachtrag.md §3.5).
    expect(body.fixed_materials).toEqual([
      { item_name: 'Storen grau', amount: 1, unit: 'Stk', unit_price: 480, source_quote_id: 9 },
    ])
    expect(body.kleinmaterial).toEqual({ item_name: 'Kleinmaterial', count: 1, amount_chf: 25 })
    expect(body.is_warranty).toBe(true)
    expect(body.art_der_arbeit).toEqual(['Reparatur'])
  })

  it('ordnet eine Stundenzeile ohne staff_id über den Namen zu', async () => {
    // Alt-Zeilen (vor der staff_id) würden sonst auf «Mitarbeiter wählen…» stehen
    // und beim Speichern still verschwinden.
    withReport(existingReport({
      staff: [{ staff_id: null, name: 'Anna', hours: 2, hour_type: 'standard' }],
    }))
    renderEdit()
    await waitFor(() => expect(screen.getByLabelText('Mitarbeiter 1')).toHaveValue('s1'))
  })

  it('sperrt das Speichern, wenn das Backend die Bearbeitung ablehnt', async () => {
    withReport(existingReport({
      editable: false,
      edit_blocked_reason: 'Der Rapport hängt an einer Rechnung und kann nicht mehr bearbeitet werden.',
    }))
    renderEdit()

    expect(await screen.findByText(/hängt an einer Rechnung/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Änderungen speichern' })).toBeDisabled()
  })

  it('speichert nicht, wenn der Rapport gar nicht geladen werden konnte', async () => {
    // Sonst schriebe ein Klick das leere Formular über den Rapport.
    mockFetch.mockImplementation(async (path: string) => {
      if (path === '/pwa/admin/projects/p1/reports/77') throw new Error('Netzwerkfehler')
      return { report_id: 77 }
    })
    renderEdit()

    expect(await screen.findByText('Netzwerkfehler')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Änderungen speichern' })).toBeDisabled()
  })

  it('bleibt ohne editReportId die Erfassungsmaske (POST)', async () => {
    mockFetch.mockResolvedValue({ report_id: 42 })
    const user = userEvent.setup()
    render(
      <ReportCreateForm
        project={PROJECT}
        staff={STAFF}
        quotes={[]}
        onDone={vi.fn()}
        onCancel={vi.fn()}
      />,
    )

    expect(screen.getByRole('heading', { name: 'Rapport manuell erfassen' })).toBeInTheDocument()
    await user.selectOptions(screen.getByLabelText('Mitarbeiter 1'), 's1')
    await user.type(screen.getByLabelText('Stunden 1'), '4')
    await user.type(screen.getByLabelText('Arbeitsbeschrieb *'), 'Neu erfasst')
    await user.click(screen.getByRole('button', { name: 'Rapport speichern' }))

    await waitFor(() =>
      expect(mockFetch.mock.calls.some(c => (c[1] as RequestInit | undefined)?.method === 'POST')).toBe(true),
    )
    expect(mockFetch.mock.calls.every(c => (c[1] as RequestInit | undefined)?.method !== 'PUT')).toBe(true)
  })
})
