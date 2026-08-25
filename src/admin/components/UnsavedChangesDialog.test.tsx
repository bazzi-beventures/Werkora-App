import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { UnsavedChangesDialog } from './UnsavedChangesDialog'

function renderDialog(props: Partial<React.ComponentProps<typeof UnsavedChangesDialog>> = {}) {
  const { container } = render(
    <UnsavedChangesDialog onSave={vi.fn()} onDiscard={vi.fn()} onCancel={vi.fn()} {...props} />,
  )
  return container.querySelector('.admin-confirm-actions')!
}

// Die Buttons schrumpfen nicht (.admin-btn: white-space: nowrap). Bei langen
// Beschriftungen ragten sie deshalb aus der Dialogbox heraus — der Test hält
// fest, dass sie in dem Fall gestapelt werden.
describe('UnsavedChangesDialog — Button-Anordnung', () => {
  it('lässt kurze Standard-Beschriftungen nebeneinander', () => {
    const actions = renderDialog()

    expect(actions.className).not.toContain('admin-confirm-actions-stacked')
  })

  it('stapelt satzlange Beschriftungen', () => {
    const actions = renderDialog({
      saveLabel: 'Entwurf behalten',
      discardLabel: 'Entwurf verwerfen',
      cancelLabel: 'Zurück zum Formular',
    })

    expect(actions.className).toContain('admin-confirm-actions-stacked')
    expect(screen.getByRole('button', { name: 'Entwurf behalten' })).toBeInTheDocument()
  })

  it('springt beim Speichern nicht zwischen den Anordnungen', () => {
    const labels = { saveLabel: 'Sichern', savingLabel: 'Wird gesichert…' }

    expect(renderDialog(labels).className).toBe(renderDialog({ ...labels, saving: true }).className)
  })
})

// Über dem Projekt-Detail kann die Rapport-Maske offen sein. «Speichern» hiesse dort
// entweder "das Formular darunter speichern" (wirkungslos) oder "einen halben Rapport
// buchen" (ein Beleg mit Geldfolge) — der Knopf entfällt.
describe('UnsavedChangesDialog — allowSave', () => {
  it('zeigt Speichern standardmässig an', () => {
    renderDialog()

    expect(screen.getByRole('button', { name: 'Speichern' })).toBeInTheDocument()
  })

  it('blendet Speichern aus, lässt aber Verwerfen und Abbrechen stehen', () => {
    renderDialog({ allowSave: false })

    expect(screen.queryByRole('button', { name: 'Speichern' })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Verwerfen' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Abbrechen' })).toBeInTheDocument()
  })

  it('rechnet den fehlenden Knopf bei der Anordnung heraus', () => {
    // Ohne diese Korrektur stapelte die Zwei-Knopf-Fassung früher als nötig.
    const labels = { saveLabel: 'Entwurf behalten', discardLabel: 'Entwurf verwerfen' }

    expect(renderDialog(labels).className).toContain('admin-confirm-actions-stacked')
    expect(renderDialog({ ...labels, allowSave: false }).className)
      .not.toContain('admin-confirm-actions-stacked')
  })
})
