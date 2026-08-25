import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react'
import SupportForm from './SupportForm'
import { ApiError } from '../api/client'

// Spec docs/specs/support-ticket.md §5.5 — «Problem diktieren» (Mistral Voice).
//
// Getestet wird der Weg Mikrofon → Transkript → Textfeld MIT dem echten
// `useVoiceRecorder`; nur `MediaRecorder`/`getUserMedia` und der Netzaufruf sind
// ersetzt. Ein Mock des Hooks selbst würde genau die Verdrahtung überspringen,
// an der es scheitert (Knopf ruft nichts, Blob kommt nie an).

const transcribeSupportAudio = vi.fn()
const sendSupportTicket = vi.fn()
vi.mock('../api/support', async () => {
  const actual = await vi.importActual<typeof import('../api/support')>('../api/support')
  return {
    ...actual,
    sendSupportTicket: (...args: unknown[]) => sendSupportTicket(...args),
    transcribeSupportAudio: (...args: unknown[]) => transcribeSupportAudio(...args),
  }
})

/** Minimaler MediaRecorder: sammelt nichts, liefert beim Stoppen einen Blob. */
class FakeMediaRecorder {
  static isTypeSupported = () => true
  static instances: FakeMediaRecorder[] = []

  state: 'inactive' | 'recording' = 'inactive'
  mimeType = 'audio/webm'
  ondataavailable: ((e: { data: Blob }) => void) | null = null
  onstop: (() => void) | null = null

  constructor() {
    FakeMediaRecorder.instances.push(this)
  }

  start() { this.state = 'recording' }

  stop() {
    this.state = 'inactive'
    this.ondataavailable?.({ data: new Blob(['audio'], { type: 'audio/webm' }) })
    this.onstop?.()
  }
}

const track = { stop: vi.fn() }

function installMediaStack() {
  Object.defineProperty(navigator, 'mediaDevices', {
    configurable: true,
    value: { getUserMedia: vi.fn().mockResolvedValue({ getTracks: () => [track] }) },
  })
  ;(globalThis as unknown as { MediaRecorder: unknown }).MediaRecorder = FakeMediaRecorder
}

/**
 * Aufnahme starten, die Mindestdauer verstreichen lassen, «Fertig» drücken.
 *
 * Die 500 ms sind kein Zierrat: der Hook verwirft alles Kürzere und verzögert
 * das Stoppen — ohne den Zeitsprung bliebe das Formular in «Aufnahme läuft».
 */
async function record() {
  fireEvent.click(screen.getByRole('button', { name: /diktieren/i }))
  await screen.findByText(/Aufnahme läuft/)
  await act(async () => { await vi.advanceTimersByTimeAsync(1000) })
  fireEvent.click(screen.getByRole('button', { name: 'Fertig' }))
  await act(async () => { await vi.advanceTimersByTimeAsync(600) })
}

beforeEach(() => {
  vi.useFakeTimers({ shouldAdvanceTime: true })
  transcribeSupportAudio.mockReset()
  sendSupportTicket.mockReset()
  FakeMediaRecorder.instances = []
  track.stop.mockClear()
  installMediaStack()
})

afterEach(() => {
  vi.useRealTimers()
})

describe('SupportForm — Diktat', () => {
  it('schreibt das Transkript ins Textfeld, statt es sofort zu senden', async () => {
    transcribeSupportAudio.mockResolvedValue('Rapport speichert nicht')
    render(<SupportForm route="rapport" appContext="pwa" />)

    await record()

    const feld = await screen.findByLabelText<HTMLTextAreaElement>('Was ist passiert?')
    await waitFor(() => expect(feld.value).toBe('Rapport speichert nicht'))
    // Kern der Entscheidung: der Melder liest gegen, bevor etwas rausgeht.
    expect(sendSupportTicket).not.toHaveBeenCalled()
  })

  it('hängt das Diktat an bereits getippten Text', async () => {
    transcribeSupportAudio.mockResolvedValue('Knopf reagiert nicht')
    render(<SupportForm route="rapport" appContext="pwa" />)
    const feld = screen.getByLabelText<HTMLTextAreaElement>('Was ist passiert?')
    fireEvent.change(feld, { target: { value: 'Seit heute:' } })

    await record()

    await waitFor(() => expect(feld.value).toBe('Seit heute: Knopf reagiert nicht'))
  })

  it('verwirft die Aufnahme, ohne sie zu transkribieren', async () => {
    render(<SupportForm route="rapport" appContext="pwa" />)
    fireEvent.click(screen.getByRole('button', { name: /diktieren/i }))
    await screen.findByText(/Aufnahme läuft/)

    fireEvent.click(screen.getByRole('button', { name: 'Verwerfen' }))
    await act(async () => { await vi.advanceTimersByTimeAsync(600) })

    // Eine verunglückte Aufnahme darf weder Kosten noch Text erzeugen.
    expect(transcribeSupportAudio).not.toHaveBeenCalled()
    expect(screen.getByLabelText<HTMLTextAreaElement>('Was ist passiert?').value).toBe('')
    expect(screen.queryByText(/Aufnahme läuft/)).toBeNull()
  })

  it('sagt es, wenn das Mikrofon gesperrt ist', async () => {
    // Der Hook schluckt den Fehler im Chat still — im Meldeformular wäre ein
    // Knopf, der nichts tut, die Sackgasse, an der die Meldung ungeschrieben bleibt.
    Object.defineProperty(navigator, 'mediaDevices', {
      configurable: true,
      value: { getUserMedia: vi.fn().mockRejectedValue(new Error('NotAllowedError')) },
    })
    render(<SupportForm route="rapport" appContext="pwa" />)

    fireEvent.click(screen.getByRole('button', { name: /diktieren/i }))

    await waitFor(() => expect(screen.getByRole('alert').textContent).toMatch(/Mikrofon/))
  })

  it('übersetzt einen Transkriptions-Fehler in Klartext', async () => {
    transcribeSupportAudio.mockRejectedValue(new ApiError(502, 'transcription_failed'))
    render(<SupportForm route="rapport" appContext="pwa" />)

    await record()

    await waitFor(() => expect(screen.getByRole('alert').textContent).toMatch(/nicht in Text/))
  })

  it('blendet den Knopf aus, wo der Browser nicht aufnehmen kann', () => {
    // Unsicherer Kontext (http://) oder altes iOS: `mediaDevices` fehlt ganz.
    Object.defineProperty(navigator, 'mediaDevices', { configurable: true, value: undefined })
    render(<SupportForm route="rapport" appContext="pwa" />)

    expect(screen.queryByRole('button', { name: /diktieren/i })).toBeNull()
    // Tippen bleibt der Weg — das Formular selbst ist unverändert da.
    expect(screen.getByLabelText('Was ist passiert?')).toBeTruthy()
  })
})
