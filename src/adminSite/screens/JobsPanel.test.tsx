import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import { JobsTable } from './JobsPanel'
import type { JobsResponse } from '../../api/serviceHealth'

const JETZT = Date.parse('2026-11-12T08:00:00Z')

function ok(over: Partial<Extract<JobsResponse, { status: 'ok' }>> = {}): JobsResponse {
  return {
    status: 'ok', days: 7,
    lease: { holder: 'web-1:7:abc', expires_at: '2026-11-12T08:01:00Z', acquired_at: '2026-11-12T06:00:00Z' },
    jobs: [
      {
        name: 'support_cleanup', beschreibung: 'Support-Meldungen bereinigen', plan: 'täglich 03:15',
        je_mandant: false, laeufe: 3, fehler: 1,
        letzter: { status: 'ok', tenant_id: null, due_at: '2026-11-12T02:15:00Z', finished_at: '2026-11-12T02:15:04Z', dauer_ms: 4100, error: null },
        letzter_fehler: { tenant_id: null, due_at: '2026-11-11T02:15:00Z', finished_at: null, error: 'RuntimeError: Bucket weg' },
      },
      {
        name: 'access_log_cleanup', beschreibung: 'Zugriffsprotokoll löschen', plan: 'täglich 03:45',
        je_mandant: false, laeufe: 0, fehler: 0, letzter: null, letzter_fehler: null,
      },
    ],
    ...over,
  }
}

describe('JobsTable', () => {
  it('zeigt letzten Lauf, Fehlerzahl und den letzten Fehler', () => {
    render(<JobsTable data={ok()} jetzt={JETZT} />)
    expect(screen.getByText('OK')).toBeTruthy()
    expect(screen.getByText('1 / 3')).toBeTruthy()
    expect(screen.getByText('RuntimeError: Bucket weg')).toBeTruthy()
    expect(screen.getByText('noch nie')).toBeTruthy()
    expect(screen.getByText(/Runner aktiv: web-1:7:abc/)).toBeTruthy()
  })

  it('warnt, wenn niemand die Lease hält', () => {
    render(<JobsTable data={ok({ lease: { holder: 'alt', expires_at: '2026-11-12T07:00:00Z', acquired_at: '2026-11-12T06:00:00Z' } })} jetzt={JETZT} />)
    expect(screen.getByText(/Kein Runner hält die Lease/)).toBeTruthy()
  })

  it('sagt «nicht lesbar» statt eine leere Tabelle zu zeigen', () => {
    render(<JobsTable data={{ status: 'nicht_lesbar', days: 7 }} jetzt={JETZT} />)
    expect(screen.getByText(/Lauf-Journal nicht lesbar/)).toBeTruthy()
    expect(screen.queryByRole('table')).toBeNull()
  })
})
