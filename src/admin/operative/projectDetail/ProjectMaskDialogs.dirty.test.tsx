import { describe, it, expect, vi } from 'vitest'
import { createRef } from 'react'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ProjectMaskDialogs } from './ProjectMaskDialogs'
import type { Project } from '../../../api/admin/projects'

// Der Projekt-Detail meldete dem globalen Guard (admin/unsavedChanges) bisher nur
// sein eigenes Formular. Stand die Rapport-Maske offen und halb ausgefüllt, warf ein
// Klick in der Sidebar sie ersatzlos weg — ✕/Esc/Backdrop fragen längst nach, die
// Navigation nicht. Die Maske spiegelt ihren Dirty-Stand deshalb in eine Ref des
// Aufrufers (Ref statt State: sonst rendert jeder Tastendruck den ganzen Screen neu).

vi.mock('../../../api/auth', () => ({ getMe: vi.fn().mockResolvedValue({}) }))
vi.mock('../../../api/modules', () => ({ isFeatureEnabled: () => false }))
vi.mock('../../../api/admin/materials', () => ({ listAllMaterials: vi.fn().mockResolvedValue([]) }))
vi.mock('../../../api/admin/quotes', () => ({ getQuoteDetail: vi.fn() }))
vi.mock('../../../api/admin/reports', () => ({
  saveProjectReport: vi.fn(),
  getProjectReport: vi.fn(),
}))

const PROJECT = { id: 'p1', name: 'Testprojekt' } as unknown as Project

function renderMasks(dirtyRef: React.MutableRefObject<boolean>) {
  return render(
    <ProjectMaskDialogs
      project={PROJECT}
      staff={[{ id: 's1', name: 'Hans', projektleiter: false, authorized_user_id: null }]}
      quotes={[]}
      showQuoteForm={false}
      onQuoteDone={() => {}}
      onQuoteCancel={() => {}}
      showReportForm
      editReportId={null}
      onReportDone={() => {}}
      onReportCancel={() => {}}
      editQuote={null}
      onEditQuoteDone={() => {}}
      onEditQuoteClose={() => {}}
      reportDirtyRef={dirtyRef}
    />
  )
}

describe('ProjectMaskDialogs — Dirty-Stand der Rapport-Maske', () => {
  it('meldet eine Eingabe an die Ref des Aufrufers', async () => {
    const dirtyRef = createRef<boolean>() as React.MutableRefObject<boolean>
    dirtyRef.current = false
    renderMasks(dirtyRef)

    await waitFor(() => expect(dirtyRef.current).toBe(false))

    await userEvent.type(screen.getByLabelText(/Arbeitsbeschrieb/), 'Storen montiert')

    await waitFor(() => expect(dirtyRef.current).toBe(true))
  })

  it('setzt die Ref zurück, wenn die Maske verschwindet', async () => {
    const dirtyRef = createRef<boolean>() as React.MutableRefObject<boolean>
    dirtyRef.current = false
    const { unmount } = renderMasks(dirtyRef)

    await userEvent.type(screen.getByLabelText(/Arbeitsbeschrieb/), 'Storen montiert')
    await waitFor(() => expect(dirtyRef.current).toBe(true))

    // Projekt-Detail geschlossen: sonst fragt die nächste Navigation nach einer
    // Maske, die es gar nicht mehr gibt.
    unmount()
    expect(dirtyRef.current).toBe(false)
  })
})
