/** Zeitpunkt als «TT.MM.JJJJ, hh:mm» (de-CH). Steht unter Dateien, Kommentaren
 *  und Aufgaben — in der Verwaltung wie in der Monteur-PWA. */
export function formatDateTime(iso: string): string {
  const d = new Date(iso)
  return d.toLocaleString('de-CH', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })
}
