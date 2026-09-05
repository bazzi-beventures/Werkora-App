import { trackApiError } from '../shared/breadcrumbs'
const BASE_URL = import.meta.env.VITE_API_URL ?? ''

// Absolute URL für direkte Browser-Navigation (z.B. <a href> in neuem Tab).
// Backend liegt auf anderer Origin als die PWA — relative Pfade würden auf
// die PWA-Origin zeigen. Cookies werden trotzdem mitgesendet (SameSite=None).
export const apiUrl = (path: string): string => `${BASE_URL}${path}`

// Auth läuft ausschliesslich via httpOnly-Cookie (pwa_session). Kein Token in
// localStorage → XSS kann ihn nicht stehlen. Cross-Origin (GitHub Pages →
// Railway) funktioniert via SameSite=None; Secure Cookies + credentials:'include'.
// CSRF-Schutz: Server prüft Origin-Header serverseitig (siehe agents/app.py).

export class ApiError extends Error {
  // Maschinenlesbarer Code aus einem strukturierten Fehler-Body
  // ({detail: {code, message}}), sonst undefined. `message` bleibt der Klartext
  // für die Anzeige; der Code ist für Aufrufer, die AUF einen bestimmten Fehler
  // reagieren müssen (z.B. 'absence_conflict' → Rückfrage statt Fehlermeldung)
  // und sich dafür nicht auf Meldungstexte verlassen sollen.
  constructor(public status: number, message: string, public code?: string) {
    super(message)
  }
}

// status 0 = fetch ist mit TypeError abgebrochen. Das passiert bei echtem
// Verbindungsabbruch (kein Internet, DNS, Timeout) — aber auch bei CORS-Block,
// Cert-Fehler, Mixed-Content oder einem Backend, das diesen Origin nicht mehr
// akzeptiert. Beim Bevenetures-Domain-Wechsel hat genau das die App auf alten
// Installationen in eine Endlos-Offline-Queue geschoben (Origin gewechselt,
// Backend hat alten Origin geblockt, Browser war online, App hielt sich für
// offline und queuete jede Aktion).
//
// Daher: nur als "offline" zählen, wenn der Browser selbst sagt, dass er
// offline ist. Sonst echten Fehler nach oben durchreichen.
export const isOfflineError = (e: unknown): boolean =>
  e instanceof ApiError &&
  e.status === 0 &&
  typeof navigator !== 'undefined' &&
  navigator.onLine === false

// status 0 unabhängig vom onLine-Flag — fängt auch "verbunden, aber kein
// Durchkommen" (Funkloch mit Empfangsbalken, Timeout). Kann aber genauso ein
// CORS-/Cert-/Origin-Problem sein (siehe oben). Deshalb NUR in Flows verwenden,
// die in eine Offline-Queue mit Versuchs-Deckel (MAX_DRAIN_ATTEMPTS) schreiben —
// ohne Deckel droht wieder die Endlos-Queue vom Bevenetures-Domain-Wechsel.
export const isNetworkError = (e: unknown): boolean =>
  e instanceof ApiError && e.status === 0

let sessionExpiredHandled = false

// Wird von App.tsx aufgerufen sobald der User sich wieder einloggt,
// damit eine spaetere, zweite abgelaufene Session erneut ein Event ausloesen kann.
export function resetSessionExpiredFlag() { sessionExpiredHandled = false }

function handleExpiredSession(status: number, detail: string, path: string): boolean {
  // Auth-Endpoints sind der Wiedereinstiegspunkt — dort nicht feuern (sonst Loop bei Falsch-Passwort)
  if (path.startsWith('/pwa/auth/')) return false
  const expired = status === 401 || (status === 403 && detail === 'csrf_invalid')
  if (!expired) return false
  if (sessionExpiredHandled) return true
  sessionExpiredHandled = true
  window.dispatchEvent(new CustomEvent('auth:expired'))
  return true
}

async function parseErrorDetail(res: Response): Promise<{ text: string; code?: string }> {
  // Diagnose-Breadcrumb (Spec docs/specs/support-ticket.md §5.3). Hier, weil
  // JEDER Fehlerpfad des Clients durch diese Funktion läuft — ein Aufruf statt
  // drei. Festgehalten werden nur Pfad und Statuscode, nie Inhalte: die Spur
  // verlässt mit einer Support-Meldung den Mandanten.
  try {
    trackApiError(new URL(res.url).pathname, res.status)
  } catch {
    /* res.url leer/relativ (Testumgebung) — die Spur ist Beiwerk, nie ein Fehler */
  }
  let detail: unknown = res.statusText
  let code: string | undefined
  try {
    const body = await res.json()
    // detail ist meist ein String-Code; strukturierte Fehler (z.B. Passwort-Policy)
    // liefern {code, message} — dann den Klartext zeigen statt "[object Object]".
    if (body.detail && typeof body.detail === 'object' && typeof body.detail.message === 'string') {
      detail = body.detail.message
      if (typeof body.detail.code === 'string') code = body.detail.code
    } else {
      // `detail` ist die app-weite Fehlerform (FastAPI HTTPException). Manche
      // neueren Endpoints (z.B. manueller Rapport) antworten mit `{ error: … }` —
      // als Fallback lesen, damit die deutsche Meldung nicht auf "Bad Request" fällt.
      detail = body.detail ?? body.error ?? detail
    }
  } catch {
    // Body ist kein JSON (HTML vom Edge-Proxy, leere Antwort) — dann bleibt
    // `detail` auf dem Statuszeilen-Fallback stehen, der unten gesetzt wird.
  }
  // Nie leer und nie ein Objekt zurückgeben. Zwei reale Fälle laufen sonst als
  // stumme Fehler durch, weil die Screens ihre Meldung mit `{error && …}` rendern
  // und ein Leerstring dort NICHTS anzeigt (Spinner stoppt, sonst passiert nichts):
  //   1. Antworten vom Edge-Proxy (502/504, Body ist HTML statt JSON) — dann greift
  //      der statusText-Fallback, und der ist über HTTP/2 IMMER leer, weil HTTP/2
  //      keine Reason-Phrase mehr kennt.
  //   2. FastAPI-Validierungsfehler liefern `detail` als Array von Objekten.
  const text = typeof detail === 'string' ? detail.trim() : ''
  return { text: text || `Serverfehler (HTTP ${res.status})`, code }
}

export interface ApiFetchOptions extends RequestInit {
  // Bricht den Request nach dieser Zeit ab (wird zu ApiError status 0). Für
  // Aktionen mit Offline-Queue: im Funkloch hängt fetch sonst minutenlang,
  // bevor die Aktion überhaupt gequeued werden kann.
  timeoutMs?: number
}

// `T` ist die erwartete Antwortform: `apiFetch<Project[]>('/pwa/admin/projects')`.
// Das ersetzt den früheren nachgestellten `as Promise<…>`-Cast — beides ist
// dieselbe Zusicherung (geprüft wird zur Laufzeit nichts), aber die Zusicherung
// steht jetzt am Aufruf statt hinter ihm, und ohne Default `unknown` fällt auf,
// wo sie fehlt. Wer die Form nicht kennt, lässt `T` weg und bekommt `unknown`.
export async function apiFetch<T = unknown>(path: string, options: ApiFetchOptions = {}): Promise<T> {
  const { timeoutMs, ...init } = options
  const controller = timeoutMs !== undefined ? new AbortController() : null
  const timer = controller !== null ? setTimeout(() => controller.abort(), timeoutMs) : null
  try {
    const res = await fetch(`${BASE_URL}${path}`, {
      ...init,
      ...(controller !== null ? { signal: controller.signal } : {}),
      credentials: 'include',
      headers: {
        'Content-Type': 'application/json',
        ...(init.headers ?? {}),
      },
    })

    if (!res.ok) {
      const { text, code } = await parseErrorDetail(res)
      if (handleExpiredSession(res.status, text, path)) {
        throw new ApiError(res.status, 'Sitzung abgelaufen')
      }
      throw new ApiError(res.status, text, code)
    }

    return res.json()
  } catch (e) {
    if (e instanceof ApiError) throw e
    throw new ApiError(0, 'Keine Internetverbindung')
  } finally {
    if (timer !== null) clearTimeout(timer)
  }
}

// Liest den Datei-Namen aus dem Content-Disposition-Header. Unterstuetzt
// sowohl filename="..." als auch das RFC-5987-Format filename*=utf-8''<urlencoded>,
// das FastAPI/Starlette automatisch verwenden, sobald der Name Leerzeichen
// oder Sonderzeichen enthaelt — z.B. "Einsatzplanung Gehlhaar Test KW 19.pdf".
export function parseDispositionFilename(disposition: string): string | null {
  const m5987 = disposition.match(/filename\*\s*=\s*([^']*)''([^;]+)/i)
  if (m5987) {
    try { return decodeURIComponent(m5987[2].trim()) } catch { /* fall through */ }
  }
  const mPlain = disposition.match(/filename\s*=\s*"?([^"]+?)"?(?:;|$)/i)
  return mPlain ? mPlain[1] : null
}

// `headers` wird mitgegeben, weil manche Downloads Metadaten im Header
// transportieren (z.B. X-Export-Truncated beim Error-Log-CSV). Cross-Origin
// sind dort nur Header sichtbar, die in `expose_headers` der CORSMiddleware
// stehen (agents/app.py).
export async function apiBlobFetch(
  path: string,
): Promise<{ blob: Blob; filename: string; headers: Headers }> {
  try {
    const res = await fetch(`${BASE_URL}${path}`, {
      credentials: 'include',
    })

    if (!res.ok) {
      const { text, code } = await parseErrorDetail(res)
      if (handleExpiredSession(res.status, text, path)) {
        throw new ApiError(res.status, 'Sitzung abgelaufen')
      }
      throw new ApiError(res.status, text, code)
    }

    const disposition = res.headers.get('Content-Disposition') ?? ''
    const filename = parseDispositionFilename(disposition) ?? 'download.pdf'

    return { blob: await res.blob(), filename, headers: res.headers }
  } catch (e) {
    if (e instanceof ApiError) throw e
    throw new ApiError(0, 'Keine Internetverbindung')
  }
}

/**
 * SSE-Streaming-Fetch. Öffnet einen POST-Request gegen `path`, parst SSE-Events
 * (`data: <json>\n\n`) und yieldet das geparste Objekt pro Event.
 *
 * Das Backend muss `text/event-stream` zurückliefern. Bei 4xx/5xx wird ApiError
 * geworfen — der Caller kann dann auf nicht-streamendes apiFetch zurückfallen.
 */
export async function* apiStreamFetch(
  path: string,
  body: unknown,
): AsyncGenerator<Record<string, unknown>, void, void> {
  let res: Response
  try {
    res = await fetch(`${BASE_URL}${path}`, {
      method: 'POST',
      credentials: 'include',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'text/event-stream',
      },
      body: JSON.stringify(body),
    })
  } catch {
    throw new ApiError(0, 'Keine Internetverbindung')
  }

  if (!res.ok) {
    const { text, code } = await parseErrorDetail(res)
    if (handleExpiredSession(res.status, text, path)) {
      throw new ApiError(res.status, 'Sitzung abgelaufen')
    }
    throw new ApiError(res.status, text, code)
  }

  if (!res.body) {
    throw new ApiError(0, 'Stream nicht verfügbar')
  }

  const reader = res.body.getReader()
  const decoder = new TextDecoder('utf-8')
  let buf = ''
  try {
    while (true) {
      const { value, done } = await reader.read()
      if (done) break
      buf += decoder.decode(value, { stream: true })
      // SSE events sind durch \n\n getrennt; jede Zeile beginnt mit "data: "
      let boundary = buf.indexOf('\n\n')
      while (boundary !== -1) {
        const raw = buf.slice(0, boundary)
        buf = buf.slice(boundary + 2)
        const dataLines = raw
          .split('\n')
          .filter(l => l.startsWith('data:'))
          .map(l => l.slice(5).trimStart())
        if (dataLines.length > 0) {
          const payload = dataLines.join('\n')
          try {
            yield JSON.parse(payload) as Record<string, unknown>
          } catch {
            // Malformed event — überspringen
          }
        }
        boundary = buf.indexOf('\n\n')
      }
    }
  } finally {
    try {
      reader.releaseLock()
    } catch {
      // Der Reader kann bereits freigegeben sein (Abbruch, Netzwerkfehler) —
      // das Aufraeumen darf den urspruenglichen Fehler nicht ueberdecken.
    }
  }
}

// Multipart-Gegenstück zu apiFetch — `T` bedeutet dasselbe (erwartete Antwortform).
export async function apiFormFetch<T = unknown>(path: string, form: FormData): Promise<T> {
  // No Content-Type header — browser sets it with the multipart boundary
  try {
    const res = await fetch(`${BASE_URL}${path}`, {
      method: 'POST',
      credentials: 'include',
      body: form,
    })

    if (!res.ok) {
      const { text, code } = await parseErrorDetail(res)
      if (handleExpiredSession(res.status, text, path)) {
        throw new ApiError(res.status, 'Sitzung abgelaufen')
      }
      throw new ApiError(res.status, text, code)
    }

    return res.json()
  } catch (e) {
    if (e instanceof ApiError) throw e
    throw new ApiError(0, 'Keine Internetverbindung')
  }
}
