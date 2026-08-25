// Zusatztexte für die Erfolgsmeldung nach dem Rechnungslauf.
//
// Standen bis Charge H3 im InvoicesScreen und wurden von dort ins Projekt-Detail
// importiert (Screen → Screen). Beide Meldungen sind reine Textbausteine über der
// Backend-Antwort — sie gehören zu keiner der beiden Masken.

// Sammelrechnung: hat der Kunde mehrere Offerten eines Projekts angenommen
// ('mehrfach'-Gruppe), deckt EINE Rechnung alle noch unverrechneten ab. Das ist
// nicht offensichtlich — deshalb im Erfolgs-Toast benennen, welche das waren.
// Bei genau einer Offerte (Normalfall) bleibt der Text unverändert.
export function sammelrechnungHint(quoteNumbers?: string[]): string {
  if (!quoteNumbers || quoteNumbers.length < 2) return ''
  return ` — Sammelrechnung über ${quoteNumbers.length} Offerten (${quoteNumbers.join(', ')})`
}

// Hinweise, die den Erfolg NICHT in Frage stellen (heute: ein verrechneter Rapport
// ist als Garantiefall erfasst). Sie kommen als `warnings` aus dem Backend und
// werden an die Erfolgsmeldung gehängt — die Rechnung existiert bereits, der
// Hinweis sagt «nachschauen», nicht «fehlgeschlagen».
export function invoiceWarningHint(warnings?: unknown): string {
  if (!Array.isArray(warnings)) return ''
  const texts = warnings.filter((w): w is string => typeof w === 'string' && !!w.trim())
  return texts.length > 0 ? ` — ${texts.join(' ')}` : ''
}
