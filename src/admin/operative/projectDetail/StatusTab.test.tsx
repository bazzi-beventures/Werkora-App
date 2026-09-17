import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import { StatusTab } from './StatusTab'

// Die eine Zusage, die hier zählt: **ohne Flag kein Abruf.** Hinter dem Verlauf
// stehen rund zehn Abfragen, und den Reiter «Status» öffnet man meistens, um ein
// Projekt abzuschliessen — nicht, um zu lesen.

const listProjectHistory = vi.fn()
vi.mock('../../../api/admin/projects', () => ({
  listProjectHistory: (...args: unknown[]) => listProjectHistory(...args),
}))

const KNOPF_PROPS = {
  settingStatus: false,
  reopening: false,
  onClose: vi.fn(),
  onReopen: vi.fn(),
  onArchive: vi.fn(),
  onReactivate: vi.fn(),
}

describe('StatusTab', () => {
  beforeEach(() => {
    listProjectHistory.mockReset()
    listProjectHistory.mockResolvedValue({
      events: [{
        at: '2026-09-12T13:42:11Z', gruppe: 'projekt',
        text: 'Projekt eröffnet', akteur: 'Luca Bazzi', quelle: 'tabelle',
      }],
      truncated: false,
    })
  })

  it('ohne Flag: keine Chronik, kein Abruf', () => {
    render(<StatusTab status="offen" projectId="p-1" {...KNOPF_PROPS} />)
    expect(screen.getByRole('button', { name: 'Abschliessen' })).toBeTruthy()
    expect(screen.queryByText('Verlauf')).toBeNull()
    expect(listProjectHistory).not.toHaveBeenCalled()
  })

  it('mit Flag: lädt und zeigt die Chronik neben den Knöpfen', async () => {
    render(<StatusTab status="offen" projectId="p-1" verlaufEnabled {...KNOPF_PROPS} />)
    await waitFor(() => expect(screen.getByText('Projekt eröffnet')).toBeTruthy())
    expect(listProjectHistory).toHaveBeenCalledWith('p-1')
    expect(screen.getByRole('button', { name: 'Abschliessen' })).toBeTruthy()
  })

  it('ohne Projekt-id wird nichts geladen', () => {
    render(<StatusTab status="offen" projectId={null} verlaufEnabled {...KNOPF_PROPS} />)
    expect(listProjectHistory).not.toHaveBeenCalled()
  })

  it('ein Fehler beim Laden kostet die Knöpfe nicht', async () => {
    listProjectHistory.mockRejectedValue(new Error('offline'))
    render(<StatusTab status="abgeschlossen" projectId="p-1" verlaufEnabled {...KNOPF_PROPS} />)
    await waitFor(() => expect(screen.getByText(/konnte nicht geladen werden/)).toBeTruthy())
    expect(screen.getByRole('button', { name: 'Wiedereröffnen' })).toBeTruthy()
  })
})
