import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import {
  ApiError,
  isNetworkError,
  isOfflineError,
  parseDispositionFilename,
  apiFetch,
  resetSessionExpiredFlag,
} from './client'

// jsdom-Response-Stub: nur die von client.ts genutzten Felder.
function makeRes(opts: {
  ok: boolean
  status: number
  body?: unknown
  headers?: Record<string, string>
  statusText?: string
  /** true = Body ist kein JSON (z.B. HTML-Fehlerseite vom Edge-Proxy) */
  bodyNotJson?: boolean
}): Response {
  const headers = opts.headers ?? {}
  return {
    ok: opts.ok,
    status: opts.status,
    statusText: opts.statusText ?? 'StatusText',
    json: async () => {
      if (opts.bodyNotJson) throw new SyntaxError('Unexpected token < in JSON')
      return opts.body ?? {}
    },
    blob: async () => new Blob(),
    headers: { get: (k: string) => headers[k] ?? null },
  } as unknown as Response
}

function setOnline(value: boolean) {
  Object.defineProperty(navigator, 'onLine', { value, configurable: true })
}

describe('isOfflineError', () => {
  afterEach(() => setOnline(true))

  it('ist true nur bei ApiError(status 0) UND navigator.onLine === false', () => {
    setOnline(false)
    expect(isOfflineError(new ApiError(0, 'Keine Internetverbindung'))).toBe(true)
  })

  it('ist false bei status 0, wenn der Browser online ist (CORS/Cert ≠ offline)', () => {
    // Der Bugfix: ein geblockter Origin liefert status 0, ist aber NICHT offline —
    // sonst landet jede Aktion fälschlich in der Offline-Queue.
    setOnline(true)
    expect(isOfflineError(new ApiError(0, 'fehler'))).toBe(false)
  })

  it('ist false bei echten HTTP-Fehlern (status ≠ 0)', () => {
    setOnline(false)
    expect(isOfflineError(new ApiError(500, 'serverfehler'))).toBe(false)
  })

  it('ist false bei Nicht-ApiError-Werten', () => {
    setOnline(false)
    expect(isOfflineError(new Error('irgendwas'))).toBe(false)
    expect(isOfflineError(null)).toBe(false)
  })
})

describe('isNetworkError', () => {
  afterEach(() => setOnline(true))

  it('ist true bei status 0 — unabhängig vom onLine-Flag (Funkloch-Fall)', () => {
    setOnline(true)
    expect(isNetworkError(new ApiError(0, 'Keine Internetverbindung'))).toBe(true)
    setOnline(false)
    expect(isNetworkError(new ApiError(0, 'Keine Internetverbindung'))).toBe(true)
  })

  it('ist false bei echten HTTP-Fehlern und Nicht-ApiError-Werten', () => {
    expect(isNetworkError(new ApiError(500, 'serverfehler'))).toBe(false)
    expect(isNetworkError(new Error('irgendwas'))).toBe(false)
    expect(isNetworkError(null)).toBe(false)
  })
})

describe('parseDispositionFilename', () => {
  it('liest filename="..."', () => {
    expect(parseDispositionFilename('attachment; filename="rechnung.pdf"')).toBe('rechnung.pdf')
  })

  it('liest das RFC-5987-Format (filename*) mit Leerzeichen', () => {
    const disp = "attachment; filename*=utf-8''Einsatzplanung%20Gehlhaar%20Test%20KW%2019.pdf"
    expect(parseDispositionFilename(disp)).toBe('Einsatzplanung Gehlhaar Test KW 19.pdf')
  })

  it('dekodiert Umlaute im RFC-5987-Format', () => {
    expect(parseDispositionFilename("attachment; filename*=utf-8''R%C3%A4chnung.pdf")).toBe('Rächnung.pdf')
  })

  it('bevorzugt das RFC-5987-Feld, wenn beide vorhanden sind', () => {
    const disp = "attachment; filename=\"fallback.pdf\"; filename*=utf-8''Echt%20Name.pdf"
    expect(parseDispositionFilename(disp)).toBe('Echt Name.pdf')
  })

  it('liefert null, wenn kein filename vorhanden ist', () => {
    expect(parseDispositionFilename('attachment')).toBeNull()
    expect(parseDispositionFilename('')).toBeNull()
  })
})

describe('apiFetch — abgelaufene Session', () => {
  beforeEach(() => {
    resetSessionExpiredFlag() // Modul-State zwischen Tests isolieren
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('feuert auth:expired bei 401 genau einmal und wirft ApiError', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(makeRes({ ok: false, status: 401, body: { detail: 'expired' } })))
    const handler = vi.fn()
    window.addEventListener('auth:expired', handler)

    await expect(apiFetch('/pwa/projects')).rejects.toBeInstanceOf(ApiError)
    // Zweiter 401 darf das Event nicht erneut feuern (sessionExpiredHandled-Flag)
    await expect(apiFetch('/pwa/projects')).rejects.toBeInstanceOf(ApiError)

    expect(handler).toHaveBeenCalledTimes(1)
    window.removeEventListener('auth:expired', handler)
  })

  it('feuert auth:expired NICHT auf Auth-Endpoints (kein Loop bei Falsch-Passwort)', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(makeRes({ ok: false, status: 401, body: { detail: 'falsch' } })))
    const handler = vi.fn()
    window.addEventListener('auth:expired', handler)

    await expect(apiFetch('/pwa/auth/login-password')).rejects.toBeInstanceOf(ApiError)

    expect(handler).not.toHaveBeenCalled()
    window.removeEventListener('auth:expired', handler)
  })

  it('erlaubt nach resetSessionExpiredFlag() ein erneutes Event', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(makeRes({ ok: false, status: 401, body: { detail: 'expired' } })))
    const handler = vi.fn()
    window.addEventListener('auth:expired', handler)

    await expect(apiFetch('/pwa/projects')).rejects.toBeInstanceOf(ApiError)
    resetSessionExpiredFlag()
    await expect(apiFetch('/pwa/projects')).rejects.toBeInstanceOf(ApiError)

    expect(handler).toHaveBeenCalledTimes(2)
    window.removeEventListener('auth:expired', handler)
  })

  it('wirft ApiError(0) bei Netzwerkabbruch (fetch wirft)', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('Failed to fetch')))
    await expect(apiFetch('/pwa/projects')).rejects.toMatchObject({ status: 0 })
  })
})

describe('apiFetch — Fehlermeldung', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('bevorzugt `detail` (app-weite FastAPI-Form)', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(makeRes({ ok: false, status: 400, body: { detail: 'Ungültig' } })))
    await expect(apiFetch('/pwa/x')).rejects.toMatchObject({ status: 400, message: 'Ungültig' })
  })

  it('liest `error` als Fallback (z.B. manueller Rapport)', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(makeRes({ ok: false, status: 400, body: { error: 'Kein Stundenansatz für Anna hinterlegt' } })))
    await expect(apiFetch('/pwa/x')).rejects.toMatchObject({ status: 400, message: 'Kein Stundenansatz für Anna hinterlegt' })
  })

  // Der stille Fehler: die Screens rendern ihre Meldung mit `{error && …}`. Ein
  // Leerstring zeigt dort NICHTS an — der Spinner stoppt und scheinbar passiert
  // nichts. Genau das meldeten Nutzer beim Lieferanten-PDF-Upload.
  it('fällt auf "Serverfehler (HTTP …)" zurück, wenn der Body kein JSON ist und statusText leer', async () => {
    // Realfall: 502 vom Edge-Proxy — HTML-Body, und über HTTP/2 ist statusText
    // IMMER leer, weil HTTP/2 keine Reason-Phrase mehr kennt.
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(
      makeRes({ ok: false, status: 502, statusText: '', bodyNotJson: true })))
    await expect(apiFetch('/pwa/x')).rejects.toMatchObject({
      status: 502, message: 'Serverfehler (HTTP 502)',
    })
  })

  it('fällt zurück, wenn `detail` ein Leerstring ist', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(
      makeRes({ ok: false, status: 500, statusText: '', body: { detail: '   ' } })))
    await expect(apiFetch('/pwa/x')).rejects.toMatchObject({
      status: 500, message: 'Serverfehler (HTTP 500)',
    })
  })

  it('rendert FastAPI-Validierungsfehler (detail = Array) nicht als "[object Object]"', async () => {
    const detail = [{ loc: ['body', 'menge'], msg: 'value is not a valid float', type: 'type_error.float' }]
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(
      makeRes({ ok: false, status: 422, body: { detail } })))
    await expect(apiFetch('/pwa/x')).rejects.toMatchObject({
      status: 422, message: 'Serverfehler (HTTP 422)',
    })
  })

  it('reicht String-Codes unveraendert weiter (csrf_invalid bleibt erkennbar)', async () => {
    // Regressionsschutz für den Fallback oben: er darf den Code nicht überschreiben,
    // sonst greift die Sitzungs-abgelaufen-Erkennung nicht mehr.
    resetSessionExpiredFlag()
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(
      makeRes({ ok: false, status: 403, body: { detail: 'csrf_invalid' } })))
    await expect(apiFetch('/pwa/x')).rejects.toMatchObject({
      status: 403, message: 'Sitzung abgelaufen',
    })
    resetSessionExpiredFlag()
  })
})

describe('apiFetch — timeoutMs', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('bricht einen hängenden Request nach timeoutMs mit ApiError(0) ab', async () => {
    // fetch, das nie antwortet, aber auf das Abort-Signal reagiert —
    // wie ein Request im Funkloch mit "online"-Flag.
    vi.stubGlobal('fetch', vi.fn((_url: string, init: RequestInit) =>
      new Promise((_resolve, reject) => {
        init.signal?.addEventListener('abort', () =>
          reject(new DOMException('The operation was aborted.', 'AbortError')))
      })))
    await expect(apiFetch('/pwa/zeit/clock_in', { method: 'POST', timeoutMs: 20 }))
      .rejects.toMatchObject({ status: 0 })
  })

  it('lässt erfolgreiche Antworten innerhalb des Timeouts normal durch', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(makeRes({ ok: true, status: 200, body: { ok: true } })))
    await expect(apiFetch('/pwa/projects', { timeoutMs: 5000 })).resolves.toEqual({ ok: true })
  })
})
