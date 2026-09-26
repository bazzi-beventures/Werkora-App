/**
 * Zwischenablage für die Betreiber-Seite — erst für die technische
 * Zusammenfassung der Feature-Anfragen (docs/specs/feature-anfragen.md §7.5).
 */

/** Kopiert Text in die Zwischenablage; fällt auf ein markiertes Textfeld
 *  zurück, wo die Clipboard-API fehlt (http, alte Browser). */
export async function copyToClipboard(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text)
    return true
  } catch {
    try {
      const ta = document.createElement('textarea')
      ta.value = text
      ta.setAttribute('readonly', '')
      ta.style.position = 'fixed'
      ta.style.opacity = '0'
      document.body.appendChild(ta)
      ta.select()
      const ok = document.execCommand('copy')
      ta.remove()
      return ok
    } catch {
      return false
    }
  }
}
