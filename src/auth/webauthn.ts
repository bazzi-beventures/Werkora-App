import { apiFetch } from '../api/client'
import { clearApiCache } from '../api/swCache'

// ── base64url helpers ────────────────────────────────────────

function b64urlToBuffer(b64: string): ArrayBuffer {
  const pad = 4 - (b64.length % 4)
  const padded = pad < 4 ? b64 + '='.repeat(pad) : b64
  const binary = atob(padded.replace(/-/g, '+').replace(/_/g, '/'))
  const buf = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) buf[i] = binary.charCodeAt(i)
  return buf.buffer
}

function bufferToB64url(buf: ArrayBuffer): string {
  const bytes = new Uint8Array(buf)
  let binary = ''
  for (const b of bytes) binary += String.fromCharCode(b)
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '')
}

// ── Registration ─────────────────────────────────────────────

export async function registerPasskey(
  tenantSlug: string,
  authorizedUserId: string,
  pin: string,
  deviceLabel?: string,
): Promise<void> {
  // 1. Get options from server
  const options = (await apiFetch('/pwa/auth/register-begin', {
    method: 'POST',
    body: JSON.stringify({ tenant_slug: tenantSlug, authorized_user_id: authorizedUserId, pin }),
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
  await apiFetch('/pwa/auth/register-complete', {
    method: 'POST',
    body: JSON.stringify({
      tenant_slug: tenantSlug,
      authorized_user_id: authorizedUserId,
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
  })
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
