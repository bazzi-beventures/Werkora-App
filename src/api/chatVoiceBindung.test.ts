import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest'
import { sendVoice } from './chat'

// Die Sprachnotiz trägt das Projekt des laufenden Rapports mit.
//
// Sie ist der Weg, auf dem der gemeldete Fehler am ehesten zuschlägt: «acht Stunden
// für Peter» ist genau die Nachricht, in der ein Mitarbeitername ein fremdes Projekt
// in die Auswahl hebt, wenn der Server gerade keine Bindung hat (Chat-Zustand nicht
// ladbar — `pwa_chat_state` behandelt das bewusst offen). Die Route ist multipart,
// die Angabe reist deshalb als Formularfeld statt im JSON-Body.

function formOf(call: unknown): FormData {
  return (call as RequestInit).body as FormData
}

describe('sendVoice — Projekt-Bindung', () => {
  beforeEach(() => {
    localStorage.setItem('auth-token', 't')
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ reply: 'ok', action_taken: null }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }),
    ))
  })
  afterEach(() => { vi.unstubAllGlobals(); localStorage.clear() })

  it('hängt Projekt und id als Formularfelder an', async () => {
    await sendVoice(new Blob(['x']), { project: 'Storen Müller', projectId: 'p1' })

    const form = formOf(vi.mocked(fetch).mock.calls[0][1])
    expect(form.get('resume_project')).toBe('Storen Müller')
    expect(form.get('resume_project_id')).toBe('p1')
  })

  it('lässt sie weg, wenn kein Rapport läuft — sonst bände der Server ins Blaue', async () => {
    await sendVoice(new Blob(['x']))

    const form = formOf(vi.mocked(fetch).mock.calls[0][1])
    expect(form.get('resume_project')).toBeNull()
    expect(form.get('resume_project_id')).toBeNull()
  })
})
