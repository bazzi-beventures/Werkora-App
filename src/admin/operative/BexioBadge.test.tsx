import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { vi } from 'vitest'
import { BexioBadge } from './BexioBadge'

// docs/specs/bexio-anbindung.md §8.2 — nur Anzeige, nichts davon ist klickbar.

describe('BexioBadge', () => {
  it('zeigt nichts ohne Zustand', () => {
    const { container } = render(<BexioBadge />)
    expect(container.textContent).toBe('')
  })

  it('zeigt «in bexio»', () => {
    const { container } = render(<BexioBadge badge={{ state: 'in_bexio', bexio_id: 9 }} />)
    expect(container.textContent).toBe('in bexio')
  })

  it('schreibt «wird übertragen» aus', () => {
    const { container } = render(<BexioBadge badge={{ state: 'wird_uebertragen' }} />)
    expect(container.textContent).toBe('bexio: wird übertragen')
  })

  it('erklärt einen Fehler im Tooltip', () => {
    const { container } = render(<BexioBadge badge={{ state: 'fehler', message: 'Nummer schon vergeben' }} />)
    const el = container.querySelector('span')!
    expect(el.textContent).toBe('bexio: Fehler')
    expect(el.getAttribute('title')).toMatch(/Nummer schon vergeben/)
  })

  it('«Storno offen» ist mit Handler ein Knopf', async () => {
    const onCancel = vi.fn()
    render(<BexioBadge badge={{ state: 'storno_offen' }} onCancelRequest={onCancel} />)
    await userEvent.click(screen.getByRole('button', { name: 'bexio: Storno offen' }))
    expect(onCancel).toHaveBeenCalled()
  })

  it('der Knopf erbt nicht die Schriftgrösse der Umgebung', () => {
    render(<BexioBadge badge={{ state: 'storno_offen' }} onCancelRequest={vi.fn()} />)
    const btn = screen.getByRole('button', { name: 'bexio: Storno offen' })
    expect(btn.style.fontSize).toBe('')                       // 11 px kommen aus .admin-badge
    expect(btn.className).toContain('admin-badge')
  })

  it('bestätigtes Storno ist nur noch Anzeige', () => {
    render(<BexioBadge badge={{ state: 'storno_offen', confirmed: true }} onCancelRequest={vi.fn()} />)
    expect(screen.queryByRole('button')).toBeNull()
    expect(screen.getByText('bexio: wird storniert')).toBeInTheDocument()
  })
})
