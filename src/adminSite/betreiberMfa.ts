/**
 * MFA des Betreiber-Kontos — Bestätigen, Wiederherstellungscodes, Geräte.
 *
 * Spec: docs/specs/betreiber-mfa.md. Gegenstück im Backend:
 * agents/routers/betreiber_mfa.py (Routen unter /pwa/auth/mfa/).
 *
 * Die QR-Bestätigung baut Werkora nicht selbst: «Mit dem Handy» bittet den
 * Browser per `hints: ['hybrid']` um seinen eigenen QR-Code (WebAuthn
 * «Hybrid», Bluetooth belegt die Nähe des Handys). Browser ohne `hints`
 * zeigen ihre normale Auswahl, in der derselbe Weg steht (Spec §6.4, §6.5).
 */
import { ApiError, apiFetch } from '../api/client'
import { anfrageOptionen, signaturAlsJson, type RequestOptionsJson } from './adminPasskey'

/** Womit bestätigt wird. `auto` lässt den Browser wählen (App am Handy). */
export type BestaetigungsArt = 'handy' | 'computer' | 'auto'

export interface MfaPasskey {
  id: string
  domain: string
  betreiber_seite: boolean
  geraet: string | null
  transports: string[]
  angelegt: string | null
  zuletzt: string | null
}

export interface MfaGeraete {
  pflicht: boolean
  pflicht_seit: string | null
  bestaetigt: boolean
  methode: string | null
  frisch: boolean
  codes_uebrig: number
  passkeys: MfaPasskey[]
}

export interface NeueCodes {
  codes: string[]
  text: string
  pflicht: boolean
}

const HINTS: Record<BestaetigungsArt, string[] | undefined> = {
  handy: ['hybrid'],
  computer: ['client-device'],
  auto: undefined,
}

/**
 * Woher der Passkey kam, laut Browser (`authenticatorAttachment`):
 * - `lokal` — auf diesem Gerät, auch ein synchronisierter aus dem Google- oder
 *   iCloud-Passwortmanager. Dann zeigt der Browser keinen QR-Code, auch wenn
 *   «Mit dem Handy» gewählt war, und «Diesen Computer merken» wäre überflüssig.
 * - `anderes_geraet` — Handy per QR-Code oder Sicherheitsschlüssel.
 * - `unbekannt` — ältere Browser kennen das Feld nicht.
 */
export type PasskeyHerkunft = 'lokal' | 'anderes_geraet' | 'unbekannt'

function herkunft(credential: PublicKeyCredential): PasskeyHerkunft {
  const a = (credential as PublicKeyCredential & { authenticatorAttachment?: string | null })
    .authenticatorAttachment
  if (a === 'platform') return 'lokal'
  if (a === 'cross-platform') return 'anderes_geraet'
  return 'unbekannt'
}

/** Bestätigt die Sitzung mit einem Passkey; der Server ersetzt das Cookie. */
export async function bestaetigeMitPasskey(art: BestaetigungsArt): Promise<PasskeyHerkunft> {
  const o = await apiFetch<RequestOptionsJson>('/pwa/auth/mfa/passkey-begin', { method: 'POST' })
  const hints = HINTS[art]
  // `hints` (WebAuthn Level 3) fehlt in älteren DOM-Typen — deshalb über ein
  // erweitertes Objekt statt eines Typ-Casts der ganzen Optionen.
  const publicKey: PublicKeyCredentialRequestOptions & { hints?: string[] } = {
    ...anfrageOptionen(o),
    ...(hints ? { hints } : {}),
  }
  const credential = (await navigator.credentials.get({ publicKey })) as PublicKeyCredential
  await apiFetch('/pwa/auth/mfa/passkey-complete', {
    method: 'POST',
    body: JSON.stringify({ credential: signaturAlsJson(credential) }),
  })
  return herkunft(credential)
}

/** Notfallweg: Code einlösen. Liefert, wie viele noch übrig sind. */
export async function loeseCodeEin(code: string): Promise<number> {
  const res = await apiFetch<{ codes_uebrig: number }>('/pwa/auth/mfa/wiederherstellung', {
    method: 'POST',
    body: JSON.stringify({ code }),
  })
  return res.codes_uebrig
}

export function ladeGeraete(): Promise<MfaGeraete> {
  return apiFetch<MfaGeraete>('/pwa/auth/mfa/geraete')
}

export function erzeugeCodes(): Promise<NeueCodes> {
  return apiFetch<NeueCodes>('/pwa/auth/mfa/codes', { method: 'POST' })
}

export async function aktiviere(): Promise<void> {
  await apiFetch('/pwa/auth/mfa/aktivieren', { method: 'POST' })
}

export async function entfernePasskey(id: string): Promise<void> {
  await apiFetch(`/pwa/auth/mfa/passkeys/${encodeURIComponent(id)}`, { method: 'DELETE' })
}

const FEHLT_BESTAETIGUNG = new Set(['bestaetigung_erforderlich', 'mfa_required'])

/** Fehlt eine (frische) Bestätigung? Dann zuerst Passkey, dann nochmals.
 *  `bestaetigung_erforderlich`: bestätigt, aber zu lange her (oder per Code statt
 *  Passkey). `mfa_required`: diese Sitzung ist noch gar nicht bestätigt. */
export function brauchtBestaetigung(err: unknown): boolean {
  return err instanceof ApiError
    && (FEHLT_BESTAETIGUNG.has(err.code ?? '') || FEHLT_BESTAETIGUNG.has(err.message))
}

/**
 * Führt `aktion` aus; verlangt der Server eine frische Bestätigung, wird
 * einmal mit Passkey bestätigt und dann wiederholt.
 */
export async function mitBestaetigung<T>(aktion: () => Promise<T>, art: BestaetigungsArt = 'auto'): Promise<T> {
  try {
    return await aktion()
  } catch (err: unknown) {
    if (!brauchtBestaetigung(err)) throw err
    await bestaetigeMitPasskey(art)
    return aktion()
  }
}

/** Meldung zu einem Fehlschlag der Bestätigung oder Verwaltung. */
export function mfaFehlerText(err: unknown): string {
  if (err instanceof DOMException) {
    if (err.name === 'NotAllowedError' || err.name === 'AbortError') {
      return 'Abgebrochen oder nicht bestätigt. Bitte nochmals versuchen.'
    }
    return `Fehler des Geräts (${err.name}). Bitte nochmals versuchen.`
  }
  if (err instanceof ApiError) {
    switch (err.code ?? err.message) {
      case 'code_ungueltig':
        return 'Der Code stimmt nicht oder wurde schon benutzt.'
      case 'no_credentials_registered':
        return 'Für dieses Konto ist auf der Betreiber-Seite noch kein Passkey eingerichtet — '
          + 'bitte mit einem Wiederherstellungscode bestätigen.'
      case 'verification_failed':
      case 'credential_not_found':
        return 'Der Passkey wurde nicht erkannt. Bitte nochmals versuchen.'
      case 'challenge_expired':
        return 'Das hat zu lange gedauert. Bitte nochmals versuchen.'
      case 'letzter_faktor':
      case 'keine_codes':
        return err.message
      case 'admin_passkey_unavailable':
        return 'Passkeys sind auf dem Server nicht eingerichtet (ADMIN_ORIGIN).'
    }
    if (err.status === 0) return 'Keine Verbindung. Bitte Internet prüfen.'
    return err.message || 'Das ging nicht durch.'
  }
  return 'Das ging nicht durch.'
}
