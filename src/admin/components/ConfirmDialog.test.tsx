import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ConfirmDialog } from './ConfirmDialog'

function renderDialog(warning?: React.ReactNode) {
  render(
    <ConfirmDialog
      title="Projekt abschliessen?"
      message="Wird für Mitarbeiter ausgeblendet."
      warning={warning}
      onConfirm={vi.fn()}
      onCancel={vi.fn()}
    />,
  )
}

describe('ConfirmDialog — Warnhinweis', () => {
  it('zeigt den Hinweis, ohne das Bestätigen zu sperren', () => {
    renderDialog('Achtung: Für dieses Projekt sind noch 2 Rechnungen offen.')

    expect(screen.getByText('Achtung: Für dieses Projekt sind noch 2 Rechnungen offen.')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Bestätigen' })).toBeEnabled()
  })

  it('lässt den Kasten weg, wenn der Hinweis leer ist', () => {
    // Aufrufer reichen den Hinweis direkt durch — ein leerer String darf keinen
    // leeren Warnkasten erzeugen.
    const { container } = render(
      <ConfirmDialog
        title="Projekt abschliessen?"
        message="Wird für Mitarbeiter ausgeblendet."
        warning=""
        onConfirm={vi.fn()}
        onCancel={vi.fn()}
      />,
    )
    expect(container.querySelector('.admin-confirm-warning')).toBeNull()
  })
})

describe('ConfirmDialog — dritte Aktion', () => {
  // Rückfragen mit zwei verschiedenen Ja-Antworten (z.B. Serientermin: nur dieser
  // / ganze Serie) bauten früher ihr Overlay selbst. Reihenfolge zählt: der
  // mittlere Knopf ist die harmlosere Variante, das gefährliche Bestätigen bleibt
  // rechts.
  it('rendert Abbrechen, Zusatz-Aktion und Bestätigen in dieser Reihenfolge', async () => {
    const onExtra = vi.fn()
    const { container } = render(
      <ConfirmDialog
        title="Serientermin entfernen"
        message="Nur dieser Termin oder die ganze Serie?"
        extraAction={{ label: 'Nur dieser Termin', onClick: onExtra }}
        confirmLabel="Ganze Serie"
        variant="danger"
        onConfirm={vi.fn()}
        onCancel={vi.fn()}
      />,
    )

    const labels = [...container.querySelectorAll('.admin-confirm-actions button')].map(b => b.textContent)
    expect(labels).toEqual(['Abbrechen', 'Nur dieser Termin', 'Ganze Serie'])

    await userEvent.click(screen.getByRole('button', { name: 'Nur dieser Termin' }))
    expect(onExtra).toHaveBeenCalledTimes(1)
  })

  it('sperrt die Zusatz-Aktion während einer laufenden Aktion', () => {
    render(
      <ConfirmDialog
        title="Serientermin entfernen"
        message="Nur dieser Termin oder die ganze Serie?"
        extraAction={{ label: 'Nur dieser Termin', onClick: vi.fn() }}
        confirmLabel="Ganze Serie"
        busy
        onConfirm={vi.fn()}
        onCancel={vi.fn()}
      />,
    )
    expect(screen.getByRole('button', { name: 'Nur dieser Termin' })).toBeDisabled()
  })
})
