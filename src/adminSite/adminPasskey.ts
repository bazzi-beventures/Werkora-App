/**
 * Passkey der Betreiber-Seite: einrichten und damit entsperren.
 *
 * Spec: docs/specs/admin-werkora-ch.md §15. Gegenstück im Backend:
 * agents/routers/admin_passkey.py — eigene Routen mit der RP-ID von
 * admin.werkora.ch, getrennt von den Passkeys der Mandanten-App
 * (src/auth/webauthn.ts), deren Ablauf hier nicht berührt wird.
 */
import { ApiError, apiFetch } from '../api/client'
import { b64urlToBuffer, bufferToB64url } from '../auth/webauthn'
import type { AdminPasskeyKonto } from './appSperreRegeln'

interface CredentialDescriptorJson { id: string; type: 'public-key' }

interface CreationOptionsJson {
  challenge: string
  rp: PublicKeyCredentialRpEntity
  user: { id: string; name: string; displayName: string }
  pubKeyCredParams: PublicKeyCredentialParameters[]
  timeout?: number
  excludeCredentials?: CredentialDescriptorJson[]
  authenticatorSelection?: AuthenticatorSelectionCriteria
  attestation?: AttestationConveyancePreference
}

interface RequestOptionsJson {
  challenge: string
  rpId: string
  timeout?: number
  allowCredentials?: CredentialDescriptorJson[]
  userVerification?: UserVerificationRequirement
}

interface KontoJson { authorized_user_id: string; tenant_slug: string; display_name: string }

function konto(k: KontoJson): AdminPasskeyKonto {
  return { authorizedUserId: k.authorized_user_id, tenantSlug: k.tenant_slug, displayName: k.display_name }
}

function descriptors(list: CredentialDescriptorJson[] | undefined): PublicKeyCredentialDescriptor[] {
  return (list ?? []).map((c) => ({ type: 'public-key' as const, id: b64urlToBuffer(c.id) }))
}

/**
 * Das Gerät hat für dieses Konto schon einen Passkey auf admin.werkora.ch
 * (`InvalidStateError` aus `credentials.create`). Kein Fehler im eigentlichen
 * Sinn: das Konto ist bekannt, entsperrt wird mit dem vorhandenen Passkey.
 */
export class SchonEingerichtet extends Error {
  readonly konto: AdminPasskeyKonto
  constructor(k: AdminPasskeyKonto) {
    super('passkey_exists')
    this.name = 'SchonEingerichtet'
    this.konto = k
  }
}

/**
 * Fingerabdruck für die App einrichten. Verlangt eine frische Anmeldung mit
 * Passwort (Server: höchstens zehn Minuten alt, sonst `fresh_login_required`).
 */
export async function adminPasskeyEinrichten(): Promise<AdminPasskeyKonto> {
  const begin = await apiFetch<{ options: CreationOptionsJson; account: KontoJson }>(
    '/pwa/auth/admin-passkey/register-begin', { method: 'POST' },
  )
  const o = begin.options
  const publicKey: PublicKeyCredentialCreationOptions = {
    challenge: b64urlToBuffer(o.challenge),
    rp: o.rp,
    user: { id: b64urlToBuffer(o.user.id), name: o.user.name, displayName: o.user.displayName },
    pubKeyCredParams: o.pubKeyCredParams,
    timeout: o.timeout,
    excludeCredentials: descriptors(o.excludeCredentials),
    authenticatorSelection: o.authenticatorSelection,
    attestation: o.attestation,
  }

  let credential: PublicKeyCredential
  try {
    credential = (await navigator.credentials.create({ publicKey })) as PublicKeyCredential
  } catch (err: unknown) {
    if (err instanceof DOMException && err.name === 'InvalidStateError') {
      throw new SchonEingerichtet(konto(begin.account))
    }
    throw err
  }
  const response = credential.response as AuthenticatorAttestationResponse

  const res = await apiFetch<KontoJson>('/pwa/auth/admin-passkey/register-complete', {
    method: 'POST',
    body: JSON.stringify({
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
  })
  return konto(res)
}

/**
 * Mit dem Fingerabdruck entsperren. Der Server prüft die Signatur, ersetzt die
 * bisherige Sitzung dieses Geräts und setzt ein neues Cookie.
 */
export async function adminPasskeyEntsperren(k: AdminPasskeyKonto): Promise<void> {
  const ident = { tenant_slug: k.tenantSlug, authorized_user_id: k.authorizedUserId }
  const o = await apiFetch<RequestOptionsJson>('/pwa/auth/admin-passkey/login-begin', {
    method: 'POST',
    body: JSON.stringify(ident),
  })
  const publicKey: PublicKeyCredentialRequestOptions = {
    challenge: b64urlToBuffer(o.challenge),
    rpId: o.rpId,
    allowCredentials: descriptors(o.allowCredentials),
    userVerification: o.userVerification,
    timeout: o.timeout,
  }
  const credential = (await navigator.credentials.get({ publicKey })) as PublicKeyCredential
  const response = credential.response as AuthenticatorAssertionResponse

  await apiFetch('/pwa/auth/admin-passkey/login-complete', {
    method: 'POST',
    body: JSON.stringify({
      ...ident,
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
  })
}

/** Hat der Server gesagt, dass es für dieses Konto hier keinen Passkey gibt? */
export function istOhnePasskey(err: unknown): boolean {
  return err instanceof ApiError && err.message === 'no_credentials_registered'
}

/** Ist die Passwort-Anmeldung für die Einrichtung zu alt? */
export function istNichtFrisch(err: unknown): boolean {
  return err instanceof ApiError && err.message === 'fresh_login_required'
}

/** Hat die Person die Abfrage abgebrochen (oder das Gerät sie verweigert)? */
export function istAbgebrochen(err: unknown): boolean {
  return err instanceof DOMException && (err.name === 'NotAllowedError' || err.name === 'AbortError')
}

/** Meldung zu einem Fehlschlag beim Einrichten oder Entsperren. */
export function sperrFehlerText(err: unknown): string {
  if (istAbgebrochen(err)) return 'Abgebrochen. Bitte nochmals versuchen.'
  if (err instanceof ApiError) {
    switch (err.message) {
      case 'verification_failed':
      case 'credential_not_found':
        return 'Der Fingerabdruck wurde nicht erkannt. Bitte nochmals versuchen.'
      case 'challenge_expired':
        return 'Das hat zu lange gedauert. Bitte nochmals versuchen.'
      case 'superadmin_required':
        return 'Diese Seite ist für Betreiber-Konten.'
      case 'admin_passkey_unavailable':
        return 'Die Anmeldung per Fingerabdruck ist auf dem Server nicht eingerichtet. '
          + 'Bitte die Seite im Browser statt als App öffnen.'
      case 'rate_limited':
        return 'Zu viele Versuche. Bitte in 15 Minuten nochmals probieren.'
    }
    if (err.status === 0) return 'Keine Verbindung. Bitte Internet prüfen.'
    return err.message || 'Das ging nicht durch.'
  }
  if (err instanceof DOMException) {
    if (err.name === 'SecurityError') return 'Sicherheitsfehler. Bitte die App neu öffnen.'
    return `Fehler des Geräts (${err.name}). Bitte nochmals versuchen.`
  }
  return 'Das ging nicht durch.'
}
