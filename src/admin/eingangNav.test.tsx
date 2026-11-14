/**
 * Navigationspunkt «Eingang» — docs/specs/mail-eingang-triage.md §10: nur mit
 * Modul `mail_eingang`, mit der Zahl der offenen Mails (wie Lieferschein-Eingang).
 */
import { describe, it, expect, vi } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import AdminSidebar from './AdminSidebar'
import MobileNav from './MobileNav'
import { SCREEN_TITLES } from './screenTitles'
import { HELP_TARGETS } from '../shared/helpTargets'

const basis = {
  screen: 'dashboard' as const, onLoggedOut: () => {}, onSwitchToUser: () => {},
  displayName: 'Petra Büro', role: 'admin', tenantName: 'Muster AG',
}

describe('Navigationspunkt «Eingang»', () => {
  it('steht in der Seitenleiste nur mit dem Modul, mit Zahl und Beta-Abzeichen', async () => {
    const onNav = vi.fn()
    const { rerender } = render(
      <AdminSidebar {...basis} onNav={onNav} enabledModules={['lieferschein_erfassung']} badges={{ mailEingang: 3 }} />,
    )
    expect(screen.queryByTitle('Eingang')).toBeNull()

    rerender(<AdminSidebar {...basis} onNav={onNav} enabledModules={['mail_eingang']} badges={{ mailEingang: 3 }} />)
    const punkt = screen.getByTitle('Eingang')
    expect(within(punkt).getByText('3')).toBeInTheDocument()
    expect(within(punkt).getByText('Beta')).toBeInTheDocument()
    await userEvent.click(punkt)
    expect(onNav).toHaveBeenCalledWith('eingang')
  })

  it('steht in der Seitenleiste gleich unter dem Dashboard, vor Aufgaben und Meine Zeit', () => {
    render(
      <AdminSidebar {...basis} onNav={() => {}} showTaskBoard
                    enabledModules={['mail_eingang', 'timekeeping', 'lieferschein_erfassung']} />,
    )
    const titel = Array.from(document.querySelectorAll('.admin-nav-item')).map(b => b.getAttribute('title'))
    expect(titel.slice(0, 4)).toEqual(['Dashboard', 'Eingang', 'Aufgaben', 'Meine Zeit'])
  })

  it('zeigt ohne offene Mails keine Zahl', () => {
    render(<AdminSidebar {...basis} onNav={() => {}} enabledModules={['mail_eingang']} badges={{ mailEingang: 0 }} />)
    expect(within(screen.getByTitle('Eingang')).queryByText('0')).toBeNull()
  })

  it('steht am Handy im «Mehr»-Menü, die Zahl meldet sich schon am Menüknopf', async () => {
    const onNav = vi.fn()
    const { container } = render(
      <MobileNav {...basis} onNav={onNav} enabledModules={['mail_eingang']} badges={{ mailEingang: 2 }} />,
    )
    // Der Punkt am «Mehr»-Knopf: es wartet etwas, das nicht in der Tab-Leiste steht.
    expect(container.querySelector('.admin-mobile-tab-dot')).not.toBeNull()
    await userEvent.click(screen.getByRole('button', { name: /Mehr/ }))
    const punkt = screen.getByRole('button', { name: /^Eingang/ })
    expect(within(punkt).getByText('2')).toBeInTheDocument()
    // Zuoberst in «Häufig genutzt», wie in der Seitenleiste.
    expect(container.ownerDocument.querySelector('.admin-mobile-drawer-item')).toBe(punkt)
    await userEvent.click(punkt)
    expect(onNav).toHaveBeenCalledWith('eingang', undefined)
  })

  it('hat einen Titel und ist für den Hilfe-Bot ein Ziel hinter dem Modul', () => {
    expect(SCREEN_TITLES.eingang).toBe('Eingang')
    expect(HELP_TARGETS).toContainEqual({ app: 'admin', screen: 'eingang', module: 'mail_eingang' })
  })
})
