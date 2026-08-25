import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { SkontoFieldset, pdfUploadErrorMessage, skontoValidationError } from './QuoteFormParts'
import { ApiError } from '../../api/client'

const noop = () => {}

describe('SkontoFieldset', () => {
  it('rendert beide Felder mit den übergebenen Werten', () => {
    render(
      <SkontoFieldset skontoActive skontoPct="2" skontoDays="10"
        onActiveChange={noop} onPctChange={noop} onDaysChange={noop} />
    )
    expect(screen.getByText('Skonto')).toBeInTheDocument()
    expect(screen.getByDisplayValue('2')).toBeInTheDocument()
    expect(screen.getByDisplayValue('10')).toBeInTheDocument()
  })

  it('meldet Eingaben über onPctChange / onDaysChange', async () => {
    const onPct = vi.fn()
    const onDays = vi.fn()
    const user = userEvent.setup()
    render(
      <SkontoFieldset skontoActive skontoPct="" skontoDays=""
        onActiveChange={noop} onPctChange={onPct} onDaysChange={onDays} />
    )
    // Felder über ihre Labels ansteuern (title-Attribut spielt keine Rolle).
    const inputs = screen.getAllByRole('textbox')
    await user.type(inputs[0], '3')
    await user.type(inputs[1], '7')
    expect(onPct).toHaveBeenCalledWith('3')
    expect(onDays).toHaveBeenCalledWith('7')
  })

  it('weist darauf hin, dass das Total unverändert bleibt', () => {
    render(
      <SkontoFieldset skontoActive skontoPct="" skontoDays=""
        onActiveChange={noop} onPctChange={noop} onDaysChange={noop} />
    )
    expect(screen.getByText(/Total bleibt unverändert/i)).toBeInTheDocument()
  })

  it('sperrt beide Felder, solange das Häkchen nicht gesetzt ist', () => {
    render(
      <SkontoFieldset skontoActive={false} skontoPct="2" skontoDays="10"
        onActiveChange={noop} onPctChange={noop} onDaysChange={noop} />
    )
    // Werte bleiben stehen (erneutes Anhaken bringt sie zurück), sind aber gesperrt.
    for (const input of screen.getAllByRole('textbox')) {
      expect(input).toBeDisabled()
    }
    expect(screen.getByRole('checkbox')).not.toBeChecked()
  })

  it('meldet das Setzen des Häkchens', async () => {
    const onActive = vi.fn()
    const user = userEvent.setup()
    render(
      <SkontoFieldset skontoActive={false} skontoPct="" skontoDays=""
        onActiveChange={onActive} onPctChange={noop} onDaysChange={noop} />
    )
    await user.click(screen.getByRole('checkbox'))
    expect(onActive).toHaveBeenCalledWith(true)
  })

  it('zeigt die Fehlermeldung als Alert an', () => {
    render(
      <SkontoFieldset skontoActive skontoPct="" skontoDays=""
        error="Bitte den Prozentsatz eintragen." onActiveChange={noop}
        onPctChange={noop} onDaysChange={noop} />
    )
    expect(screen.getByRole('alert')).toHaveTextContent('Bitte den Prozentsatz eintragen.')
  })

  it('zeigt ohne Fehler keinen Alert', () => {
    render(
      <SkontoFieldset skontoActive skontoPct="2" skontoDays="10"
        onActiveChange={noop} onPctChange={noop} onDaysChange={noop} />
    )
    expect(screen.queryByRole('alert')).toBeNull()
  })
})

// Kern der Änderung: ein angehaktes, aber leeres Skonto-Feld wurde früher still zu
// "kein Skonto" — die Offerte ging ohne Hinweis zum Kunden. Die Grenzen spiegeln
// services/quote_service.py::normalize_skonto.
describe('skontoValidationError', () => {
  it('prüft nichts, solange das Häkchen aus ist', () => {
    expect(skontoValidationError(false, '', '')).toBeNull()
    expect(skontoValidationError(false, 'quatsch', '-5')).toBeNull()
  })

  it('verlangt den Prozentsatz, wenn das Häkchen gesetzt ist', () => {
    expect(skontoValidationError(true, '', '10')).toMatch(/Prozentsatz/i)
    expect(skontoValidationError(true, '   ', '10')).toMatch(/Prozentsatz/i)
  })

  it('verlangt die Zahlungsfrist, wenn das Häkchen gesetzt ist', () => {
    expect(skontoValidationError(true, '2', '')).toMatch(/Zahlungsfrist/i)
  })

  it('weist Prozentsätze ausserhalb von 0 bis 100 ab', () => {
    expect(skontoValidationError(true, '0', '10')).toMatch(/über 0/i)
    expect(skontoValidationError(true, '-1', '10')).toMatch(/über 0/i)
    expect(skontoValidationError(true, '101', '10')).toMatch(/100/)
    expect(skontoValidationError(true, 'zwei', '10')).toMatch(/Zahl/i)
  })

  it('weist negative Fristen ab, lässt 0 Tage aber zu', () => {
    expect(skontoValidationError(true, '2', '-1')).toMatch(/Zahlungsfrist/i)
    expect(skontoValidationError(true, '2', '0')).toBeNull()
  })

  it('akzeptiert gültige Eingaben inkl. Komma-Dezimaltrennung', () => {
    expect(skontoValidationError(true, '2', '10')).toBeNull()
    expect(skontoValidationError(true, '2,5', '10')).toBeNull()
    expect(skontoValidationError(true, '100', '30')).toBeNull()
  })
})

// Kundenmeldung: "PDF lädt, dann passiert nichts, ich muss nochmal hochladen."
// Eine der Ursachen war eine leere Fehlermeldung — die Formulare rendern mit
// `{pdfError && …}`, ein Leerstring zeigt dort nichts an.
describe('pdfUploadErrorMessage', () => {
  const setOnline = (v: boolean) =>
    Object.defineProperty(navigator, 'onLine', { value: v, configurable: true })
  afterEach(() => setOnline(true))

  it('gibt bei abgebrochener Verbindung NICHT "kein Internet" aus, wenn der Browser online ist', () => {
    // ApiError(0) heisst nur "fetch abgebrochen". Auf dem OCR-Endpoint ist das
    // fast immer der Proxy, der waehrend der laufenden Analyse dichtmacht.
    setOnline(true)
    const msg = pdfUploadErrorMessage(new ApiError(0, 'Keine Internetverbindung'))
    expect(msg).toMatch(/Verbindung zum Server ist abgebrochen/i)
    expect(msg).not.toMatch(/Keine Internetverbindung/i)
  })

  it('meldet echtes Offline nur, wenn der Browser sich selbst offline meldet', () => {
    setOnline(false)
    expect(pdfUploadErrorMessage(new ApiError(0, 'egal'))).toMatch(/Keine Internetverbindung/i)
  })

  it('reicht die Serverantwort durch (z.B. das 422-Detail des OCR-Endpoints)', () => {
    const msg = pdfUploadErrorMessage(new ApiError(422, 'PDF-Extraktion fehlgeschlagen: ungültiges JSON'))
    expect(msg).toBe('PDF-Extraktion fehlgeschlagen: ungültiges JSON')
  })

  it('liefert nie einen Leerstring — auch nicht bei leerer oder fremder Fehlerform', () => {
    expect(pdfUploadErrorMessage(new ApiError(500, ''))).not.toBe('')
    expect(pdfUploadErrorMessage(new Error('   '))).not.toBe('')
    expect(pdfUploadErrorMessage(undefined)).not.toBe('')
    expect(pdfUploadErrorMessage({ irgendwas: true })).not.toBe('')
  })
})
