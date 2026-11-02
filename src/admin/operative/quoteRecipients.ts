// Empfänger-Vorschläge im Offerten-Versand (WW-55): «die Offerte ging an die
// Rechnungsadresse statt an den Bewirtschafter». Bisher stand im Feld «An» nur die
// Kunden-Adresse der Offerte; wer an den Bewirtschafter senden wollte, musste
// dessen Adresse von Hand eintippen — obwohl sie als Projekt-Kontakt hinterlegt ist.
//
// Bewusst Vorschläge, kein Pflichtschritt: die Vorbelegung bleibt der Kunde, ein
// Tipp auf einen Vorschlag setzt das Feld «An». Kein zusätzlicher Klick im
// Normalfall, und keine neue Entscheidung, die man falsch treffen kann.

import type { Eigentuemer } from '../../api/admin/projects'
import type { Kontakt } from '../../shared/projectDetail/types'

export interface RecipientSuggestion {
  label: string
  email: string
}

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

/** Kunde (Adresse der Offerte), Projekt-Kontakte mit E-Mail, Eigentümer — in
 *  dieser Reihenfolge, ohne Doppelte (gross/klein egal) und ohne Ungültige. */
export function quoteRecipientSuggestions(
  customerEmail: string | null | undefined,
  kontakte: readonly Kontakt[] | null | undefined,
  eigentuemer: Eigentuemer | null | undefined,
): RecipientSuggestion[] {
  const out: RecipientSuggestion[] = []
  const seen = new Set<string>()
  function add(label: string, email: string | null | undefined) {
    const e = (email ?? '').trim()
    if (!EMAIL.test(e) || seen.has(e.toLowerCase())) return
    seen.add(e.toLowerCase())
    out.push({ label: label.trim() || e, email: e })
  }
  add('Kunde', customerEmail)
  for (const k of kontakte ?? []) {
    const name = (k.name ?? '').trim()
    const rolle = (k.kommentar ?? '').trim()
    add(rolle && name ? `${name} (${rolle})` : name || rolle, k.email)
  }
  if (eigentuemer) add(`${(eigentuemer.name ?? '').trim()} (Eigentümer)`, eigentuemer.email)
  return out
}

/** Nur zeigen, wenn es etwas zu wählen gibt: mindestens eine Adresse, die nicht
 *  schon im Feld steht. */
export function showRecipientSuggestions(list: readonly RecipientSuggestion[], current: string): boolean {
  const cur = current.trim().toLowerCase()
  return list.some(s => s.email.toLowerCase() !== cur)
}
