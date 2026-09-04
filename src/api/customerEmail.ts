import { apiFetch } from './client'

// Kunden-E-Mail vom Einsatz aus nachtragen (Spec docs/specs/kunden-email-erfassen.md).
//
// Der einzige Schreibzugriff, den die Monteur-PWA auf den Kundenstamm hat: bei
// vielen Kunden fehlt die Adresse, und die Baustelle ist die Gelegenheit, sie zu
// bekommen. Der Server nimmt genau dieses eine Feld entgegen und prüft die
// Projektzuweisung — die Regel steht dort, nicht hier.

/** Grobe Formatprüfung fürs Formular: genau ein @, kein Leerzeichen, Punkt danach.
 *  Absichtlich dieselbe Regel wie `db.EMAIL_RE` im Backend, damit ein Tippfehler
 *  nicht erst nach dem Speichern-Klick auffällt. Massgeblich bleibt der Server. */
export function looksLikeEmail(value: string): boolean {
  return /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(value.trim())
}

export async function setCustomerEmail(projectId: string, email: string): Promise<string> {
  const d = await apiFetch(`/pwa/projects/${projectId}/customer-email`, {
    method: 'POST',
    body: JSON.stringify({ email: email.trim() }),
  }) as { email?: string } | null
  // Der Server antwortet mit der gespeicherten Fassung — die zeigt die App an,
  // statt der eigenen Eingabe: getrimmt ist sie schon, und beim nächsten Laden
  // stünde ohnehin die Serverfassung da.
  return d?.email ?? email.trim()
}
