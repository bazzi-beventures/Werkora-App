import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import LeistungsartPrompt, { WORK_TYPES } from './LeistungsartPrompt'

// Leistungsart-Schritt im Rapport-Chat: der Monteur kreuzt an, was er gemacht hat.
// Vorbelegt aus dem Projekt (Backend liefert nur kanonische Werte).

describe('LeistungsartPrompt', () => {
  it('bietet alle sechs Leistungsarten an', () => {
    render(<LeistungsartPrompt initial={[]} onSubmit={vi.fn()} />)

    for (const w of WORK_TYPES) {
      expect(screen.getByRole('button', { name: w.label })).toBeInTheDocument()
    }
  })

  it('markiert die Vorauswahl aus dem Projekt', () => {
    render(<LeistungsartPrompt initial={['Reparatur']} onSubmit={vi.fn()} />)

    expect(screen.getByRole('button', { name: 'Reparatur' })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByRole('button', { name: 'Neumontage' })).toHaveAttribute('aria-pressed', 'false')
  })

  it('gibt die Vorauswahl unverändert weiter, wenn nichts angetippt wird', async () => {
    const user = userEvent.setup()
    const onSubmit = vi.fn()
    render(<LeistungsartPrompt initial={['Neumontage']} onSubmit={onSubmit} />)

    await user.click(screen.getByRole('button', { name: 'Weiter' }))
    expect(onSubmit).toHaveBeenCalledWith(['Neumontage'])
  })

  it('erlaubt Mehrfachauswahl', async () => {
    const user = userEvent.setup()
    const onSubmit = vi.fn()
    render(<LeistungsartPrompt initial={[]} onSubmit={onSubmit} />)

    await user.click(screen.getByRole('button', { name: 'Neumontage' }))
    await user.click(screen.getByRole('button', { name: 'Reparatur' }))
    await user.click(screen.getByRole('button', { name: 'Weiter' }))

    expect(onSubmit).toHaveBeenCalledWith(['Neumontage', 'Reparatur'])
  })

  it('erlaubt das Abwählen der Projekt-Vorauswahl', async () => {
    // Der Zweck des Schritts: auf einem Neumontage-Projekt war dieser Einsatz eine
    // Reparatur. Die leere Auswahl ist ebenfalls erlaubt.
    const user = userEvent.setup()
    const onSubmit = vi.fn()
    render(<LeistungsartPrompt initial={['Neumontage']} onSubmit={onSubmit} />)

    await user.click(screen.getByRole('button', { name: 'Neumontage' }))
    await user.click(screen.getByRole('button', { name: 'Weiter' }))

    expect(onSubmit).toHaveBeenCalledWith([])
  })

  it('gibt die Auswahl in kanonischer Reihenfolge zurück', async () => {
    // Gleich gemeinte Rapporte sollen gleich in der DB landen — das Backend
    // normalisiert zwar ebenfalls, doppelt hält hier besser.
    const user = userEvent.setup()
    const onSubmit = vi.fn()
    render(<LeistungsartPrompt initial={['Demontage', 'Neumontage']} onSubmit={onSubmit} />)

    await user.click(screen.getByRole('button', { name: 'Weiter' }))
    expect(onSubmit).toHaveBeenCalledWith(['Neumontage', 'Demontage'])
  })

  it('ignoriert nicht-kanonische Vorauswahl-Werte', async () => {
    const user = userEvent.setup()
    const onSubmit = vi.fn()
    render(<LeistungsartPrompt initial={['Garantiefall', 'Reparatur']} onSubmit={onSubmit} />)

    await user.click(screen.getByRole('button', { name: 'Weiter' }))
    expect(onSubmit).toHaveBeenCalledWith(['Reparatur'])
  })
})
