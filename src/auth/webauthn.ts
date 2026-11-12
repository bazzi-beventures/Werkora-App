import { ApiError, apiFetch } from '../api/client'
import { clearApiCache } from '../api/swCache'
import { SK } from '../api/storageKeys'

// ── base64url helpers ────────────────────────────────────────
// Exportiert für die App-Sperre der Betreiber-Seite (adminSite/adminPasskey.ts),
// die dieselbe Umwandlung braucht, aber eigene Routen anspricht.

export function b64urlToBuffer(b64: string): ArrayBuffer {
  const pad = 4 - (b64.length % 4)
  const padded = pad < 4 ? b64 + '='.repeat(pad) : b64
  const binary = atob(padded.replace(/-/g, '+').replace(/_/g, '/'))
  const buf = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) buf[i] = binary.charCodeAt(i)
  return buf.buffer
}

export function bufferToB64url(buf: ArrayBuffer): string {
  const bytes = new Uint8Array(buf)
  let binary = ''
  for (const b of bytes) binary += String.fromCharCode(b)
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '')
}

// ── Registration ─────────────────────────────────────────────

/** Wer sich gerade einen Passkey eingerichtet hat — das Gerät merkt es sich,
 *  damit der nächste Start die Anmeldung per Passkey anbietet (LoginScreen). */
export interface PasskeyAccount {
  authorizedUserId: string
  tenantSlug: string
  displayName: string
}

/** Kann dieser Browser überhaupt Passkeys? Fehlt die API (alter Browser, kein
 *  sicherer Kontext), soll die Maske das sagen statt mit einem TypeError zu enden. */
export function passkeySupported(): boolean {
  return typeof window !== 'undefined'
    && typeof window.PublicKeyCredential !== 'undefined'
    && typeof navigator !== 'undefined'
    && !!navigator.credentials
}

/** Merkt sich die Identität für den Passkey-Login beim nächsten Start.
 *  Bis 20261101 schrieb keine Stelle der App diesen Schlüssel — er wurde nur
 *  gelesen und gelöscht, der Passkey-Login war damit auf jedem neuen Gerät weg. */
export function rememberPasskeyAccount(account: PasskeyAccount): void {
  localStorage.setItem(SK.TENANT_SLUG, account.tenantSlug)
  localStorage.setItem(SK.AUTHORIZED_USER_ID, account.authorizedUserId)
  localStorage.setItem(SK.DISPLAY_NAME, account.displayName)
}

/** Passkey auf diesem Gerät einrichten — mit Benutzername und der Einmal-PIN,
 *  die der Admin beim Anlegen oder unter «PIN generieren» ausgibt (Handbuch §2.2).
 *  Der Server leitet Mandant und Konto aus dem Benutzernamen ab; erfolgreich
 *  heisst: Passkey gespeichert, PIN verbraucht, Session-Cookie gesetzt. */
export async function registerPasskey(
  username: string,
  pin: string,
  deviceLabel?: string,
): Promise<PasskeyAccount> {
  // 1. Get options from server (prüft den PIN, verbraucht ihn noch nicht)
  const options = (await apiFetch('/pwa/auth/register-begin', {
    method: 'POST',
    body: JSON.stringify({ username, pin }),
  })) as Record<string, unknown>

  // 2. Convert base64url fields → ArrayBuffer for browser API
  const publicKey: PublicKeyCredentialCreationOptions = {
    challenge: b64urlToBuffer(options.challenge as string),
    rp: options.rp as PublicKeyCredentialRpEntity,
    user: {
      ...(options.user as Record<string, unknown>),
      id: b64urlToBuffer((options.user as Record<string, string>).id),
    } as PublicKeyCredentialUserEntity,
    pubKeyCredParams: options.pubKeyCredParams as PublicKeyCredentialParameters[],
    timeout: options.timeout as number,
    excludeCredentials: ((options.excludeCredentials as Array<Record<string, string>>) ?? []).map(c => ({
      type: 'public-key' as const,
      id: b64urlToBuffer(c.id),
    })),
    authenticatorSelection: options.authenticatorSelection as AuthenticatorSelectionCriteria,
    attestation: options.attestation as AttestationConveyancePreference,
  }

  // 3. Browser fingerprint/biometric dialog
  const credential = (await navigator.credentials.create({ publicKey })) as PublicKeyCredential
  const response = credential.response as AuthenticatorAttestationResponse

  // Neue Session beginnt: evtl. gecachte /pwa/-Antworten eines früheren
  // Nutzers auf diesem Gerät loswerden (geteiltes Gerät ohne sauberen Logout).
  await clearApiCache()

  // 4. Send to server (Session-Cookie wird vom Server gesetzt)
  const result = (await apiFetch('/pwa/auth/register-complete', {
    method: 'POST',
    body: JSON.stringify({
      username,
      pin,
      device_label: deviceLabel ?? null,
      credential: {
        id: credential.id,
        rawId: bufferToB64url(credential.rawId),
        type: credential.type,
        response: {
          clientDataJSON: bufferToB64url(response.clientDataJSON),
          attestationObject: bufferToB64url(response.attestationObject),
        },
      },
    }),
  })) as { authorized_user_id: string; tenant_slug: string; display_name: string }

  return {
    authorizedUserId: result.authorized_user_id,
    tenantSlug: result.tenant_slug,
    displayName: result.display_name,
  }
}


/** Meldung zu einem Fehlschlag der Passkey-Einrichtung. Die Codes kommen aus
 *  `agents/routers/auth.py` (register-begin/-complete), die DOMExceptions aus
 *  `navigator.credentials.create`. */
export function passkeySetupErrorMessage(err: unknown): string {
  if (err instanceof ApiError) {
    if (err.message === 'invalid_pin') return 'Benutzername oder PIN ungültig, oder die PIN ist abgelaufen. Bitte bei deinem Admin eine neue PIN anfordern.'
    if (err.status === 429) return 'Zu viele Versuche. Bitte warte 15 Minuten.'
    if (err.message === 'tenant_unavailable') return 'Deine PIN stimmt, aber deine Firma ist auf diesem Server nicht freigeschaltet. Bitte wende dich an den Support.'
    if (err.message === 'challenge_expired') return 'Die Einrichtung hat zu lange gedauert. Bitte nochmals versuchen.'
    if (err.message === 'verification_failed') return 'Biometrie-Verifizierung fehlgeschlagen. Bitte nochmals versuchen.'
    if (err.status === 0) return 'Keine Verbindung. Bitte prüfe dein Internet.'
    return `Fehler: ${err.message}`
  }
  if (err instanceof DOMException) {
    if (err.name === 'NotAllowedError') return 'Einrichtung abgebrochen oder Biometrie fehlgeschlagen. Bitte nochmals versuchen.'
    if (err.name === 'InvalidStateError') return 'Auf diesem Gerät ist für dein Konto schon ein Passkey eingerichtet. Bitte bei deinem Admin eine neue PIN anfordern, falls er nicht mehr funktioniert.'
    if (err.name === 'SecurityError') return 'Sicherheitsfehler. Bitte die Seite neu laden.'
    return `Biometrie-Fehler (${err.name}). Bitte Seite neu laden und nochmals versuchen.`
  }
  return 'Verbindungsfehler.'
}

// ── Authentication ────────────────────────────────────────────

export async function authenticatePasskey(
  tenantSlug: string,
  authorizedUserId: string,
): Promise<string> {
  // 1. Get challenge
  const options = (await apiFetch('/pwa/auth/login-begin', {
    method: 'POST',
    body: JSON.stringify({ tenant_slug: tenantSlug, authorized_user_id: authorizedUserId }),
  })) as Record<string, unknown>

  // 2. Convert
  const publicKey: PublicKeyCredentialRequestOptions = {
    challenge: b64urlToBuffer(options.challenge as string),
    rpId: options.rpId as string,
    allowCredentials: ((options.allowCredentials as Array<Record<string, string>>) ?? []).map(c => ({
      type: 'public-key' as const,
      id: b64urlToBuffer(c.id),
    })),
    userVerification: options.userVerification as UserVerificationRequirement,
    timeout: options.timeout as number,
  }

  // 3. Fingerprint dialog
  const credential = (await navigator.credentials.get({ publicKey })) as PublicKeyCredential
  const response = credential.response as AuthenticatorAssertionResponse

  // Neue Session beginnt: evtl. gecachte /pwa/-Antworten eines früheren
  // Nutzers auf diesem Gerät loswerden (geteiltes Gerät ohne sauberen Logout).
  await clearApiCache()

  // 4. Verify on server (server sets cookie on success)
  const result = (await apiFetch('/pwa/auth/login-complete', {
    method: 'POST',
    body: JSON.stringify({
      tenant_slug: tenantSlug,
      authorized_user_id: authorizedUserId,
      credential: {
        id: credential.id,
        rawId: bufferToB64url(credential.rawId),
        type: credential.type,
        response: {
          clientDataJSON: bufferToB64url(response.clientDataJSON),
          authenticatorData: bufferToB64url(response.authenticatorData),
          signature: bufferToB64url(response.signature),
          userHandle: response.userHandle ? bufferToB64url(response.userHandle) : null,
        },
      },
    }),
  })) as { display_name: string }

  return result.display_name
}
