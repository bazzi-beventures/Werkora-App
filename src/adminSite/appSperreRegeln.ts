/**
 * App-Sperre der Betreiber-Seite — wann sie greift und welches Konto sie öffnet.
 *
 * Spec: docs/specs/admin-werkora-ch.md §15 (O3).
 *
 * **Nur als installierte App.** Im Browser-Tab (Schreibtisch, Handy-Safari)
 * bleibt alles, wie es war: Passwort und 30-Tage-Cookie. Als App vom
 * Home-Bildschirm geöffnet, geht es dagegen nur mit Fingerabdruck hinein — bei
 * jedem Start und bei jeder Rückkehr nach `SPERRE_NACH_MS` im Hintergrund.
 * Die Mandanten-App (app.werkora.ch) kennt nichts davon.
 *
 * Ob die Seite als App läuft, weiss nur der Browser — deshalb sitzt die
 * Entscheidung hier und nicht im Backend. Das Backend liefert den Nachweis:
 * jede Entsperrung ist eine WebAuthn-Anmeldung mit verlangter
 * Benutzerprüfung, die eine neue Sitzung ausstellt
 * (agents/routers/admin_passkey.py).
 */
import { useEffect, useRef } from 'react'
import { SK } from '../api/storageKeys'

/**
 * Wie lange die App im Hintergrund sein darf, ohne beim Zurückkommen zu
 * sperren. Eine Minute deckt den kurzen Abstecher (Code aus der Mail kopieren,
 * Foto auswählen) — wer länger weg war, «öffnet» die App neu.
 */
export const SPERRE_NACH_MS = 60_000

/**
 * Läuft die Seite als installierte App (Home-Bildschirm, «App installieren»)?
 *
 * `navigator.standalone` ist das ältere iOS-Signal und gilt dort auch, wo
 * `display-mode` nicht zuverlässig meldet; die Media-Query deckt Android und
 * Desktop ab. Das Manifest (`public/admin-manifest.json`) startet mit
 * `display: standalone`.
 */
export function istAppModus(): boolean {
  if (typeof window === 'undefined') return false
  const nav = window.navigator as Navigator & { standalone?: boolean }
  if (nav.standalone === true) return true
  return typeof window.matchMedia === 'function'
    && window.matchMedia('(display-mode: standalone)').matches
}

/** Das Konto, dessen Passkey diese App auf diesem Gerät öffnet. */
export interface AdminPasskeyKonto {
  authorizedUserId: string
  tenantSlug: string
  displayName: string
}

/** Gemerktes Konto — oder `null`, wenn auf diesem Gerät keines eingerichtet ist.
 *  Ein kaputter Eintrag gilt als «keines»: der Weg über das Passwort richtet
 *  ihn neu ein. */
export function gemerktesKonto(): AdminPasskeyKonto | null {
  try {
    const roh = localStorage.getItem(SK.ADMIN_PASSKEY_KONTO)
    if (!roh) return null
    const k = JSON.parse(roh) as Partial<AdminPasskeyKonto>
    if (typeof k.authorizedUserId !== 'string' || !k.authorizedUserId) return null
    if (typeof k.tenantSlug !== 'string' || !k.tenantSlug) return null
    return {
      authorizedUserId: k.authorizedUserId,
      tenantSlug: k.tenantSlug,
      displayName: typeof k.displayName === 'string' ? k.displayName : '',
    }
  } catch {
    return null
  }
}

export function kontoMerken(konto: AdminPasskeyKonto): void {
  try {
    localStorage.setItem(SK.ADMIN_PASSKEY_KONTO, JSON.stringify(konto))
  } catch {
    /* Privater Modus / voller Speicher: dann geht es beim nächsten Start
       wieder über das Passwort — unbequem, aber nicht offen. */
  }
}

export function kontoVergessen(): void {
  try {
    localStorage.removeItem(SK.ADMIN_PASSKEY_KONTO)
  } catch {
    /* siehe kontoMerken */
  }
}

/**
 * Ruft `onSperren`, wenn die App nach mindestens `SPERRE_NACH_MS` im
 * Hintergrund wieder sichtbar wird. Gemessen an der Wanduhr — iOS friert
 * Timer im Hintergrund ein, ein `setTimeout` liefe also nie ab.
 */
export function useSperreBeiRueckkehr(aktiv: boolean, onSperren: () => void): void {
  const onSperrenRef = useRef(onSperren)
  useEffect(() => { onSperrenRef.current = onSperren }, [onSperren])

  useEffect(() => {
    if (!aktiv) return
    let verstecktSeit: number | null = null
    function beiWechsel() {
      if (document.visibilityState === 'hidden') {
        verstecktSeit = Date.now()
        return
      }
      if (verstecktSeit !== null && Date.now() - verstecktSeit >= SPERRE_NACH_MS) {
        onSperrenRef.current()
      }
      verstecktSeit = null
    }
    document.addEventListener('visibilitychange', beiWechsel)
    return () => document.removeEventListener('visibilitychange', beiWechsel)
  }, [aktiv])
}
