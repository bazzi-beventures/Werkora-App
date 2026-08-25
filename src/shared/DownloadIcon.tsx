/** Pfeil auf die Ablage — der Speichern-Knopf neben einer Datei. Steht in beiden
 *  Sichten neben derselben Zeile (Verwaltung: Dokumente-Reiter, Monteur-PWA:
 *  Datei-Karte im Projekt). */
export function DownloadIcon({ size = 15 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      style={{ display: 'block' }}
    >
      <path d="M12 3v12" />
      <path d="m7 11 5 5 5-5" />
      <path d="M4 20h16" />
    </svg>
  )
}
