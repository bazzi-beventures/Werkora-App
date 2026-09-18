/**
 * Der Passwort-Dialog der Betreiber-Seite.
 *
 * Gepinnt wird, was ihn von einem Formular mit zwei Feldern unterscheidet:
 * die Sperren vor dem Absenden, der Unterschied zwischen eigenem und fremdem
 * Konto, und dass die Policy-Meldung des Backends im Klartext ankommt. Das
 * letzte ist der Grund, warum es den Dialog überhaupt gibt: «Fehler beim
 * Speichern» statt «enthält Ihren Namen» macht aus einer Korrektur ein Raten.
 */
import { describe, it, expect, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { PasswordDialog } from './PasswordDialog'
import { ApiError } from '../api/client'

const GUT = 'Baustelle-Winterthur-42'

function zeige(props: Partial<React.ComponentProps<typeof PasswordDialog>> = {}) {
  const onSave = props.onSave ?? vi.fn().mockResolvedValue(undefined)
  const onDone = props.onDone ?? vi.fn()
  const onClose = props.onClose ?? vi.fn()
  render(
    <PasswordDialog
      titel="Passwort für Luca"
      onSave={onSave}
      onDone={onDone}
      onClose={onClose}
      {...props}
    />,
  )
  return { onSave, onDone, onClose }
}

const knopf = () => screen.getByRole('button', { name: 'Passwort setzen' })

describe('PasswordDialog', () => {
  it('bleibt gesperrt, solange die Wiederholung fehlt', async () => {
    zeige()
    await userEvent.type(screen.getByLabelText('Neues Passwort'), GUT)
    expect(knopf()).toBeDisabled()
  })

  it('meldet zwei verschiedene Eingaben, statt sie zu senden', async () => {
    const { onSave } = zeige()
    await userEvent.type(screen.getByLabelText('Neues Passwort'), GUT)
    await userEvent.type(screen.getByLabelText('Neues Passwort wiederholen'), GUT + 'x')

    expect(screen.getByText('Die beiden Eingaben sind verschieden.')).toBeInTheDocument()
    expect(knopf()).toBeDisabled()
    expect(onSave).not.toHaveBeenCalled()
  })

  it('meldet ein zu kurzes Passwort ohne Rundreise zum Server', async () => {
    const { onSave } = zeige()
    await userEvent.type(screen.getByLabelText('Neues Passwort'), 'kurz')
    expect(screen.getByText('Zu kurz.')).toBeInTheDocument()
    expect(onSave).not.toHaveBeenCalled()
  })

  it('sendet das neue Passwort, wenn beide Eingaben stimmen', async () => {
    const { onSave, onDone } = zeige()
    await userEvent.type(screen.getByLabelText('Neues Passwort'), GUT)
    await userEvent.type(screen.getByLabelText('Neues Passwort wiederholen'), GUT)
    await userEvent.click(knopf())

    expect(onSave).toHaveBeenCalledWith(GUT, null)
    await waitFor(() => expect(onDone).toHaveBeenCalledWith('Passwort gesetzt'))
  })

  it('zeigt die Policy-Meldung des Backends im Klartext', async () => {
    const onSave = vi.fn().mockRejectedValue(new Error('Das Passwort enthält Ihren Namen.'))
    const { onDone } = zeige({ onSave })

    await userEvent.type(screen.getByLabelText('Neues Passwort'), GUT)
    await userEvent.type(screen.getByLabelText('Neues Passwort wiederholen'), GUT)
    await userEvent.click(knopf())

    expect(await screen.findByText('Das Passwort enthält Ihren Namen.')).toBeInTheDocument()
    expect(onDone).not.toHaveBeenCalled()
  })
})

describe('PasswordDialog — eigenes Konto', () => {
  it('verlangt das alte Passwort und reicht es durch', async () => {
    // Ohne Re-Auth könnte eine gekaperte Sitzung den Zugang übernehmen.
    const { onSave } = zeige({ requireCurrent: true })

    await userEvent.type(screen.getByLabelText('Neues Passwort'), GUT)
    await userEvent.type(screen.getByLabelText('Neues Passwort wiederholen'), GUT)
    expect(knopf()).toBeDisabled()

    await userEvent.type(screen.getByLabelText('Aktuelles Passwort'), 'alt-alt-alt-alt')
    await userEvent.click(knopf())

    expect(onSave).toHaveBeenCalledWith(GUT, 'alt-alt-alt-alt')
  })

  it('sagt, dass die eigene Sitzung bestehen bleibt', () => {
    zeige({ requireCurrent: true })
    expect(screen.getByText(/Diese Sitzung bleibt bestehen/)).toBeInTheDocument()
  })

  it('warnt beim fremden Konto stattdessen vor der Abmeldung', () => {
    zeige()
    expect(screen.getByText(/auf allen Geräten abgemeldet/)).toBeInTheDocument()
    expect(screen.queryByLabelText('Aktuelles Passwort')).toBeNull()
  })
})


describe('PasswordDialog — rohe Fehlercodes', () => {
  /**
   * Beide Passwort-Routen antworten ausserhalb der Policy mit blossen
   * String-Details (`detail: "wrong_current_password"`), und `apiFetch` reicht
   * die unverändert als `Error.message` durch. Ohne Zuordnung stünde der
   * Bezeichner wörtlich im Dialog — ausgerechnet beim Vertipper, dem
   * häufigsten Fehlerfall überhaupt.
   */
  async function absendenMitFehler(fehler: Error, props = {}) {
    const onSave = vi.fn().mockRejectedValue(fehler)
    zeige({ onSave, ...props })
    if ('requireCurrent' in props) {
      await userEvent.type(screen.getByLabelText('Aktuelles Passwort'), 'alt-alt-alt-alt')
    }
    await userEvent.type(screen.getByLabelText('Neues Passwort'), GUT)
    await userEvent.type(screen.getByLabelText('Neues Passwort wiederholen'), GUT)
    await userEvent.click(knopf())
  }

  it('übersetzt ein falsches aktuelles Passwort', async () => {
    await absendenMitFehler(new ApiError(400, 'wrong_current_password'), { requireCurrent: true })

    expect(await screen.findByText('Das aktuelle Passwort stimmt nicht.')).toBeInTheDocument()
    expect(screen.queryByText('wrong_current_password')).toBeNull()
  })

  it('übersetzt das fehlende aktuelle Passwort', async () => {
    await absendenMitFehler(new ApiError(400, 'current_password_required'), { requireCurrent: true })

    expect(await screen.findByText('Bitte das aktuelle Passwort eingeben.')).toBeInTheDocument()
  })

  it('übersetzt einen Datenbankfehler des fremden Kontos', async () => {
    await absendenMitFehler(new ApiError(500, 'db_error'))

    expect(
      await screen.findByText('Die Datenbank hat die Änderung abgelehnt. Bitte nochmals versuchen.'),
    ).toBeInTheDocument()
  })

  it('übersetzt ein verschwundenes Konto', async () => {
    await absendenMitFehler(new ApiError(404, 'user_not_found'))

    expect(await screen.findByText('Dieses Konto gibt es nicht mehr.')).toBeInTheDocument()
  })

  it('lässt die strukturierte Policy-Meldung unangetastet', async () => {
    // `{code, message}`: der Code ist maschinenlesbar, der Text ist schon
    // deutsch — die Tabelle darf ihn nicht durch einen gröberen ersetzen.
    await absendenMitFehler(
      new ApiError(400, 'Das Passwort ist zu kurz (mindestens 12 Zeichen).', 'password_too_short'),
    )

    expect(
      await screen.findByText('Das Passwort ist zu kurz (mindestens 12 Zeichen).'),
    ).toBeInTheDocument()
  })
})
