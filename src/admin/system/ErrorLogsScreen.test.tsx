import { describe, expect, it, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import ErrorLogsScreen from './ErrorLogsScreen'
import type { ErrorLogRow } from '../../api/errorLogs'

const getErrorLogs = vi.fn()
const downloadErrorLogsCsv = vi.fn()

vi.mock('../../api/errorLogs', async () => {
  const actual = await vi.importActual<typeof import('../../api/errorLogs')>('../../api/errorLogs')
  return {
    ...actual,
    getErrorLogs: (...args: unknown[]) => getErrorLogs(...args),
    downloadErrorLogsCsv: (...args: unknown[]) => downloadErrorLogsCsv(...args),
  }
})

function row(over: Partial<ErrorLogRow> = {}): ErrorLogRow {
  return {
    id: 1,
    occurred_at: '2026-08-12T09:27:03+00:00',
    tenant_id: 't-1',
    tenant_name: 'Gehlhaar GmbH',
    user_id: null,
    level: 'error',
    source: 'invoice',
    error_type: 'ValueError',
    message: 'Betrag ungültig',
    traceback: 'Traceback:\n  line 1',
    fingerprint: 'abc123',
    context: { project_id: 7 },
    ...over,
  }
}

describe('ErrorLogsScreen', () => {
  beforeEach(() => {
    getErrorLogs.mockReset()
    downloadErrorLogsCsv.mockReset()
    getErrorLogs.mockResolvedValue({
      rows: [row(), row({ id: 2, level: 'warning', message: 'Langsame Antwort', error_type: null })],
      tenants: [{ id: 't-1', name: 'Gehlhaar GmbH' }],
      total: 812,
      capped: true,
    })
    downloadErrorLogsCsv.mockResolvedValue({ truncated: false })
  })

  it('zeigt Zeilen, Trefferzahl und Level-Zähler', async () => {
    render(<ErrorLogsScreen />)

    expect(await screen.findByText('Betrag ungültig')).toBeInTheDocument()
    expect(screen.getByText('Langsame Antwort')).toBeInTheDocument()
    expect(screen.getByText('2 angezeigt von 812')).toBeInTheDocument()
    // Chip-Zähler: 1 ERROR, 1 WARN, 0 CRIT
    expect(screen.getByRole('button', { name: /ERROR/ })).toHaveTextContent('1')
    expect(screen.getByRole('button', { name: /WARN/ })).toHaveTextContent('1')
  })

  it('öffnet das Detail als Overlay-Panel statt als Block unter der Liste', async () => {
    render(<ErrorLogsScreen />)
    fireEvent.click(await screen.findByText('Betrag ungültig'))

    const dialog = await screen.findByRole('dialog')
    expect(dialog).toHaveTextContent('Traceback')
    expect(dialog).toHaveTextContent('abc123')

    // Escape schliesst wieder
    fireEvent.keyDown(window, { key: 'Escape' })
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
  })

  it('„Gleiche Fehler" filtert auf die Signatur des Eintrags', async () => {
    render(<ErrorLogsScreen />)
    fireEvent.click(await screen.findByText('Betrag ungültig'))
    fireEvent.click(await screen.findByRole('button', { name: 'Gleiche Fehler' }))

    await waitFor(() => expect(getErrorLogs).toHaveBeenLastCalledWith(
      expect.objectContaining({ q: 'abc123' }),
    ))
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('exportiert CSV mit denselben Filtern wie die Ansicht', async () => {
    render(<ErrorLogsScreen />)
    await screen.findByText('Betrag ungültig')

    fireEvent.click(screen.getByRole('button', { name: /ERROR/ }))
    // Der Export-Button ist während des Nachladens gesperrt — erst wenn die
    // Ansicht steht, exportiert er garantiert denselben Ausschnitt.
    await waitFor(() => expect(screen.getByRole('button', { name: 'CSV-Export' })).toBeEnabled())
    fireEvent.click(screen.getByRole('button', { name: 'CSV-Export' }))

    await waitFor(() => expect(downloadErrorLogsCsv).toHaveBeenCalled())
    const viewParams = getErrorLogs.mock.calls[getErrorLogs.mock.calls.length - 1][0]
    expect(downloadErrorLogsCsv.mock.calls[0][0]).toEqual(viewParams)
    expect(viewParams.levels).toEqual(['error'])
  })

  it('meldet einen an der Obergrenze gekürzten Export', async () => {
    downloadErrorLogsCsv.mockResolvedValue({ truncated: true })
    render(<ErrorLogsScreen />)
    await screen.findByText('Betrag ungültig')

    fireEvent.click(screen.getByRole('button', { name: 'CSV-Export' }))
    expect(await screen.findByText(/gekürzt/)).toBeInTheDocument()
  })
})
